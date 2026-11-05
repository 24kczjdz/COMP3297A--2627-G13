"""Run with Python 3: python scripts/test_database.py. No third-party packages.

Each case applies the actual migrations to a fresh, foreign-key-enabled SQLite
database. The live acceptance suite separately verifies Cloudflare D1 behavior.
"""
import sqlite3
import unittest
import re
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone, date
from pathlib import Path

kRoot = Path(__file__).resolve().parents[1]
kToday = datetime.now(timezone(timedelta(hours=8))).date()
kFuture = date(kToday.year + 1, 1, 10)
kDataTables = ('staff', 'leave_application', 'notification', 'session')


@contextmanager
def StatisticsDatabase(records, utc_instant):
    """Summary: Exercise the real balance views at a deterministic Hong Kong date.

    Parameters: records is a list of valid date-range dictionaries with leave_type,
    start_date, end_date, and status; archived and decided_at are optional metadata.
    utc_instant is a valid UTC ISO timestamp, never None.
    Return Value: Yields an open SQLite connection; setup/query failures propagate.
    Side Effects & Constraints: Owns and closes two in-memory connections. Only
    SQLite's 'now' input is replaced; its date arithmetic and migration SQL remain
    unchanged. Historical fixture rows are inserted before validation is installed.
    """
    with closing(sqlite3.connect(':memory:')) as clock_db, closing(sqlite3.connect(':memory:')) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys = ON')

        def FixedDate(*arguments):
            """Summary: Evaluate SQLite date with the fixture clock replacing now.

            Parameters: arguments are SQLite date arguments; an empty list means now.
            Return Value: SQLite's ISO date or None for invalid input; SQL errors propagate.
            Side Effects & Constraints: Reads the helper connection; preserves all modifiers.
            """
            values = tuple(utc_instant if value == 'now' else value for value in arguments) or (utc_instant,)
            return clock_db.execute(f'SELECT date({", ".join("?" for value in values)})', values).fetchone()[0]

        def FixedStrftime(*arguments):
            """Summary: Format dates with SQLite using the fixture clock for now.

            Parameters: arguments contain a format, date input, and optional modifiers.
            Return Value: SQLite's formatted value or None; SQL errors propagate.
            Side Effects & Constraints: Reads the helper connection without changing state.
            """
            values = tuple(utc_instant if value == 'now' else value for value in arguments)
            return clock_db.execute(f'SELECT strftime({", ".join("?" for value in values)})', values).fetchone()[0]

        db.create_function('date', -1, FixedDate)
        db.create_function('strftime', -1, FixedStrftime)
        db.executescript((kRoot / 'migrations' / '0001_schema.sql').read_text(encoding='utf-8'))
        db.execute("""INSERT INTO staff VALUES
            ('statistics-staff', 'statistics@worksmartse.hk', 'salt', 'hash', 'Statistics Staff',
             'STAT-001', '1990-01-01', 'Engineering', 2020, 'staff', '2020-01-01T00:00:00Z')""")
        for index, record in enumerate(records):
            db.execute("""INSERT INTO leave_application
                (id, applicant_id, leave_type, start_date, end_date, reason, status, archived,
                 submitted_at, decided_at, updated_at)
                VALUES (?, 'statistics-staff', ?, ?, ?, 'Historical fixture', ?, ?,
                        '2020-01-01T00:00:00Z', ?, '2020-01-01T00:00:00Z')""",
                (f'statistics-{index}', record['leave_type'], record['start_date'], record['end_date'],
                 record['status'], record.get('archived', int(record['status'] in ('Approved', 'Disapproved'))),
                 record.get('decided_at')))
        for path in sorted((kRoot / 'migrations').glob('*.sql')):
            if path.name > '0002_seed.sql':
                db.executescript(path.read_text(encoding='utf-8'))
        yield db


def ExpectedStatistics(records, today, year, leave_type):
    """Summary: Count individual leave dates as an independent statistics oracle.

    Parameters: records contains valid fixture dictionaries; today is a Hong Kong
    date; year is a calendar year; leave_type is annual or sick. None are nullable.
    Return Value: Entitlement, pending, approved, taken, and remaining day totals.
    Side Effects & Constraints: Pure; iterates each fixture date instead of reusing
    the SQL interval formulas. Invalid fixture dates raise ValueError.
    """
    result = {'entitlement': 18 if leave_type == 'annual' else 14,
              'pending_days': 0, 'approved_days': 0, 'taken_days': 0}
    for record in records:
        if record['leave_type'] != leave_type:
            continue
        day = date.fromisoformat(record['start_date'])
        last_day = date.fromisoformat(record['end_date'])
        while day <= last_day:
            if day.year == year:
                if record['status'] == 'Pending':
                    result['pending_days'] += 1
                elif record['status'] == 'Approved':
                    result['approved_days'] += 1
                    if day <= today:
                        result['taken_days'] += 1
            day += timedelta(days=1)
    result['remaining'] = result['entitlement'] - result['pending_days'] - result['approved_days']
    return result


def ReadSchema(db):
    """Summary: Describe schema contracts independently of SQL whitespace/comments.

    Parameters: db is an open, non-null SQLite test connection with trusted schema
    names; no caller-controlled identifiers are accepted.
    Return Value: A dictionary of table metadata and tokenized index/view/trigger
    definitions. SQLite errors propagate to the calling test.
    Side Effects & Constraints: Performs read-only queries; the caller owns and
    closes db. SQL string literals retain their exact contents during comparison.
    """
    schema = {}
    for object_type, name, table_name, sql in db.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    ).fetchall():
        if object_type == 'table':
            schema[(object_type, name)] = (
                tuple(tuple(row) for row in db.execute(f'PRAGMA table_info({name})')),
                tuple(tuple(row) for row in db.execute(f'PRAGMA foreign_key_list({name})')),
                tuple(sorted(tuple(row)[1:] for row in db.execute(f'PRAGMA index_list({name})'))),
            )
        else:
            tokens = tuple(token for token in re.findall(
                r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|\S", sql
            ) if not token.startswith(('--', '/*')))
            schema[(object_type, name)] = (table_name, tokens)
    return schema


