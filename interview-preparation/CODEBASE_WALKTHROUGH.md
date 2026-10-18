# Watch Party — Comprehensive Codebase Walkthrough

> **File-by-File Technical Deep Dive for Code-Level Interviews**  
> *Target: Explaining exact functions, components, hooks, variables, execution flows, and interviewer queries.*

---

## Guide Navigation & File Reading Order

To understand this codebase in the most logical sequence, study the files in this order:

```
1. backend/src/models/Room.js      (Data model & database schema)
2. backend/src/server.js           (Core backend server & real-time engine)
3. frontend/src/App.jsx            (Client root, socket lifecycle & state)
4. frontend/src/WatchPlayer.jsx    (HTML5 video synchronization engine)
5. frontend/src/components/ChatPanel.jsx       (Real-time chat UI)
6. frontend/src/components/EmojiReactions.jsx   (Floating reaction canvas)
7. frontend/src/components/PlaylistPanel.jsx    (Shared video queue)
8. frontend/src/components/PollPanel.jsx        (Live interactive polls)
9. backend/test_suite.js           (Automated integration test harness)
10. Deployment & Config Files      (render.yaml, vercel.json, vite.config.js)
```

---

## 1. `backend/src/models/Room.js`

### What the File Does & Why It Exists
Defines the Mongoose schema and model for persisting room metadata in MongoDB Atlas. It exists to guarantee room code uniqueness across restarts, maintain an audit log of rooms, and track host ownership transitions.

### Key Code Structure
- **File Path**: [`backend/src/models/Room.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js)
- **Schema Definition**:
  ```javascript
  const roomSchema = new mongoose.Schema(
    {
      roomCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        match: /^[A-Z0-9]{6}$/,
      },
      hostUsername: {
        type: String,
        required: true,
        trim: true,
      },
      status: {
        type: String,
        enum: ["active", "ended"],
        default: "active",
      },
    },
    {
      timestamps: true, // Automatically manages createdAt and updatedAt
    }
  );
  ```

### How It Interacts With Other Files
- Imported by [`backend/src/server.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L9).
- Called in `generateUniqueRoomCode()` via `Room.exists({ roomCode })`.
- Called in `create_room` via `Room.create(...)`.
- Called in `leaveCurrentRoom()` via `Room.updateOne(...)` to update host or mark status as `ended`.

### Execution Flow
1. Server starts and registers the model in Mongoose.
2. When a room is created, Mongoose validates constraints (regex, required, uppercase) and saves to the MongoDB `rooms` collection.
3. MongoDB's unique index on `roomCode` enforces global uniqueness at the database engine level.

### Potential Interview Questions
- **Q: Why don't you store participants, chat messages, or playback positions in this schema?**  
  *Answer:* Real-time playback and chat mutate multiple times per second. Persisting every seek, tick, and reaction to MongoDB would create an I/O bottleneck and introduce 50–100ms latency. High-frequency volatile state is kept in server RAM, while MongoDB acts strictly as an audit and uniqueness authority.
- **Q: What happens if MongoDB goes down while the server is running?**  
  *Answer:* Active rooms currently in memory continue functioning for chat and playback, but new room creations fail gracefully because `generateUniqueRoomCode()` and `Room.create()` require a database write. The health check (`/health`) flags the service as `degraded` (`503 Service Unavailable`).

---

## 2. `backend/src/server.js`

### What the File Does & Why It Exists
The central nervous system of the Watch Party backend. Initializes Express 5, binds HTTP and Socket.IO servers, configures dynamic CORS matching, manages in-memory room state, enforces host permissions, executes clock calculations, and handles room teardown grace periods.

### Key Global Variables & In-Memory State
- `activeRooms = new Map()`: Primary memory store mapping `roomCode -> RoomObject`. Each room object holds:
  - `hostSocketId`: Current socket ID with admin permissions.
  - `participants`: Map of `socket.id -> { id, username, joinedAt }`.
  - `playback`: `{ videoUrl, position, isPlaying, updatedAt, version }`.
  - `messages`: Array of chat messages (capped at `MAX_CHAT_HISTORY = 100`).
  - `playlist`: Array of playlist items (capped at `MAX_PLAYLIST_ITEMS = 30`).
  - `poll`: Active poll object or `null`.
