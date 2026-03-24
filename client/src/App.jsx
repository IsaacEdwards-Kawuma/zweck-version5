import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import PostTransaction from "./pages/PostTransaction";
import Ledger from "./pages/Ledger";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import Directors from "./pages/Directors";
import DirectorDetail from "./pages/DirectorDetail";
import Portfolio from "./pages/Portfolio";
import ProjectsLayout from "./pages/ProjectsLayout";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import Users from "./pages/Users";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/post" element={<PostTransaction />} />
          <Route path="/ledger" element={<Ledger />} />
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
  );
}
