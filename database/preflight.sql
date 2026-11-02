-- READ ONLY. Date-based checks work before and after migrations 0003/0004.
-- Each nonempty result set needs review. Never silently delete historical data.
SELECT lower(trim(email)) AS normalized_email, COUNT(*) AS accounts
FROM staff GROUP BY lower(trim(email)) HAVING COUNT(*) > 1;

SELECT COUNT(*) AS approver_count FROM staff WHERE role = 'approver' HAVING COUNT(*) > 1;

SELECT id, start_date, end_date FROM leave_application
WHERE length(start_date) != 10 OR length(end_date) != 10
   OR date(start_date, '+0 days') IS NOT start_date
   OR date(end_date, '+0 days') IS NOT end_date OR end_date < start_date;

SELECT a.applicant_id, a.id AS application_a, b.id AS application_b
FROM leave_application a JOIN leave_application b
  ON a.applicant_id = b.applicant_id AND a.id < b.id
WHERE a.status IN ('Pending', 'Approved') AND b.status IN ('Pending', 'Approved')
  AND a.start_date <= b.end_date AND a.end_date >= b.start_date;

WITH RECURSIVE allocations AS (
  SELECT id, applicant_id, leave_type, start_date, end_date,
         CAST(substr(start_date, 1, 4) AS INTEGER) AS calendar_year
  FROM leave_application WHERE status IN ('Pending', 'Approved')
  UNION ALL
  SELECT id, applicant_id, leave_type, start_date, end_date, calendar_year + 1
  FROM allocations WHERE calendar_year < CAST(substr(end_date, 1, 4) AS INTEGER)
)
SELECT applicant_id, calendar_year, leave_type,
       SUM(CAST(julianday(min(end_date, printf('%04d-12-31', calendar_year)))
         - julianday(max(start_date, printf('%04d-01-01', calendar_year))) + 1 AS INTEGER)) AS reserved_days
FROM allocations GROUP BY applicant_id, calendar_year, leave_type
HAVING reserved_days > CASE leave_type WHEN 'annual' THEN 18 ELSE 14 END;
