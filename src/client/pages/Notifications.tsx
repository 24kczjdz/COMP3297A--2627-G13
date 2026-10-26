import { useCallback, useEffect, useState } from "react";
import { formatLongDate } from "../../shared/dates";
import type { Notice } from "../../shared/types";
import { ApiError, getNotifications } from "../api";
import { EmptyNote, ErrorNote, LoadingNote, PageTitle } from "../components";
import { useTitle } from "../useTitle";

export function Notifications() {
  useTitle("Notices");
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getNotifications();
      setNotices(result.notifications);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Notices could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageTitle
        title="Notices"
        lede="A decision from the approver is posted here. Opening this list marks the notices as read."
      />
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
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
              <p className="mt-1">{notice.message}</p>
              <p className="mt-1 text-xs text-stone-500">{formatLongDate(notice.createdAt.slice(0, 10))}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
