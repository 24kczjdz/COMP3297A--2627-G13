-- Upgrade existing D1 installations without rewriting applied migrations or deleting data.
-- Group 13 policy: 18 annual / 14 sick days per calendar year, Hong Kong dates.
-- Pending and Approved requests consume quota. Rejection/cancellation releases it.
-- Existing history is preserved; submission-time rules apply to new requests/edits.

ALTER TABLE leave_application ADD COLUMN decision_comment TEXT NOT NULL DEFAULT ''
  CHECK (length(trim(decision_comment)) <= 1000);
ALTER TABLE leave_application ADD COLUMN decided_by TEXT REFERENCES staff(id);
ALTER TABLE leave_application ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

-- Catch case variants even if SQL is used outside the API.
CREATE UNIQUE INDEX idx_staff_email_normalized ON staff (lower(trim(email)));
CREATE UNIQUE INDEX idx_one_approver ON staff (role) WHERE role = 'approver';
CREATE INDEX idx_leave_active_range ON leave_application (applicant_id, start_date, end_date)
  WHERE status IN ('Pending', 'Approved');
CREATE INDEX idx_leave_pending_start ON leave_application (start_date, submitted_at, id)
  WHERE status = 'Pending';
CREATE INDEX idx_notification_unread ON notification (recipient_id, created_at)
  WHERE read_at IS NULL;
CREATE INDEX idx_session_expiry ON session (expires_at);

-- One allocation per request per calendar year; never charge the entire request
-- to its start year. ISO date strings sort in calendar order.
CREATE VIEW leave_application_year AS
WITH RECURSIVE slices AS (
  SELECT id AS application_id, applicant_id, leave_type, status,
         start_date AS segment_start,
         min(end_date, substr(start_date, 1, 4) || '-12-31') AS segment_end,
         end_date
  FROM leave_application
  UNION ALL
  SELECT application_id, applicant_id, leave_type, status,
         date(segment_end, '+1 day'),
         min(end_date, printf('%04d-12-31', CAST(substr(segment_end, 1, 4) AS INTEGER) + 1)),
         end_date
  FROM slices WHERE segment_end < end_date
)
SELECT application_id, applicant_id, leave_type, status,
       CAST(substr(segment_start, 1, 4) AS INTEGER) AS calendar_year,
       segment_start, segment_end,
       CAST(julianday(segment_end) - julianday(segment_start) + 1 AS INTEGER) AS day_count,
       CASE WHEN status = 'Approved' THEN
         max(0, CAST(julianday(min(segment_end, date('now', '+8 hours')))
                     - julianday(segment_start) + 1 AS INTEGER))
       ELSE 0 END AS taken_days
FROM slices;

-- Derived balances cannot drift away from application records. Every staff member
-- gets a current-year row even with no leave. Other years appear when requested.
CREATE VIEW leave_balance AS
WITH staff_years AS (
  SELECT id AS staff_id, CAST(strftime('%Y', 'now', '+8 hours') AS INTEGER) AS calendar_year FROM staff
  UNION
  SELECT applicant_id, calendar_year FROM leave_application_year
), types AS (
  SELECT 'annual' AS leave_type, 18 AS entitlement
  UNION ALL SELECT 'sick', 14
)
SELECT y.staff_id, y.calendar_year, t.leave_type, t.entitlement,
       COALESCE(SUM(CASE WHEN a.status = 'Pending' THEN a.day_count ELSE 0 END), 0) AS pending_days,
       COALESCE(SUM(CASE WHEN a.status = 'Approved' THEN a.day_count ELSE 0 END), 0) AS approved_days,
       COALESCE(SUM(a.taken_days), 0) AS taken_days,
       t.entitlement - COALESCE(SUM(CASE WHEN a.status IN ('Pending', 'Approved')
                                        THEN a.day_count ELSE 0 END), 0) AS remaining
FROM staff_years y CROSS JOIN types t
LEFT JOIN leave_application_year a
  ON a.applicant_id = y.staff_id AND a.calendar_year = y.calendar_year AND a.leave_type = t.leave_type
GROUP BY y.staff_id, y.calendar_year, t.leave_type, t.entitlement;

CREATE TRIGGER staff_company_email_insert BEFORE INSERT ON staff
BEGIN
  SELECT CASE WHEN NEW.email != lower(trim(NEW.email))
    OR NEW.email NOT GLOB '?*@worksmartse.hk'
    OR instr(substr(NEW.email, 1, length(NEW.email) - 15), '@') > 0
    THEN RAISE(ABORT, 'staff:company_email') END;
END;
CREATE TRIGGER staff_company_email_update BEFORE UPDATE OF email ON staff
BEGIN
  SELECT CASE WHEN NEW.email != lower(trim(NEW.email))
    OR NEW.email NOT GLOB '?*@worksmartse.hk'
    OR instr(substr(NEW.email, 1, length(NEW.email) - 15), '@') > 0
    THEN RAISE(ABORT, 'staff:company_email') END;
