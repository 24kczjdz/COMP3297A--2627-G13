CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  staff_code TEXT NOT NULL UNIQUE,
  birthday TEXT NOT NULL,
  department TEXT NOT NULL,
  year_joined INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('staff', 'approver')),
  created_at TEXT NOT NULL
);

CREATE TABLE leave_application (
  id TEXT PRIMARY KEY,
  applicant_id TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  day_count INTEGER NOT NULL CHECK (day_count >= 1),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Disapproved', 'Cancelled')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  submitted_at TEXT NOT NULL,
  decided_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (applicant_id) REFERENCES staff(id)
);

CREATE TABLE notification (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('approved', 'disapproved')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (recipient_id) REFERENCES staff(id),
  FOREIGN KEY (application_id) REFERENCES leave_application(id)
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES staff(id)
);

CREATE INDEX idx_leave_applicant ON leave_application (applicant_id);
CREATE INDEX idx_leave_status ON leave_application (status);
CREATE INDEX idx_leave_dates ON leave_application (start_date, end_date);
CREATE INDEX idx_notification_recipient ON notification (recipient_id);
CREATE INDEX idx_session_staff ON session (staff_id);
