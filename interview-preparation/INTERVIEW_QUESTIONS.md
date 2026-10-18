# Watch Party — 80-Question Technical Interview Question Bank

> **Curated & Code-Verified Interview Questions for Full-Stack, Frontend, & Systems Engineering Interviews**  
> *Every answer reflects the actual implementation in `backend/` and `frontend/`.*

---

## Category 1: Project Overview & Motivation

### Q1.1: What is Watch Party and what problem does it solve?
- **Model Answer**: Watch Party is a real-time collaborative streaming web app allowing distributed users to watch HTML5 videos in synchronized lockstep. It eliminates the manual coordination friction of pressing play over voice calls, and integrates social interactions (chat, reactions, playlists, polls) directly into the viewing canvas without browser extensions.
- **Detailed Explanation**: In remote environments, people watching videos together suffer from buffer timing mismatches, hardware clock drift, and fragmented communication across external chat apps. Watch Party synchronizes playback using an authoritative server clock and client drift compensation, while providing low-latency embedded communication channels.
- **Code Reference**: [`frontend/src/App.jsx`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L293-L306), [`README.md`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/README.md#L28-L42).
- **Likely Follow-up**: How does your implementation compare to commercial products like Teleparty or Scener?
- **Interviewer Evaluates**: Ability to clearly articulate project value, user empathy, and product vision.

### Q1.2: Who are the target users and what are the primary use cases?
- **Model Answer**: Long-distance couples, friend groups, study groups, and remote creative teams reviewing video cuts. Use cases range from movie nights to interactive study sessions with live quizzes.
- **Detailed Explanation**: The application is tailored for casual and educational watch sessions where low barrier to entry (no login, no extensions, instant invite links) is paramount.
- **Code Reference**: [`frontend/src/App.jsx` Line 253](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L253) (`copyInvite`).
- **Likely Follow-up**: Why didn't you require user accounts with passwords?
- **Interviewer Evaluates**: Understanding of friction vs. security trade-offs in product design.

### Q1.3: What features did you successfully implement and verify?
- **Model Answer**: Room lifecycle (create, join, reconnect, host migration, capacity limits), synchronized video controls (play, pause, seek, ended), live chat with rate limiting and unread counters, floating emoji reactions, collaborative playlists, and live polls.
- **Detailed Explanation**: Every feature has been tested end-to-end via our automated integration test harness `backend/test_suite.js`, simulating multiple client sockets.
- **Code Reference**: [`backend/test_suite.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/test_suite.js).
- **Likely Follow-up**: What features are partially implemented or planned for the future?
- **Interviewer Evaluates**: Honesty, self-awareness, and testing discipline.

### Q1.4: How are rooms identified and shared between users?
- **Model Answer**: Rooms use a 6-character uppercase alphanumeric code generated from a 31-character alphabet. Users can share the code manually or send an invite link (`/?room=CODE`).
- **Detailed Explanation**: The alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` excludes visually ambiguous characters (`0`, `O`, `1`, `I`) to prevent user input errors when reading codes over audio.
- **Code Reference**: [`backend/src/server.js` Lines 79–83](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L79-L83), [`frontend/src/App.jsx` Lines 29–40](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L29-L40).
- **Likely Follow-up**: What is the probability of a room code collision?
- **Interviewer Evaluates**: Attention to detail in usability and entropy calculations.

### Q1.5: How does the invite link work from a cold browser open?
- **Model Answer**: When a user opens `https://domain/?room=ABC123`, `App.jsx` extracts the code using `URLSearchParams`, validates the format with regex, pre-fills the join input, and displays an invite banner.
- **Detailed Explanation**: The user only needs to type their desired username and click "Join Room", reducing join steps to under 3 seconds.
- **Code Reference**: [`frontend/src/App.jsx` Lines 29–40, 309–313](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L29-L40).
- **Likely Follow-up**: What happens if the invited room code doesn't exist on the server?
- **Interviewer Evaluates**: Understanding of URL parsing, input validation, and user feedback states.

### Q1.6: What is the maximum participant capacity per room and why?
- **Model Answer**: `MAX_PARTICIPANTS = 10`. This limit balances interactive social dynamics with browser and server WebSocket broadcast overhead.
- **Detailed Explanation**: For N participants in a room, broadcasting an event is an $O(N)$ operation. 10 users creates 10 outgoing socket packets per event, keeping memory and CPU negligible on Render's free tier.
- **Code Reference**: [`backend/src/server.js` Line 78](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L78).
- **Likely Follow-up**: How would the architecture change if you wanted to support 1,000 participants in a single room?
- **Interviewer Evaluates**: Awareness of scaling limits and computational complexity.

### Q1.7: What happens when the host of a room leaves or loses connection?
- **Model Answer**: The server automatically promotes the earliest-joined remaining participant (`joinedAt` sort) to host and persists the new host in MongoDB.
- **Detailed Explanation**: This prevents the room from becoming an unmanageable "orphan room" where no one can control playback or manage playlists.
- **Code Reference**: [`backend/src/server.js` Lines 444–460](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L444-L460).
- **Likely Follow-up**: What if the original host reconnects 5 seconds later? Do they regain host rights?
- **Interviewer Evaluates**: Distributed state ownership and failover logic.

### Q1.8: What was your primary technical goal when starting this project?
- **Model Answer**: To build a low-latency, resilient real-time synchronization engine using WebSockets while gaining deep hands-on mastery of race condition prevention, drift compensation, and hybrid state architectures.
- **Detailed Explanation**: Rather than building a generic CRUD application, this project tackled event loops, authoritative clock drift, and bi-directional state synchronization.
- **Code Reference**: [`backend/src/server.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js), [`frontend/src/WatchPlayer.jsx`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx).
- **Likely Follow-up**: What was the most surprising engineering bug you encountered?
- **Interviewer Evaluates**: Passion for engineering and technical ambition.

---

## Category 2: Architecture & Technology Choices

### Q2.1: Why did you choose Socket.IO instead of raw WebSockets?
- **Model Answer**: Socket.IO provides built-in transport fallback to HTTP long-polling, automatic reconnection with backoff, room-based multicasting (`socket.join`), and request-response acknowledgments out of the box.
- **Detailed Explanation**: With raw WebSockets, we would have had to manually engineer an application-level heartbeat, reconnection backoff, long-polling fallbacks for restrictive corporate firewalls, and custom correlation IDs for request-response flows.
- **Code Reference**: [`backend/src/server.js` Lines 146–167](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L146-L167), [`frontend/src/App.jsx` Lines 54–60](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L54-L60).
- **Likely Follow-up**: What overhead does Socket.IO introduce compared to raw WebSockets?
- **Interviewer Evaluates**: Pragmatism vs. "reinventing the wheel".

### Q2.2: Explain your hybrid state management model: what is in RAM vs. MongoDB?
- **Model Answer**: Ephemeral, high-frequency state (playback position, timestamps, participants, chat history, live polls, reactions) lives in server RAM (`activeRooms` Map). Persistent metadata (room code, host display name, status `active`/`ended`, timestamps) is stored in MongoDB.
- **Detailed Explanation**: Writing video ticks, seeks, and chat to MongoDB introduces 30–100ms disk and network latency, bottlenecking real-time video sync. RAM lookups take $< 0.05\text{ms}$.
- **Code Reference**: [`backend/src/server.js` Line 90](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L90), [`backend/src/models/Room.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js).
- **Likely Follow-up**: What is the downside of keeping active rooms in RAM?
- **Interviewer Evaluates**: In-depth understanding of caching, latency budgets, and persistence trade-offs.

### Q2.3: Why is React 19 used on the frontend?
- **Model Answer**: React provides a declarative component model, efficient reconciliation, and hooks (`useEffect`, `useRef`, `useCallback`) that enable clean encapsulation of external WebSocket streams.
- **Detailed Explanation**: React 19 provides improved rendering optimizations and hydration stability, paired with Vite's rapid ES modules bundling.
- **Code Reference**: [`frontend/package.json` Line 13](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/package.json#L13).
- **Likely Follow-up**: How do you prevent video flicker during state re-renders in React?
- **Interviewer Evaluates**: Modern frontend framework literacy.

### Q2.4: Why did you decouple the backend (Render) from the frontend (Vercel)?
- **Model Answer**: Separation of concerns. Static assets are distributed globally via Vercel's Edge CDN with near-zero latency, while the backend maintains long-lived, persistent WebSocket connections in a dedicated Node.js runtime on Render.
- **Detailed Explanation**: Serverless platforms (like Vercel serverless functions) cannot maintain persistent WebSocket connections because functions spin down after executing. Render provides a long-running Linux container necessary for Socket.IO.
- **Code Reference**: [`DEPLOYMENT.md` Lines 7–18](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L7-L18).
- **Likely Follow-up**: How do you handle CORS when frontend and backend are hosted on different domains?
- **Interviewer Evaluates**: Understanding of Edge architecture vs. stateful servers.

### Q2.5: Why did you choose Node.js and Express 5 for the backend?
- **Model Answer**: Node's non-blocking, event-driven I/O loop is ideally suited for high-concurrency, I/O-bound real-time WebSocket applications. Express 5 adds robust promise rejection handling and modern routing.
- **Detailed Explanation**: Node executes I/O asynchronously via `libuv`, handling thousands of idle connections without allocating heavy multi-threaded memory stacks.
- **Code Reference**: [`backend/package.json` Lines 14, 18](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/package.json#L14-L18).
- **Likely Follow-up**: What is the difference between Express 4 and Express 5 regarding async error handling?
- **Interviewer Evaluates**: Deep knowledge of Node.js concurrency and framework evolutions.

### Q2.6: How is Vite configured and why was it chosen over Create React App?
- **Model Answer**: Vite uses native ES modules during development for instant HMR (<100ms) and Rollup for optimized production tree-shaking, whereas CRA is deprecated and relies on slow Webpack bundling.
- **Detailed Explanation**: Build times with Vite take ~2–3 seconds on Vercel, compared to 45+ seconds with Webpack.
- **Code Reference**: [`frontend/vite.config.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/vite.config.js).
- **Likely Follow-up**: How does Vite handle environment variables differently than Create React App?
- **Interviewer Evaluates**: Tooling knowledge and modern frontend build pipelines.

### Q2.7: What is the purpose of `render.yaml`?
- **Model Answer**: It is an Infrastructure-as-Code (IaC) blueprint that declaratively specifies the Render service type, build commands, start scripts, environment bindings, and the `/health` check path.
- **Detailed Explanation**: IaC ensures reproducible deployments and eliminates human configuration error in cloud dashboards.
- **Code Reference**: [`render.yaml`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/render.yaml).
- **Likely Follow-up**: How does Render utilize the `healthCheckPath` property?
- **Interviewer Evaluates**: Cloud automation, DevOps awareness, and infrastructure reproducibility.

### Q2.8: What happens to active rooms if the Render server restarts?
- **Model Answer**: Because active room state is in RAM, all in-memory rooms are wiped on process restart. MongoDB retains the room documents, but their runtime participants and timers vanish.
- **Detailed Explanation**: If a client reconnects after a restart, the server replies that the room is no longer active (`activeRooms.get(roomCode)` returns `undefined`).
- **Code Reference**: [`backend/src/server.js` Lines 582–589, 654–661](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L582-L589).
- **Likely Follow-up**: How would you make active rooms survive server restarts?
- **Interviewer Evaluates**: Honesty regarding architectural limitations and state durability.

---

## Category 3: React & Frontend Engineering

### Q3.1: Explain the purpose and usage of `useRef` vs `useState` in `WatchPlayer.jsx`.
- **Model Answer**: `useState` is used for visual values like `displayPosition`, `duration`, and `buffering` that trigger DOM updates. `useRef` is used for `isApplyingPlaybackRef`, `isDraggingRef`, and `playbackRef` to store mutable flags across renders without triggering re-renders.
- **Detailed Explanation**: Mutating a ref updates its value synchronously without triggering a re-render. Mutating state is asynchronous and queues a re-render.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 21–40](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L21-L40).
- **Likely Follow-up**: Why would storing `isDraggingRef` in `useState` cause a laggy seek bar?
- **Interviewer Evaluates**: React lifecycle mastery and render-cycle optimization.

### Q3.2: How does `ChatPanel.jsx` detect if the user has scrolled up?
- **Model Answer**: It calculates the scroll container's distance from the bottom: `el.scrollHeight - el.scrollTop - el.clientHeight`. If greater than 60px, it sets `hasScrolledUp(true)`.
- **Detailed Explanation**: This prevents auto-scrolling from yanking the view away when a user is reading message history, and displays the "↓ New messages below" shortcut.
- **Code Reference**: [`frontend/src/components/ChatPanel.jsx` Lines 74–83](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/ChatPanel.jsx#L74-L83).
- **Likely Follow-up**: Why is `useCallback` used to wrap `handleScroll`?
- **Interviewer Evaluates**: DOM geometry calculations and scroll ergonomics.

### Q3.3: How does the unread message counter work when the chat tab is hidden?
- **Model Answer**: When a new message arrives via `chat_message` and `isVisible === false`, `ChatPanel` increments `unreadCountRef.current` and informs the parent via `onUnreadCountChange`.
- **Detailed Explanation**: When the user switches back to the chat tab (`isVisible === true`), an effect resets the counter to 0.
- **Code Reference**: [`frontend/src/components/ChatPanel.jsx` Lines 41–44, 54–60](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/ChatPanel.jsx#L41-L44).
- **Likely Follow-up**: Why is the unread badge rendered in `App.jsx` rather than `ChatPanel.jsx`?
- **Interviewer Evaluates**: Component communication and state lifting patterns.

### Q3.4: How does `EmojiReactions.jsx` manage the lifecycle of floating emojis?
- **Model Answer**: Each incoming reaction receives a unique ID and random horizontal position (15%–80%). It is added to component state, and a 2.6-second `setTimeout` removes it after the CSS animation completes.
- **Detailed Explanation**: The state is capped at 20 items (`prev.slice(-20)`) to protect the DOM from unbounded memory growth during spam.
- **Code Reference**: [`frontend/src/components/EmojiReactions.jsx` Lines 12–28](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/EmojiReactions.jsx#L12-L28).
- **Likely Follow-up**: What happens if the component unmounts while timers are active?
- **Interviewer Evaluates**: Animation lifecycle and memory leak prevention in React.

### Q3.5: What is the purpose of `useCallback` in `WatchPlayer.jsx`?
- **Model Answer**: To memoize `applyPlayback` and `sendCommand`, ensuring their function references remain stable unless their explicit dependencies change.
- **Detailed Explanation**: Because `applyPlayback` is passed into `useEffect` dependency arrays, an un-memoized function would cause the effect to re-run on every single render.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 44, 170](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L44-L170).
- **Likely Follow-up**: What is the performance cost of overusing `useCallback`?
- **Interviewer Evaluates**: Deep understanding of React hook dependencies and reference equality.

### Q3.6: How do you handle keyboard accessibility in `ChatPanel.jsx` and `PollPanel.jsx`?
- **Model Answer**: In `ChatPanel`, `Enter` submits while `Shift+Enter` allows newlines. In `PollPanel`, options have `role="button"` and `onKeyDown` listeners for `Enter` and `Space`.
- **Detailed Explanation**: This ensures non-mouse users can navigate and vote using standard keyboard accessibility conventions.
- **Code Reference**: [`frontend/src/components/ChatPanel.jsx` Lines 123–128](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/ChatPanel.jsx#L123-L128), [`frontend/src/components/PollPanel.jsx` Lines 225–230](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/PollPanel.jsx#L225-L230).
- **Likely Follow-up**: What ARIA attributes are used in the application?
- **Interviewer Evaluates**: Web accessibility (a11y) standards and inclusive engineering.

### Q3.7: How does `WatchPlayer.jsx` handle browser autoplay blocking?
- **Model Answer**: It wraps `video.play()` in a `try...catch` block. If the browser blocks playback with a `NotAllowedError`, it catches it and sets a friendly alert: "Playback was blocked. Press Play to retry."
- **Detailed Explanation**: Modern browsers block unmuted autoplay without prior user interaction on that domain.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 72–78](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L72-L78).
- **Likely Follow-up**: How could you bypass the autoplay policy without user interaction?
- **Interviewer Evaluates**: Knowledge of browser security policies and media playback APIs.

### Q3.8: Why does `App.jsx` maintain an active socket ref (`socketRef`) alongside state (`socket`)?
- **Model Answer**: State triggers re-renders when the socket is initialized or disconnected so UI badges update. The ref allows socket emissions inside helper functions (`requestRoom`, `leaveRoom`) without closure issues.
- **Detailed Explanation**: Reading `socketRef.current` guarantees that handlers always access the live socket instance even if invoked from an un-memoized closure.
- **Code Reference**: [`frontend/src/App.jsx` Lines 20, 24, 61](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L20-L24).
- **Likely Follow-up**: Can you demonstrate a race condition that occurs when relying only on `socket` state?
- **Interviewer Evaluates**: Mastery of dual-state/ref architectures in React.

---

## Category 4: Node.js & Express Engineering

### Q4.1: Explain the purpose and implementation of `/health` and `/api/health`.
- **Model Answer**: They return HTTP 200 (healthy) or 503 (degraded) based on `mongoose.connection.readyState === 1`, along with server uptime and active room count.
- **Detailed Explanation**: Cloud platforms like Render use these probes to determine whether to route traffic to the container or trigger a restart during cold starts.
- **Code Reference**: [`backend/src/server.js` Lines 122–144](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L122-L144).
- **Likely Follow-up**: Why do you check MongoDB connection state in the HTTP health check?
- **Interviewer Evaluates**: Production monitoring, readiness probes, and liveness checks.

### Q4.2: Why do you configure `app.set("trust proxy", 1)` in `server.js`?
- **Model Answer**: It instructs Express to trust headers added by Render's reverse proxy (`X-Forwarded-For`, `X-Forwarded-Proto`), allowing accurate client IP identification for logs and rate limits.
- **Detailed Explanation**: Without it, `req.ip` returns the private IP of the internal load balancer.
- **Code Reference**: [`backend/src/server.js` Line 103](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L103).
- **Likely Follow-up**: What is the danger of setting `trust proxy` to `true` unconditionally?
- **Interviewer Evaluates**: Understanding of reverse proxies, IP spoofing, and network headers.

### Q4.3: How does Node.js handle unhandled promise rejections in Express 5?
- **Model Answer**: Express 5 automatically catches rejected promises returned from route handlers and passes them to the error-handling middleware without requiring manual `try...catch` or wrapper libraries.
- **Detailed Explanation**: In Express 4, unhandled promise rejections would bypass Express and trigger Node's `unhandledRejection` process event.
- **Code Reference**: [`backend/package.json` Line 18](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/package.json#L18).
- **Likely Follow-up**: How are asynchronous errors handled inside Socket.IO event listeners?
- **Interviewer Evaluates**: Node.js error handling and framework evolution.

### Q4.4: How does `cleanUsername` sanitize display names?
- **Model Answer**: It trims whitespace, collapses internal whitespace, validates length (2–24 chars), and rejects control characters and HTML brackets (`/[\u0000-\u001F\u007F<>]/`).
- **Detailed Explanation**: This prevents XSS attacks and layout breakage when usernames are rendered in participant lists or chat bubbles.
- **Code Reference**: [`backend/src/server.js` Lines 196–214](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L196-L214).
- **Likely Follow-up**: Why not use a library like `DOMPurify` on the backend?
- **Interviewer Evaluates**: Defensive programming and input sanitization fundamentals.

### Q4.5: What happens if `process.env.MONGODB_URI` is missing at startup?
- **Model Answer**: The server throws an explicit error: `"MONGODB_URI is missing from backend/.env"` and terminates immediately with `process.exit(1)`.
- **Detailed Explanation**: Fail-fast startup design prevents the server from entering a corrupted half-running state where it accepts HTTP traffic but fails on every database write.
- **Code Reference**: [`backend/src/server.js` Lines 1452–1454, 1492](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L1452-L1454).
- **Likely Follow-up**: How do cloud orchestrators handle non-zero exit codes?
- **Interviewer Evaluates**: Fail-fast design principles in production systems.

### Q4.6: How is the server's listening port determined?
- **Model Answer**: `Number(process.env.PORT) || 5000`. In production, Render dynamically injects `$PORT` (typically 10000). Locally, it defaults to 5000.
- **Detailed Explanation**: Hardcoding a port causes container deployment failure because PaaS environments allocate ports dynamically.
- **Code Reference**: [`backend/src/server.js` Line 19](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L19).
- **Likely Follow-up**: Why is `HOST` bound to `0.0.0.0` instead of `localhost`?
- **Interviewer Evaluates**: Container networking and Twelve-Factor App principles.

### Q4.7: What is the purpose of `cleanUrl` in `server.js`?
- **Model Answer**: It parses URLs using Node's native `new URL(urlString)` and strictly enforces that the protocol is either `http:` or `https:`.
- **Detailed Explanation**: Prevents malicious payloads such as `javascript:alert(1)` or `data:text/html` from being inserted into shared video sources.
- **Code Reference**: [`backend/src/server.js` Lines 258–269](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L258-L269).
- **Likely Follow-up**: Does `cleanUrl` prevent Server-Side Request Forgery (SSRF)?
- **Interviewer Evaluates**: Web security and URL parsing security best practices.

### Q4.8: How does `server.js` log connection errors without leaking sensitive data?
- **Model Answer**: It listens to `io.engine.on("connection_error")` and logs the error code, transport, origin, and IP, but excludes authentication tokens or environment secrets.
- **Detailed Explanation**: Diagnostic logging enables debugging CORS or proxy upgrade failures without exposing credentials in server logs.
- **Code Reference**: [`backend/src/server.js` Lines 170–190](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L170-L190).
- **Likely Follow-up**: What does the error code `MIDDLEWARE_FAILURE` mean in Engine.IO?
- **Interviewer Evaluates**: Observability and secure logging practices.

---

## Category 5: Socket.IO & Real-Time Networking

### Q5.1: Walk me through the Socket.IO connection lifecycle in this app.
- **Model Answer**: Client initiates an HTTP long-polling handshake (`/socket.io/?transport=polling`), receives session ID and upgrade options, probes WebSocket transport (`2probe`/`3probe`), upgrades to full-duplex WebSocket (`wss://`), and closes the polling transport.
- **Detailed Explanation**: This multi-stage handshake ensures connectivity through firewalls while maximizing performance once upgraded.
- **Code Reference**: [`backend/src/server.js` Lines 166](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L166), [`frontend/src/App.jsx` Line 58](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L58).
- **Likely Follow-up**: What happens if a corporate firewall blocks the WebSocket upgrade?
- **Interviewer Evaluates**: Protocol-level networking knowledge.

### Q5.2: How does Socket.IO isolate messages between different rooms?
- **Model Answer**: Using `socket.join(roomCode)`. Emitting via `io.to(roomCode).emit(...)` multicasts the payload strictly to sockets registered in that room key within Socket.IO's internal memory adapter.
- **Detailed Explanation**: Clients never receive packets or events belonging to other rooms, maintaining privacy and minimizing bandwidth.
- **Code Reference**: [`backend/src/server.js` Lines 537, 623, 706](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L537).
- **Likely Follow-up**: What data structure does Socket.IO use internally to store room memberships?
- **Interviewer Evaluates**: Pub/sub mechanics and channel isolation.

### Q5.3: What is the purpose of acknowledgments in your socket events?
- **Model Answer**: Acknowledgments act as request-response RPCs over WebSockets. The client passes a callback function as the final argument, which the server invokes with an `{ ok: true/false, ... }` payload.
- **Detailed Explanation**: Unlike fire-and-forget emissions, acknowledgments inform the UI whether an action succeeded or failed, allowing the frontend to show loading states and error banners.
- **Code Reference**: [`backend/src/server.js` Lines 391–395](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L391-L395) (`reply`), [`frontend/src/App.jsx` Line 177](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L177).
- **Likely Follow-up**: Can you set a timeout on an acknowledgment callback?
- **Interviewer Evaluates**: Bi-directional RPC communication over WebSockets.

### Q5.4: How does `reconnect_room` work when a user refreshes the page?
- **Model Answer**: On refresh, the socket reconnects with a new `socket.id`. The client emits `reconnect_room` with its username and room code. The server locates the participant, deletes the stale socket ID, binds the new socket ID, reclaims host privileges if applicable, and rejoins the Socket.IO room.
- **Detailed Explanation**: This avoids creating duplicate participant entries or losing host ownership on page reloads.
- **Code Reference**: [`backend/src/server.js` Lines 642–718](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L642-L718).
- **Likely Follow-up**: How do you prevent an attacker from hijacking a host's session via `reconnect_room`?
- **Interviewer Evaluates**: Session recovery and identity management over stateful connections.

### Q5.5: Explain the 15-second grace period for empty disconnected rooms.
- **Model Answer**: If all participants disconnect unexpectedly, `leaveCurrentRoom` schedules a 15-second `setTimeout`. If a user reconnects within 15 seconds, the timer is cancelled and the room survives. If 15 seconds elapse with 0 users, the room is deleted from RAM and marked `ended` in MongoDB.
- **Detailed Explanation**: Without this grace period, a host refreshing their browser or experiencing a 2-second Wi-Fi drop would instantly terminate the entire room and erase its playlist and chat history.
- **Code Reference**: [`backend/src/server.js` Lines 414–432, 592–595](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L414-L432).
- **Likely Follow-up**: Why don't you apply the grace period when a user clicks "Leave Room"?
- **Interviewer Evaluates**: Edge-case engineering and user experience protection.

### Q5.6: How do you prevent a single socket from joining multiple rooms simultaneously?
- **Model Answer**: The server maintains a `socketRooms` Map (`socket.id -> roomCode`). In `create_room` and `join_room`, it verifies `if (socketRooms.has(socket.id))` and rejects the request if already joined.
- **Detailed Explanation**: This prevents cross-room event contamination and memory leaks.
- **Code Reference**: [`backend/src/server.js` Lines 93, 475, 558](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L93).
- **Likely Follow-up**: What happens to `socketRooms` on disconnect?
- **Interviewer Evaluates**: Data integrity and state invariants.

### Q5.7: How are chat and reaction rate limits enforced?
- **Model Answer**: Using a sliding window: `chatRateLimits` allows 5 messages per 3 seconds per socket; `reactionRateLimits` allows 8 reactions per 3 seconds per socket.
- **Detailed Explanation**: The function filters out timestamps older than the window. If the remaining count exceeds the threshold, the request is rejected with a rate limit error acknowledgment.
- **Code Reference**: [`backend/src/server.js` Lines 224–236, 921, 985](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L224-L236).
- **Likely Follow-up**: How would you implement rate limiting across multiple backend instances?
- **Interviewer Evaluates**: API throttling, anti-abuse, and algorithm efficiency.

### Q5.8: How does Socket.IO handle client reconnection backoff?
- **Model Answer**: Configured in `App.jsx` with `reconnectionAttempts: 15` and `reconnectionDelay: 1000`. Socket.IO uses randomized exponential backoff to avoid thundering herd problems on server reconnect.
- **Detailed Explanation**: Reconnection attempts start at 1 second, increasing incrementally with jitter to prevent thousands of clients from hammering a restarting server at the exact same millisecond.
- **Code Reference**: [`frontend/src/App.jsx` Lines 55–58](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L55-L58).
- **Likely Follow-up**: What is the thundering herd problem in WebSocket systems?
- **Interviewer Evaluates**: Resilient distributed network design.

### Q5.9: How do you prevent unauthorized users from controlling playback?
- **Model Answer**: In `playback_command`, the server checks `if (socket.id !== room.hostSocketId)`. If unauthorized, it immediately returns `{ ok: false, error: "Only the host can control playback." }`.
- **Detailed Explanation**: Client-side UI disables the buttons, but the server enforces authorization independently to prevent hacked clients from emitting unauthorized socket events.
- **Code Reference**: [`backend/src/server.js` Lines 814–819](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L814-L819).
- **Likely Follow-up**: How would you implement role-based access control (RBAC) with co-hosts?
- **Interviewer Evaluates**: Principle of least privilege and zero-trust backend validation.

### Q5.10: What is the role of `socket.io-client` in Vite production bundles?
- **Model Answer**: It bundles the Engine.IO and Socket.IO client parser and transports into the static build output in `frontend/dist/`, running natively in the browser's JavaScript runtime.
- **Detailed Explanation**: It tree-shakes unused debugging modules and connects to the Render URL specified by `import.meta.env.VITE_SERVER_URL`.
- **Code Reference**: [`frontend/package.json` Line 15](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/package.json#L15).
- **Likely Follow-up**: How does Vite inject environment variables into production builds?
- **Interviewer Evaluates**: Production frontend asset compilation.

---

## Category 6: Video Synchronization

### Q6.1: How does the server track the current playback position without polling the video player?
- **Model Answer**: It stores an anchor position (`position`), play state (`isPlaying`), and timestamp (`updatedAt`). When playing, real-time position is calculated on demand: `position + (Date.now() - updatedAt) / 1000`.
- **Detailed Explanation**: This authoritative wall-clock model avoids continuous network traffic, updating the server position only on state changes (play, pause, seek, ended).
- **Code Reference**: [`backend/src/server.js` Lines 338–347](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L338-L347).
- **Likely Follow-up**: What happens if the server's system clock drifts?
- **Interviewer Evaluates**: Distributed time synchronization and mathematical modeling.

### Q6.2: How does the client determine whether it needs to seek?
- **Model Answer**: It calculates `target = expectedPosition(state)`. If `Math.abs(video.currentTime - target) > DRIFT_THRESHOLD` (1.5s), it executes `video.currentTime = target`.
- **Detailed Explanation**: Small drift (<1.5s) is ignored to avoid audio stutter and frame dropping. Significant drift forces an instantaneous catch-up.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 44–70](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L44-L70).
- **Likely Follow-up**: Why didn't you adjust `playbackRate` (e.g. 1.05x) instead of hard seeking?
- **Interviewer Evaluates**: Trade-offs between hard seeking vs. adaptive speed adjustment.

### Q6.3: What is the "Recursive Seek Trap" and how does your code solve it?
- **Model Answer**: Setting `video.currentTime` programmatically triggers the browser's native `onTimeUpdate` event. If unhandled, the client might interpret this as a user seek and send a command back to the server, causing an infinite loop.
- **Detailed Explanation**: Solved via `isApplyingPlaybackRef.current = true`. The `onTimeUpdate` listener returns early if this flag is true. The flag is cleared in `queueMicrotask()`.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 57, 66–68, 446–451](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L57-L68).
- **Likely Follow-up**: What is the difference between `queueMicrotask` and `setTimeout(..., 0)` in this context?
- **Interviewer Evaluates**: Deep browser event loop mechanics and DOM event lifecycle.

### Q6.4: How does the monotonic `version` counter prevent out-of-order execution?
- **Model Answer**: Every playback mutation increments `room.playback.version`. Both server and client discard any incoming playback update where `version <= previous.version`.
- **Detailed Explanation**: If network jitter causes a "Play" packet to arrive after a subsequent "Pause" packet, the older "Play" packet has a lower version number and is ignored.
- **Code Reference**: [`backend/src/server.js` Line 875](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L875), [`frontend/src/WatchPlayer.jsx` Lines 91–97, 118–124](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L91-L97).
- **Likely Follow-up**: How is this similar to Lamport timestamps in distributed systems?
- **Interviewer Evaluates**: Distributed ordering and concurrency control.

### Q6.5: How does the player avoid interrupting the host while they drag the seek slider?
- **Model Answer**: Dragging sets `isDraggingRef.current = true` and `isDragging(true)`. The local 100ms interval and `onTimeUpdate` listeners are silenced, and incoming server updates do not overwrite the draft seek position.
- **Detailed Explanation**: The seek command is emitted only when the user releases the slider (`onPointerUp`, `commitSeek`), resetting the dragging flags.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 149, 308–332](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L149-L332).
- **Likely Follow-up**: What happens if the user drags the slider off-screen and releases the mouse?
- **Interviewer Evaluates**: User experience design in media players.

### Q6.6: How does the app handle video completion (end of video)?
- **Model Answer**: The native `onEnded` event triggers `handleVideoEnded`. If the user is host, it checks `endedVersionRef.current === state.version` to prevent duplicate emissions, then sends `playback_command` with action `"ended"`.
- **Detailed Explanation**: The server sets `isPlaying = false`, freezes position at video duration, and notifies all clients to pause.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 334–357](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L334-L357), [`backend/src/server.js` Lines 861–868](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L861-L868).
- **Likely Follow-up**: Could a room be configured to automatically play the next playlist item on video end?
- **Interviewer Evaluates**: State transition edge cases and media event handling.

### Q6.7: What happens when a viewer has a slow internet connection?
- **Model Answer**: The viewer's player triggers `onWaiting` and enters buffering state (`buffering: true`). Meanwhile, the host continues playing. When the viewer's buffer recovers, drift will exceed 1.5s, causing the player to jump forward to the host's current position.
- **Detailed Explanation**: The architecture prioritizes shared synchronization over un-interrupted individual viewing, ensuring the lagging viewer catches up to the group.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 54, 462](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L54-L462).
- **Likely Follow-up**: How would you implement a "pause for all if anyone buffers" feature?
- **Interviewer Evaluates**: Understanding of consensus models in synchronized streaming.

### Q6.8: Why does the seek bar update every 100ms rather than relying solely on `timeupdate`?
- **Model Answer**: The browser's native `timeupdate` event fires unpredictably, typically every 250ms to 500ms, which creates a visibly stuttering seek bar. A 100ms `setInterval` provides smooth UI progression.
- **Detailed Explanation**: The interval directly reads `video.currentTime` and updates `displayPosition` without triggering heavy component re-renders.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 7, 145–167](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L7-L167).
- **Likely Follow-up**: Does a 100ms interval cause performance issues on low-end mobile devices?
- **Interviewer Evaluates**: UI rendering smoothness vs. CPU efficiency trade-offs.