END;

CREATE TRIGGER leave_insert_state BEFORE INSERT ON leave_application
BEGIN
  SELECT CASE WHEN NEW.status != 'Pending' OR NEW.archived != 0
    OR NEW.decided_at IS NOT NULL OR NEW.decided_by IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL OR NEW.decision_comment != '' OR NEW.revision != 0
    THEN RAISE(ABORT, 'leave:new_pending') END;
END;

CREATE TRIGGER leave_update_state BEFORE UPDATE ON leave_application
BEGIN
  SELECT CASE WHEN NEW.id != OLD.id OR NEW.applicant_id != OLD.applicant_id
    OR NEW.submitted_at != OLD.submitted_at OR NEW.revision != OLD.revision + 1
    THEN RAISE(ABORT, 'leave:immutable') END;
  SELECT CASE WHEN NOT (
    (OLD.status = 'Pending' AND NEW.status IN ('Pending', 'Approved', 'Disapproved', 'Cancelled'))
    OR (OLD.status = 'Approved' AND NEW.status = 'Cancelled'
        AND date('now', '+8 hours') < OLD.start_date)
  ) THEN RAISE(ABORT, 'leave:transition') END;
  SELECT CASE WHEN (NEW.leave_type != OLD.leave_type OR NEW.start_date != OLD.start_date
    OR NEW.end_date != OLD.end_date OR NEW.day_count != OLD.day_count OR NEW.reason != OLD.reason)
    AND NOT (OLD.status = 'Pending' AND NEW.status = 'Pending')
    THEN RAISE(ABORT, 'leave:edit_pending') END;
  SELECT CASE WHEN NEW.archived != CASE WHEN NEW.status IN ('Approved', 'Disapproved') THEN 1 ELSE 0 END
    THEN RAISE(ABORT, 'leave:archive') END;
  SELECT CASE WHEN NEW.status = 'Cancelled' AND NEW.cancelled_at IS NULL
    THEN RAISE(ABORT, 'leave:cancel_timestamp') END;
  SELECT CASE WHEN NEW.status IN ('Approved', 'Disapproved') AND (
    NEW.decided_at IS NULL OR NEW.decided_by IS NULL
    OR NOT EXISTS (SELECT 1 FROM staff WHERE id = NEW.decided_by AND role = 'approver')
    OR (NEW.day_count > 4 AND length(trim(NEW.decision_comment)) = 0)
  ) THEN RAISE(ABORT, 'leave:decision_comment') END;
  SELECT CASE WHEN NEW.status = 'Pending' AND (
    NEW.decided_at IS NOT NULL OR NEW.decided_by IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL OR NEW.decision_comment != ''
  ) THEN RAISE(ABORT, 'leave:pending_metadata') END;
  SELECT CASE WHEN NEW.status = 'Cancelled' AND (
    NEW.decided_at IS NOT OLD.decided_at OR NEW.decided_by IS NOT OLD.decided_by
    OR NEW.decision_comment != OLD.decision_comment
  ) THEN RAISE(ABORT, 'leave:decision_immutable') END;
END;

CREATE TRIGGER leave_validate_insert BEFORE INSERT ON leave_application

BEGIN
  SELECT CASE WHEN length(NEW.start_date) != 10 OR length(NEW.end_date) != 10
    OR NEW.start_date < '1900-01-01' OR NEW.end_date > '9998-12-31'
    OR date(NEW.start_date, '+0 days') IS NOT NEW.start_date
    OR date(NEW.end_date, '+0 days') IS NOT NEW.end_date OR NEW.end_date < NEW.start_date
    OR typeof(NEW.day_count) != 'integer'
    OR NEW.day_count != CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER)
    THEN RAISE(ABORT, 'leave:dates') END;
  SELECT CASE WHEN length(NEW.reason) > 500 OR (NEW.day_count > 4 AND length(trim(NEW.reason)) = 0)
    THEN RAISE(ABORT, 'leave:reason') END;
  SELECT CASE WHEN NEW.leave_type = 'annual' AND NEW.start_date < date('now', '+8 hours', '+2 days')
    THEN RAISE(ABORT, 'leave:annual_notice') END;
  SELECT CASE WHEN NEW.leave_type = 'sick' AND NEW.end_date < date('now', '+8 hours', '-7 days')
    THEN RAISE(ABORT, 'leave:sick_backdate') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM leave_application a WHERE a.applicant_id = NEW.applicant_id AND a.id != NEW.id
      AND a.status IN ('Pending', 'Approved') AND a.start_date <= NEW.end_date AND a.end_date >= NEW.start_date
  ) THEN RAISE(ABORT, 'leave:overlap') END;
  -- Exclude the edited request: only its replacement allocation should be charged.
  -- This check runs inside the write statement, so competing submissions cannot
  -- both consume the same remaining quota after a separate stale balance read.
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE years(y) AS (
      SELECT CAST(substr(NEW.start_date, 1, 4) AS INTEGER)
      UNION ALL SELECT y + 1 FROM years WHERE y < CAST(substr(NEW.end_date, 1, 4) AS INTEGER)
    )
    SELECT 1 FROM years WHERE
      CAST(julianday(min(NEW.end_date, printf('%04d-12-31', y)))
           - julianday(max(NEW.start_date, printf('%04d-01-01', y))) + 1 AS INTEGER)
      + COALESCE((SELECT SUM(a.day_count) FROM leave_application_year a
          WHERE a.applicant_id = NEW.applicant_id AND a.application_id != NEW.id
            AND a.leave_type = NEW.leave_type AND a.calendar_year = y
            AND a.status IN ('Pending', 'Approved')), 0)
      > CASE NEW.leave_type WHEN 'annual' THEN 18 ELSE 14 END
  ) THEN RAISE(ABORT, 'leave:balance') END;
