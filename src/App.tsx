import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { signOutUser } from "./services/authService";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import LiveMonitoring from "./pages/LiveMonitoring";
import MovementAnalysis from "./pages/MovementAnalysis";
import AIInsights from "./pages/AIInsights";
import PatientHistory from "./pages/PatientHistory";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import DoctorDashboard from "./pages/DoctorDashboard";
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import type { SessionUser, UserRole } from "./types/auth";

function AppShell({
  session,
  onLogout,
}: {
  session: SessionUser;
  onLogout: () => void;
}) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const isDoctor = session.role === "doctor";

  const handleSearch = (query: string) => {
    const params = new URLSearchParams({ query });
    const target = isDoctor ? "/patients" : "/reports";
    navigate(`${target}?${params.toString()}`);
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const isCompactViewport = window.innerWidth <= 1024;
    document.body.style.overflow =
      sidebarOpen && isCompactViewport ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <TopNav
        isSidebarOpen={sidebarOpen}
        onMenuToggle={() => setSidebarOpen((open) => !open)}
        role={session.role}
        displayName={session.displayName}
        onLogout={() => {
          onLogout();
          navigate("/login", { replace: true });
        }}
        onSearch={handleSearch}
        onProfile={() => navigate("/profile")}
      />
      <Sidebar
        role={session.role}
        open={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
      />
      <button
        type="button"
        className={`sidebar-backdrop${sidebarOpen ? " visible" : ""}`}
        aria-label="Close navigation menu"
        onClick={() => setSidebarOpen(false)}
      />
      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              isDoctor ? (
                <DoctorDashboard />
              ) : (
                <Dashboard
                  patientUid={session.uid}
                  displayName={session.displayName}
                />
              )
            }
          />
          <Route
            path="/live"
            element={
              <LiveMonitoring role={session.role} patientUid={session.uid} />
            }
          />
          <Route path="/movement" element={<MovementAnalysis />} />
          <Route path="/insights" element={<AIInsights />} />
          <Route
            path="/patients"
            element={
              isDoctor ? <PatientHistory /> : <Navigate to="/" replace />
            }
          />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRouter() {
  // undefined = still resolving auth state (show loading spinner)
  const [session, setSession] = useState<SessionUser | null | undefined>(
    undefined,
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setSession(null);
        return;
      }
      try {
        const indexSnap = await getDoc(doc(db, "user_index", firebaseUser.uid));
        if (!indexSnap.exists()) {
          setSession(null);
          return;
        }

        const indexData = indexSnap.data() as {
          role: UserRole;
          displayName: string;
          docId: string;
        };

        const { role, displayName, docId: profileDocId } = indexData;

        let needsOnboarding = false;
        if (role === "patient") {
          const profileSnap = await getDoc(doc(db, "patients", profileDocId));
          needsOnboarding = !(profileSnap.exists() && profileSnap.data()?.onboardedAt);
        }

        setSession({
          uid: firebaseUser.uid,
          profileDocId,
          role,
          displayName,
          needsOnboarding,
        });
      } catch {
        setSession(null);
      }
    });
    return unsubscribe;
  }, []);

  const handleLogin = (next: SessionUser) => setSession(next);

  const handleOnboardingComplete = () => {
    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        needsOnboarding: false,
      };
    });
  };

  const handleLogout = async () => {
    setSession(null);
    await signOutUser();
  };

  if (session === undefined) {
    return (
      <div className="auth-shell">
        <div
          className="auth-panel card"
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "14px",
          }}
        >
          Loading MotionCare AI�
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public � login page */}
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />

      {/* Patient onboarding � standalone full-screen flow */}
      <Route
        path="/onboarding"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : session.role !== "patient" ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding
              session={session}
              onComplete={handleOnboardingComplete}
            />
          )
        }
      />

      {/* Main authenticated app shell */}
      <Route
        path="/*"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : session.needsOnboarding ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <AppShell session={session} onLogout={handleLogout} />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}