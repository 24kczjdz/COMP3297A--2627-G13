import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { GetBalancePreview, GetYearAllocations, ShiftDate, ValidateLeaveAvailability } from '../src/shared/leaveRules';
import { ValidateLeaveInput } from '../src/shared/validate';
import { hongKongToday } from '../src/shared/dates';
import type { LeaveRecord, LeaveStatus, Me } from '../src/shared/types';
import { Home } from '../src/client/pages/Home';
import { Profile } from '../src/client/pages/Profile';
import { LeaveList } from '../src/client/components';
import { GetDateRestriction, GetMonthDays, kAnnualNoticeHint } from '../src/client/LeaveDateInput';

const kToday = '2026-11-02';
const kPeriod = { leave_type: 'annual' as const, start_date: '2026-11-04', end_date: '2026-11-07' };
const kInput = { leaveType: 'annual', startDate: kPeriod.start_date, endDate: kPeriod.end_date };

/**
 * Summary: Build a complete own-history fixture with caller-selected overrides.
 * Parameters: overrides contains zero or more valid LeaveRecord fields.
 * Return Value: An independent record; omitted fields use a four-day pending request.
 * Side Effects & Constraints: Allocates an object; does not write storage or use time.
 */
function Record(overrides: Partial<LeaveRecord> = {}): LeaveRecord {
  return { id: 'request-1', applicantId: 'staff-1', applicantName: 'Test Staff', applicantStaffCode: 'T-001',
    leaveType: 'annual', startDate: kPeriod.start_date, endDate: kPeriod.end_date, dayCount: 4,
    reason: '', status: 'Pending', archived: false, submittedAt: '', decidedAt: null,
    cancelledAt: null, updatedAt: '', decisionComment: '', decidedBy: null, revision: 0, ...overrides };
}

test('one to four days accept absent, null, empty, and whitespace reasons', () => {
  for (const days of [1, 4]) {
    for (const reason of [undefined, null, '', '   ']) {
      const result = ValidateLeaveInput({ ...kInput, endDate: ShiftDate(kInput.startDate, days - 1), reason }, kToday);
      assert.equal(result.ok, true);
      if (result.ok) { assert.equal(result.value.reason, ''); assert.equal(result.value.dayCount, days); }
    }
  }
});

test('five days require a nonblank reason for both leave types', () => {
  for (const leave_type of ['annual', 'sick']) {
    for (const reason of [undefined, null, '', '   ']) {
      const result = ValidateLeaveInput({ ...kInput, leaveType: leave_type, endDate: '2026-11-08', reason }, kToday);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /reason is required/);
    }
    assert.equal(ValidateLeaveInput({ ...kInput, leaveType: leave_type, endDate: '2026-11-08', reason: 'Family trip' }, kToday).ok, true);
  }
});

test('annual notice rejects past, today, tomorrow and accepts exactly two days', () => {
  for (const offset of [-27, -1, 0, 1, 2]) {
    const date = ShiftDate(kToday, offset);
    assert.equal(ValidateLeaveInput({ ...kInput, startDate: date, endDate: date }, kToday).ok, offset === 2);
  }
});

test('sick backdating uses the last day and includes exactly seven days', () => {
  assert.equal(ValidateLeaveInput({ leaveType: 'sick', startDate: '2026-10-23', endDate: '2026-10-26' }, kToday).ok, true);
  assert.equal(ValidateLeaveInput({ leaveType: 'sick', startDate: '2026-10-25', endDate: '2026-10-25' }, kToday).ok, false);
});

