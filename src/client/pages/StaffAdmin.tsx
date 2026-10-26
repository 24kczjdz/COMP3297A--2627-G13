import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { COMPANY_DOMAIN } from "../../shared/constants";
import { formatLongDate } from "../../shared/dates";
import type { StaffAccount } from "../../shared/types";
import { ApiError, createStaff, getStaff, getStaffMember, updateStaff } from "../api";
import { ErrorNote, Field, LoadingNote, PageTitle, PrimaryButton, TextInput } from "../components";
import { useTitle } from "../useTitle";

export function StaffList() {
  useTitle("Staff accounts");
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStaff()
      .then((result) => setStaff(result.staff))
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : "Staff accounts could not be loaded.");
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
              <Link to={`/approver/staff/${person.id}/edit`} className="text-sm font-medium underline">
                Edit profile
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StaffForm({ mode }: { mode: "new" | "edit" }) {
  useTitle(mode === "new" ? "Create account" : "Edit profile");
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [birthday, setBirthday] = useState("");
  const [department, setDepartment] = useState("");
  const [yearJoined, setYearJoined] = useState("2024");
  const [roleNote, setRoleNote] = useState<string | null>(null);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let active = true;
    getStaffMember(id)
      .then((person) => {
        if (!active) return;
        setEmail(person.email);
        setName(person.name);
        setStaffCode(person.staffCode);
        setBirthday(person.birthday);
        setDepartment(person.department);
        setYearJoined(String(person.yearJoined));
        if (person.role === "approver") {
          setRoleNote("This is the approver account. The role stays approver.");
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : "That account could not be opened.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, id]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body = { email, name, staffCode, birthday, department, yearJoined: Number(yearJoined), password };
    try {
      if (mode === "new") {
        const result = await createStaff(body);
        setIssuedPassword(result.initialPassword);
        setCreatedName(result.staff.name);
        setPassword("");
      } else if (id) {
        await updateStaff(id, body);
        navigate("/approver/staff");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The account could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageTitle
        title={mode === "new" ? "Create a staff account" : "Edit profile"}
        lede={`Email addresses must end in @${COMPANY_DOMAIN}. A new account is always a staff account.`}
      />
      {loading ? <LoadingNote label="Loading the account…" /> : null}
      {error ? <div className="mb-4"><ErrorNote message={error} /></div> : null}
      {roleNote ? <p className="mb-4 text-sm text-stone-700">{roleNote}</p> : null}
      {issuedPassword && createdName ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-medium">Account created for {createdName}.</p>
          <p className="mt-2 text-sm">
            Initial password: <span className="font-semibold">{issuedPassword}</span>
          </p>
          <p className="mt-1 text-sm">Give this to the staff member now. It will not be shown again, and it is not stored on the profile.</p>
          <Link to="/approver/staff" className="mt-3 inline-block text-sm font-medium underline">
            Back to staff accounts
          </Link>
        </div>
      ) : null}
      {!loading && !issuedPassword ? (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-rule bg-card p-5">
          <Field label="Company email">
            <TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          {mode === "new" ? (
            <Field label="Initial password" hint="8 to 72 characters. Shown once after you create the account.">
              <TextInput
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Name">
            <TextInput required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Staff ID">
            <TextInput required value={staffCode} onChange={(event) => setStaffCode(event.target.value)} />
          </Field>
          <Field label="Birthday" hint={birthday ? formatLongDate(birthday) : undefined}>
            <TextInput type="date" required value={birthday} onChange={(event) => setBirthday(event.target.value)} />
          </Field>
          <Field label="Department">
            <TextInput required value={department} onChange={(event) => setDepartment(event.target.value)} />
          </Field>
          <Field label="Year joined">
            <TextInput
              inputMode="numeric"
              required
              value={yearJoined}
              onChange={(event) => setYearJoined(event.target.value)}
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
    </div>
  );
}
