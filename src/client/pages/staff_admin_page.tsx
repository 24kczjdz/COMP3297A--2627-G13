import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { kCompanyDomain } from "../../shared/constants";
import { FormatLongDate, HongKongToday } from "../../shared/dates";
import type { StaffAccount } from "../../shared/types";
import { ApiError, CreateStaff, DeleteStaffAccount, GetStaff, GetStaffMember, UpdateStaff } from "../api";
import { DangerButton, ErrorNote, Field, LoadingNote, PageTitle, PrimaryButton, TextInput } from "../components";
import { useTitle } from "../use_title";
import { useAuth } from "../auth";
import { ResetPasswordForm } from "../reset_password_form";

/**
 * Summary: Display staff accounts and confirmed account-deletion controls.
 * Parameters: None; requires the approver route.
 * Return Value: Account rows, deletion feedback, and create/edit actions.
 * Side Effects & Constraints: Loads staff on mount; user-confirmed deletion removes the account and
 * history through the API.
 */
export function StaffList() {
  useTitle("Staff accounts");
  const { refresh: Refresh } = useAuth();
  const [staff, SetStaff] = useState<StaffAccount[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [delete_target, SetDeleteTarget] = useState<StaffAccount | null>(null);
  const [notice, SetNotice] = useState("");

  useEffect(() => {
    GetStaff()
      .then((result) => SetStaff(result.staff))
      .catch((caught: unknown) => {
        SetError(caught instanceof ApiError ? caught.message : "Staff accounts could not be loaded.");
      });
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Staff accounts" lede="Create a company email and an initial password. Staff cannot register themselves." />
        <Link to="/approver/staff/new" className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white">
          Create account
        </Link>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <p role="status" className="mb-2 text-sm text-forest">{notice}</p>
      {staff === null && !error ? <LoadingNote label="Loading staff…" /> : null}
      {staff ? (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-card">
          {staff.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">
                  {person.name} <span className="font-normal text-stone-500">{person.staffCode}</span>
                </p>
                <p className="text-sm text-stone-600">
                  {person.email} · {person.department} · joined {person.yearJoined}
                  {person.role === "approver" ? " · Approver" : ""}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Link to={`/approver/staff/${person.id}/edit`} className="text-sm font-medium underline">
                  Edit profile
                </Link>
                {person.role === "staff" ? (
                  <button type="button" aria-label={`Delete account for ${person.name}`}
                    className="text-sm font-medium text-red-800 underline"
                    onClick={() => { SetNotice(""); SetDeleteTarget(person); }}>Delete account</button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {delete_target ? (
        <DeleteAccountDialog person={delete_target} on_cancel={() => SetDeleteTarget(null)}
          on_deleted={() => {
            SetStaff((rows) => rows?.filter((person) => person.id !== delete_target.id) ?? null);
            SetNotice(`Account deleted for ${delete_target.name}.`);
            SetDeleteTarget(null);
            void Refresh();
          }} />
      ) : null}
    </div>
  );
}

/**
 * Summary: Confirm permanent deletion of one ordinary staff account.
 * Parameters: person is the non-null target account; on_cancel dismisses the dialog;
 * on_deleted runs only after deletion succeeds. Both callbacks are required.
 * Return Value: A native confirmation dialog with modal keyboard focus.
 * Side Effects & Constraints: Opens/closes the modal on mount/unmount. The password
 * stays in its input, is cleared on attempts, and is discarded when the dialog closes.
 */
function DeleteAccountDialog({ person, on_cancel: OnCancel, on_deleted: OnDeleted }: {
  person: StaffAccount; on_cancel: () => void; on_deleted: () => void;
}) {
  const dialog_ref = useRef<HTMLDialogElement>(null);
  const [pending, SetPending] = useState(false);
  const [error, SetError] = useState("");
  useEffect(() => {
    const dialog = dialog_ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  /**
   * Summary: Submit the confirmed account deletion.
   * Parameters: event is the non-null submission event from the validated form.
   * Return Value: Resolves after deletion or a visible error; repeated pending
   * submissions return without another request.
   * Side Effects & Constraints: Prevents navigation, clears the password, and
   * sends one authenticated deletion request before invoking OnDeleted.
   */
  async function OnConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    if (typeof password !== "string" || !password) return;
    form.reset();
    SetPending(true);
    SetError("");
    try {
      await DeleteStaffAccount(person.id, password);
      OnDeleted();
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "The account could not be deleted.");
    } finally {
      SetPending(false);
    }
  }

  return (
    <dialog ref={dialog_ref} aria-labelledby="delete-account-title" aria-describedby="delete-account-description"
      className="m-auto w-[min(28rem,90vw)] rounded-lg border border-rule bg-card p-5 text-ink shadow-lg backdrop:bg-black/40"
      onCancel={(event) => { event.preventDefault(); if (!pending) OnCancel(); }}>
      <h2 id="delete-account-title" className="font-serif text-2xl">Delete staff account?</h2>
      <p id="delete-account-description" className="my-3 text-sm">
        This will permanently delete the account for <strong>{person.name}</strong> ({person.email}),
        all their leave requests (including pending and approved leave), and related notifications.
        They will be signed out of all sessions. This cannot be undone.
      </p>
      <form onSubmit={OnConfirm} className="space-y-4">
        <Field label="Your approver password">
          <TextInput type="password" name="password" autoComplete="current-password" required
            readOnly={pending} autoFocus />
        </Field>
        {error ? <ErrorNote message={error} /> : null}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={pending} onClick={OnCancel} className="text-sm underline">Cancel</button>
          <DangerButton type="submit" disabled={pending}>{pending ? "Deleting…" : "Delete account"}</DangerButton>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Summary: Create a staff account or edit an existing profile.
 * Parameters: mode selects creation or editing; edit mode requires a route staff ID.
 * Return Value: The account form or the issued staff ID and initial password.
 * Side Effects & Constraints: Loads/saves through the API and resets on route changes.
 * New accounts default to the Hong Kong current year; the server assigns staff IDs.
 */
export function StaffForm({ mode }: { mode: "new" | "edit" }) {
  useTitle(mode === "new" ? "Create account" : "Edit profile");
  const { id } = useParams();
  const Navigate = useNavigate();
  const [email, SetEmail] = useState("");
  const [password, SetPassword] = useState("");
  const [name, SetName] = useState("");
  const [staff_code, SetStaffCode] = useState("");
  const [birthday, SetBirthday] = useState("");
  const [department, SetDepartment] = useState("");
  const [year_joined, SetYearJoined] = useState(() => HongKongToday().slice(0, 4));
  const [role_note, SetRoleNote] = useState<string | null>(null);
  const [reset_account, SetResetAccount] = useState<StaffAccount | null>(null);
  const [issued_password, SetIssuedPassword] = useState<string | null>(null);
  const [created_name, SetCreatedName] = useState<string | null>(null);
  const [issued_staff_code, SetIssuedStaffCode] = useState<string | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [loading, SetLoading] = useState(mode === "edit");
  const [pending, SetPending] = useState(false);

  useEffect(() => {
    let active = true;
    SetEmail("");
    SetPassword("");
    SetName("");
    SetStaffCode("");
    SetBirthday("");
    SetDepartment("");
    SetYearJoined(HongKongToday().slice(0, 4));
    SetRoleNote(null);
    SetResetAccount(null);
    SetIssuedPassword(null);
    SetCreatedName(null);
    SetIssuedStaffCode(null);
    SetError(null);
    SetLoading(mode === "edit");
    if (mode !== "edit" || !id) return () => { active = false; };
    GetStaffMember(id)
      .then((person) => {
        if (!active) return;
        SetEmail(person.email);
        SetName(person.name);
        SetStaffCode(person.staffCode);
        SetBirthday(person.birthday);
        SetDepartment(person.department);
        SetYearJoined(String(person.yearJoined));
        if (person.role === "staff") SetResetAccount(person);
        if (person.role === "approver") {
          SetRoleNote("This is the approver account. The role stays approver.");
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        SetError(caught instanceof ApiError ? caught.message : "That account could not be opened.");
      })
      .finally(() => {
        if (active) SetLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, id]);

  /**
   * Summary: Create a staff account or save the current profile edits.
   * Parameters: event is the non-null form submission event; the enclosing mode selects
   * creation/editing.
   * Return Value: Resolves after showing issued credentials, navigating back, or displaying an error.
   * Side Effects & Constraints: Prevents navigation, sends profile data, and updates UI; password
   * reset is a separate form.
   */
  async function OnSubmit(event: FormEvent) {
    event.preventDefault();
    SetPending(true);
    SetError(null);
    const body = { email, name, birthday, department, yearJoined: Number(year_joined), password };
    try {
      if (mode === "new") {
        const result = await CreateStaff(body);
        SetIssuedPassword(result.initialPassword);
        SetCreatedName(result.staff.name);
        SetIssuedStaffCode(result.staff.staffCode);
        SetPassword("");
      } else if (id) {
        await UpdateStaff(id, { ...body, staffCode: staff_code });
        Navigate("/approver/staff");
      }
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "The account could not be saved.");
    } finally {
      SetPending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageTitle
        title={mode === "new" ? "Create a staff account" : "Edit profile"}
        lede={`Email addresses must end in @${kCompanyDomain}. A new account is always a staff account.`}
      />
      {loading ? <LoadingNote label="Loading the account…" /> : null}
      {error ? <div className="mb-4"><ErrorNote message={error} /></div> : null}
      {role_note ? <p className="mb-4 text-sm text-stone-700">{role_note}</p> : null}
      {issued_password && created_name ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-medium">Account created for {created_name}.</p>
          <p className="mt-2 text-sm">Staff ID: <span className="font-semibold">{issued_staff_code}</span></p>
          <p className="mt-2 text-sm">
            Initial password: <span className="font-semibold">{issued_password}</span>
          </p>
          <p className="mt-1 text-sm">Give this to the staff member now. It will not be shown again, and it is not stored on the profile.</p>
          <Link to="/approver/staff" className="mt-3 inline-block text-sm font-medium underline">
            Back to staff accounts
          </Link>
        </div>
      ) : null}
      {!loading && !issued_password ? (
        <form onSubmit={OnSubmit} className="space-y-4 rounded-lg border border-rule bg-card p-5">
          <Field label="Company email">
            <TextInput type="email" required value={email} onChange={(event) => SetEmail(event.target.value)} />
          </Field>
          {mode === "new" ? (
            <Field label="Initial password" hint="8 to 72 characters. Shown once after you create the account.">
              <TextInput
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => SetPassword(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Name">
            <TextInput required value={name} onChange={(event) => SetName(event.target.value)} />
          </Field>
          <Field label="Staff ID">
            {mode === "new" ? (
              <p className="text-sm text-stone-600">Assigned automatically when the account is created.</p>
            ) : (
              <TextInput required value={staff_code} onChange={(event) => SetStaffCode(event.target.value)} />
            )}
          </Field>
          <Field label="Birthday" hint={birthday ? FormatLongDate(birthday) : undefined}>
            <TextInput type="date" required value={birthday} onChange={(event) => SetBirthday(event.target.value)} />
          </Field>
          <Field label="Department">
            <TextInput required value={department} onChange={(event) => SetDepartment(event.target.value)} />
          </Field>
          <Field label="Year joined">
            <TextInput
              inputMode="numeric"
              required
              value={year_joined}
              onChange={(event) => SetYearJoined(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-4">
            <PrimaryButton type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "new" ? "Create account" : "Save profile"}
            </PrimaryButton>
            <Link to="/approver/staff" className="text-sm underline">
              Back to staff
            </Link>
          </div>
        </form>
      ) : null}
      {mode === "edit" && !loading && reset_account && reset_account.id === id ? (
        <ResetPasswordForm key={reset_account.id} staff_id={reset_account.id} staff_name={reset_account.name} />
      ) : null}
    </div>
  );
}
