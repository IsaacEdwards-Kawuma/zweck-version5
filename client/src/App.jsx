import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Layout from "./components/Layout";
import Loading from "./components/Loading";
import RequireStaff from "./components/RequireStaff";
import RequireAdmin from "./components/RequireAdmin";
import HomeRedirect from "./components/HomeRedirect";

const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
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
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceCreate = lazy(() => import("./pages/InvoiceCreate"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const ClientRegister = lazy(() => import("./pages/ClientRegister"));
const Reports = lazy(() => import("./pages/Reports"));
const Meetings = lazy(() => import("./pages/Meetings"));
const Documents = lazy(() => import("./pages/Documents"));
const Forms = lazy(() => import("./pages/Forms"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Users = lazy(() => import("./pages/Users"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));
const AboutCompany = lazy(() => import("./pages/AboutCompany"));
const Privacy = lazy(() => import("./pages/Privacy"));
const HelpGuides = lazy(() => import("./pages/HelpGuides"));
const DataRights = lazy(() => import("./pages/DataRights"));
const Chat = lazy(() => import("./pages/Chat"));
const ChatRoom = lazy(() => import("./pages/ChatRoom"));
const Forbidden = lazy(() => import("./pages/Forbidden"));

export default function App() {
  return (
    <Suspense fallback={<Loading label="Loading page..." />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/forbidden" element={<Forbidden />} />

        <Route element={<Protected />}>
          <Route element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/user" element={<UserDashboard />} />

            <Route element={<RequireStaff />}>
              <Route path="/reports" element={<Reports />} />
              <Route path="/post" element={<PostTransaction />} />
              <Route path="/accounts" element={<ChartOfAccounts />} />
              <Route path="/directors" element={<Directors />} />
              <Route path="/directors/:id" element={<DirectorDetail />} />
              <Route path="/portfolio" element={<Portfolio />} />
            </Route>

            <Route path="/meetings" element={<Meetings />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/forms" element={<Forms />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/rooms/:roomId" element={<ChatRoom />} />
            <Route element={<RequireAdmin />}>
              <Route path="/users" element={<Users />} />
              <Route path="/audit" element={<AuditLog />} />
            </Route>
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<AboutCompany />} />
            <Route path="/help" element={<HelpGuides />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/legal/data-rights" element={<DataRights />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceCreate />} />
            <Route path="/invoices/clients" element={<ClientRegister />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
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
