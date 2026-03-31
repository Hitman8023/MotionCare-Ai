# 🏗️ Chat UI Architecture & Component Flow

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        YourApp                                 │
└───────────────────┬───────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────┐
│                      ChatPage.tsx                             │
│  (or your page that renders ChatScreen)                       │
└───────────────────┬───────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ChatScreen.tsx ⭐                          │
│                   (Main Component)                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Tasks:                                                  │  │
│  │ 1. Fetch messages from Firebase                        │  │
│  │ 2. Setup real-time listener                            │  │
│  │ 3. Handle message sending                              │  │
│  │ 4. Manage UI state (loading, input)                    │  │
│  │ 5. Auto-scroll to latest                               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Props In:                                                      │
│  ├─ patientId: string                                          │
│  ├─ doctorId: string                                           │
│  ├─ currentUserId: string                                      │
│  └─ patientName?: string                                       │
│                                                                 │
│  State:                                                         │
│  ├─ messages: Message[]                                        │
│  ├─ input: string                                              │
│  ├─ loading: boolean                                           │
│  └─ sending: boolean                                           │
│                                                                 │
│  Effects:                                                       │
│  ├─ setupChat() - Initialize Firebase listener                │
│  └─ scrollToBottom() - Auto-scroll on message arrival         │
│                                                                 │
│  Handlers:                                                      │
│  ├─ handleSend() - Send message                               │
│  ├─ handleKeyPress() - Enter key support                      │
│  └─ formatTime() - Format timestamps                          │
│                                                                 │
│  Renders:                                                       │
│  ├─ .chat-screen-header ──────────────────────────────────┐  │
│  │ Header with contact name and status indicator          │  │
│  ├──────────────────────────────────────────────────────┘  │
│  │                                                          │  │
│  │ .chat-screen-messages                                   │  │
│  │ ├─→ MessageBubble (for each message)                   │  │
│  │ │   ├─ text                                             │  │
│  │ │   ├─ isOwn                                            │  │
│  │ │   ├─ timestamp                                        │  │
│  │ │   └─ senderName                                       │  │
│  │ │                                                        │  │
│  │ │ [... more bubbles ...]                                │  │
│  │ │                                                        │  │
│  │ └─→ ref={messagesEndRef} (for scroll target)           │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  │                                                          │  │
│  ├─ .chat-screen-input-bar ──────────────────────────────┐  │
│  │ [Input field] [Send button]                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├──────────────────────────────┐
                    │                              │
                    ▼                              ▼
        ┌──────────────────────┐    ┌──────────────────────┐
        │  MessageBubble ⭐    │    │  chatService API     │
        │  (Presentation)      │    │  (Firebase Logic)    │
        │                      │    │                      │
        │ Props: {             │    │ Functions:           │
        │   text               │    │ ├─ ensureChatExists()│
        │   isOwn              │    │ ├─ sendMessage()     │
        │   timestamp   ──────────→ │ └─ listenMessages()  │
        │   senderName    │    │    │                      │
        │ }              │    │    │ Uses:                │
        │                │    │    │ ├─ Firestore         │
        │ Renders:       │    │    │ └─ serverTimestamp   │
        │ ├─ Bubble div  │    │    │                      │
        │ ├─ Text content│    │    └──────────────────────┘
        │ └─ Timestamp   │    │
        │                │    │
        │ Styling:       │    │
        │ ├─ own-message │    │
        │ │ (right, green)    │
        │ └─ other-message   │
        │   (left, grey)     │
        └──────────────────────┘
