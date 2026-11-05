import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { ErrorNote, LoadingNote, PageTitle, Shell } from "./components";
import { Applications } from "./pages/applications_page";
import { ApplicationForm } from "./pages/application_form_page";
import { Home } from "./pages/home_page";
import { Notifications } from "./pages/notifications_page";
import { Archive } from "./pages/archive_page";
import { Pending } from "./pages/pending_page";
import { Profile } from "./pages/profile_page";
import { SignIn } from "./pages/sign_in_page";
import { StaffForm, StaffList } from "./pages/staff_admin_page";

/**
 * Summary: Define the public, staff, and approver routes.
 * Parameters: None.
 * Return Value: The route tree, including a missing-page fallback.
 * Side Effects & Constraints: Rendering delegates authentication and data loading to child routes.
 */
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
            <Route path="/approver/archive" element={<Archive />} />
            <Route path="/approver/on-date" element={<Navigate to="/approver/archive" replace />} />
          </Route>
          <Route path="*" element={<Missing />} />
        </Route>
      </Route>
    </Routes>
  );
}

/**
 * Summary: Gate protected routes on the current authentication state.
 * Parameters: None; reads the surrounding authentication context.
 * Return Value: A loading/error view, sign-in redirect, or child outlet.
 * Side Effects & Constraints: Retry requests refresh the session; requires AuthProvider.
 */
function RequireAuth() {
  const { me, ready, error, refresh: Refresh } = useAuth();
  if (!ready) return <p className="p-8 text-sm text-stone-600">Checking your session…</p>;
  if (error && !me) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorNote message={error} on_retry={() => void Refresh()} />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Summary: Render the signed-in navigation and refresh account data after navigation.
 * Parameters: None; reads the router and authentication contexts.
 * Return Value: The application shell or a loading message while no account is available.
 * Side Effects & Constraints: Loads the profile on path changes; signing out ends the session and
 * navigates to login.
 */
function Frame() {
  const { me, refresh: Refresh, sign_out: SignOut } = useAuth();
  const location = useLocation();
  useEffect(() => {
    void Refresh();
  }, [location.pathname, Refresh]);
  if (!me) return <LoadingNote label="Loading your desk…" />;
  return (
    <Shell
      me={me}
      on_sign_out={() => {
        void SignOut().then(() => {
          window.location.assign("/login");
        });
      }}
    >
      <Outlet />
    </Shell>
  );
}

/**
 * Summary: Provide the current account to the dashboard page.
 * Parameters: None; reads AuthProvider.
 * Return Value: The page, or null while no account is available.
 * Side Effects & Constraints: Renders only; the child owns any data requests.
 */
function HomeRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Home me={me} />;
}

/**
 * Summary: Provide the current account to the profile page.
 * Parameters: None; reads AuthProvider.
 * Return Value: The page, or null while no account is available.
 * Side Effects & Constraints: Renders only; the child owns any data requests.
 */
function ProfileRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Profile me={me} />;
}

/**
 * Summary: Provide the current account to the personal leave history page.
 * Parameters: None; reads AuthProvider.
 * Return Value: The page, or null while no account is available.
 * Side Effects & Constraints: Renders only; the child owns any data requests.
 */
function ApplicationsRoute() {
  const { me } = useAuth();
  if (!me) return null;
  return <Applications me={me} />;
}

/**
 * Summary: Gate administrative routes on the approver role.
 * Parameters: None; reads AuthProvider.
 * Return Value: The child outlet, an access-denied view, or null without an account.
 * Side Effects & Constraints: Client navigation guard only; the API independently authorizes
 * requests.
 */
function RequireApprover() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role !== "approver") {
    return (
      <div>
        <PageTitle title="Approver desk" lede="Only the approver can open staff accounts, pending decisions, and the archive." />
        <ErrorNote message="Only the approver can do that." />
      </div>
    );
  }
  return <Outlet />;
}

/**
 * Summary: Render the missing-route message.
 * Parameters: None.
 * Return Value: The page heading for an unrecognized route.
 * Side Effects & Constraints: Render-only; does not change state or send requests.
 */
function Missing() {
  return <PageTitle title="That page is not part of LeaveFlowSE" />;
}