- `socketRooms = new Map()`: Reverse index mapping `socket.id -> roomCode`. Ensures a socket can only be in one room at a time and enables $O(1)$ lookups on disconnect.
- `roomCleanupTimers = new Map()`: Holds pending `setTimeout` references for 15-second grace periods when a room becomes empty due to unexpected disconnects.
- `chatRateLimits = new Map()` & `reactionRateLimits = new Map()`: Sliding-window rate limit trackers per socket.

### Critical Functions & Handlers

#### 1. Dynamic CORS Evaluator (`getAllowedOrigins` & `isOriginAllowed`)
- **Lines 39–76**:
  ```javascript
  function isOriginAllowed(origin, allowedList) {
    if (!origin) return true; // Allows curl, health checks, server-to-server
    const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();
    return allowedList.some((allowed) => {
      // Direct equality check or Wildcard regex matching for "https://*.vercel.app"
    });
  }
  ```
  *Significance:* Solves CORS for dynamic preview deployments generated by Vercel for GitHub branches without opening the server to universal `*`.

#### 2. Authoritative Position Calculator (`getExpectedPosition` & `getPlaybackSnapshot`)
- **Lines 338–357**:
  ```javascript
  function getExpectedPosition(playback, now = Date.now()) {
    if (!playback.isPlaying) return playback.position;
    const elapsedSeconds = Math.max(0, now - playback.updatedAt) / 1000;
    return playback.position + elapsedSeconds;
  }
  ```
  *Significance:* The cornerstone of the video synchronization engine. Computes the real-time playback position on demand using the server's authoritative wall clock.

#### 3. Room Code Generator (`generateUniqueRoomCode`)
- **Lines 316–332**: Uses `crypto.randomInt` over a curated alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (31 chars, omitting confusing glyphs like `0`, `O`, `1`, `I`). Checks both in-memory `activeRooms` and MongoDB `Room.exists` with a 10-attempt collision retry loop.

#### 4. Disconnect & Host Migration Manager (`leaveCurrentRoom`)
- **Lines 401–464**:
  - Removes socket from room and Socket.IO channel.
  - If room is empty and it was an unexpected disconnect (`isDisconnect === true`), starts a **15-second grace period timer**.
  - If the departing user was the host, finds the earliest joined remaining participant (`[...room.participants.values()].sort((a,b) => a.joinedAt - b.joinedAt)[0]`), assigns them as new host, and persists the update to MongoDB.
  - Emits `room_updated` to inform all remaining viewers.

#### 5. Socket.IO Event Handlers
- `socket.on("create_room", ...)`: Validates username, generates code, saves to MongoDB, creates room in `activeRooms`, joins socket, and replies with acknowledgment.
- `socket.on("join_room", ...)`: Validates code, enforces `MAX_PARTICIPANTS = 10`, prevents duplicate display names, and adds participant.
- `socket.on("reconnect_room", ...)`: Reclaims the participant slot for a reconnected user, updates their socket ID, restores host status if applicable, and cancels any pending grace period cleanup timer.
- `socket.on("playback_command", ...)`: **Host-only**. Actions: `play`, `pause`, `seek`, `ended`. Updates in-memory playback, increments monotonic `version`, and broadcasts `playback_updated`.
- `socket.on("send_chat_message", ...)`: Validates message (1–500 chars), enforces rate limit (5 msgs / 3s), appends to history, and broadcasts `chat_message`.
- `socket.on("send_reaction", ...)`: Validates against `ALLOWED_REACTIONS` (`❤️, 😂, 🔥, 👍, 😮, 👏`), enforces rate limit (8 reactions / 3s), and broadcasts `reaction_received`.
- `socket.on("create_poll" | "vote_poll" | "close_poll" | "delete_poll", ...)`: Manages real-time voting, prevents duplicate votes per username, and broadcasts `poll_updated`.
- `socket.on("add_to_playlist" | "remove_from_playlist" | "reorder_playlist" | "play_playlist_item", ...)`: Host-controlled shared playlist management.

### Potential Interview Questions
- **Q: What is the purpose of `app.set("trust proxy", 1)`?**  
  *Answer:* Behind Render's reverse proxy, client requests arrive with proxy IP addresses. Enabling `trust proxy` tells Express to trust the `X-Forwarded-*` headers, allowing the application to extract authentic client IP addresses for security logging and diagnostics.
