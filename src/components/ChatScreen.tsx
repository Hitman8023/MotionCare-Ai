import { useEffect, useState, useRef } from "react";
import {
  ensureChatExists,
  sendMessage,
  listenMessages,
} from "../services/chatService";
import MessageBubble from "./MessageBubble";
import Loader from "./Loader";
import "../styles/chat.css";

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp?: any;
}

interface ChatScreenProps {
  patientId: string;
  doctorId: string;
  currentUserId: string;
  patientName?: string;
}

const ChatScreen = ({
  patientId,
  doctorId,
  currentUserId,
  patientName = "Patient",
}: ChatScreenProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Setup chat + listener
  useEffect(() => {
    let unsubscribe: any;

    const setupChat = async () => {
      try {
        setLoading(true);
        await ensureChatExists(patientId, doctorId);

        unsubscribe = listenMessages(patientId, (msgs) => {
          setMessages(msgs);
          setLoading(false);
        });
      } catch (err) {
        console.error("Chat setup error:", err);
        setLoading(false);
      }
    };

    setupChat();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [patientId, doctorId]);

  // Format timestamp to readable time
  const formatTime = (timestamp: any): string => {
    if (!timestamp) return "";
    try {
      const date = timestamp.toDate?.() || new Date(timestamp);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      
      if (isToday) {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      } else {
        return date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      }
    } catch {
      return "";
    }
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim()) return;

    const messageText = input.trim();
    setInput("");

    try {
      setSending(true);
      await sendMessage(patientId, messageText, currentUserId);
      // Focus input after sending
      inputRef.current?.focus();
    } catch (err) {
      console.error("Send failed:", err);
      // Restore input on error
      setInput(messageText);
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key (Shift+Enter for new line)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="chat-screen-container">
        <div className="chat-screen-header">
          <div className="chat-screen-header-main">
            <div className="chat-screen-avatar">{getInitials(patientName)}</div>
            <div className="chat-screen-header-content">
              <h3 className="chat-screen-title">{patientName}</h3>
              <p className="chat-screen-subtitle">Online</p>
            </div>
          </div>
        </div>
        <div className="chat-screen-loading">
          <Loader />
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-screen-container">
      {/* Header */}
      <div className="chat-screen-header">
        <div className="chat-screen-header-main">
          <div className="chat-screen-avatar">{getInitials(patientName)}</div>
          <div className="chat-screen-header-content">
            <h3 className="chat-screen-title">{patientName}</h3>
            <p className="chat-screen-subtitle">Online</p>
          </div>
        </div>
        <div className="chat-screen-status online"></div>
      </div>

      {/* Messages Area */}
      <div className="chat-screen-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 ? (
            <div className="chat-screen-empty">
              <div className="empty-icon" aria-hidden="true">
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </svg>
              </div>
              <h4>No messages yet</h4>
              <p>Start a conversation with {patientName}</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  text={msg.text}
                  isOwn={msg.senderId === currentUserId}
                  timestamp={formatTime(msg.timestamp)}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input Bar */}
      <div className="chat-screen-input-bar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="chat-screen-input-form"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={sending}
            className="chat-screen-input"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="chat-screen-send-btn"
            title="Send message"
          >
            {sending ? (
              <span className="send-spinner"></span>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatScreen;
