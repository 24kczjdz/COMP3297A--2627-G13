"""Run with Python 3: python scripts/test-database.py. No third-party packages.

Each case applies the actual migrations to a fresh, foreign-key-enabled SQLite
database. The live acceptance suite separately verifies Cloudflare D1 behavior.
"""
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone, date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TODAY = datetime.now(timezone(timedelta(hours=8))).date()
FUTURE = date(TODAY.year + 1, 1, 10)


class DatabaseRules(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys = ON')
        for path in sorted((ROOT / 'migrations').glob('*.sql')):
            self.db.executescript(path.read_text(encoding='utf-8'))
        self.db.execute("""INSERT INTO staff VALUES
          ('test-staff', 'test.staff@worksmartse.hk', 'salt', 'hash', 'Test Staff',
           'TEST-001', '1990-01-01', 'Engineering', 2020, 'staff', '2026-01-01T00:00:00Z')""")

    def tearDown(self):
        self.db.close()

    def request(self, id='test', start=FUTURE, days=1, type='annual', reason=''):
        end = start + timedelta(days=days - 1)
        self.db.execute("""INSERT INTO leave_application
          (id, applicant_id, leave_type, start_date, end_date, day_count, reason,
           status, archived, submitted_at, updated_at)
          VALUES (?, 'test-staff', ?, ?, ?, ?, ?, 'Pending', 0, 'now', 'now')""",
          (id, type, str(start), str(end), days, reason))

    def update(self, id='test', **fields):
        fields['revision'] = self.db.execute('SELECT revision + 1 FROM leave_application WHERE id = ?', (id,)).fetchone()[0]
        self.db.execute('UPDATE leave_application SET ' + ', '.join(f'{k} = ?' for k in fields) + ' WHERE id = ?',
                        (*fields.values(), id))

    def decide(self, status='Approved', comment='', id='test'):
        self.update(id, status=status, archived=1, decided_by='staff-01',
                    decided_at='2026-01-01T00:00:00Z', decision_comment=comment)

    def balance(self, year=FUTURE.year, type='annual'):
        return self.db.execute('SELECT * FROM leave_balance WHERE staff_id = ? AND calendar_year = ? AND leave_type = ?',
                               ('test-staff', year, type)).fetchone()

    def rejects(self, code, action):
        with self.assertRaisesRegex(sqlite3.IntegrityError, code):
            action()

    def test_upgrade_preserves_seed(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM staff').fetchone()[0], 41)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM leave_application').fetchone()[0], 8)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM notification').fetchone()[0], 3)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_maintenance_queries_are_read_only(self):
        changes = self.db.total_changes
        for name in ['preflight.sql', 'queries.sql']:
            sql = (ROOT / 'database' / name).read_text(encoding='utf-8')
            sql = '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            for statement in sql.split(';'):
                if statement.strip():
                    self.db.execute(statement).fetchall()
        self.assertEqual(self.db.total_changes, changes)

    def test_empty_staff_gets_current_year_quotas(self):
        self.assertEqual(self.balance(TODAY.year)['remaining'], 18)
        self.assertEqual(self.balance(TODAY.year, 'sick')['remaining'], 14)

    def test_pending_reserves_and_cancel_restores(self):
        self.request(days=4)
        self.assertEqual(self.balance()['remaining'], 14)
        self.assertEqual(self.balance()['pending_days'], 4)
        self.update(status='Cancelled', cancelled_at='now')
        self.assertEqual(self.balance()['remaining'], 18)

    def test_rejection_restores_and_notifies(self):
        self.request()
        self.decide('Disapproved')
        self.assertEqual(self.balance()['remaining'], 18)
        self.assertEqual(self.db.execute("SELECT kind FROM notification WHERE application_id = 'test'").fetchone()[0], 'disapproved')

    def test_approval_does_not_deduct_twice(self):
        self.request(days=4)
        self.decide()
        self.assertEqual(self.balance()['remaining'], 14)
        self.assertEqual(self.balance()['pending_days'], 0)
        self.assertEqual(self.balance()['approved_days'], 4)
        self.update(status='Cancelled', archived=0, cancelled_at='now')
        self.assertEqual(self.balance()['remaining'], 18)

    def test_edit_replaces_old_reservation(self):
        self.request(days=4)
        self.update(end_date=str(FUTURE + timedelta(days=5)), day_count=6, reason='Extended leave')
        self.assertEqual(self.balance()['remaining'], 12)
        self.update(leave_type='sick')
        self.assertEqual(self.balance()['remaining'], 18)
        self.assertEqual(self.balance(type='sick')['remaining'], 8)

    def test_annual_notice_boundary(self):
        self.rejects('leave:annual_notice', lambda: self.request(start=TODAY + timedelta(days=1)))
        self.request(start=TODAY + timedelta(days=2))

    def test_sick_backdate_uses_last_date(self):
        self.rejects('leave:sick_backdate', lambda: self.request(start=TODAY - timedelta(days=8), type='sick'))
        self.request(start=TODAY - timedelta(days=10), days=4, type='sick')

    def test_sick_backdate_boundary(self):
        self.request(start=TODAY - timedelta(days=7), type='sick')

    def test_long_reason_boundary(self):
        self.request(days=4)
        self.rejects('leave:reason', lambda: self.request('long', FUTURE + timedelta(days=10), 5))
        self.request('long', FUTURE + timedelta(days=10), 5, reason='Family trip')

    def test_overlap_across_types_and_inclusive_endpoints(self):
        self.request(days=2)
        self.rejects('leave:overlap', lambda: self.request('overlap', FUTURE + timedelta(days=1), type='sick'))
        self.request('adjacent', FUTURE + timedelta(days=2))

    def test_approved_overlap_and_cancelled_dates_reusable(self):
        self.request()
        self.decide()
        self.rejects('leave:overlap', lambda: self.request('overlap'))
        self.update(status='Cancelled', archived=0, cancelled_at='now')
        self.request('replacement')

    def test_annual_and_sick_limits(self):
        self.request(days=18, reason='Long annual leave')
        self.rejects('leave:balance', lambda: self.request('extra', FUTURE + timedelta(days=30)))
        self.request('sick', FUTURE + timedelta(days=40), 14, 'sick', 'Recovery')
        self.rejects('leave:balance', lambda: self.request('sick-extra', FUTURE + timedelta(days=60), type='sick'))

    def test_edit_uses_same_date_and_balance_rules(self):
        self.request(days=4)
        self.rejects('leave:balance', lambda: self.update(end_date=str(FUTURE + timedelta(days=18)), day_count=19, reason='Extended'))
        self.rejects('leave:annual_notice', lambda: self.update(start_date=str(TODAY), end_date=str(TODAY), day_count=1))
        self.assertEqual(self.balance()['remaining'], 14)

    def test_cross_year_allocation(self):
        self.request(start=date(FUTURE.year, 12, 30), days=5, reason='New Year holiday')
        self.assertEqual(self.balance()['remaining'], 16)
        self.assertEqual(self.balance(FUTURE.year + 1)['remaining'], 15)
        self.decide(comment='Approved across both years')
        self.assertEqual(self.balance()['remaining'], 16)

    def test_cross_year_checks_both_years(self):
        self.request('existing', date(FUTURE.year + 1, 1, 10), 16, reason='Existing reservation')
        self.rejects('leave:balance', lambda: self.request(start=date(FUTURE.year, 12, 30), days=5, reason='Cross year'))

    def test_long_approval_and_rejection_need_comment(self):
        self.request(days=5, reason='Trip')
        self.rejects('leave:decision_comment', lambda: self.decide())
        self.rejects('leave:decision_comment', lambda: self.decide('Disapproved'))
        self.decide(comment='Coverage confirmed')
        notice = self.db.execute("SELECT message FROM notification WHERE application_id = 'test'").fetchone()[0]
        self.assertIn('Coverage confirmed', notice)

    def test_decisions_are_final_and_staff_cannot_be_decider(self):
        self.request()
        self.rejects('leave:decision_comment', lambda: self.update(status='Approved', archived=1, decided_by='test-staff', decided_at='now'))
        self.decide()
        self.rejects('leave:transition', lambda: self.decide('Disapproved'))

    def test_started_approved_leave_cannot_be_cancelled(self):
        self.request(start=TODAY, type='sick')
        self.decide()
        self.rejects('leave:transition', lambda: self.update(status='Cancelled', archived=0, cancelled_at='now'))

    def test_taken_days_exclude_future_and_pending(self):
        self.request(start=TODAY - timedelta(days=1), days=3, type='sick')
        self.assertEqual(self.balance(TODAY.year, 'sick')['taken_days'], 0)
        self.decide()
        self.assertEqual(self.balance(TODAY.year, 'sick')['taken_days'],
                         1 if TODAY.month == 1 and TODAY.day == 1 else 2)

    def test_invalid_dates_and_forged_lengths(self):
        self.request()
        self.rejects('leave:dates', lambda: self.update(day_count=1.5))
        self.rejects('leave:dates', lambda: self.update(day_count=2))
        self.rejects('leave:dates', lambda: self.update(start_date=f'{FUTURE.year}-02-30', end_date=f'{FUTURE.year}-02-30'))

    def test_notification_failure_rolls_back_decision(self):
        self.request()
        self.db.executescript("""CREATE TRIGGER test_failure BEFORE INSERT ON notification
          BEGIN SELECT RAISE(ABORT, 'test:notification_failure'); END;""")
        self.rejects('test:notification_failure', lambda: self.decide())
        self.assertEqual(self.db.execute("SELECT status FROM leave_application WHERE id = 'test'").fetchone()[0], 'Pending')
        self.assertEqual(self.balance()['pending_days'], 1)

    def test_stale_revision_cannot_overwrite(self):
        self.request()
        self.update(reason='Updated')
        result = self.db.execute("UPDATE leave_application SET status = 'Cancelled', cancelled_at = 'now', revision = revision + 1 WHERE id = 'test' AND revision = 0")
        self.assertEqual(result.rowcount, 0)

    def test_company_emails_unique_and_single_approver(self):
        self.rejects('staff:company_email', lambda: self.db.execute("UPDATE staff SET email = 'test@gmail.com' WHERE id = 'test-staff'"))
        self.rejects('staff:company_email', lambda: self.db.execute("UPDATE staff SET email = 'TEST@worksmartse.hk' WHERE id = 'test-staff'"))
        self.rejects('UNIQUE', lambda: self.db.execute("UPDATE staff SET email = 'mira.cheung@worksmartse.hk' WHERE id = 'test-staff'"))
        self.rejects('UNIQUE', lambda: self.db.execute("UPDATE staff SET role = 'approver' WHERE id = 'test-staff'"))


if __name__ == '__main__':
    unittest.main(verbosity=2)
