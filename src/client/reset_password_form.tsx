import { useState, type FormEvent } from "react";
import { ValidatePassword } from "../shared/validate";
import { ApiError, ResetStaffPassword } from "./api";
import { ErrorNote, Field, PrimaryButton, TextInput } from "./components";

/**
 * Summary: Let an approver reset an ordinary staff account's password.
 * Parameters: staff_id is a non-empty active employee ID; staff_name is its
 * non-null display name.
 * Return Value: A separate password form with success/error feedback.
 * Side Effects & Constraints: Sends a reset request; never saves profile edits.
 * Passwords are not kept in React state; inputs are cleared before requests
 * and discarded on unmount.
 */
export function ResetPasswordForm({ staff_id, staff_name }: { staff_id: string; staff_name: string }) {
  const [pending, SetPending] = useState(false);
  const [error, SetError] = useState("");
  const [notice, SetNotice] = useState("");

  /**
   * Summary: Validate the two passwords and submit the reset.
   * Parameters: event is the non-null submission event from this form.
   * Return Value: Resolves after success or a visible refusal.
   * Side Effects & Constraints: Prevents navigation, clears inputs and updates UI.
   * The server verifies the approver password and revokes the employee's sessions.
   */
  async function OnReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const new_password = data.get("new_password");
    const approver_password = data.get("approver_password");
    const password_error = ValidatePassword(new_password);
    SetNotice("");
    if (password_error || typeof new_password !== "string") {
      SetError(password_error ?? "Enter a new password.");
      return;
    }
    if (typeof approver_password !== "string" || !approver_password) {
      SetError("Enter your approver password.");
      return;
    }
    form.reset();
    SetPending(true);
    SetError("");
    try {
      await ResetStaffPassword(staff_id, new_password, approver_password);
      SetNotice("Password reset. The employee must sign in again with the new password.");
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "The password could not be reset.");
    } finally {
      SetPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-rule bg-card p-5" aria-labelledby="reset-password-title">
      <h2 id="reset-password-title" className="font-serif text-2xl">Reset employee password</h2>
      <p className="my-3 text-sm text-stone-600">
        Set a new password for {staff_name}. This signs the employee out of all sessions.
      </p>
      <form onSubmit={OnReset} className="space-y-4">
        <Field label="New employee password" hint="8 to 72 characters.">
          <TextInput type="password" name="new_password" autoComplete="new-password"
            minLength={8} maxLength={72} required readOnly={pending} />
        </Field>
        <Field label="Your approver password">
          <TextInput type="password" name="approver_password" autoComplete="current-password"
            maxLength={72} required readOnly={pending} />
        </Field>
        {error ? <ErrorNote message={error} /> : null}
        <p role="status" className="text-sm text-forest">{notice}</p>
        <PrimaryButton type="submit" disabled={pending}>{pending ? "Resetting…" : "Reset password"}</PrimaryButton>
      </form>
    </section>
  );
}
