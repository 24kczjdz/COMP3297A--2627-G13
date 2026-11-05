import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LeaveRecord, Me } from "../../shared/types";
import { ApiError, CancelApplication, GetApplications } from "../api";
import { EmptyNote, ErrorNote, LeaveList, LoadingNote, PageTitle } from "../components";
import { useTitle } from "../use_title";
import { useAuth } from "../auth";

/**
 * Summary: Display the signed-in applicant's history and cancellation actions.
 * Parameters: me is the non-null signed-in account with its current Hong Kong date.
 * Return Value: History, loading/error feedback, and a new-request link.
 * Side Effects & Constraints: Loads personal history and refreshes the account after cancellation.
 */
export function Applications({ me }: { me: Me }) {
  useTitle("My leave");
  const { refresh: Refresh } = useAuth();
  const [records, SetRecords] = useState<LeaveRecord[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [cancelling_id, SetCancellingId] = useState<string | null>(null);

  /**
   * Summary: Reload personal history for the current session.
   * Parameters: None.
   * Return Value: Resolves after updating records or a visible error.
   * Side Effects & Constraints: Sends one GET and replaces local history/error state.
   */
  const Load = useCallback(async () => {
    SetError(null);
    try {
      const result = await GetApplications();
      SetRecords(result.applications);
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "Your leave history could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void Load();
  }, [Load]);

  /**
   * Summary: Cancel an eligible request and refresh its history and released balance.
   * Parameters: id is the non-empty application ID belonging to the current user.
   * Return Value: Resolves after refreshing or displaying the cancellation error.
   * Side Effects & Constraints: Writes through the API and updates local/auth state;
   * the server rechecks cancellation eligibility and concurrent changes.
   */
  async function OnCancel(id: string) {
    SetCancellingId(id);
    SetError(null);
    try {
      await CancelApplication(id);
      await Refresh();
      await Load();
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "That request could not be cancelled.");
    } finally {
      SetCancellingId(null);
    }
  }

  return (
    <div>
      <PageTitle
        title="My leave"
        lede="Pending requests can be edited or cancelled. Approved leave can be cancelled up to the day before it starts."
      />
      {error ? <div className="mb-4"><ErrorNote message={error} on_retry={() => void Load()} /></div> : null}
      {records === null && !error ? <LoadingNote label="Loading your leave…" /> : null}
      {records && records.length === 0 ? (
        <EmptyNote title="No requests yet" body="When you apply, the request stays here with its status." />
      ) : null}
      {records && records.length > 0 ? (
        <LeaveList records={records} today={me.hongKongToday} on_cancel={OnCancel} cancelling_id={cancelling_id} />
      ) : null}
      <p className="mt-6">
        <Link to="/applications/new" className="font-medium text-forest underline">
          Submit a request
        </Link>
      </p>
    </div>
  );
}
