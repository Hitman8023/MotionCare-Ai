import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TopNav from './components/TopNav';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import LiveMonitoring from './pages/LiveMonitoring';
import MovementAnalysis from './pages/MovementAnalysis';
import AIInsights from './pages/AIInsights';
import PatientHistory from './pages/PatientHistory';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
    return (
        <BrowserRouter>
            <TopNav />
            <Sidebar />
            <main className="main">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/live" element={<LiveMonitoring />} />
                    <Route path="/movement" element={<MovementAnalysis />} />
                    <Route path="/insights" element={<AIInsights />} />
                    <Route path="/patients" element={<PatientHistory />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </main>
        </BrowserRouter>
    );
}
