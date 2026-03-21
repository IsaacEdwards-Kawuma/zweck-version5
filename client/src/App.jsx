import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PostTransaction from "./pages/PostTransaction";
import Ledger from "./pages/Ledger";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import Directors from "./pages/Directors";
import DirectorDetail from "./pages/DirectorDetail";
import Portfolio from "./pages/Portfolio";
import MMFTracker from "./pages/MMFTracker";
import CirculationRounds from "./pages/CirculationRounds";
import Reports from "./pages/Reports";
import Users from "./pages/Users";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

export default function App() {
  const token = localStorage.getItem("zweck_token");

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/post" element={<PostTransaction />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/accounts" element={<ChartOfAccounts />} />
          <Route path="/directors" element={<Directors />} />
          <Route path="/directors/:id" element={<DirectorDetail />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/mmf" element={<MMFTracker />} />
          <Route path="/circulation" element={<CirculationRounds />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={authDisabled || token ? "/" : "/login"} replace />}
      />
    </Routes>
  );
}