- **Q: How does `reconnect_room` prevent duplicate participants?**  
  *Answer:* When a client reconnects, their socket ID changes. `reconnect_room` searches `room.participants` for a matching username. If found, it deletes the stale socket ID from `room.participants` and `socketRooms`, rebinds the participant to the new `socket.id`, and migrates `hostSocketId` if that user was the host.

---

## 3. `frontend/src/App.jsx`

### What the File Does & Why It Exists
The root React component. Establishes and manages the Socket.IO client lifecycle, tracks connection status, handles invite link URL parameters (`?room=CODE`), coordinates tab navigation (`chat`, `playlist`, `poll`, `people`), and manages top-level notification alerts.

### Key Code Structure
- **Backend URL Resolution (`getBackendUrl`)**:
  ```javascript
  function getBackendUrl() {
    const envUrl = (import.meta.env.VITE_SERVER_URL || "").trim();
    if (!envUrl) return "http://localhost:5000";
    return envUrl.replace(/\/+$/, "").replace(/\/socket\.io\/?$/, "");
  }
  ```
  *Significance:* Safely sanitizes the environment variable, preventing double slashes or accidental path suffixes that break Socket.IO handshakes.
- **Refs for Lifecycle Preservation**:
  - `socketRef.current`: Maintains the live Socket.IO connection instance across component re-renders.
  - `currentRoomCodeRef.current` & `currentUsernameRef.current`: Keep track of active room credentials so that if the socket disconnects and reconnects, the `connect` listener can automatically trigger `reconnect_room`.

### State Management Breakdown
- `connectionStatus`: `"connecting"` | `"connected"` | `"reconnecting"` | `"disconnected"`. Drives the connection badge in the navbar.
- `room`: Complete room snapshot received from server. Contains `roomCode`, `hostUsername`, `participants`, `playback`, `playlist`, `poll`, `messages`.
- `activeTab`: Manages sidebar tab switching (`"chat"` | `"playlist"` | `"poll"` | `"people"`).
- `unreadChatCount`: Increments when new chat messages arrive while the user is viewing another tab (e.g. Playlist or Polls).

### Execution Flow
1. Component mounts; `useEffect` initializes `io(API_URL)`.
2. Checks `window.location.search` for `?room=CODE`. If present, pre-fills the room code input and displays an invite banner.
3. Upon `connect`, if previous room credentials exist in refs, emits `reconnect_room` to restore state automatically.
4. Registers listeners for `room_updated`, `poll_updated`, `playlist_updated`.
5. Renders hero/action forms when `!room`, or the full watch room experience when `room` is active.

### Potential Interview Questions
- **Q: Why are `currentRoomCodeRef` and `currentUsernameRef` used inside the `useEffect` instead of reading state directly?**  
  *Answer:* The `useEffect` setting up the socket connection runs once on mount (`[]` dependency array). If we referenced `room` or `username` state directly inside socket event callbacks registered on mount, they would suffer from **stale closures**, permanently capturing the initial empty state. `useRef` provides a mutable container whose `.current` property always reflects the latest values across renders without requiring effect re-runs.

---

## 4. `frontend/src/WatchPlayer.jsx`

### What the File Does & Why It Exists
The core video player component. Wraps the native HTML5 `<video>` element, provides customized host controls, calculates real-time video drift against the server's clock, executes seek operations, and mounts the floating emoji reaction canvas.

### Key Constants & Calculation Formulas
- `DRIFT_THRESHOLD = 1.5;`: Maximum allowable desynchronization (in seconds) before the client forces a video seek.
- `PROGRESS_INTERVAL_MS = 100;`: Frequency of local progress bar updates for smooth UI rendering.
- `expectedPosition(playback)`:
  ```javascript
  function expectedPosition(playback) {
    if (!playback?.isPlaying) return playback?.position ?? 0;
    return (playback.position ?? 0) + Math.max(0, Date.now() - playback.updatedAt) / 1000;
  }
  ```

