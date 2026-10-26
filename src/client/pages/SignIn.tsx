import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { COMPANY_DOMAIN } from "../../shared/constants";
import { ApiError, signIn } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, Field, PrimaryButton, TextInput } from "../components";

export function SignIn() {
  const { me, ready, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = "Sign in · LeaveFlowSE";
  }, []);

  if (!ready) return <p className="p-8 text-sm text-stone-600">Checking your session…</p>;
  if (me) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(email, password);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "LeaveFlowSE could not sign you in.");
    } finally {
      setPending(false);
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
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="font-serif text-3xl">Sign in</h2>
            <p className="mt-2 text-sm text-stone-700">
              Use the company email and password issued by the approver. There is no self-registration.
            </p>
          </div>
          {error ? <ErrorNote message={error} /> : null}
          <Field label="Company email" hint={`Addresses end in @${COMPANY_DOMAIN}.`}>
            <TextInput
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
