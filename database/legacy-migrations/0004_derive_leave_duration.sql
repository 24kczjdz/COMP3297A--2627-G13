-- Remove the redundant stored duration without rewriting applied migrations.
-- Parameters: none; requires migrations 0001 through 0003.
-- Result: all request fields, foreign keys, indexes, and history are preserved
-- except day_count, which is now calculated from the inclusive date range.
-- Constraints: apply with the matching Worker during a write maintenance window.
-- The existing yearly allocation/balance views already derive their own lengths.

DROP TRIGGER leave_update_state;
DROP TRIGGER leave_validate_insert;
DROP TRIGGER leave_validate_edit;
DROP TRIGGER leave_decision_notification;

ALTER TABLE leave_application DROP COLUMN day_count;

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
    OR NEW.end_date != OLD.end_date OR NEW.reason != OLD.reason)
    AND NOT (OLD.status = 'Pending' AND NEW.status = 'Pending')
    THEN RAISE(ABORT, 'leave:edit_pending') END;
  SELECT CASE WHEN NEW.archived != CASE WHEN NEW.status IN ('Approved', 'Disapproved') THEN 1 ELSE 0 END
    THEN RAISE(ABORT, 'leave:archive') END;
  SELECT CASE WHEN NEW.status = 'Cancelled' AND NEW.cancelled_at IS NULL
    THEN RAISE(ABORT, 'leave:cancel_timestamp') END;
  SELECT CASE WHEN NEW.status IN ('Approved', 'Disapproved') AND (
    NEW.decided_at IS NULL OR NEW.decided_by IS NULL
    OR NOT EXISTS (SELECT 1 FROM staff WHERE id = NEW.decided_by AND role = 'approver')
    OR (CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER) > 4 AND length(trim(NEW.decision_comment)) = 0)
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
    THEN RAISE(ABORT, 'leave:dates') END;
  SELECT CASE WHEN length(NEW.reason) > 500 OR (CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER) > 4 AND length(trim(NEW.reason)) = 0)
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

CREATE TRIGGER leave_validate_edit BEFORE UPDATE OF leave_type, start_date, end_date, reason ON leave_application
WHEN OLD.status = 'Pending' AND NEW.status = 'Pending'
BEGIN
  SELECT CASE WHEN length(NEW.start_date) != 10 OR length(NEW.end_date) != 10
    OR NEW.start_date < '1900-01-01' OR NEW.end_date > '9998-12-31'
    OR date(NEW.start_date, '+0 days') IS NOT NEW.start_date
    OR date(NEW.end_date, '+0 days') IS NOT NEW.end_date OR NEW.end_date < NEW.start_date
    THEN RAISE(ABORT, 'leave:dates') END;
  SELECT CASE WHEN length(NEW.reason) > 500 OR (CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER) > 4 AND length(trim(NEW.reason)) = 0)
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
      || ' from ' || NEW.start_date || ' to ' || NEW.end_date || ' (' || CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER)
      || CASE WHEN CAST(julianday(NEW.end_date) - julianday(NEW.start_date) + 1 AS INTEGER) = 1 THEN ' day)' ELSE ' days)' END
      || ' was ' || lower(NEW.status) || '.'
      || CASE WHEN NEW.decision_comment = '' THEN '' ELSE ' Comment: ' || NEW.decision_comment END,
    NEW.decided_at, NULL);
END;
