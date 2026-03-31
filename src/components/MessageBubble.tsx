import "../styles/chat.css";

interface MessageBubbleProps {
  text: string;
  isOwn: boolean;
  timestamp: string;
}

const MessageBubble = ({
  text,
  isOwn,
  timestamp,
}: MessageBubbleProps) => {
  return (
    <div className={`message-bubble-wrapper ${isOwn ? "own-message" : "other-message"}`}>
      <div className="message-bubble">
        <p className="message-bubble-text">{text}</p>
        <span className="message-bubble-time">{timestamp}</span>
      </div>
    </div>
  );
};

export default MessageBubble;
