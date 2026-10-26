import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LeaveRecord, Me } from "../../shared/types";
import { ApiError, cancelApplication, getApplications } from "../api";
import { EmptyNote, ErrorNote, LeaveList, LoadingNote, PageTitle } from "../components";
import { useTitle } from "../useTitle";

export function Applications({ me }: { me: Me }) {
  useTitle("My leave");
  const [records, setRecords] = useState<LeaveRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getApplications();
      setRecords(result.applications);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Your leave history could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      await cancelApplication(id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That request could not be cancelled.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <PageTitle
        title="My leave"
        lede="Pending requests can be edited or cancelled. Approved leave can be cancelled up to the day before it starts."
      />
      {error ? <div className="mb-4"><ErrorNote message={error} onRetry={() => void load()} /></div> : null}
      {records === null && !error ? <LoadingNote label="Loading your leave…" /> : null}
      {records && records.length === 0 ? (
        <EmptyNote title="No requests yet" body="When you apply, the request stays here with its status." />
      ) : null}
      {records && records.length > 0 ? (
        <LeaveList records={records} today={me.hongKongToday} onCancel={onCancel} cancellingId={cancellingId} />
      ) : null}
      <p className="mt-6">
        <Link to="/applications/new" className="font-medium text-forest underline">
          Submit a request
        </Link>
      </p>
    </div>
  );
}
