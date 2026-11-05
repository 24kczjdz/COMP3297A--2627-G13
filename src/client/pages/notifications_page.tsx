import { useCallback, useEffect, useState } from "react";
import { FormatHongKongTimestampDate } from "../../shared/dates";
import type { Notice } from "../../shared/types";
import { ApiError, GetNotifications } from "../api";
import { EmptyNote, ErrorNote, LoadingNote, PageTitle } from "../components";
import { useTitle } from "../use_title";
import { LeaveTypeText } from "../leave_type_label";

/**
 * Summary: Display the signed-in account's decision notices.
 * Parameters: None.
 * Return Value: The notice list, empty/loading state, or a visible error.
 * Side Effects & Constraints: Loads notices on mount and sets the document title; opening notices
 * marks them read.
 */
export function Notifications() {
  useTitle("Notices");
  const [notices, SetNotices] = useState<Notice[] | null>(null);
  const [error, SetError] = useState<string | null>(null);

  /**
   * Summary: Load notices and mark them read through the API.
   * Parameters: None.
   * Return Value: Resolves after replacing the list or displaying an error.
   * Side Effects & Constraints: Sends one request that updates server read timestamps and local
   * list/error state.
   */
  const Load = useCallback(async () => {
    SetError(null);
    try {
      const result = await GetNotifications();
      SetNotices(result.notifications);
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "Notices could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void Load();
  }, [Load]);

  return (
    <div>
      <PageTitle
        title="Notices"
        lede="A decision from the approver is posted here. Opening this list marks the notices as read."
      />
      {error ? <ErrorNote message={error} on_retry={() => void Load()} /> : null}
      {notices === null && !error ? <LoadingNote label="Loading notices…" /> : null}
      {notices && notices.length === 0 ? (
        <EmptyNote title="No decisions yet" body="When the approver approves or disapproves a request, the notice appears here." />
      ) : null}
      {notices && notices.length > 0 ? (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li key={notice.id} className="rounded-lg border border-rule bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                {notice.kind === "approved" ? "Approved" : "Disapproved"}
                {notice.readAt ? "" : " · New"}
              </p>
              <p className="mt-1 whitespace-pre-wrap"><LeaveTypeText text={notice.message} /></p>
              <p className="mt-1 text-xs text-stone-500">{FormatHongKongTimestampDate(notice.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
