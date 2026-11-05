-- Keep the staff ID and profile for historical leave reports after deleting login access.
ALTER TABLE staff ADD COLUMN deleted_at TEXT
  CHECK (deleted_at IS NULL OR role = 'staff');

-- Session revocation commits or rolls back with the deletion.
CREATE TRIGGER staff_delete_sessions AFTER UPDATE OF deleted_at ON staff
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM session WHERE staff_id = NEW.id;
END;