```

---

## Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    USER ACTION                                 │
│                                                                │
│   1. User types:  "Hello"                                     │
│      └─→ input state: "Hello"                                 │
│                                                                │
│   2. User presses Enter or clicks Send                        │
│      └─→ handleSend() called                                  │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│              ChatScreen Component                              │
│                                                                │
│   handleSend():                                               │
│   ├─ Validate: input.trim() !== ""                            │
│   ├─ Extract: messageText = input.trim()                      │
│   ├─ Clear: setInput("")                                      │
│   └─ Send: await sendMessage(patientId, text, userId)        │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│              Firebase/chatService                              │
│                                                                │
│   sendMessage(patientId, text, senderId):                     │
│   ├─ Get ref: doc(db, 'chats', patientId)                    │
│   ├─ Create message: {                                        │
│   │   id: UUID                                                │
│   │   text: "Hello"                                           │
│   │   senderId: "user_123"                                    │
│   │   timestamp: serverTimestamp()                            │
│   │ }                                                          │
│   └─ Add to collection(ref, 'messages')                      │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│              Firestore Database                                │
│                                                                │
│   Database Structure:                                         │
│   chats/                                                      │
│   └─ patient_123/                                             │
│      ├─ (basic info)                                          │
│      └─ messages/                                             │
│         ├─ msg_001: {                                         │
│         │   text: "Hello"                                     │
│         │   senderId: "user_123"                              │
│         │   timestamp: 2026-03-31T14:30:00Z  ←── Added!      │
│         │ }                                                    │
│         └─ ... other messages                                 │
└────────────────────┬───────────────────────────────────────────┘
                     │
         Real-time update via listener
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│         Firebase Listener (onSnapshot)                         │
│                                                                │
│   Triggers automatically when new message added:              │
│   └─ receives updated messages array                          │
│      └─→ setMessages(newMessagesArray)                        │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│         ChatScreen State Update                                │
│                                                                │
│   State updates:                                              │
│   ├─ messages: [...oldMessages, newMessage]                  │
│   └─ Triggers re-render                                       │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│         useEffect: Auto-scroll                                 │
│                                                                │
│   Dependency: [messages]                                      │
│   ├─ messagesEndRef.current?.scrollIntoView({                │
│   │   behavior: "smooth"                                      │
│   │ })                                                        │
│   └─ Scrolls to latest message smoothly                       │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│    Render Updated Messages                                    │
│                                                                │
│   {messages.map((msg) =>                                      │
│     <MessageBubble                                             │
│       text={msg.text}                                          │
│       isOwn={msg.senderId === currentUserId}                  │
│       timestamp={formatTime(msg.timestamp)}                   │
│       ...                                                      │
│     />                                                         │
│   )}                                                           │
│                                                                │
│   MessageBubble renders with appropriate styling:             │
│   ├─ Own message: right-aligned, green background             │
│   └─ Other message: left-aligned, grey background             │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Tree

```
App
└── YourPage (ChatPage, PatientDetail, etc.)
    └── ChatScreen ⭐ (Main Component)
        ├── Header Section
        │   ├── Title
        │   ├── Subtitle
        │   └── Status Indicator
        │
        ├── Messages Section
        │   ├── Empty State (if no messages)
        │   │   ├── Emoji Icon
        │   │   ├── Title
        │   │   └── Subtitle
        │   │
        │   └── Messages List (if has messages)
        │       ├── MessageBubble ⭐
        │       │   ├── Bubble Container
        │       │   ├── Message Text
        │       │   └── Timestamp
        │       │
        │       ├── MessageBubble ⭐
        │       │   ├── Bubble Container
        │       │   ├── Message Text
        │       │   └── Timestamp
        │       │
        │       └── ... (more MessageBubbles)
        │
        └── Input Section
            ├── Text Input
            └── Send Button
```

---

## State Management Flow

```
ChatScreen Component State:

┌─────────────────────────────────────────────────────────────┐
│                        Initial State                        │
│                                                             │
│  messages: []              (empty array)                    │
│  input: ""                 (empty string)                   │
│  loading: true             (show spinner)                   │
│  sending: false            (button not disabled)            │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              After Firebase Setup (useEffect)               │
│                                                             │
│  Listener established ✓                                     │
│  messages: [msg1, msg2, msg3, ...]  (from Firestore)       │
│  loading: false            (hide spinner)                   │
│  input: ""                 (empty)                          │
│  sending: false            (button enabled)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                    User types in input
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              User is Typing (onChange)                      │
│                                                             │
│  input: "H" → "He" → "Hel" → "Hello"                       │
│  messages: [... same ...]                                   │
│  loading: false                                             │
│  sending: false                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                 User clicks Send or presses Enter
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Sending Message (handleSend)                   │
│                                                             │
│  sending: true             (button disabled, spinner)       │
│  input: ""                 (cleared immediately)            │
│  messages: [... same ...] (optimistic update later)         │
└─────────────────────────────────────────────────────────────┘
                              │
           Firebase receives and stores message
                              │
           Listener fires with updated messages
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           Message Added (state updated by listener)         │
│                                                             │
│  sending: false            (button re-enabled)              │
│  messages: [..., newMsg]   (includes new message)           │
│  input: ""                 (still empty)                    │
│  useEffect => auto-scroll to newest message                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Props & Interface Flow