class DatabaseRules(unittest.TestCase):
    def setUp(self):
        """Summary: Create an isolated database with migrations and one extra employee.

        Parameters: self is a fresh unittest fixture; no other parameters.
        Return Value: None; migration or insertion errors fail setup.
        Side Effects & Constraints: Allocates one in-memory SQLite connection owned by self; tearDown closes it. No disk database is used.
        """
        self.db_ = sqlite3.connect(':memory:')
        self.db_.row_factory = sqlite3.Row
        self.db_.execute('PRAGMA foreign_keys = ON')
        for path in sorted((kRoot / 'migrations').glob('*.sql')):
            self.db_.executescript(path.read_text(encoding='utf-8'))
        self.db_.execute("""INSERT INTO staff
          (id, email, password_salt, password_hash, name, staff_code, birthday, department,
           year_joined, role, created_at) VALUES
          ('test-staff', 'test.staff@worksmartse.hk', 'salt', 'hash', 'Test Staff',
           'TEST-001', '1990-01-01', 'Engineering', 2020, 'staff', '2026-01-01T00:00:00Z')""")

    def tearDown(self):
        """Summary: Close the database owned by this test fixture.

        Parameters: self owns the connection created by setUp.
        Return Value: None; SQLite close errors propagate.
        Side Effects & Constraints: Releases the fixture connection after each test; no persistent storage is changed.
        """
        self.db_.close()

    def Request(self, request_id='test', start=kFuture, days=1, leave_type='annual', reason=''):
        """Summary: Insert a pending request for the fixture employee.

        Parameters: self owns the open test database; request_id is a unique non-empty ID; start is a date; days is an integer length; leave_type is annual or sick; reason is text. Defaults form a valid one-day annual request.
        Return Value: None; invalid inputs propagate SQLite constraint errors for rejection tests.
        Side Effects & Constraints: Writes only the in-memory fixture and executes its validation triggers.
        """
        end = start + timedelta(days=days - 1)
        self.db_.execute("""INSERT INTO leave_application
          (id, applicant_id, leave_type, start_date, end_date, reason,
           status, archived, submitted_at, updated_at)
          VALUES (?, 'test-staff', ?, ?, ?, ?, 'Pending', 0, 'now', 'now')""",
          (request_id, leave_type, str(start), str(end), reason))

    def Update(self, request_id='test', **fields):
        """Summary: Update one fixture request with its next revision.

        Parameters: self owns the fixture; request_id identifies an existing request; fields contains trusted SQL column names and replacement values, including invalid values in rejection tests.
        Return Value: None; lookup, SQL, or constraint errors propagate.
        Side Effects & Constraints: Writes the in-memory fixture and may trigger notifications. Column identifiers must never come from untrusted input.
        """
        fields['revision'] = self.db_.execute('SELECT revision + 1 FROM leave_application WHERE id = ?', (request_id,)).fetchone()[0]
        self.db_.execute('UPDATE leave_application SET ' + ', '.join(f'{k} = ?' for k in fields) + ' WHERE id = ?',
                        (*fields.values(), request_id))

    def Decide(self, status='Approved', comment='', request_id='test'):
        """Summary: Apply an approver decision to one fixture request.

        Parameters: self owns the fixture; status is Approved or Disapproved; comment is optional text; request_id identifies an existing request.
        Return Value: None; validation errors propagate from Update.
        Side Effects & Constraints: Updates the in-memory request and its decision notice atomically through triggers.
        """
        self.Update(request_id, status=status, archived=1, decided_by='staff-01',
                    decided_at='2026-01-01T00:00:00Z', decision_comment=comment)

    def Balance(self, year=kFuture.year, leave_type='annual'):
        """Summary: Read one employee quota row from the calculated balance view.

        Parameters: self owns the fixture; year is a calendar year; leave_type is annual or sick. Defaults select the fixture request year and annual leave.
        Return Value: The matching SQLite row, or None when no row exists; SQLite errors propagate.
        Side Effects & Constraints: Read-only query of the in-memory database; does not maintain a stored counter.
        """
        return self.db_.execute('SELECT * FROM leave_balance WHERE staff_id = ? AND calendar_year = ? AND leave_type = ?',
                               ('test-staff', year, leave_type)).fetchone()

    def Rejects(self, code, action):
        """Summary: Assert that a test action violates the expected database rule.

        Parameters: self is the initialized fixture; code is the expected exception regex; action is a non-null zero-argument callable.
        Return Value: None; missing or mismatched errors fail the assertion.
        Side Effects & Constraints: Invokes action once; it may attempt a fixture write. Only the expected SQLite integrity error is consumed.
        """
        with self.assertRaisesRegex(sqlite3.IntegrityError, code):
            action()

    def test_upgrade_preserves_seed(self):
        """Summary: Verify upgrade preserves seed.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.assertEqual(self.db_.execute('SELECT COUNT(*) FROM staff').fetchone()[0], 41)
        self.assertEqual(self.db_.execute('SELECT COUNT(*) FROM leave_application').fetchone()[0], 8)
        self.assertEqual(self.db_.execute('SELECT COUNT(*) FROM notification').fetchone()[0], 3)
        self.assertEqual(self.db_.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_staff_deletion_is_permanent_scoped_and_atomic(self):
        """Summary: Verify staff deletion is permanent scoped and atomic.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.db_.execute("INSERT INTO session VALUES ('other-session', 'staff-01', 'now', 'later')")
        def Snapshot():
            """Summary: Capture the account-related rows for atomic deletion checks.

            Parameters: None; captures the enclosing fixture connection.
            Return Value: A dictionary of ordered rows for each account-related table.
            Side Effects & Constraints: Reads only the in-memory fixture; SQLite errors propagate.
            """
            return {table: self.db_.execute(f'SELECT * FROM {table} ORDER BY id').fetchall()
                    for table in ('staff', 'leave_application', 'notification', 'session')}
        original = Snapshot()
        original['staff'] = [row for row in original['staff'] if row['id'] != 'test-staff']
        for offset, status in enumerate(('Approved', 'Disapproved', 'Cancelled', 'Pending')):
            self.Request(request_id=status, start=kFuture + timedelta(days=offset))
            if status in ('Approved', 'Disapproved'):
                self.Decide(status=status, request_id=status)
            elif status == 'Cancelled':
                self.Update(request_id=status, status=status, cancelled_at='now')
        self.db_.execute("INSERT INTO session VALUES ('departing-session', 'test-staff', 'now', 'later')")
        before = Snapshot()
        self.Rejects('staff:protected_approver', lambda: self.db_.execute("DELETE FROM staff WHERE id='staff-01'"))
        self.assertEqual(Snapshot(), before)
        self.db_.execute("""CREATE TRIGGER fail_history_delete BEFORE DELETE ON leave_application
                           BEGIN SELECT RAISE(ABORT, 'injected_failure'); END""")
        self.Rejects('injected_failure', lambda: self.db_.execute("DELETE FROM staff WHERE id='test-staff'"))
        self.assertEqual(Snapshot(), before)
        self.db_.execute("DROP TRIGGER fail_history_delete")
        self.db_.execute("DELETE FROM staff WHERE id='test-staff'")
        self.assertEqual(Snapshot(), original)
        self.assertEqual(self.db_.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_duration_migration_preserves_every_other_field(self):
        """Summary: Upgrade legacy data without changing any non-duration field.

        Parameters: self is an initialized DatabaseRules test fixture.
        Return Value: None; assertion or SQLite errors fail the test.
        Side Effects & Constraints: Uses and closes a separate in-memory database;
        archived migrations reproduce the former schema without touching disk data.
        """
        with closing(sqlite3.connect(':memory:')) as original:
            original.execute('PRAGMA foreign_keys = ON')
            for path in sorted((kRoot / 'database' / 'legacy-migrations').glob('000[123]_*.sql')):
                original.executescript(path.read_text(encoding='utf-8'))
            original.execute("INSERT INTO session VALUES ('legacy-session', 'staff-02', 'created', 'expires')")
            original.execute("""INSERT INTO leave_application
                (id, applicant_id, leave_type, start_date, end_date, day_count,
                 reason, status, archived, submitted_at, updated_at)
                VALUES ('legacy-request', 'staff-40', 'annual', ?, ?, 1,
                        'An existing request', 'Pending', 0, 'created', 'updated')""",
                (str(kFuture), str(kFuture)))
            original.execute("""UPDATE leave_application SET reason = 'An existing edited request',
                revision = revision + 1 WHERE id = 'legacy-request'""")
            queries = {}
            for table in kDataTables:
                columns = [row[1] for row in original.execute(f'PRAGMA table_info({table})')
                           if row[1] != 'day_count']
                queries[table] = f'SELECT {", ".join(columns)} FROM {table} ORDER BY id'
            before = {table: original.execute(query).fetchall() for table, query in queries.items()}
            original.executescript((kRoot / 'database' / 'legacy-migrations' / '0004_derive_leave_duration.sql').read_text(encoding='utf-8'))
            for path in sorted((kRoot / 'migrations').glob('000[56]_*.sql')):
                original.executescript(path.read_text(encoding='utf-8'))
            self.assertEqual({table: original.execute(query).fetchall() for table, query in queries.items()}, before)
            self.assertNotIn('day_count', {row[1] for row in original.execute('PRAGMA table_info(leave_application)')})
            self.assertEqual(original.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_fresh_schema_never_stores_duration_at_any_migration_step(self):
        """Summary: Ensure every fresh migration stage omits stored leave duration.

        Parameters: self is an initialized DatabaseRules test fixture.
        Return Value: None; a missing table or stored duration fails an assertion.
        Side Effects & Constraints: Applies each active migration to a disposable
        in-memory database and closes it; no existing database is read or changed.
        """
        with closing(sqlite3.connect(':memory:')) as fresh_db:
            fresh_db.execute('PRAGMA foreign_keys = ON')
            for path in sorted((kRoot / 'migrations').glob('*.sql')):
                with self.subTest(migration=path.name):
                    fresh_db.executescript(path.read_text(encoding='utf-8'))
                    columns = {row[1] for row in fresh_db.execute('PRAGMA table_info(leave_application)')}
                    self.assertIn('start_date', columns)
                    self.assertIn('end_date', columns)
                    self.assertNotIn('day_count', columns)

    def test_fresh_and_legacy_paths_produce_equivalent_schema_and_seed(self):
        """Summary: Upgrade each supported legacy prefix to the fresh schema safely.

        Parameters: self is an initialized DatabaseRules fixture using active SQL.
        Return Value: None; lost existing fields or different final schemas, seed
        records, or derived balances fail assertions.
        Side Effects & Constraints: Builds and closes a memory database per prefix;
        only missing migrations run. SQL formatting does not affect comparison.
        """
        archived_paths = sorted((kRoot / 'database' / 'legacy-migrations').glob('*.sql'))
        active_paths = sorted((kRoot / 'migrations').glob('000[56]_*.sql'))
        for completed_count in (1, 2, 3):
            with self.subTest(legacy_prefix=completed_count), closing(sqlite3.connect(':memory:')) as legacy_db:
                legacy_db.execute('PRAGMA foreign_keys = ON')
                for path in archived_paths[:completed_count]:
                    legacy_db.executescript(path.read_text(encoding='utf-8'))
                staff_columns = [row[1] for row in legacy_db.execute('PRAGMA table_info(staff)')]
                staff_values = self.db_.execute(
                    f'SELECT {", ".join(staff_columns)} FROM staff WHERE id = ?', ('test-staff',)
                ).fetchone()
                legacy_db.execute(
                    f'INSERT INTO staff ({", ".join(staff_columns)}) VALUES ({", ".join("?" for _ in staff_columns)})',
                    tuple(staff_values),
                )
                queries = {}
                for table in kDataTables:
                    columns = [row[1] for row in legacy_db.execute(f'PRAGMA table_info({table})')
                               if row[1] != 'day_count']
                    queries[table] = f'SELECT {", ".join(columns)} FROM {table} ORDER BY id'
                before_rows = {table: legacy_db.execute(query).fetchall() for table, query in queries.items()}
                for path in archived_paths[completed_count:] + active_paths:
                    legacy_db.executescript(path.read_text(encoding='utf-8'))
                for table, query in queries.items():
                    existing_ids = {row[0] for row in before_rows[table]}
                    preserved_rows = [row for row in legacy_db.execute(query) if row[0] in existing_ids]
                    self.assertEqual(preserved_rows, before_rows[table], table)
                self.assertEqual(ReadSchema(legacy_db), ReadSchema(self.db_))
                for table in kDataTables:
                    with self.subTest(table=table):
                        expected = [tuple(row) for row in self.db_.execute(f'SELECT * FROM {table} ORDER BY id')]
                        actual = legacy_db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall()
                        self.assertEqual(actual, expected)
                balance_query = 'SELECT * FROM leave_balance ORDER BY staff_id, calendar_year, leave_type'
                expected_balances = [tuple(row) for row in self.db_.execute(balance_query)]
                self.assertEqual(legacy_db.execute(balance_query).fetchall(), expected_balances)
                self.assertEqual(legacy_db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_fresh_checkpoint_refuses_legacy_duration_until_explicit_upgrade(self):
        """Summary: Reject old stored-duration tables without partially changing them.

        Parameters: self is an initialized DatabaseRules test fixture.
        Return Value: None; an unexpected success or changed data/schema fails.
        Side Effects & Constraints: Uses one memory database; simulates Wrangler's
        transactional migration rollback before checking the documented legacy path.
        """
        with closing(sqlite3.connect(':memory:')) as legacy_db:
            legacy_db.execute('PRAGMA foreign_keys = ON')
            for path in sorted((kRoot / 'database' / 'legacy-migrations').glob('000[123]_*.sql')):
                legacy_db.executescript(path.read_text(encoding='utf-8'))
            before_schema = ReadSchema(legacy_db)
            before_rows = {table: legacy_db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in kDataTables}
            checkpoint_sql = (kRoot / 'migrations' / '0004_derive_leave_duration.sql').read_text(encoding='utf-8')
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'legacy_duration_requires_upgrade'):
                legacy_db.executescript('BEGIN;\n' + checkpoint_sql + '\nCOMMIT;')
            legacy_db.rollback()
            self.assertEqual(ReadSchema(legacy_db), before_schema)
            self.assertEqual({table: legacy_db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in kDataTables}, before_rows)
            legacy_db.executescript((kRoot / 'database' / 'legacy-migrations' / '0004_derive_leave_duration.sql').read_text(encoding='utf-8'))
            upgraded_schema = ReadSchema(legacy_db)
            upgraded_rows = {table: legacy_db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in kDataTables}
            legacy_db.executescript(checkpoint_sql)
            self.assertEqual(ReadSchema(legacy_db), upgraded_schema)
            self.assertEqual({table: legacy_db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in kDataTables}, upgraded_rows)

    def test_soft_deletion_still_revokes_sessions_and_retains_history(self):
        """Summary: Preserve migration 0005's optional soft-deletion behavior.

        Parameters: self is an initialized DatabaseRules test fixture.
        Return Value: None; lost history, retained target sessions, or unrelated
        changes fail assertions.
        Side Effects & Constraints: Changes only the fixture's in-memory rows;
        permanent account deletion is not invoked by this test.
        """
        self.Request()
        self.Decide()
        self.db_.execute("INSERT INTO session VALUES ('target-session', 'test-staff', 'created', 'expires')")
        self.db_.execute("INSERT INTO session VALUES ('approver-session', 'staff-01', 'created', 'expires')")
        before_history = {table: self.db_.execute(f'SELECT * FROM {table} ORDER BY id').fetchall()
                          for table in ('leave_application', 'notification')}
        self.db_.execute("UPDATE staff SET deleted_at = '2026-11-05T00:00:00Z' WHERE id = 'test-staff'")
        self.assertEqual(self.db_.execute("SELECT deleted_at FROM staff WHERE id = 'test-staff'").fetchone()[0], '2026-11-05T00:00:00Z')
        self.assertEqual([row[0] for row in self.db_.execute('SELECT id FROM session')], ['approver-session'])
        self.assertEqual({table: self.db_.execute(f'SELECT * FROM {table} ORDER BY id').fetchall()
                          for table in ('leave_application', 'notification')}, before_history)
        self.assertEqual(self.db_.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_maintenance_queries_are_read_only(self):
        """Summary: Verify maintenance queries are read only.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        changes = self.db_.total_changes
        for name in ['preflight.sql', 'queries.sql']:
            sql = (kRoot / 'database' / name).read_text(encoding='utf-8')
            sql = '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            for statement in sql.split(';'):
                if statement.strip():
                    self.db_.execute(statement).fetchall()
        self.assertEqual(self.db_.total_changes, changes)

    def test_empty_staff_gets_current_year_quotas(self):
        """Summary: Verify empty staff gets current year quotas.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.assertEqual(self.Balance(kToday.year)['remaining'], 18)
        self.assertEqual(self.Balance(kToday.year, 'sick')['remaining'], 14)

    def test_pending_reserves_and_cancel_restores(self):
        """Summary: Verify pending reserves and cancel restores.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=4)
        self.assertEqual(self.Balance()['remaining'], 14)
        self.assertEqual(self.Balance()['pending_days'], 4)
        self.Update(status='Cancelled', cancelled_at='now')
        self.assertEqual(self.Balance()['remaining'], 18)

    def test_rejection_restores_and_notifies(self):
        """Summary: Verify rejection restores and notifies.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.Decide('Disapproved')
        self.assertEqual(self.Balance()['remaining'], 18)
        self.assertEqual(self.db_.execute("SELECT kind FROM notification WHERE application_id = 'test'").fetchone()[0], 'disapproved')

    def test_approval_does_not_deduct_twice(self):
        """Summary: Verify approval does not deduct twice.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=4)
        self.Decide()
        self.assertEqual(self.Balance()['remaining'], 14)
        self.assertEqual(self.Balance()['pending_days'], 0)
        self.assertEqual(self.Balance()['approved_days'], 4)
        self.Update(status='Cancelled', archived=0, cancelled_at='now')
        self.assertEqual(self.Balance()['remaining'], 18)

    def test_edit_replaces_old_reservation(self):
        """Summary: Verify edit replaces old reservation.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=4)
        self.Update(end_date=str(kFuture + timedelta(days=5)), reason='Extended leave')
        self.assertEqual(self.Balance()['remaining'], 12)
        self.Update(leave_type='sick')
        self.assertEqual(self.Balance()['remaining'], 18)
        self.assertEqual(self.Balance(leave_type='sick')['remaining'], 8)

    def test_annual_notice_boundary(self):
        """Summary: Verify annual notice boundary.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        for offset in [-27, -1, 0, 1]:
            self.Rejects('leave:annual_notice', lambda: self.Request(start=kToday + timedelta(days=offset)))
        self.Request(start=kToday + timedelta(days=2))

    def test_sick_backdate_uses_last_date(self):
        """Summary: Verify sick backdate uses last date.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Rejects('leave:sick_backdate', lambda: self.Request(start=kToday - timedelta(days=8), leave_type='sick'))
        self.Request(start=kToday - timedelta(days=10), days=4, leave_type='sick')

    def test_sick_backdate_boundary(self):
        """Summary: Verify sick backdate boundary.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(start=kToday - timedelta(days=7), leave_type='sick')

    def test_long_reason_boundary(self):
        """Summary: Verify long reason boundary.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=4)
        self.Rejects('leave:reason', lambda: self.Request('long', kFuture + timedelta(days=10), 5))
        self.Request('long', kFuture + timedelta(days=10), 5, reason='Family trip')

    def test_overlap_across_types_and_inclusive_endpoints(self):
        """Summary: Verify overlap across types and inclusive endpoints.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=2)
        self.Rejects('leave:overlap', lambda: self.Request('annual-overlap', kFuture + timedelta(days=1)))
        self.Rejects('leave:overlap', lambda: self.Request('overlap', kFuture + timedelta(days=1), leave_type='sick'))
        self.Request('adjacent', kFuture + timedelta(days=2))

    def test_approved_overlap_and_cancelled_dates_reusable(self):
        """Summary: Verify approved overlap and cancelled dates reusable.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.Decide()
        self.Rejects('leave:overlap', lambda: self.Request('overlap'))
        self.Update(status='Cancelled', archived=0, cancelled_at='now')
        self.Request('replacement')

    def test_annual_and_sick_limits(self):
        """Summary: Verify annual and sick limits.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=18, reason='Long annual leave')
        self.Rejects('leave:balance', lambda: self.Request('extra', kFuture + timedelta(days=30)))
        self.Request('sick', kFuture + timedelta(days=40), 14, 'sick', 'Recovery')
        self.Rejects('leave:balance', lambda: self.Request('sick-extra', kFuture + timedelta(days=60), leave_type='sick'))

    def test_edit_uses_same_date_and_balance_rules(self):
        """Summary: Verify edit uses same date and balance rules.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=4)
        self.Rejects('leave:balance', lambda: self.Update(end_date=str(kFuture + timedelta(days=18)), reason='Extended'))
        self.Rejects('leave:annual_notice', lambda: self.Update(start_date=str(kToday), end_date=str(kToday)))
        self.assertEqual(self.Balance()['remaining'], 14)

    def test_cross_year_allocation(self):
        """Summary: Verify cross year allocation.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(start=date(kFuture.year, 12, 30), days=5, reason='New Year holiday')
        self.assertEqual(self.Balance()['remaining'], 16)
        self.assertEqual(self.Balance(kFuture.year + 1)['remaining'], 15)
        self.Decide(comment='Approved across both years')
        self.assertEqual(self.Balance()['remaining'], 16)

    def test_cross_year_checks_both_years(self):
        """Summary: Verify cross year checks both years.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request('existing', date(kFuture.year + 1, 1, 10), 16, reason='Existing reservation')
        self.Rejects('leave:balance', lambda: self.Request(start=date(kFuture.year, 12, 30), days=5, reason='Cross year'))

    def test_cross_year_segments_follow_one_request_through_its_lifecycle(self):
        """Summary: Verify cross year segments follow one request through its lifecycle.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        start = date(kFuture.year, 12, 30)
        self.Request(start=start, days=5, reason='New Year holiday')
        self.assertEqual(self.db_.execute("SELECT COUNT(*) FROM leave_application WHERE id = 'test'").fetchone()[0], 1)

        def Segments():
            """Summary: Read the yearly allocations of the lifecycle test request.

            Parameters: None; captures the enclosing fixture connection.
            Return Value: The ordered yearly segment rows used by lifecycle assertions.
            Side Effects & Constraints: Reads only the in-memory fixture; SQLite errors propagate.
            """
            return [tuple(row) for row in self.db_.execute('''SELECT calendar_year, segment_start, segment_end, day_count, status
                FROM leave_application_year WHERE application_id = 'test' ORDER BY calendar_year''')]

        self.assertEqual(Segments(), [
            (kFuture.year, str(start), str(date(kFuture.year, 12, 31)), 2, 'Pending'),
            (kFuture.year + 1, str(date(kFuture.year + 1, 1, 1)), str(date(kFuture.year + 1, 1, 3)), 3, 'Pending'),
        ])
        self.Update(start_date=str(date(kFuture.year, 12, 31)), end_date=str(date(kFuture.year + 1, 1, 2)))
        self.assertEqual([(row[0], row[3]) for row in Segments()], [(kFuture.year, 1), (kFuture.year + 1, 2)])
        self.assertEqual((self.Balance()['remaining'], self.Balance(kFuture.year + 1)['remaining']), (17, 16))
        self.Decide()
        self.assertEqual((self.Balance()['approved_days'], self.Balance(kFuture.year + 1)['approved_days']), (1, 2))
        self.assertEqual((self.Balance()['pending_days'], self.Balance(kFuture.year + 1)['pending_days']), (0, 0))
        self.assertEqual((self.Balance()['remaining'], self.Balance(kFuture.year + 1)['remaining']), (17, 16))
        self.Update(status='Cancelled', archived=0, cancelled_at='now')
        self.assertEqual((self.Balance()['remaining'], self.Balance(kFuture.year + 1)['remaining']), (18, 18))
        self.assertTrue(all(row[4] == 'Cancelled' for row in Segments()))

    def test_cross_year_rejection_releases_both_years(self):
        """Summary: Verify cross year rejection releases both years.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(start=date(kFuture.year, 12, 30), days=5, reason='New Year holiday')
        self.Decide(status='Disapproved', comment='Insufficient coverage')
        self.assertEqual((self.Balance()['remaining'], self.Balance(kFuture.year + 1)['remaining']), (18, 18))
        self.assertEqual((self.Balance()['pending_days'], self.Balance(kFuture.year + 1)['pending_days']), (0, 0))

    def test_cross_year_failed_edit_preserves_both_allocations(self):
        """Summary: Verify cross year failed edit preserves both allocations.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request('existing', date(kFuture.year + 1, 1, 10), 16, reason='Existing reservation')
        self.Request(start=date(kFuture.year, 12, 30), days=3, reason='New Year holiday')
        before = [tuple(row) for row in self.db_.execute("SELECT * FROM leave_application_year WHERE application_id = 'test' ORDER BY calendar_year")]
        self.Rejects('leave:balance', lambda: self.Update(end_date=str(date(kFuture.year + 1, 1, 3))))
        after = [tuple(row) for row in self.db_.execute("SELECT * FROM leave_application_year WHERE application_id = 'test' ORDER BY calendar_year")]
        self.assertEqual(after, before)
        self.assertEqual((self.Balance()['remaining'], self.Balance(kFuture.year + 1)['remaining']), (16, 1))

    def test_long_approval_and_rejection_need_comment(self):
        """Summary: Verify long approval and rejection need comment.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(days=5, reason='Trip')
        self.Rejects('leave:decision_comment', lambda: self.Decide())
        self.Rejects('leave:decision_comment', lambda: self.Decide('Disapproved'))
        self.Decide(comment='Coverage confirmed')
        notice = self.db_.execute("SELECT message FROM notification WHERE application_id = 'test'").fetchone()[0]
        self.assertIn('Coverage confirmed', notice)

    def test_decisions_are_final_and_staff_cannot_be_decider(self):
        """Summary: Verify decisions are final and staff cannot be decider.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.Rejects('leave:decision_comment', lambda: self.Update(status='Approved', archived=1, decided_by='test-staff', decided_at='now'))
        self.Decide()
        self.Rejects('leave:transition', lambda: self.Decide('Disapproved'))

    def test_started_approved_leave_cannot_be_cancelled(self):
        """Summary: Verify started approved leave cannot be cancelled.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(start=kToday, leave_type='sick')
        self.Decide()
        self.Rejects('leave:transition', lambda: self.Update(status='Cancelled', archived=0, cancelled_at='now'))

    def test_taken_days_exclude_future_and_pending(self):
        """Summary: Verify taken days exclude future and pending.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request(start=kToday - timedelta(days=1), days=3, leave_type='sick')
        self.assertEqual(self.Balance(kToday.year, 'sick')['taken_days'], 0)
        self.Decide()
        self.assertEqual(self.Balance(kToday.year, 'sick')['taken_days'],
                         1 if kToday.month == 1 and kToday.day == 1 else 2)

    def AssertStatistics(self, db, records, today):
        """Summary: Compare every fixture balance row with independently counted days.

        Parameters: self is the fixture; db is an open statistics database; records
        are its historical rows; today is the expected Hong Kong date, never None.
        Return Value: None; missing rows, wrong metrics, inconsistent used/remaining
        quota, or foreign keys fail assertions.
        Side Effects & Constraints: Reads only; checks both types for every represented
        year and verifies that no stored duration or balance counter is required.
        """
        years = {today.year}
        for record in records:
            years.update(range(int(record['start_date'][:4]), int(record['end_date'][:4]) + 1))
        rows = db.execute('SELECT * FROM leave_balance WHERE staff_id = ?', ('statistics-staff',)).fetchall()
        self.assertEqual({(row['calendar_year'], row['leave_type']) for row in rows},
                         {(year, leave_type) for year in years for leave_type in ('annual', 'sick')})
        for row in rows:
            with self.subTest(year=row['calendar_year'], leave_type=row['leave_type']):
                expected = ExpectedStatistics(records, today, row['calendar_year'], row['leave_type'])
                self.assertEqual({key: row[key] for key in expected}, expected)
                used_quota = row['pending_days'] + row['approved_days']
                self.assertEqual(used_quota, expected['pending_days'] + expected['approved_days'])
                self.assertEqual(used_quota, row['entitlement'] - row['remaining'])
                self.assertEqual(used_quota + row['remaining'], row['entitlement'])
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_oscar_approved_future_leave_is_reserved_but_not_taken(self):
        """Summary: Distinguish Oscar's ten used annual days from zero actual taken days.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; incorrect reservations, actual taken days, or balances fail.
        Side Effects & Constraints: Uses a separate memory database fixed at 5 November
        2026; it never reads or changes Oscar's real account or the system clock.
        """
        records = [
            {'leave_type': 'annual', 'start_date': '2026-11-07', 'end_date': '2026-11-11', 'status': 'Approved'},
            {'leave_type': 'annual', 'start_date': '2026-11-12', 'end_date': '2026-11-16', 'status': 'Pending'},
            {'leave_type': 'sick', 'start_date': '2026-06-08', 'end_date': '2026-06-09', 'status': 'Approved'},
            {'leave_type': 'sick', 'start_date': '2026-10-23', 'end_date': '2026-10-29', 'status': 'Approved'},
            {'leave_type': 'annual', 'start_date': '2026-11-04', 'end_date': '2026-11-05', 'status': 'Disapproved'},
            {'leave_type': 'annual', 'start_date': '2027-03-16', 'end_date': '2027-03-18', 'status': 'Cancelled'},
        ]
        with StatisticsDatabase(records, '2026-11-05T04:00:00Z') as db:
            self.AssertStatistics(db, records, date(2026, 11, 5))
            annual = db.execute("SELECT * FROM leave_balance WHERE calendar_year = 2026 AND leave_type = 'annual'").fetchone()
            sick = db.execute("SELECT * FROM leave_balance WHERE calendar_year = 2026 AND leave_type = 'sick'").fetchone()
            self.assertEqual((annual['pending_days'], annual['approved_days'], annual['taken_days'], annual['remaining']),
                             (5, 5, 0, 8))
            used_annual_quota = annual['pending_days'] + annual['approved_days']
            self.assertEqual((used_annual_quota, annual['remaining']), (10, 8))
            self.assertEqual(used_annual_quota + annual['remaining'], 18)
            self.assertEqual((sick['approved_days'], sick['taken_days'], sick['remaining']), (9, 9, 5))

    def test_statistics_match_enumerated_days_for_all_statuses_and_periods(self):
        """Summary: Distinguish reservation and actual taken days for both leave types.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; any SQL/oracle difference fails the corresponding subtest.
        Side Effects & Constraints: Creates small disposable databases for 48 status,
        type, and period combinations; the date stays fixed and no live data is used.
        """
        periods = [('2026-10-01', '2026-10-03'), ('2026-11-05', '2026-11-05'),
                   ('2026-11-04', '2026-11-07'), ('2026-11-07', '2026-11-11'),
                   ('2025-12-30', '2026-01-03'), ('2026-12-30', '2027-01-03')]
        for leave_type in ('annual', 'sick'):
            for status in ('Pending', 'Approved', 'Disapproved', 'Cancelled'):
                for start_date, end_date in periods:
                    with self.subTest(leave_type=leave_type, status=status, start=start_date, end=end_date):
                        records = [{'leave_type': leave_type, 'start_date': start_date,
                                    'end_date': end_date, 'status': status}]
                        with StatisticsDatabase(records, '2026-11-05T04:00:00Z') as db:
                            self.AssertStatistics(db, records, date(2026, 11, 5))

    def test_statistics_advance_at_hong_kong_midnight_and_new_year(self):
        """Summary: Charge cross-year dates to their year and advance taken at HK midnight.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; wrong local year, daily cutoff, or yearly allocation fails.
        Side Effects & Constraints: Uses four frozen instants with unchanged SQL views;
        the host clock and existing databases remain untouched.
        """
        records = [{'leave_type': 'annual', 'start_date': '2026-12-30',
                    'end_date': '2027-01-03', 'status': 'Approved'}]
        instants = [('2026-12-31T15:59:59Z', date(2026, 12, 31), (2, 0)),
                    ('2026-12-31T16:00:00Z', date(2027, 1, 1), (2, 1)),
                    ('2027-01-02T16:00:00Z', date(2027, 1, 3), (2, 3)),
                    ('2027-01-03T16:00:00Z', date(2027, 1, 4), (2, 3))]
        for utc_instant, today, expected_taken in instants:
            with self.subTest(utc=utc_instant), StatisticsDatabase(records, utc_instant) as db:
                self.assertEqual(db.execute("SELECT date('now', '+8 hours')").fetchone()[0], str(today))
                self.AssertStatistics(db, records, today)
                rows = db.execute("SELECT approved_days, taken_days, remaining FROM leave_balance "
                                  "WHERE leave_type = 'annual' ORDER BY calendar_year").fetchall()
                self.assertEqual([(row['approved_days'], row['remaining']) for row in rows], [(2, 16), (3, 15)])
                self.assertEqual(tuple(row['taken_days'] for row in rows), expected_taken)

    def test_statistics_include_leap_day_once_and_today_inclusively(self):
        """Summary: Count leap-day leave once and include today's approved date.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; wrong approved/taken totals or remaining balance fails.
        Side Effects & Constraints: Uses three fixed leap-year dates in memory;
        expected counts are enumerated independently of SQLite interval arithmetic.
        """
        records = [{'leave_type': 'sick', 'start_date': '2024-02-28',
                    'end_date': '2024-03-01', 'status': 'Approved'}]
        for today, taken in ((date(2024, 2, 28), 1), (date(2024, 2, 29), 2), (date(2024, 3, 1), 3)):
            with self.subTest(today=today), StatisticsDatabase(records, f'{today}T04:00:00Z') as db:
                self.AssertStatistics(db, records, today)
                row = db.execute("SELECT * FROM leave_balance WHERE leave_type = 'sick'").fetchone()
                self.assertEqual((row['approved_days'], row['taken_days'], row['remaining']), (3, taken, 11))

    def test_statistics_follow_leave_dates_not_decision_time_or_archive_flag(self):
        """Summary: Keep reporting based on leave dates/status despite historical metadata.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; metadata-dependent balance or taken totals fail.
        Side Effects & Constraints: Historical archived flags and decision timestamps
        vary only in a disposable pre-rule fixture; current write validation is intact.
        """
        for archived in (0, 1):
            for decided_at in (None, '2025-01-01T00:00:00Z', '2026-11-05T04:00:00Z'):
                with self.subTest(archived=archived, decided_at=decided_at):
                    records = [{'leave_type': 'annual', 'start_date': '2026-11-04',
                                'end_date': '2026-11-07', 'status': 'Approved',
                                'archived': archived, 'decided_at': decided_at}]
                    with StatisticsDatabase(records, '2026-11-05T04:00:00Z') as db:
                        self.AssertStatistics(db, records, date(2026, 11, 5))
                        row = db.execute("SELECT * FROM leave_balance WHERE leave_type = 'annual'").fetchone()
                        self.assertEqual((row['approved_days'], row['taken_days'], row['remaining']), (4, 2, 14))

    def test_duration_is_derived_and_cannot_be_written(self):
        """Summary: Verify duration is derived and cannot be written.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        columns = {row['name'] for row in self.db_.execute('PRAGMA table_info(leave_application)')}
        self.assertNotIn('day_count', columns)
        self.Request(days=3)
        with self.assertRaisesRegex(sqlite3.OperationalError, 'no such column: day_count'):
            self.Update(day_count=99)
        self.assertEqual(self.Balance()['pending_days'], 3)
        self.Update(end_date=str(kFuture))
        self.assertEqual(self.Balance()['pending_days'], 1)

    def test_invalid_dates(self):
        """Summary: Verify invalid dates.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.Rejects('leave:dates', lambda: self.Update(start_date=f'{kFuture.year}-02-30', end_date=f'{kFuture.year}-02-30'))

    def test_notification_failure_rolls_back_decision(self):
        """Summary: Verify notification failure rolls back decision.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.db_.executescript("""CREATE TRIGGER test_failure BEFORE INSERT ON notification
          BEGIN SELECT RAISE(ABORT, 'test:notification_failure'); END;""")
        self.Rejects('test:notification_failure', lambda: self.Decide())
        self.assertEqual(self.db_.execute("SELECT status FROM leave_application WHERE id = 'test'").fetchone()[0], 'Pending')
        self.assertEqual(self.Balance()['pending_days'], 1)

    def test_stale_revision_cannot_overwrite(self):
        """Summary: Verify stale revision cannot overwrite.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Request()
        self.Update(reason='Updated')
        result = self.db_.execute("UPDATE leave_application SET status = 'Cancelled', cancelled_at = 'now', revision = revision + 1 WHERE id = 'test' AND revision = 0")
        self.assertEqual(result.rowcount, 0)

    def test_company_emails_unique_and_single_approver(self):
        """Summary: Verify company emails unique and single approver.

        Parameters: self is an initialized DatabaseRules fixture; no other parameters.
        Return Value: None; failed assertions or unexpected SQLite errors fail the test.
        Side Effects & Constraints: Reads or mutates only the disposable in-memory fixture; unittest closes its connection after the test.
        """
        self.Rejects('staff:company_email', lambda: self.db_.execute("UPDATE staff SET email = 'test@gmail.com' WHERE id = 'test-staff'"))
        self.Rejects('staff:company_email', lambda: self.db_.execute("UPDATE staff SET email = 'TEST@worksmartse.hk' WHERE id = 'test-staff'"))
        self.Rejects('UNIQUE', lambda: self.db_.execute("UPDATE staff SET email = 'mira.cheung@worksmartse.hk' WHERE id = 'test-staff'"))
        self.Rejects('UNIQUE', lambda: self.db_.execute("UPDATE staff SET role = 'approver' WHERE id = 'test-staff'"))


if __name__ == '__main__':
    unittest.main(verbosity=2)
