# Watch Party — Final Interview Revision Checklist & Cheat Sheet

> **Quick-Reference Cheat Sheet for Day-Before & Hour-Before Interview Revision**  
> *Keep this open to rapidly review exact constants, formulas, and architectural facts.*

---

## 1. Key Constants & Thresholds (Memorize These Exact Numbers)

| Constant / Setting | Exact Value in Code | File Location | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- |
| `DRIFT_THRESHOLD` | **1.5 seconds** | [`frontend/src/WatchPlayer.jsx` L6](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L6) | Tolerates 50–150ms internet jitter and audio decoding variance without triggering jarring micro-seeks. Forces hard seek when desync > 1.5s. |
| `PROGRESS_INTERVAL_MS`| **100 ms** | [`frontend/src/WatchPlayer.jsx` L7](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L7) | Drives the UI seek bar smoothly instead of relying on the browser's erratic 250–500ms `timeupdate` event. |
| `MAX_PARTICIPANTS` | **10 users** | [`backend/src/server.js` L78](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L78) | Enforces room capacity limit to keep broadcast CPU and socket packet overhead negligible on free cloud tiers. |
| `ROOM_CODE_LENGTH` | **6 characters** | [`backend/src/server.js` L79](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L79) | 6 alphanumeric chars from a 31-char alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), omitting `0, O, 1, I`. |
| `USERNAME_MIN / MAX` | **2 to 24 chars** | [`backend/src/server.js` L80-81](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L80-L81) | Sanitized by `cleanUsername` to reject control characters and HTML injection glyphs (`/[\u0000-\u001F\u007F<>]/`). |
| `MAX_CHAT_HISTORY` | **100 messages** | [`backend/src/server.js` L86](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L86) | Caps in-memory message history array in RAM using `room.messages.shift()` to bound memory footprint per room. |
| `MAX_PLAYLIST_ITEMS` | **30 items** | [`backend/src/server.js` L87](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L87) | Prevents denial-of-service queue flooding while providing generous playlist capacity for watch sessions. |
| `Chat Rate Limit` | **5 msgs / 3 sec** | [`backend/src/server.js` L920](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L920) | Sliding-window timestamp filtering per socket ID (`checkRateLimit`). |
| `Reaction Rate Limit` | **8 emojis / 3 sec**| [`backend/src/server.js` L984](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L984) | Restricts reaction bursts over WebSockets; validated against `["❤️", "😂", "🔥", "👍", "😮", "👏"]`. |
| `Grace Period Timer` | **15 seconds** | [`backend/src/server.js` L428](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L428) | Prevents empty room destruction on accidental disconnections or browser reloads. |
| `MongoDB Connect Timeout`| **5000 ms (5s)** | [`backend/src/server.js` L1460](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L1460) | 3 retry attempts with `serverSelectionTimeoutMS: 5000` for rapid fail-fast container boot. |

---

## 2. Core Formulas & Code Mechanics

### Expected Position Formula
$$\text{expectedPosition} = 
\begin{cases} 
\text{playback.position} & \text{if paused} \\ 
\text{playback.position} + \frac{\max(0, \text{Date.now()} - \text{playback.updatedAt})}{1000} & \text{if playing} 
\end{cases}$$

### Drift Check Formula
$$\text{drift} = \left|\text{video.currentTime} - \text{target}\right|$$
Seek occurs if: `forceSeek === true || drift > 1.5`.

---

## 3. High-Priority Concept Checklist

Review and tick off each concept before your interview:

### Architecture & System Design
- [ ] **Hybrid State Model**: Can articulate why high-frequency playback state is in RAM (`activeRooms` Map) while metadata (`roomCode`, `hostUsername`, `status`) is in MongoDB.
- [ ] **Horizontal Scaling Limitation**: Understand why single-instance is currently required and how to scale with `@socket.io/redis-adapter` and Redis Hashes.
- [ ] **Transport Negotiation**: Understand why Socket.IO starts with HTTP long-polling and upgrades to WebSocket (`wss://`).
- [ ] **Reverse Proxy Configuration**: Understand why `app.set("trust proxy", 1)` is required on Render.
- [ ] **Dynamic Wildcard CORS**: Understand how `isOriginAllowed` converts `https://*.vercel.app` into regex to permit branch previews.

### Frontend & React Mastery
- [ ] **Ref vs. State**: Explain why `isApplyingPlaybackRef` and `isDraggingRef` are stored in refs rather than `useState`.
- [ ] **Stale Closures**: Explain how `currentRoomCodeRef` prevents socket reconnect handlers from reading stale initial state.
- [ ] **Microtask Guard**: Explain why `queueMicrotask()` is used to clear `isApplyingPlaybackRef.current` after setting `video.currentTime`.
- [ ] **Effect Cleanups**: Explain why `socket.off()` in `useEffect` cleanups prevents duplicate event listeners.
- [ ] **Autoplay Restrictions**: Explain how catching `video.play()` promise rejection handles browser unmuted autoplay policies.

### Real-Time & Networking Depth
- [ ] **Authoritative Wall Clock**: Explain why calculating position from an anchor timestamp saves 98% bandwidth over continuous timecode streaming.
- [ ] **Monotonic Versioning**: Explain how `version` numbers discard out-of-order network packets during network jitter.
- [ ] **Failover & Host Migration**: Explain how the server promotes the earliest-joined participant (`joinedAt`) when a host departs.
- [ ] **15-Second Grace Period**: Explain how `roomCleanupTimers` prevents room destruction during quick page refreshes.
- [ ] **Sliding-Window Rate Limiting**: Explain the algorithm used in `checkRateLimit` to prevent WebSocket spam.

---

## 4. "Gotcha" Questions & Quick Defenses

| Interviewer "Gotcha" | Quick, Authoritative Defense |
| :--- | :--- |
| *"Why not save every pause and seek in MongoDB?"* | *"Disk I/O and network latency over MongoDB Atlas takes 30–100ms. In RAM, pointer lookups take $<0.05\text{ms}$, which is required for frame-accurate video synchronization."* |
| *"What happens if two people click play at the same time?"* | *"Only the host socket is authorized on the backend (`socket.id === room.hostSocketId`). Viewer commands are rejected with `{ ok: false }`."* |
| *"What happens if the backend restarts?"* | *"Because active rooms are in RAM, live sessions are wiped. MongoDB retains room existence, but clients must recreate or restart rooms. In production, Redis would externalize this state."* |
| *"Why does Socket.IO use long-polling first?"* | *"To guarantee connectivity through restrictive corporate or school firewalls that block the HTTP WebSocket Upgrade header, before testing a WebSocket probe."* |
| *"Why did you use `queueMicrotask` instead of `setTimeout(..., 0)`?"* | *"Microtasks execute immediately after the current synchronous execution context drains, guaranteeing all synchronous DOM `timeupdate` events complete before the guard flag resets. `setTimeout` yields to the macrotask queue, introducing unnecessary frame delay."* |

---

## 5. Confidence Scorecard

Before your interview, rate yourself (1 to 5) on these topics:

- [ ] Project Overview & Value Proposition: `[ /5 ]`
- [ ] React 19 State, Hooks, & Refs: `[ /5 ]`
- [ ] Node.js Event Loop & Express Pipeline: `[ /5 ]`
- [ ] Socket.IO Transports, Rooms, & Acks: `[ /5 ]`
- [ ] Video Synchronization & Drift Calculation: `[ /5 ]`
- [ ] MongoDB Schema & Resilience: `[ /5 ]`
- [ ] Cloud Deployment (Render & Vercel): `[ /5 ]`
- [ ] Security, Rate Limiting, & Scaling: `[ /5 ]`
