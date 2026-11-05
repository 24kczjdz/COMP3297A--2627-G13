-- Installing this trigger does not delete existing staff or historical records.
-- A confirmed staff DELETE removes dependants in foreign-key order within
-- the same statement. Any failure rolls back the entire deletion.
CREATE TRIGGER staff_delete_dependants BEFORE DELETE ON staff
BEGIN
  SELECT CASE WHEN OLD.role = 'approver'
    THEN RAISE(ABORT, 'staff:protected_approver') END;

  DELETE FROM notification
  WHERE recipient_id = OLD.id
     OR application_id IN (SELECT id FROM leave_application WHERE applicant_id = OLD.id);
  DELETE FROM session WHERE staff_id = OLD.id;
  DELETE FROM leave_application WHERE applicant_id = OLD.id;
END;