### Q6.9: What types of video URLs are supported and why can't you paste a YouTube URL?
- **Model Answer**: Only direct MP4/WebM video streams served over HTTP/HTTPS are supported. YouTube URLs point to full HTML web pages with proprietary players and DRM protections that cannot be rendered inside an HTML5 `<video src="...">` tag.
- **Detailed Explanation**: Supporting YouTube would require integrating the YouTube IFrame Player API and translating socket commands into YouTube player SDK calls.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 236–242](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L236-L242), [`DEPLOYMENT.md` Lines 155–157](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L155-L157).
- **Likely Follow-up**: How would you architect support for both direct video files and YouTube streams?
- **Interviewer Evaluates**: Practical knowledge of web media standards, DRM, and third-party APIs.

### Q6.10: How would you improve video sync accuracy to sub-100ms without stutter?
- **Model Answer**: Implement NTP-style clock synchronization (measuring round-trip time and client-server clock offset via ping/pong timestamps) and use adaptive playback rate adjustments (e.g. playing at 1.02x or 0.98x) instead of hard seeking.
- **Detailed Explanation**: Micro-adjusting playback speed allows the audio and video decoders to gradually converge on the authoritative clock without audible clicks or keyframe drops.
- **Code Reference**: [`interview-preparation/TECHNICAL_CONCEPTS.md`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/interview-preparation/TECHNICAL_CONCEPTS.md#L200).
- **Likely Follow-up**: How does the Network Time Protocol (NTP) calculate round-trip latency?
- **Interviewer Evaluates**: Advanced real-time systems and audio/video engineering depth.

---

## Category 7: MongoDB & Data Persistence

### Q7.1: What is the exact schema of the `Room` model?
- **Model Answer**: Fields: `roomCode` (String, required, unique, uppercase, regex `^[A-Z0-9]{6}$`), `hostUsername` (String, required), and `status` (String, enum `["active", "ended"]`, default `"active"`), with automated Mongoose timestamps (`createdAt`, `updatedAt`).
- **Detailed Explanation**: Kept intentionally lean to minimize database overhead while enforcing structural integrity.
- **Code Reference**: [`backend/src/models/Room.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js).
- **Likely Follow-up**: Is `roomCode` automatically indexed by MongoDB?
- **Interviewer Evaluates**: Database schema design and Mongoose fundamentals.

### Q7.2: Why does MongoDB have a unique constraint on `roomCode`?
- **Model Answer**: To guarantee at the database storage engine level that two rooms can never share the same code, even under race conditions where two simultaneous requests generate the same random code.
- **Detailed Explanation**: MongoDB builds a unique B-Tree index on `roomCode`. Any attempt to insert a duplicate key rejects with an `E11000 duplicate key error`.
- **Code Reference**: [`backend/src/models/Room.js` Line 9](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js#L9).
- **Likely Follow-up**: How does `generateUniqueRoomCode` handle a potential collision?
- **Interviewer Evaluates**: Database indexing, uniqueness constraints, and collision handling.

### Q7.3: How does the server connect to MongoDB Atlas and handle startup failures?
- **Model Answer**: It executes `mongoose.connect()` with `serverSelectionTimeoutMS: 5000` inside a 3-attempt retry loop with 1-second delays. If all 3 attempts fail, it logs the error and terminates with `process.exit(1)`.
- **Detailed Explanation**: This provides resilience against transient cloud network glitches while avoiding indefinite startup hangs.
- **Code Reference**: [`backend/src/server.js` Lines 1456–1475](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L1456-L1475).
- **Likely Follow-up**: What is the default Mongoose server selection timeout if not specified?
- **Interviewer Evaluates**: Connection lifecycle management and fault tolerance.

### Q7.4: When does the application update the `Room` document in MongoDB?
- **Model Answer**: (1) When a room is created (`Room.create`). (2) When a host leaves and leadership transfers to another user (`Room.updateOne`). (3) When all participants leave and the room ends (`Room.updateOne` with `status: "ended"`).
- **Detailed Explanation**: Updates occur only during lifecycle state transitions, preserving database IOPS.
- **Code Reference**: [`backend/src/server.js` Lines 422, 436, 451, 528](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L422).
- **Likely Follow-up**: Why don't you delete the room document when it ends?
- **Interviewer Evaluates**: Soft deletes vs. hard deletes, and audit trails.

### Q7.5: How do you protect your MongoDB connection credentials?
- **Model Answer**: Stored in `backend/.env`, which is strictly excluded from version control via `.gitignore`. In production, Render securely injects `MONGODB_URI` via encrypted environment variables.
- **Detailed Explanation**: Atlas access is further restricted using database user roles and Network Access IP access lists.
- **Code Reference**: [`backend/.gitignore`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/.gitignore), [`DEPLOYMENT.md` Lines 21–36](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L21-L36).
- **Likely Follow-up**: Why is `0.0.0.0/0` used in MongoDB Atlas Network Access for Render?
- **Interviewer Evaluates**: Secrets management and cloud database security.

### Q7.6: What index would you add to the `Room` collection if you added a room search feature?
- **Model Answer**: A compound index on `{ status: 1, createdAt: -1 }` to quickly query active rooms sorted by newest first, or a text index on `hostUsername`.
- **Detailed Explanation**: This allows MongoDB to satisfy queries directly from RAM index trees without scanning the entire collection.
- **Code Reference**: [`backend/src/models/Room.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js).
- **Likely Follow-up**: How would you verify whether a query is using an index in MongoDB?
- **Interviewer Evaluates**: Database query optimization and index strategies (`explain()`).

### Q7.7: What is `serverSelectionTimeoutMS` and why is it set to 5000ms?
- **Model Answer**: It specifies how long the MongoDB driver waits to discover and connect to a replica set primary before throwing an error. The default is 30 seconds; setting it to 5000ms ensures rapid failure detection.
- **Detailed Explanation**: In containerized deployments, waiting 30 seconds delays health check failures, causing slow container restart cycles.
- **Code Reference**: [`backend/src/server.js` Line 1460](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L1460).
- **Likely Follow-up**: What is a replica set in MongoDB Atlas?
- **Interviewer Evaluates**: Database driver tuning and high availability concepts.

### Q7.8: How would you persist chat history permanently without degrading real-time performance?
- **Model Answer**: Keep real-time chat in RAM for zero-latency broadcasting, and asynchronously batch-write messages to a MongoDB `messages` collection in background microtasks or via a write buffer.
- **Detailed Explanation**: Decoupling the write path from the real-time broadcast path ensures that database latency never impacts chat delivery.
- **Code Reference**: [`backend/src/server.js` Lines 944–953](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L944-L953).
- **Likely Follow-up**: How would you handle backpressure if writes arrive faster than MongoDB can insert?
- **Interviewer Evaluates**: Write-behind caching, batching, and asynchronous persistence.

---

## Category 8: Deployment & Debugging

### Q8.1: How does dynamic CORS matching work in `server.js`?
- **Model Answer**: It checks the request `Origin` header against `ALLOWED_ORIGINS` and `CLIENT_URL`. It supports exact matches and wildcard regex matching for subdomains like `https://*.vercel.app`.
- **Detailed Explanation**: Requests from non-browser clients (curl, health probes) with no origin are allowed through. Browser requests from unauthorized domains are blocked cleanly without throwing unhandled exceptions.
- **Code Reference**: [`backend/src/server.js` Lines 39–76, 107–115, 148–164](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L39-L76).
- **Likely Follow-up**: Why does the Socket.IO CORS callback return `callback(null, false)` instead of throwing an Error?
- **Interviewer Evaluates**: CORS specification, regex pattern security, and Engine.IO middleware design.

### Q8.2: What causes HTTP 400 "Bad Request" errors during Socket.IO handshakes?
- **Model Answer**: Usually caused by transport mismatch (client requesting WebSockets directly when reverse proxy requires polling), CORS origin rejection, or an incorrect path prefix (e.g. client appending `/socket.io/` to the base URL).
- **Detailed Explanation**: In `App.jsx`, `getBackendUrl` strips trailing slashes and accidental `/socket.io` suffixes to ensure clean URI construction.
- **Code Reference**: [`frontend/src/App.jsx` Lines 9–15](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L9-L15), [`backend/src/server.js` Lines 170–190](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L170-L190).
- **Likely Follow-up**: How do you inspect Socket.IO network frames in Chrome DevTools?
- **Interviewer Evaluates**: Real-world debugging skills and network troubleshooting.

### Q8.3: Explain the Render Free Tier cold start problem and how your app handles it.
- **Model Answer**: Render spins down inactive containers after 15 minutes. Waking up takes 30–50 seconds. The frontend displays an amber "Connecting..." / "Reconnecting..." badge and automatically retries with backoff until the backend responds.
- **Detailed Explanation**: Because Vercel serves the frontend instantly, the user sees a responsive UI with clear connection feedback rather than a broken blank page.
- **Code Reference**: [`frontend/src/App.jsx` Lines 284–290](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L284-L290), [`DEPLOYMENT.md` Lines 152–154](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L152-L154).
- **Likely Follow-up**: How can you prevent cold starts without upgrading to a paid tier?
- **Interviewer Evaluates**: Cloud hosting constraints and graceful degradation.

### Q8.4: Why does `localhost:5000` fail when testing between two different laptops on the same Wi-Fi?
- **Model Answer**: `localhost` refers strictly to the local loopback network interface (`127.0.0.1`) of the machine running the code. Another laptop resolving `localhost` looks at its own internal machine rather than the host computer.
- **Detailed Explanation**: On a local LAN, the client must connect to the host computer's private LAN IP address (e.g. `192.168.1.45:5000`), and the server must bind to `0.0.0.0`.
- **Code Reference**: [`backend/src/server.js` Line 20](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L20), [`README.md` Lines 18–20](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/README.md#L18-L20).
- **Likely Follow-up**: What firewall settings on Windows might block incoming LAN connections on port 5000?
- **Interviewer Evaluates**: Core networking, loopback vs. LAN addresses, and socket binding.

### Q8.5: What is a Mixed Content error and how do you prevent it?
- **Model Answer**: Occurs when a webpage served over secure HTTPS requests insecure resources over HTTP or WS. The browser blocks the request.
- **Detailed Explanation**: Prevented by hosting both Vercel and Render over HTTPS/TLS, ensuring WebSocket connections use `wss://`.
- **Code Reference**: [`DEPLOYMENT.md` Lines 158–160](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L158-L160).
- **Likely Follow-up**: Does the browser allow HTTP connections to `localhost` from an HTTPS site?
- **Interviewer Evaluates**: Browser security models and TLS compliance.

### Q8.6: What is the purpose of `vercel.json` in the frontend directory?
- **Model Answer**: It instructs Vercel's edge routers to rewrite all requests (`/(.*)`) to `/index.html`.
- **Detailed Explanation**: In Single Page Applications (SPAs), route parameters like `/?room=ABC123` must be served by `index.html` so React can mount and parse the URL on the client side. Without this, direct URLs return 404.
- **Code Reference**: [`frontend/vercel.json`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/vercel.json).
- **Likely Follow-up**: What is the difference between an HTTP redirect (301/302) and a rewrite?
- **Interviewer Evaluates**: SPA deployment and Edge routing fundamentals.

### Q8.7: How does `test_suite.js` execute integration tests against a live server?
- **Model Answer**: It spawns `node src/server.js` using `child_process.spawn`, polls `/health` until the database is ready, connects multiple `socket.io-client` instances, asserts real-time events sequentially, and cleans up the child process using `taskkill` or `SIGTERM`.
- **Detailed Explanation**: This validates the entire network stack, serialization, event routing, and database writes without mocking.
- **Code Reference**: [`backend/test_suite.js` Lines 13–41, 341–352](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/test_suite.js#L13-L41).
- **Likely Follow-up**: What is the difference between unit testing with mocks vs. end-to-end integration testing?
- **Interviewer Evaluates**: Automated testing architecture and test environment orchestration.

### Q8.8: How do you debug a WebSocket connection dropped by a proxy?
- **Model Answer**: Enable verbose client debug logs (`localStorage.debug = 'socket.io-client:*'`), inspect Engine.IO handshake query params in the Network tab, check server error logs on `connection_error`, and verify reverse proxy timeout headers (`proxy_read_timeout`).
- **Detailed Explanation**: This distinguishes between client-side timeouts, CORS rejections, and intermediate proxy disconnections.
- **Code Reference**: [`backend/src/server.js` Lines 170–190](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L170-L190).
- **Likely Follow-up**: How do ping/pong intervals keep proxy connections alive?
- **Interviewer Evaluates**: Observability and diagnostic problem solving.

---

## Category 9: Security & Scalability

### Q9.1: How do you prevent a malicious client from emitting fake playback events?
- **Model Answer**: The server verifies `socket.id === room.hostSocketId` for every `playback_command`, `change_video`, and playlist mutation. If unauthorized, the command is rejected immediately.
- **Detailed Explanation**: Even if an attacker modifies client JavaScript to enable buttons, the server never executes commands without verifying socket ownership.
- **Code Reference**: [`backend/src/server.js` Lines 749, 814, 1034](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L749).
- **Likely Follow-up**: How would you prevent an attacker from spoofing `socket.id`?
- **Interviewer Evaluates**: Server-side authorization and untrusted client principles.

### Q9.2: How would you scale this application to support thousands of concurrent rooms across multiple servers?
- **Model Answer**: Three key changes: (1) Add `@socket.io/redis-adapter` to multicast events across backend nodes via Redis Pub/Sub. (2) Move in-memory room state to Redis (Hashes / RedisJSON) or Valkey. (3) Configure sticky sessions on the load balancer for the HTTP handshake.
- **Detailed Explanation**: This decouples room state from single-server RAM, allowing the backend to scale horizontally across dozens of instances.
- **Code Reference**: [`DEPLOYMENT.md` Lines 13–18](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L13-L18), [`interview-preparation/ARCHITECTURE.md` Section 7](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/interview-preparation/ARCHITECTURE.md#7-scaling-to-multiple-backend-instances-horizontal-scaling).
- **Likely Follow-up**: What is the performance impact of using Redis Pub/Sub for high-frequency video events?
- **Interviewer Evaluates**: Distributed systems design, pub/sub architecture, and horizontal scaling.

### Q9.3: What prevents Cross-Site Scripting (XSS) in the chat feature?
- **Model Answer**: Two layers: (1) Backend `cleanChatMessage` rejects non-printable control characters. (2) React's JSX engine automatically escapes all string variables before rendering them to the DOM, rendering raw text rather than HTML.
- **Detailed Explanation**: Unless `dangerouslySetInnerHTML` is used (which is never used in this repo), strings like `<script>alert(1)</script>` are safely rendered as text content.
- **Code Reference**: [`backend/src/server.js` Lines 238–252](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L238-L252), [`frontend/src/components/ChatPanel.jsx` Line 164](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/ChatPanel.jsx#L164).
- **Likely Follow-up**: Can you inject malicious HTML via emoji reactions?
- **Interviewer Evaluates**: XSS defense vectors and React's built-in escaping mechanism.

### Q9.4: How do you prevent chat spam and denial-of-service (DoS) on WebSocket connections?
- **Model Answer**: Enforce a sliding-window rate limit (5 messages per 3s), cap maximum message length at 500 characters, truncate room message history to 100 messages in RAM, and reject empty/whitespace-only messages.
- **Detailed Explanation**: This prevents memory exhaustion on the server and bandwidth saturation on client connections.
- **Code Reference**: [`backend/src/server.js` Lines 85–86, 920–934](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L85-L86).
- **Likely Follow-up**: How would you implement IP-based rate limiting on WebSocket handshakes?
- **Interviewer Evaluates**: Application-layer security, DoS mitigation, and resource limits.

### Q9.5: How would you secure rooms with passwords or private access tokens?
- **Model Answer**: Add a bcrypt-hashed `password` field to the room schema and verify the password or a signed JWT token in `join_room` before executing `socket.join()`.
- **Detailed Explanation**: The token can be stored in client memory or a secure cookie, verified on reconnection to prevent unauthorized room joins.
- **Code Reference**: [`backend/src/server.js` Lines 556–639](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L556-L639).
- **Likely Follow-up**: Why use bcrypt instead of plain SHA-256 for passwords?
- **Interviewer Evaluates**: Authentication, token verification, and cryptographic best practices.

### Q9.6: How do you prevent memory leaks from disconnected sockets in server RAM?
- **Model Answer**: The `disconnect` listener cleans up rate limit entries (`chatRateLimits.delete`, `reactionRateLimits.delete`), removes the socket from `socketRooms`, and deletes the participant from `room.participants`.
- **Detailed Explanation**: If the room becomes empty, cleanup timers destroy the entire room object if unclaimed after 15 seconds.
- **Code Reference**: [`backend/src/server.js` Lines 401–442, 1433–1443](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L401-L442).
- **Likely Follow-up**: How do you detect memory leaks in a running Node.js production service?
- **Interviewer Evaluates**: Garbage collection, V8 heap management, and resource cleanup.

### Q9.7: What prevents two users from voting multiple times in a poll?
- **Model Answer**: The poll stores user votes in a Map keyed by username: `poll.userVotes.set(username, optionIndex)`. If `poll.userVotes.has(username)`, subsequent votes are rejected.
- **Detailed Explanation**: Client UI also disables voting buttons once the user's vote is recorded.
- **Code Reference**: [`backend/src/server.js` Lines 1349–1357](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L1349-L1357), [`frontend/src/components/PollPanel.jsx` Lines 19–24](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/components/PollPanel.jsx#L19-L24).
- **Likely Follow-up**: Could a user vote twice by changing their username?
- **Interviewer Evaluates**: Data consistency and state validation rules.

### Q9.8: How do you handle Cross-Site WebSocket Hijacking (CSWSH)?
- **Model Answer**: Enforce strict origin validation during the initial HTTP handshake via `getAllowedOrigins()` and `isOriginAllowed()`. If the origin is untrusted, the handshake is rejected.
- **Detailed Explanation**: Browsers send the `Origin` header with WebSocket handshakes. Validating it prevents third-party malicious sites from establishing unauthorized socket connections on behalf of users.
- **Code Reference**: [`backend/src/server.js` Lines 107–115, 148–164](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L107-L115).
- **Likely Follow-up**: Can a non-browser attacker forge the `Origin` header?
- **Interviewer Evaluates**: Web security standards and WebSocket-specific vulnerabilities.

### Q9.9: How does the application prevent race conditions if two users issue playback commands at the same millisecond?
- **Model Answer**: Only the host is authorized to issue playback commands. If the host emits rapid commands, Node's single-threaded event loop processes them sequentially in the poll phase, incrementing `version` on each mutation.
- **Detailed Explanation**: Clients apply updates strictly in version sequence, discarding stale or out-of-order packets.
- **Code Reference**: [`backend/src/server.js` Lines 814, 875](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L814).
- **Likely Follow-up**: What if two co-hosts were permitted and both clicked play/pause at the same time?
- **Interviewer Evaluates**: Concurrency, serialization, and distributed state management.

### Q9.10: Why are chat message histories capped at 100 messages in RAM?
- **Model Answer**: To maintain a fixed $O(1)$ upper bound on memory consumption per room, preventing long-running watch parties from consuming excessive RAM.
- **Detailed Explanation**: When `room.messages.length > MAX_CHAT_HISTORY`, the oldest message is shifted out (`room.messages.shift()`).
- **Code Reference**: [`backend/src/server.js` Lines 86, 947–949](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L86).
- **Likely Follow-up**: What data structure is more efficient than an array for capped queues in JavaScript?
- **Interviewer Evaluates**: Memory profiling and data structure efficiency (Ring buffer / Deque).

---

## Category 10: Challenges, Limitations, & Future Roadmap

### Q10.1: What is the biggest architectural limitation of this project today?
- **Model Answer**: The single-instance backend constraint. Because active rooms, playback clocks, and participant lists live in Node.js process memory, the backend cannot scale horizontally across multiple servers without introducing Redis.
- **Detailed Explanation**: Being honest about architectural boundaries demonstrates senior-level maturity.
- **Code Reference**: [`DEPLOYMENT.md` Lines 13–18](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/DEPLOYMENT.md#L13-L18).
- **Likely Follow-up**: How would you prioritize the refactoring steps to introduce Redis?
- **Interviewer Evaluates**: Engineering self-awareness and architectural maturity.

### Q10.2: What happens if a video URL is hosted on a slow CDN that buffers for 10 seconds?
- **Model Answer**: The video player enters a buffering state. Once enough data buffers, the drift engine detects that the player is several seconds behind the host and seeks forward to catch up.
- **Detailed Explanation**: This can result in skipped scenes for the slow viewer. A potential improvement is implementing peer-assisted buffering or adaptive video quality streaming (HLS/DASH).
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 54, 462](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L54).
- **Likely Follow-up**: What is the difference between MP4 progressive download and HLS chunk streaming?
- **Interviewer Evaluates**: Video streaming engineering and network delivery protocols.

### Q10.3: Why can't users currently upload local video files from their laptops?
- **Model Answer**: HTML5 video players cannot load local file system paths (`C:\movie.mp4`) from other users' machines due to browser sandbox security. For local files to work, the host would have to stream the video bytes over WebRTC or upload to an S3/R2 storage bucket.
- **Detailed Explanation**: Direct HTTP/HTTPS URLs ensure all participants can fetch the same media stream from a public server.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 236–242](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L236-L242).
- **Likely Follow-up**: How would you architect a WebRTC peer-to-peer video streaming pipeline?
- **Interviewer Evaluates**: Browser security models and WebRTC capabilities.

### Q10.4: If you rebuilt this application from scratch today, what would you do differently?
- **Model Answer**: (1) Adopt TypeScript across frontend and backend for end-to-end type safety on socket events. (2) Use HLS.js for adaptive bitrate streaming rather than raw MP4. (3) Externalize room state into Redis from day one to support seamless horizontal autoscaling.
- **Detailed Explanation**: TypeScript prevents payload mismatches between client emits and server listeners, reducing integration testing overhead.
- **Likely Follow-up**: What library would you use for type-safe socket events in TypeScript?
- **Interviewer Evaluates**: Continuous improvement and engineering reflection.

### Q10.5: How did you debug race conditions between video playback and user seeks during development?
- **Model Answer**: By adding verbose logging to `onTimeUpdate` and tracking the lifecycle of `video.currentTime`. We identified that programmatic seeks were triggering `onTimeUpdate` handlers, and solved it using `isApplyingPlaybackRef` and `queueMicrotask()`.
- **Detailed Explanation**: Reproducing the issue required setting network throttling to 3G in Chrome DevTools to expose timing gaps between DOM events and network responses.
- **Code Reference**: [`frontend/src/WatchPlayer.jsx` Lines 57–68, 446–451](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L57-L68).
- **Likely Follow-up**: Why did network throttling expose this race condition?
- **Interviewer Evaluates**: Debugging methodology and edge-case reproduction.

### Q10.6: How could you add audio/video voice chat to this Watch Party application?
- **Model Answer**: Integrate WebRTC for peer-to-peer audio/video streaming, using the existing Socket.IO connection as the **signaling server** to exchange SDP offers, answers, and ICE candidates between room participants.
- **Detailed Explanation**: Socket.IO already manages room membership and participant socket IDs, making it the ideal signaling conduit.
- **Code Reference**: [`backend/src/server.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js).
- **Likely Follow-up**: What is the difference between Mesh, SFU, and MCU WebRTC architectures for 10 users?
- **Interviewer Evaluates**: WebRTC architecture and media server knowledge.

### Q10.7: How would you prevent room code brute-forcing if an attacker wanted to guess private room codes?
- **Model Answer**: Enforce IP-based rate limiting on `join_room` attempts (e.g. max 5 failed attempts per minute per IP), and increase room code entropy by expanding the alphabet or code length.
- **Detailed Explanation**: With 6 characters from a 31-character set, there are $31^6 \approx 887\text{ million}$ combinations. Rate limiting renders brute-force attacks statistically impossible.
- **Code Reference**: [`backend/src/server.js` Lines 79, 82](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L79-L82).
- **Likely Follow-up**: How would you store failed attempt counters in a distributed setup?
- **Interviewer Evaluates**: Cryptography, entropy, and brute-force mitigation.

### Q10.8: What was the most technically rewarding part of building this system?
- **Model Answer**: Seeing two physically separated devices synchronize video playback within a fraction of a second across the public internet, while managing chat and floating reactions over the same low-latency connection.
- **Detailed Explanation**: Experiencing the interplay of the authoritative wall clock, drift thresholds, and React's render lifecycle working harmoniously proved the architectural design.
- **Likely Follow-up**: What project do you want to build next based on these learnings?
- **Interviewer Evaluates**: Genuine enthusiasm for software engineering and real-time systems.