### Critical Refs & State
- `videoRef`: Reference to native `<video>` DOM element.
- `playbackRef`: Mutable ref holding latest server playback state to avoid stale closure issues in callbacks.
- `isApplyingPlaybackRef`: Guard flag to prevent programmatic seeks from triggering self-seeking echo loops.
- `isDraggingRef`: Tracks whether the host is actively dragging the seek slider to suppress background updates during interaction.
- `endedVersionRef`: Tracks the playback version when video ends to prevent duplicate `ended` emissions.

### Core Method: `applyPlayback(state, forceSeek = false)`
- **Lines 44–82**:
  1. Computes `target = Math.max(0, expectedPosition(state))`.
  2. Evaluates if seek is required: `forceSeek || Math.abs(video.currentTime - target) > DRIFT_THRESHOLD`.
  3. If required, sets `isApplyingPlaybackRef.current = true`, updates `video.currentTime = target`, and clears the flag in `queueMicrotask()`.
  4. Synchronizes play/pause state: calls `video.play()` or `video.pause()`. Catches browser autoplay restrictions gracefully and prompts user.

### Execution Flow: Host Seeking
1. Host drags slider -> `handleSeekChange` sets `isDraggingRef.current = true`, updates draft position.
2. Host releases slider -> `commitSeek` fires `socket.emit("playback_command", { action: "seek", position })`.
3. Server updates `playback.position`, increments `version`, and broadcasts `playback_updated`.
4. All clients (including host) receive `playback_updated` and execute `applyPlayback(state, true)`.

### Potential Interview Questions
- **Q: Why is `queueMicrotask()` used when resetting `isApplyingPlaybackRef.current`?**  
  *Answer:* Directly setting `video.currentTime = target` triggers synchronous browser event dispatching for `seeking` and `timeupdate`. If we cleared the flag synchronously on the next line, event handlers might still execute with the flag set to `false`. `queueMicrotask` ensures the flag remains `true` until all synchronous DOM event handlers dispatched by the property mutation have completed execution.

---

## 5. `frontend/src/components/ChatPanel.jsx`

### What the File Does & Why It Exists
Renders the real-time chat interface. Manages chat message streams, handles intelligent auto-scrolling with scroll-away detection, provides multiline text input, and tracks unread message badges.

### Key Implementation Mechanics
- **Scroll Container Reference (`scrollContainerRef`) & Distance Check**:
  ```javascript
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setHasScrolledUp(distanceFromBottom > 60);
  }, []);
  ```
  *Significance:* If a user scrolls up to read past messages, incoming messages will not forcibly yank their scroll position back down. A floating **"↓ New messages below"** pill appears instead.
- **Unread Counter Coordination**:
  When `isVisible === false` (user is on Playlist, Poll, or People tab), incoming messages increment `unreadCountRef.current` and call `onUnreadCountChange`. When the user switches back to the Chat tab (`isVisible === true`), the unread count resets to 0.
- **Keyboard Handling**:
  Pressing `Enter` sends the message; pressing `Shift+Enter` inserts a newline.

### Potential Interview Questions
- **Q: How does `ChatPanel` prevent duplicate messages if the network retransmits?**  
  *Answer:* In the `chat_message` socket listener, `setMessages` checks `if (prev.some((m) => m.id === msg.id)) return prev;`. Because each message is tagged with a unique `randomUUID()` on the server, duplicate packets are safely ignored.

---

## 6. `frontend/src/components/EmojiReactions.jsx`

### What the File Does & Why It Exists
Provides a dual-component interface:
1. `ReactionButtons`: A bottom toolbar allowing users to click one of 6 allowed emojis (`❤️, 😂, 🔥, 👍, 😮, 👏`).
2. `ReactionsOverlay`: A floating transparent canvas over the video player displaying animated floating emojis.

### Key Implementation Mechanics
- **Random Horizontal Positioning**:
  Each incoming reaction is assigned a random horizontal percentage (`left: Math.floor(Math.random() * 65) + 15`) so emojis float across different vertical columns over the video without bunching.
- **Self-Cleaning Ephemeral Lifecycle**:
  When a reaction is received, a 2.6-second `setTimeout` is scheduled to prune the reaction from local component state:
  ```javascript
  setTimeout(() => {
    setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
  }, 2600);
  ```
- **Frontend Debouncing**:
  `ReactionButtons` enforces a 250ms local cooldown state to prevent users from button-mashing faster than the network can transmit.