```
Props passed to ChatScreen:
────────────────────────────

Value: "patient_123"
  ↓
┌─────────────────────────────┐
│  interface ChatScreenProps  │
│  {                          │
│    patientId: string;   ←───┤─ Patient ID (chat identifier)
│    doctorId: string;    ←───┤─ Doctor ID (other participant)
│    currentUserId: string; ←─┤─ For message alignment
│    patientName?: string; ←──┤─ Display name
│  }                          │
└─────────────────────────────┘
  ↓
Used in: 
  ├─ ensureChatExists(patientId, doctorId)
  ├─ sendMessage(patientId, messageText, currentUserId)
  ├─ listenMessages(patientId, callback)
  └─ msg.senderId === currentUserId (for alignment)


Props passed to MessageBubble:
──────────────────────────────

Value: "Hello!"
  ↓
┌─────────────────────────────┐
│interface MessageBubbleProps │
│ {                           │
│   text: string;         ←───┤─ Message content
│   isOwn: boolean;       ←───┤─ boolean (true = own)
│   timestamp: string;    ←───┤─ Formatted time
│   senderName?: string;  ←───┤─ Optional sender name
│ }                           │
└─────────────────────────────┘
  ↓
Used for rendering:
  ├─ className: isOwn ? "own-message" : "other-message"
  ├─ Displays text content
  ├─ Displays timestamp
  └─ Applies appropriate styling
```

---

## CSS Styling Hierarchy

```
.chat-screen-container (100vh height, flex column)
│
├─→ .chat-screen-header
│   ├─→ .chat-screen-header-content
│   │   ├─→ .chat-screen-title
│   │   └─→ .chat-screen-subtitle
│   └─→ .chat-screen-status
│
├─→ .chat-screen-messages (flex: 1, scrollable)
│   ├─→ .message-bubble-wrapper
│   │   ├─→ .own-message / .other-message
│   │   │   └─→ .message-bubble
│   │   │       ├─→ .message-bubble-text
│   │   │       └─→ .message-bubble-time
│   │   
│   └─→ (or) .chat-screen-empty
│       ├─→ .empty-icon
│       ├─→ h4
│       └─→ p
│
└─→ .chat-screen-input-bar (fixed bottom)
    └─→ .chat-screen-input-form
        ├─→ .chat-screen-input
        └─→ .chat-screen-send-btn
```

---

## Lifecycle & Hooks

```
ChatScreen Component Lifecycle:

1. MOUNT
   ├─ useState initializations
   │  ├─ messages = []
   │  ├─ input = ""
   │  ├─ loading = true
   │  └─ sending = false
   │
   └─ useRef creations
      ├─ messagesEndRef
      └─ inputRef

2. EFFECTS RUN (in order)
   │
   ├─ useEffect[] (runs on mount only)
   │  └─ setupChat()
   │     ├─ ensureChatExists()
   │     └─ listenMessages() → sets up real-time listener
   │
   └─ useEffect[messages] (runs when messages change)
      └─ messagesEndRef?.scrollIntoView()

3. RENDER
   └─ Returns JSX with current state

4. USER INTERACTION
   ├─ User types: onChange → setInput()
   ├─ User sends: handleSend() → sendMessage()
   ├─ Firebase updates → listener fires
   ├─ setMessages() triggered
   ├─ Component re-renders
   └─ useEffect[messages] runs → auto-scroll

5. UNMOUNT
   ├─ Cleanup function runs
   └─ Firestore listener unsubscribed
```

---

## Error Handling Flow

```
sendMessage() Called
    │
    ├─→ Input validation
    │   └─ if (!input.trim()) return early
    │
    ├─→ Save message text
    │   └─ const messageText = input.trim()
    │
    ├─→ Clear input immediately
    │   └─ setInput("")
    │
    ├─→ Try block
    │   ├─ setSending(true)
    │   └─ await sendMessage(...)
    │       ├─ Firebase operation
    │       │   ├─ Success ✓
    │       │   │  └─ Listener will update messages
    │       │   │
    │       │   └─ Error ✗
    │       │      └─ Caught in catch block
    │       │
    │       └─ Focus input after
    │
    └─→ Finally block
        └─ setSending(false)
            └─ Button re-enabled

If Error Occurs:
    ├─ Error logged to console
    ├─ Input restored with original message
    └─ User sees disabled state cleared
```

---

## Performance Optimization Points

```
1. Component Rendering
   ├─ ChatScreen: Only re-renders on state change
   └─ MessageBubble: Receives primitive props (no deps)

2. Firebase Listener
   ├─ Setup once on mount
   ├─ Cleanup on unmount
   └─ No duplicate listeners

3. Auto-scroll
   ├─ Handled by useEffect[messages]
   ├─ Uses smooth scroll (GPU accelerated)
   └─ Only scrolls when messages change

4. CSS Animations
   ├─ GPU-accelerated transforms
   ├─ Uses will-change sparingly
   └─ No JavaScript animation loops

5. Input Management
   ├─ Debouncing not needed (simple onChange)
   └─ No expensive calculations
```

---

This architecture ensures:
✅ Clean separation of concerns
✅ Easy to test
✅ Easy to maintain
✅ Easy to extend
✅ Performance optimized
✅ Type safe
