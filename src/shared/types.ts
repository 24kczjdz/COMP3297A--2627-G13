export type Role = "staff" | "approver";
export type LeaveType = "annual" | "sick";
export type LeaveStatus = "Pending" | "Approved" | "Disapproved" | "Cancelled";

export type QuotaSide = {
  entitlement: number;
  spent: number;
  pending: number;
  remaining: number;
  taken: number;
};

export type Me = {
  id: string;
  email: string;
  name: string;
  staffCode: string;
  birthday: string;
  department: string;
  yearJoined: number;
  role: Role;
  quota: {
    annual: QuotaSide;
    sick: QuotaSide;
  };
  unreadNotifications: number;
  pendingCount: number | null;
  hongKongToday: string;
  quotaYear: number;
};

export type LeaveRecord = {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantStaffCode: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  status: LeaveStatus;
  archived: boolean;
  submittedAt: string;
  decidedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  decisionComment: string;
  decidedBy: string | null;
  revision: number;
};

export type Notice = {
  id: string;
  applicationId: string;
  kind: "approved" | "disapproved";
  message: string;
  createdAt: string;
  readAt: string | null;
};

export type StaffAccount = {
  id: string;
  email: string;
  name: string;
  staffCode: string;
  birthday: string;
  department: string;
  yearJoined: number;
  role: Role;
};
