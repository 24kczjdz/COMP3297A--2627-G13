-- READ ONLY. Run after migration 0003. Dates follow Asia/Hong_Kong (UTC+8).
-- All current-year balances, including staff without applications.
SELECT s.staff_code, s.name, b.* FROM leave_balance b JOIN staff s ON s.id = b.staff_id
WHERE b.calendar_year = CAST(strftime('%Y', 'now', '+8 hours') AS INTEGER)
ORDER BY s.staff_code, b.leave_type;

-- Pending queue, sorted by the requested leave start date.
SELECT s.staff_code, s.name, a.* FROM leave_application a JOIN staff s ON s.id = a.applicant_id
WHERE a.status = 'Pending' ORDER BY a.start_date, a.submitted_at, a.id;

-- All statuses on a particular leave date. Replace the sample literal as needed.
SELECT s.staff_code, s.name, a.* FROM leave_application a JOIN staff s ON s.id = a.applicant_id
WHERE a.start_date <= '2027-03-17' AND a.end_date >= '2027-03-17'
ORDER BY s.name, a.start_date;

-- Explain allocation of requests that span calendar years.
SELECT * FROM leave_application_year ORDER BY application_id, calendar_year;

-- Integrity checks; inspect any returned row before making corrections.
PRAGMA foreign_key_check;
SELECT * FROM leave_balance WHERE remaining < 0;