### Potential Interview Questions
- **Q: How do you prevent excessive floating reactions from degrading browser rendering performance?**  
  *Answer:* Two layers of protection: (1) The server enforces a sliding-window rate limit of 8 reactions per 3 seconds per socket. (2) The client caps the local reaction queue at 20 items using `prev.slice(-20)` and automatically removes DOM nodes after their 2.6s CSS keyframe animation completes.

---

## 7. `frontend/src/components/PlaylistPanel.jsx`

### What the File Does & Why It Exists
Allows the room to maintain a collaborative or host-curated queue of videos (up to 30 items). Displays the current playlist, highlights the currently playing video with a `▶ Playing Now` badge, and gives the host controls to play, reorder, or delete items.

### Key Event Emitters
- `socket.emit("add_to_playlist", { videoUrl, title })`
- `socket.emit("play_playlist_item", { itemId })`
- `socket.emit("reorder_playlist", { itemId, direction: "up" | "down" })`
- `socket.emit("remove_from_playlist", { itemId })`

### Execution Flow: Selecting a Playlist Video
1. Host clicks "Play" on item 3.
2. Emits `play_playlist_item` with `itemId`.
3. Server validates host authority, updates `room.playback.videoUrl = item.videoUrl`, sets `position = 0`, `isPlaying = true`, and updates `currentPlaylistId`.
4. Server emits `playback_updated` and `playlist_updated` to the room.
5. All clients switch their video source, reset their seek bars to 0, and start synchronized playback.

---

## 8. `frontend/src/components/PollPanel.jsx`

### What the File Does & Why It Exists
Provides interactive live polling. The host can create a question with 2 to 5 options. Viewers vote in real time. The component dynamically renders vote counts and animated progress bars showing percentage distributions.

### Key Implementation Mechanics
- **Single Vote Enforcement**:
  Tracks whether the current user has voted via `poll.userVotes[currentUsername]`. Once voted, options become non-clickable, and the user's selection is marked with a checkmark.
- **Dynamic Percentage Calculations**:
  Percentages are calculated on the server and verified on the client:
  $$\text{percentage} = \text{totalVotes} > 0 \;?\; \text{Math.round}\left(\frac{\text{votes}}{\text{totalVotes}} \times 100\right) : 0$$
- **Host Controls**: Host can close voting (`close_poll`) or delete the poll (`delete_poll`).

---

## 9. `backend/test_suite.js`

### What the File Does & Why It Exists
An automated integration test harness that spins up the backend server as a child process and simulates multiple concurrent client sockets (Host and Viewer) to verify all critical room operations end-to-end.

### Test Coverage Breakdown
1. **Server Health Probe**: Polls `GET /health` until MongoDB is connected.
2. **Room Creation**: Verifies 6-char code generation, host assignment, and default playlist injection.
3. **Viewer Joining**: Verifies room joining, participant count increment, and non-host role assignment.
4. **Playback Authorization**: Confirms host can play/seek and verifies viewer playback commands are rejected (`ok === false`).
5. **Chat Validation**: Tests successful broadcasting, authentic sender display names, and rejection of empty or >500 character messages.
6. **Emoji Reactions**: Validates reaction broadcasting and rejection of invalid emoji glyphs.
7. **Playlist Queue**: Tests adding, reordering, playing, and deleting queue items.
8. **Poll Lifecycle**: Tests poll creation, viewer voting, duplicate vote rejection, and poll closure with percentage calculation.
9. **Reconnection**: Tests `reconnect_room` to ensure socket ID migration without creating duplicate participant entries.

---

## 10. Deployment & Infrastructure Files

### `render.yaml`
Declarative Infrastructure-as-Code (IaC) blueprint for Render:
- `rootDir: backend`, `buildCommand: npm install`, `startCommand: npm start`.
- `healthCheckPath: /health`: Ensures zero-downtime deploys by waiting for the MongoDB connection before routing public traffic.
- Configures environment bindings (`PORT: 10000`, `HOST: 0.0.0.0`).

### `frontend/vercel.json`
Specifies rewrite rules for Vercel's edge network:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
*Significance:* Enables client-side URL routing and ensures query parameters like `/?room=ABC123` route cleanly to `index.html` instead of triggering a 404 error.
