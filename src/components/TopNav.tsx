import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTheme } from "../ThemeContext";
import type { UserRole } from "../types/auth";
import {
  subscribeToNotifications,
  type AppNotification,
} from "../services/notificationService";

type TopNavProps = {
  uid: string;
  isSidebarOpen: boolean;
  onMenuToggle: () => void;
  role: UserRole;
  displayName: string;
  onLogout: () => void;
  onSearch: (query: string) => void;
  onProfile: () => void;
};

export default function TopNav({
  uid,
  isSidebarOpen,
  onMenuToggle,
  role,
  displayName,
  onLogout,
  onSearch,
  onProfile,
}: TopNavProps) {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { theme, toggleTheme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const roleLabel = role === "doctor" ? "Doctor Portal" : "Patient Portal";
  const searchLabel = role === "doctor" ? "Search patients" : "Search reports";
  const initials = displayName
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString("en-US"));
      setDateStr(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!uid) return;
    return subscribeToNotifications(uid, setNotifications);
  }, [uid]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!notificationPanelRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [notificationsOpen]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const formatNotificationTimestamp = (createdAtMs: number) => {
    if (!createdAtMs) return "just now";
    const now = Date.now();
    const diffMs = Math.max(0, now - createdAtMs);
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(createdAtMs).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setSearchOpen(false);
      return;
    }
    onSearch(trimmed);
    setSearchOpen(false);
  };

  return (
    <nav className="topnav">
      <button
        type="button"
        className="menu-toggle"
        onClick={onMenuToggle}
        aria-label={
          isSidebarOpen ? "Close navigation menu" : "Open navigation menu"
        }
        aria-expanded={isSidebarOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className="nav-logo">
        <div className="nav-logo-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <div className="nav-logo-text">
            MotionCare <span>Ai</span>
          </div>
        </div>
      </div>

      <div className="nav-center">
        <div className="patient-selector">
          <div className="patient-avatar">
            {role === "doctor" ? "DR" : "PT"}
          </div>
          <span className="patient-selector-name">
            {displayName} · {roleLabel}
          </span>
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

        <form
          className={`nav-search${searchOpen ? " open" : ""}`}
          onSubmit={handleSearchSubmit}
        >
          <input
            ref={searchInputRef}
            type="search"
            placeholder={searchLabel}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label={searchLabel}
          />
          <button type="submit">Go</button>
        </form>

        {/* Theme Toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="notification-wrap" ref={notificationPanelRef}>
          <button
            type="button"
            className="nav-icon-btn"
            aria-label="Open notifications"
            onClick={() => setNotificationsOpen((current) => !current)}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 ? <div className="badge">{Math.min(unreadCount, 9)}</div> : null}
          </button>

          {notificationsOpen ? (
            <div className="notification-panel" role="dialog" aria-label="Notifications panel">
              <div className="notification-panel-header">Notifications</div>
              {notifications.length ? (
                <div className="notification-list">
                  {notifications.map((item) => (
                    <div className="notification-item" key={item.id}>
                      <div className="notification-message">{item.message}</div>
                      <div className="notification-time">{formatNotificationTimestamp(item.createdAtMs)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notification-empty">No notifications yet.</div>
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="nav-icon-btn"
          onClick={() => setSearchOpen((open) => !open)}
          aria-label={searchOpen ? "Close search" : "Open search"}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button type="button" className="topnav-logout" onClick={onLogout}>
          Logout
        </button>
        <button
          type="button"
          className="profile-btn"
          title="Profile"
          aria-label="Open profile"
          onClick={onProfile}
        >
          {initials}
        </button>
      </div>
    </nav>
  );
}
