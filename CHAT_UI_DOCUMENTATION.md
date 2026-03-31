# Modern WhatsApp-Like Chat UI Documentation

## Overview

A production-ready chat interface with modern design patterns, smooth animations, and full Firestore integration.

## Components

### 1. **ChatScreen.tsx** - Main Chat Component

The main container component that handles:
- Message fetching and real-time updates (Firestore listeners)
- Auto-scroll to latest messages
- Message sending
- Loading states
- Empty state handling

#### Props:
```typescript
interface ChatScreenProps {
  patientId: string;        // Patient ID (used as chat ID)
  doctorId: string;         // Doctor ID for chat pair
  currentUserId: string;    // Current user's ID (for message alignment)
  patientName?: string;     // Display name (default: "Patient")
}
```

#### Usage:
```tsx
import ChatScreen from '@/components/ChatScreen';

export default function ChatPage() {
  return (
    <ChatScreen
      patientId="patient_123"
      doctorId="doctor_456"
      currentUserId={currentUser.id}
      patientName={currentUser.name}
    />
  );
}
```

### 2. **MessageBubble.tsx** - Reusable Message Component

Displays individual message bubbles with:
- Auto-aligned bubbles (left/right based on sender)
- Color-coded messages (green for own, grey for others)
- Formatted timestamps
- Smooth animations
- Hover effects

#### Props:
```typescript
interface MessageBubbleProps {
  text: string;           // Message text content
  isOwn: boolean;         // Is this message from current user?
  timestamp: string;      // Formatted time string
  senderName?: string;    // Sender name (optional)
}
```

#### Usage:
```tsx
import MessageBubble from '@/components/MessageBubble';

<MessageBubble
  text="Hello!"
  isOwn={true}
  timestamp="2:30 PM"
  senderName="You"
/>
```

## Features

### ✨ Key Features
- **Full-screen layout** - 100vh height with fixed header and input
- **Auto-scroll** - Smooth scroll to latest message on arrival
- **Message bubbles** - WhatsApp-style with rounded corners
- **Color coding**:
  - Own messages: Green (#10b981) with gradientRight-aligned
  - Other messages: Dark grey (surface-2) with subtle borderLeft-aligned
- **Timestamps** - Readable format (e.g., "2:30 PM" or "Mar 31 2:30 PM")
- **Loading states** - Spinner during message fetch and send
- **Empty state** - Friendly message when no chat history
- **Hover effects** - Subtle lift and shadow on message hover
- **Smooth animations**:
  - Message slide-in animation
  - Button hover/active states
  - Smooth scrolling behavior

### 🎨 Styling
- Uses existing design tokens from `index.css`
- Dark mode compatible (respects root[data-theme='dark'])
- Modern color palette with proper contrast
- Custom scrollbars with smooth transitions
- Backdrop blur effects on header and input

### ⌨️ Keyboard Support
- **Enter** to send message
- **Shift+Enter** for new line in input
- Auto-focus input after sending
- Disabled state during submission

## Message Data Structure

Messages from Firebase should match this structure:
```typescript
interface Message {
  id: string;                    // Unique message ID
  text: string;                  // Message content
  senderId: string;              // User who sent it
  timestamp?: {                  // Firestore Timestamp
    toDate: () => Date;
  };
}
```

## Styling Architecture

### CSS Classes

**Container:**
- `chat-screen-container` - Main wrapper
- `chat-screen-header` - Top bar with contact info
- `chat-screen-messages` - Scrollable messages area
- `chat-screen-input-bar` - Bottom input section

**Messages:**
- `message-bubble-wrapper` - Message container
- `message-bubble` - Bubble styling
- `message-bubble-text` - Message text
- `message-bubble-time` - Timestamp

**Input:**
- `chat-screen-input-form` - Form wrapper
- `chat-screen-input` - Text input field
- `chat-screen-send-btn` - Send button

### Color Scheme
- Green messages: `#10b981` (own messages)
- Grey messages: `var(--surface-2)` (others)
- Header background: `var(--bg-secondary)`
- Text colors: `var(--text-primary)`, `var(--text-secondary)`

## Performance Optimizations

1. **Message virtualization** - Could be added for 1000+ messages
2. **Lazy loading** - Load older messages on scroll-up
3. **Debounced input** - Prevent rapid fire sends
4. **Smooth scrolling** - Uses `scroll-behavior: smooth`
5. **CSS animations** - GPU-accelerated transforms

## Customization

### Change Message Colors
Edit `chat.css`:
```css
.own-message .message-bubble {
  background: linear-gradient(135deg, #your-color 0%, #darker-shade 100%);
}

.other-message .message-bubble {
  background: var(--your-color);
}
```

### Adjust Max Width
```css
.message-bubble {
  max-width: 70%; /* Changed from 60% */
}
```

### Modify Bubble Radius
```css
.message-bubble {
  border-radius: 20px; /* Changed from 16px */
}
```

## Integration with Existing Code

The `ChatScreen` component is a drop-in replacement for the legacy `Chat` component:

**Before:**
```tsx
<Chat 
  patientId={patientId}
  doctorId={doctorId}
  currentUserId={currentUserId}
  patientName={patientName}
/>
```

**After:**
```tsx
<ChatScreen 
  patientId={patientId}
  doctorId={doctorId}
  currentUserId={currentUserId}
  patientName={patientName}
/>
```

Both components use the same `chatService` functions and Firebase integration.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- Semantic HTML structure
- Proper focus management
- Color not the only indicator (alt text on status)
- Keyboard navigation support
- Disabled states properly marked

## Known Limitations

1. Message edit/delete not implemented (can be added)
2. Typing indicators not included (can be added via Firestore)
3. Message search not included
4. No image/file uploads (requires cloud storage)
5. Max message length: 1000 characters (configurable)

## Troubleshooting

### Messages not scrolling to bottom
- Check if `ref={messagesEndRef}` is properly attached
- Verify async/await on message fetch

### Hover effects not working
- Ensure CSS file is properly imported
- Check for CSS specificity conflicts

### Timestamp showing as "NaN"
- Verify Firestore is returning proper Timestamp objects
- Check `formatTime()` function handles your timestamp format

## Future Enhancements

- [ ] Image/file sharing
- [ ] Message reactions
- [ ] Typing indicators
- [ ] Message search
- [ ] Voice messages
- [ ] Message editing
- [ ] Message deletion with undo
- [ ] Read receipts
- [ ] Message pinning
- [ ] Call integration