test('Hong Kong midnight and year changes determine the notice date', () => {
  assert.equal(hongKongToday(new Date('2026-12-31T15:59:59Z')), '2026-12-31');
  assert.equal(hongKongToday(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
  assert.equal(ShiftDate('2026-12-31', 2), '2027-01-02');
});

test('invalid dates, reversed ranges and invalid reasons cannot pass validation', () => {
  for (const body of [null, [], { ...kInput, startDate: '2026-02-30' },
    { ...kInput, endDate: '2026-11-03' }, { ...kInput, reason: 12 }, { ...kInput, reason: 'a'.repeat(501) }]) {
    assert.equal(ValidateLeaveInput(body, kToday).ok, false);
  }
});

test('cross-year allocation counts inclusive days and leap days', () => {
  assert.deepEqual(GetYearAllocations('2026-12-30', '2027-01-03'), [{ year: 2026, days: 2 }, { year: 2027, days: 3 }]);
  assert.deepEqual(GetYearAllocations('2028-02-28', '2028-03-01'), [{ year: 2028, days: 3 }]);
  assert.deepEqual(GetYearAllocations('2026-02-30', '2026-03-01'), []);
});

test('pending and approved overlap across types, including the shared endpoint', () => {
  for (const status of ['Pending', 'Approved'] as LeaveStatus[]) {
    const records = [Record({ status, leaveType: 'sick' })];
    assert.match(ValidateLeaveAvailability({ ...kPeriod, start_date: '2026-11-07' }, records)!, /overlaps/);
    assert.equal(ValidateLeaveAvailability({ ...kPeriod, start_date: '2026-11-08', end_date: '2026-11-08' }, records), null);
  }
});

test('cancelled and rejected requests release dates and quota', () => {
  const records = [Record({ status: 'Cancelled' }), Record({ id: 'request-2', status: 'Disapproved' })];
  assert.equal(ValidateLeaveAvailability(kPeriod, records), null);
  assert.deepEqual(GetBalancePreview(kPeriod, records), [{ year: 2026, days: 4, available: 18, remaining: 14 }]);
});

test('editing excludes the original reservation but still checks other requests', () => {
  const own = Record();
  assert.equal(ValidateLeaveAvailability(kPeriod, [own], own.id), null);
  assert.deepEqual(GetBalancePreview(kPeriod, [own], own.id), [{ year: 2026, days: 4, available: 18, remaining: 14 }]);
  assert.match(ValidateLeaveAvailability(kPeriod, [own, Record({ id: 'other' })], own.id)!, /overlaps/);
});

test('annual and sick balances use their own quotas and derive durations from dates', () => {
  const records = [Record({ dayCount: 999 })];
  assert.equal(GetBalancePreview(kPeriod, records)[0].available, 14);
  assert.equal(GetBalancePreview({ ...kPeriod, leave_type: 'sick' }, records)[0].available, 14);
  const full = { ...kPeriod, start_date: '2026-12-01', end_date: '2026-12-14' };
  assert.equal(ValidateLeaveAvailability(full, records), null);
  assert.match(ValidateLeaveAvailability({ ...full, end_date: '2026-12-15' }, records)!, /balance/);
});

test('cross-year requests must fit every year without charging unrelated years', () => {
  const period = { ...kPeriod, start_date: '2026-12-30', end_date: '2027-01-03' };
  const records = [Record({ startDate: '2027-02-01', endDate: '2027-02-16', status: 'Approved' })];
  assert.deepEqual(GetBalancePreview(period, records), [
    { year: 2026, days: 2, available: 18, remaining: 16 }, { year: 2027, days: 3, available: 2, remaining: -1 },
  ]);
  assert.match(ValidateLeaveAvailability(period, records)!, /balance/);
});

const kMe: Me = { id: 'staff-1', email: 'test@worksmartse.hk', name: 'Test Staff', staffCode: 'T-001',
  birthday: '1990-01-01', department: 'Engineering', yearJoined: 2020, role: 'staff', quotaYear: 2026,
  hongKongToday: kToday, pendingCount: null, unreadNotifications: 0,
  quota: { annual: { entitlement: 18, remaining: 11, pending: 3, spent: 4, taken: 2 },
    sick: { entitlement: 14, remaining: 9, pending: 1, spent: 4, taken: 3 } } };

test('profile renders remaining balance independently of quota and approved days', () => {
  const markup = renderToStaticMarkup(<Profile me={kMe} />);
  assert.match(markup, /Annual leave quota \(2026\)[\s\S]*?18 days/);
  assert.match(markup, /Annual leave remaining \(2026\)[\s\S]*?11 days/);
  assert.match(markup, /Sick leave remaining \(2026\)[\s\S]*?9 days/);
});

test('dashboard contains quotas, remaining, taken days, history and approver count', () => {
  const markup = renderToStaticMarkup(<StaticRouter><Home me={{ ...kMe, role: 'approver', pendingCount: 7 }} /></StaticRouter>);
  for (const text of ['Entitlement', 'Remaining', 'Taken this year', 'Leave history', '7 applications are waiting.']) {
    assert.ok(markup.includes(text));
  }
  const staff_markup = renderToStaticMarkup(<StaticRouter><Home me={kMe} /></StaticRouter>);
  assert.equal(staff_markup.includes('Approver desk'), false);
});

test('the history renderer displays all four application statuses', () => {
  const statuses: LeaveStatus[] = ['Pending', 'Approved', 'Disapproved', 'Cancelled'];
  const markup = renderToStaticMarkup(<StaticRouter><LeaveList today={kToday}
    records={statuses.map((status) => Record({ id: status, status }))} /></StaticRouter>);
  for (const status of statuses) assert.ok(markup.includes(status));
});

test('annual calendar dates explain the notice rule and allow exactly two days ahead', () => {
  const limits = { minimum_date: '2026-11-04', maximum_date: '9998-12-31',
    annual_notice_date: '2026-11-04', minimum_message: 'The end date cannot be before the start date.' };
  for (const date of ['2026-10-06', '2026-11-02', '2026-11-03']) {
    assert.equal(GetDateRestriction(date, limits), 'You have to apply 2 days in advance.');
  }
  assert.equal(GetDateRestriction('2026-11-04', limits), null);
  const end_limits = { ...limits, minimum_date: '2026-11-10' };
  assert.equal(GetDateRestriction('2026-11-03', end_limits), kAnnualNoticeHint);
  assert.equal(GetDateRestriction('2026-11-09', end_limits), end_limits.minimum_message);
  assert.equal(GetDateRestriction('2026-11-10', end_limits), null);
});

test('sick calendar dates never show the annual notice hint', () => {
  const limits = { minimum_date: '2026-10-26', maximum_date: '9998-12-31',
    minimum_message: 'The last date of sick leave cannot be more than 7 days ago.' };
  assert.equal(GetDateRestriction('2026-10-25', limits), limits.minimum_message);
  assert.equal(GetDateRestriction('2026-10-26', limits), null);
  assert.equal(GetDateRestriction('2026-11-02', limits), null);
});

test('calendar alignment and month lengths include leap days and December boundaries', () => {
  const february = GetMonthDays('2028-02-01');
  assert.deepEqual(february.slice(0, 3), [null, null, '2028-02-01']);
  assert.equal(february.filter(Boolean).length, 29);
  assert.equal(february.at(-1), '2028-02-29');
  assert.equal(GetMonthDays('2026-02-01').filter(Boolean).length, 28);
  assert.equal(GetMonthDays('2026-12-01').at(-1), '2026-12-31');
});
