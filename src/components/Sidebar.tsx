import { NavLink } from 'react-router-dom';
import type { UserRole } from '../types/auth';

type SidebarProps = {
    role: UserRole;
    open: boolean;
    onNavigate: () => void;
};

export default function Sidebar({ role, open, onNavigate }: SidebarProps) {

    // 🔹 DOCTOR MAIN
    const doctorMainItems = [
        { to: '/', label: 'Doctor Dashboard', icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>, badge: null },
        { to: '/live', label: 'Live Monitoring', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />, badge: '●' },
        { to: '/movement', label: 'Movement Analysis', icon: <><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" /><circle cx="12" cy="9" r="2.5" /></>, badge: null },
        { to: '/insights', label: 'AI Insights', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></>, badge: null },

        // ✅ ADDED CHAT HERE
        { to: '/chat', label: 'Chat', icon: <><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></>, badge: null },
    ];

    // 🔹 DOCTOR SECONDARY
    const doctorPatientItems = [
        { to: '/patients', label: 'Patient History', icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></> },
        { to: '/reports', label: 'Reports', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
    ];

    // 🔹 PATIENT MAIN
    const patientMainItems = [
        { to: '/', label: 'My Dashboard', icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>, badge: null },
        { to: '/live', label: 'Live Session', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />, badge: '●' },
        { to: '/movement', label: 'My Movement', icon: <><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" /><circle cx="12" cy="9" r="2.5" /></>, badge: null },
        { to: '/insights', label: 'My AI Insights', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></>, badge: null },

        // ✅ ADDED CHAT HERE
        { to: '/chat', label: 'Chat', icon: <><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></>, badge: null },
    ];

    // 🔹 PATIENT SECONDARY
    const patientSupportItems = [
        { to: '/reports', label: 'My Reports', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
    ];

    const navItems = role === 'doctor' ? doctorMainItems : patientMainItems;
    const secondaryItems = role === 'doctor' ? doctorPatientItems : patientSupportItems;

    return (
        <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
            <div className="sidebar-section-label">Main Menu</div>

            {navItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {item.icon}
                    </svg>
                    {item.label}
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                </NavLink>
            ))}

            <div className="sidebar-divider"></div>

            <div className="sidebar-section-label">
                {role === 'doctor' ? 'Patient' : 'Support'}
            </div>

            {secondaryItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {item.icon}
                    </svg>
                    {item.label}
                </NavLink>
            ))}

            <div className="sidebar-divider"></div>

            <div className="sidebar-section-label">System</div>

            <NavLink
                to="/settings"
                onClick={onNavigate}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                </svg>
                Settings
            </NavLink>

            <div className="sidebar-footer" style={{ marginTop: '20px' }}>
                <div className="sidebar-footer-label">Session Active</div>
                <p>
                    {role === 'doctor'
                        ? 'Doctor mode enabled for patient management.'
                        : 'Patient mode enabled for personal recovery tracking.'}
                </p>
            </div>
        </aside>
    );
}