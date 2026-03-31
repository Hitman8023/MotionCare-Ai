import { useEffect, useState, useRef } from "react";
import {
  ensureChatExists,
  sendMessage,
  listenMessages,
} from "../services/chatService";
import "../styles/chat.css";

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp?: any;
}

interface ChatProps {
  patientId: string;
  doctorId: string;
  currentUserId: string;
  patientName?: string;
}

const Chat = ({ patientId, doctorId, currentUserId, patientName = "Patient" }: ChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🔥 Setup chat + listener
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

  // 📤 Send message
  const handleSend = async () => {
    if (!input.trim()) return;

    try {
      await sendMessage(patientId, input, currentUserId);
      setInput("");
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    try {
      const date = timestamp.toDate?.() || new Date(timestamp);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <h3>{patientName}</h3>
        </div>
        <div className="chat-loading">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>{patientName}</h3>
        <p>Chat with {patientName}</p>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${
                msg.senderId === currentUserId ? "sent" : "received"
              }`}
            >
              <div className="message-content">
                <p className="message-sender">
                  {msg.senderId === currentUserId ? "You" : patientName}
                </p>
                <p className="message-text">{msg.text}</p>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="chat-input-form"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="chat-send-btn"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;