import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Layout from "./components/Layout";
import Loading from "./components/Loading";

const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PostTransaction = lazy(() => import("./pages/PostTransaction"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const Directors = lazy(() => import("./pages/Directors"));
const DirectorDetail = lazy(() => import("./pages/DirectorDetail"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const ProjectsLayout = lazy(() => import("./pages/ProjectsLayout"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Reports = lazy(() => import("./pages/Reports"));
const Meetings = lazy(() => import("./pages/Meetings"));
const Documents = lazy(() => import("./pages/Documents"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Users = lazy(() => import("./pages/Users"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  return (
    <Suspense fallback={<Loading label="Loading page..." />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<Protected />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/users" element={<Users />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/post" element={<PostTransaction />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/accounts" element={<ChartOfAccounts />} />
            <Route path="/directors" element={<Directors />} />
            <Route path="/directors/:id" element={<DirectorDetail />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/projects" element={<ProjectsLayout />}>
              <Route index element={<Projects />} />
            </Route>
            <Route path="/project/:id" element={<ProjectDetail />} />
            <Route path="/mmf" element={<Navigate to="/projects" replace />} />
            <Route path="/ypa" element={<Navigate to="/projects" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
