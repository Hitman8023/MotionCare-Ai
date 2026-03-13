import { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';
import type { UserRole } from '../types/auth';

type TopNavProps = {
    isSidebarOpen: boolean;
    onMenuToggle: () => void;
    role: UserRole;
    displayName: string;
    onLogout: () => void;
};

export default function TopNav({ isSidebarOpen, onMenuToggle, role, displayName, onLogout }: TopNavProps) {
    const [timeStr, setTimeStr] = useState('');
    const [dateStr, setDateStr] = useState('');
    const { theme, toggleTheme } = useTheme();
    const roleLabel = role === 'doctor' ? 'Doctor Portal' : 'Patient Portal';
    const initials = displayName
        .split(' ')
        .map((chunk) => chunk[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setTimeStr(now.toLocaleTimeString('en-US'));
            setDateStr(
                now.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                })
            );
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <nav className="topnav">
            <button
                type="button"
                className="menu-toggle"
                onClick={onMenuToggle}
                aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isSidebarOpen}
            >
                <span></span>
                <span></span>
                <span></span>
            </button>

            <div className="nav-logo">
                <div className="nav-logo-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                </div>
                <div>
                    <div className="nav-logo-text">Rehab<span>AI</span> Monitor</div>
                </div>
            </div>

            <div className="nav-center">
                <div className="patient-selector">
                    <div className="patient-avatar">{role === 'doctor' ? 'DR' : 'PT'}</div>
                    <span className="patient-selector-name">{displayName} · {roleLabel}</span>
                    <svg className="patient-selector-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </div>
                <div className="device-status">
                    <div className="status-dot"></div>
                    Device Connected · ESP32
                </div>
            </div>

            <div className="nav-right">
                <div className="nav-datetime">
                    <div style={{ fontWeight: 700 }}>{timeStr}</div>
                    <div className="date">{dateStr}</div>
                </div>

                {/* Theme Toggle */}
                <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    )}
                </button>

                <div className="nav-icon-btn">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <div className="badge">3</div>
                </div>
                <div className="nav-icon-btn">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                </div>
                <button type="button" className="topnav-logout" onClick={onLogout}>
                    Logout
                </button>
                <div className="profile-btn" title={displayName}>{initials}</div>
            </div>
        </nav>
    );
}
