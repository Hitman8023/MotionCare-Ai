import "../styles/chat.css";

export interface ChatListItemData {
  id: string;
  name: string;
  lastMessage: string;
  timestamp?: any;
  unreadCount: number;
}

interface ChatListItemProps {
  chat: ChatListItemData;
  isActive: boolean;
  onClick: () => void;
}

const formatChatTime = (timestamp?: any): string => {
  if (!timestamp) return "";
  try {
    const date = timestamp.toDate?.() || new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
};

const ChatListItem = ({ chat, isActive, onClick }: ChatListItemProps) => {
  return (
    <button
      type="button"
      className={`chat-list-item ${isActive ? "active" : ""}`}
      onClick={onClick}
      title={chat.name}
    >
      <div className="chat-list-avatar">{getInitials(chat.name)}</div>

      <div className="chat-list-content">
        <p className="chat-list-name">{chat.name}</p>
        <p className="chat-list-preview">{chat.lastMessage || "No messages yet"}</p>
      </div>

      <div className="chat-list-meta">
        <span className="chat-list-time">{formatChatTime(chat.timestamp)}</span>
        {chat.unreadCount > 0 ? (
          <span className="chat-list-unread">{chat.unreadCount}</span>
        ) : null}
      </div>
    </button>
  );
};

export default ChatListItem;