END;

CREATE TRIGGER leave_validate_edit BEFORE UPDATE OF leave_type, start_date, end_date, day_count, reason ON leave_application
WHEN OLD.status = 'Pending' AND NEW.status = 'Pending'
BEGIN
  SELECT CASE WHEN length(NEW.start_date) != 10 OR length(NEW.end_date) != 10
    OR NEW.start_date < '1900-01-01' OR NEW.end_date > '9998-12-31'
    OR date(NEW.start_date, '+0 days') IS NOT NEW.start_date
    OR date(NEW.end_date, '+0 days') IS NOT NEW.end_date OR NEW.end_date < NEW.start_date
    OR typeof(NEW.day_count) != 'integer'
    OR NEW.day_count != CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER)
    THEN RAISE(ABORT, 'leave:dates') END;
  SELECT CASE WHEN length(NEW.reason) > 500 OR (NEW.day_count > 4 AND length(trim(NEW.reason)) = 0)
    THEN RAISE(ABORT, 'leave:reason') END;
  SELECT CASE WHEN NEW.leave_type = 'annual' AND NEW.start_date < date('now', '+8 hours', '+2 days')
    THEN RAISE(ABORT, 'leave:annual_notice') END;
  SELECT CASE WHEN NEW.leave_type = 'sick' AND NEW.end_date < date('now', '+8 hours', '-7 days')
    THEN RAISE(ABORT, 'leave:sick_backdate') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM leave_application a WHERE a.applicant_id = NEW.applicant_id AND a.id != NEW.id
      AND a.status IN ('Pending', 'Approved') AND a.start_date <= NEW.end_date AND a.end_date >= NEW.start_date
  ) THEN RAISE(ABORT, 'leave:overlap') END;
  -- Exclude the edited request: only its replacement allocation should be charged.
  -- This check runs inside the write statement, so competing submissions cannot
  -- both consume the same remaining quota after a separate stale balance read.
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE years(y) AS (
      SELECT CAST(substr(NEW.start_date, 1, 4) AS INTEGER)
      UNION ALL SELECT y + 1 FROM years WHERE y < CAST(substr(NEW.end_date, 1, 4) AS INTEGER)
    )
    SELECT 1 FROM years WHERE
      CAST(julianday(min(NEW.end_date, printf('%04d-12-31', y)))
           - julianday(max(NEW.start_date, printf('%04d-01-01', y))) + 1 AS INTEGER)
      + COALESCE((SELECT SUM(a.day_count) FROM leave_application_year a
          WHERE a.applicant_id = NEW.applicant_id AND a.application_id != NEW.id
            AND a.leave_type = NEW.leave_type AND a.calendar_year = y
            AND a.status IN ('Pending', 'Approved')), 0)
      > CASE NEW.leave_type WHEN 'annual' THEN 18 ELSE 14 END
  ) THEN RAISE(ABORT, 'leave:balance') END;
END;

-- The decision and its notice commit or roll back as a single SQL statement.
CREATE TRIGGER leave_decision_notification AFTER UPDATE OF status ON leave_application
WHEN OLD.status = 'Pending' AND NEW.status IN ('Approved', 'Disapproved')
BEGIN
  INSERT INTO notification (id, recipient_id, application_id, kind, message, created_at, read_at)
  VALUES (lower(hex(randomblob(16))), NEW.applicant_id, NEW.id,
    CASE NEW.status WHEN 'Approved' THEN 'approved' ELSE 'disapproved' END,
    CASE NEW.leave_type WHEN 'annual' THEN 'Annual leave' ELSE 'Sick leave' END
      || ' from ' || NEW.start_date || ' to ' || NEW.end_date || ' (' || NEW.day_count
      || CASE WHEN NEW.day_count = 1 THEN ' day)' ELSE ' days)' END
      || ' was ' || lower(NEW.status) || '.'
      || CASE WHEN NEW.decision_comment = '' THEN '' ELSE ' Comment: ' || NEW.decision_comment END,
    NEW.decided_at, NULL);
END;
