import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { kCompanyDomain } from "../../shared/constants";
import { ApiError, SignIn as SignInRequest } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, Field, PrimaryButton, TextInput } from "../components";

/**
 * Summary: Render the sign-in form or redirect an authenticated account.
 * Parameters: None; reads the surrounding authentication context.
 * Return Value: The form, session-loading message, or home redirect.
 * Side Effects & Constraints: Sets the document title and stores form values only in component
 * state.
 */
export function SignIn() {
  const { me, ready, refresh: Refresh } = useAuth();
  const [email, SetEmail] = useState("");
  const [password, SetPassword] = useState("");
  const [error, SetError] = useState<string | null>(null);
  const [pending, SetPending] = useState(false);

  useEffect(() => {
    document.title = "Sign in · LeaveFlowSE";
  }, []);

  if (!ready) return <p className="p-8 text-sm text-stone-600">Checking your session…</p>;
  if (me) return <Navigate to="/" replace />;

  /**
   * Summary: Sign in using the entered company credentials.
   * Parameters: event is the non-null form submission event.
   * Return Value: Resolves after refreshing authentication or displaying an error.
   * Side Effects & Constraints: Prevents form navigation, posts credentials, and updates
   * pending/error state.
   */
  async function OnSubmit(event: FormEvent) {
    event.preventDefault();
    SetPending(true);
    SetError(null);
    try {
      await SignInRequest(email, password);
      await Refresh();
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "LeaveFlowSE could not sign you in.");
    } finally {
      SetPending(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-paper md:grid-cols-2">
      <section className="flex flex-col justify-between bg-ink px-8 py-10 text-paper">
        <p className="font-serif text-3xl">LeaveFlowSE</p>
        <div>
          <h1 className="max-w-md font-serif text-4xl leading-tight">Leave requests, without the paper trail.</h1>
          <p className="mt-4 max-w-md text-[#e7dccb]">
            WorkSmartSE staff apply here. One approver decides. The record follows the day you are away, not the day you sent the form.
          </p>
        </div>
        <p className="text-sm text-[#cbbba6]">Hong Kong · Asia/Hong_Kong</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={OnSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="font-serif text-3xl">Sign in</h2>
            <p className="mt-2 text-sm text-stone-700">
              Use the company email and password issued by the approver. There is no self-registration.
            </p>
          </div>
          {error ? <ErrorNote message={error} /> : null}
          <Field label="Company email" hint={`Addresses end in @${kCompanyDomain}.`}>
            <TextInput
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => SetEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => SetPassword(event.target.value)}
            />
          </Field>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
      </section>
    </div>
  );
}
