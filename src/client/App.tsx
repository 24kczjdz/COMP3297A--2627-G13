import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { ErrorNote, LoadingNote, PageTitle, Shell } from "./components";
import { Applications } from "./pages/Applications";
import { ApplicationForm } from "./pages/ApplicationForm";
import { Home } from "./pages/Home";
import { Notifications } from "./pages/Notifications";
import { OnDate } from "./pages/OnDate";
import { Pending } from "./pages/Pending";
import { Profile } from "./pages/Profile";
import { SignIn } from "./pages/SignIn";
import { StaffForm, StaffList } from "./pages/StaffAdmin";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignIn />} />
      <Route element={<RequireAuth />}>
        <Route element={<Frame />}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/profile" element={<ProfileRoute />} />
          <Route path="/applications" element={<ApplicationsRoute />} />
          <Route path="/applications/new" element={<ApplicationForm mode="new" />} />
          <Route path="/applications/:id/edit" element={<ApplicationForm mode="edit" />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route element={<RequireApprover />}>
            <Route path="/approver/staff" element={<StaffList />} />
            <Route path="/approver/staff/new" element={<StaffForm mode="new" />} />
            <Route path="/approver/staff/:id/edit" element={<StaffForm mode="edit" />} />
            <Route path="/approver/pending" element={<Pending />} />
            <Route path="/approver/on-date" element={<OnDate />} />
          </Route>
          <Route path="*" element={<Missing />} />
        </Route>
      </Route>
    </Routes>
  );
}

function RequireAuth() {
  const { me, ready, error, refresh } = useAuth();
  if (!ready) return <p className="p-8 text-sm text-stone-600">Checking your session…</p>;
  if (error && !me) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorNote message={error} onRetry={() => void refresh()} />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Frame() {
  const { me, refresh, signOut } = useAuth();
  const location = useLocation();
  useEffect(() => {
    void refresh();
  }, [location.pathname, refresh]);
  if (!me) return <LoadingNote label="Loading your desk…" />;
  return (
    <Shell
      me={me}
      onSignOut={() => {
        void signOut().then(() => {
          window.location.assign("/login");
        });
      }}
    >
      <Outlet />
    </Shell>
  );
}

function HomeRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Home me={me} />;
}

function ProfileRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Profile me={me} />;
}

function ApplicationsRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Applications me={me} />;
}

function RequireApprover() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role !== "approver") {
    return (
      <div>
        <PageTitle title="Approver desk" lede="Only the approver can open staff accounts, pending decisions, and the date search." />
        <ErrorNote message="Only the approver can do that." />
      </div>
    );
  }
  return <Outlet />;
}

function Missing() {
  return <PageTitle title="That page is not part of LeaveFlowSE" />;
}
