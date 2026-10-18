# Watch Party — Debugging & Coding Interview Exercises

> **Hands-On Code Review, Bug Fixing, & Systems Debugging Scenarios**  
> *Target: Technical screening, live coding interviews, and debugging rounds.*

---

## Exercise 1: Debugging a Failed Socket.IO Connection (CORS & Transport Mismatch)

### Problem Statement
A user opens the deployed Vercel frontend. The connection status in the navbar remains permanently stuck on `"Connecting..."`. In the browser developer tools, you see the following console error:
```text
Access to XMLHttpRequest at 'https://watch-party-p7ix.onrender.com/socket.io/?EIO=4&transport=polling' from origin 'https://my-party.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
WebSocket connection to 'wss://watch-party-p7ix.onrender.com/socket.io/?EIO=4&transport=websocket' failed: Error during WebSocket handshake: Unexpected response code: 400
```
What is causing this failure, and how do you diagnose and resolve it?

### Hints
1. Notice that the request was initiated using HTTP long-polling (`transport=polling`).
2. Look at how origins are registered in `backend/.env` vs. the actual origin of the frontend.
3. Check the Socket.IO CORS configuration inside [`backend/src/server.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L146-L167).

### Step-by-Step Solution
1. **Diagnosis**:
   - The frontend domain `https://my-party.vercel.app` is not in the backend's `ALLOWED_ORIGINS` or `CLIENT_URL` list.
   - When the browser sends the initial HTTP GET long-polling request, the backend's CORS middleware evaluates `isOriginAllowed(origin, allowed)` -> returns `false`.
   - The backend omits the `Access-Control-Allow-Origin` header, causing the browser to reject the response.
   - When Socket.IO attempts to fall back directly to WebSocket, the proxy or server rejects the handshake because the session ID (`sid`) was never established in polling.
2. **Resolution**:
   - In the Render Dashboard environment settings, update `ALLOWED_ORIGINS`:
     ```text
     ALLOWED_ORIGINS=https://my-party.vercel.app,https://*.vercel.app,http://localhost:5173
     CLIENT_URL=https://my-party.vercel.app
     ```
   - Verify in [`backend/src/server.js`](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L39-L54) that `getAllowedOrigins()` includes both comma-separated lists and wildcard subdomains.
3. **Verification**:
   - Reload the page. The initial polling request succeeds with HTTP 200, returning `{ sid: "...", upgrades: ["websocket"] }`, and cleanly upgrades to `wss://`.

### Relevant Code Reference
- [`backend/src/server.js` Lines 39–76, 146–167](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L39-L76).

### Underlying Concept
CORS is enforced strictly by browsers during HTTP requests. Because Socket.IO starts with an HTTP long-polling handshake, CORS permissions must be explicitly granted on both Express and Socket.IO server configurations.

### Interviewer Follow-Up Question
- *"Why does Socket.IO's CORS callback return `callback(null, false)` instead of `callback(new Error('CORS Error'))`?"*  
  *(Answer: Returning `callback(null, false)` tells Engine.IO to omit the CORS header cleanly. Returning an Error object throws a `MIDDLEWARE_FAILURE` exception in the Engine.IO pipeline, creating noisy uncaught exceptions in server logs).*

---

## Exercise 2: Fixing a Wildcard CORS Matching Vulnerability

### Problem Statement
A developer wrote the following regex to match Vercel preview domains:
```javascript
// NAIVE IMPLEMENTATION
const pattern = new RegExp(target.replace("*", ".*"));
return pattern.test(normalized);
```
During a security review, an engineer points out that an attacker from `https://malicious-vercel.app` or `https://evil.com/https://*.vercel.app` can bypass this check. How do you fix the wildcard matcher?

### Hints
1. What does `.` mean in an unescaped regular expression?
2. Are the start (`^`) and end (`$`) string anchors missing?

### Step-by-Step Solution
1. **Identify Vulnerabilities**:
   - Without escaping `.`, the dots match any character (e.g. `vercelXapp`).
   - Without `^` and `$`, any domain *containing* the substring passes (e.g. `https://attacker.com?origin=https://test.vercel.app`).
2. **Fix in Code** (as implemented in [`backend/src/server.js` Lines 66–71](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L66-L71)):
   ```javascript
   if (target.includes("*")) {
     const regexStr = target
       .split("*")
       .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")) // Escape special regex characters
       .join("[a-z0-9_.-]+");                                      // Replace * with valid subdomain characters
     const pattern = new RegExp(`^${regexStr}$`, "i");             // Strict start and end anchors
     return pattern.test(normalized);
   }
   ```
3. **Verification**:
   - `https://watch-party-abc.vercel.app` -> Matches (`true`).
   - `https://evilvercel.app` -> Rejected (`false`).
   - `https://evil.com/watch-party.vercel.app` -> Rejected (`false`).

### Relevant Code Reference
- [`backend/src/server.js` Lines 56–76](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L56-L76).

### Underlying Concept
Regular expression injection and incomplete string matching in security-critical authorization boundaries.

---

## Exercise 3: Diagnosing Playback Drift and Seeking Stutter Loops

### Problem Statement
Viewers in a watch party report that every 2 seconds, the video experiences an annoying micro-freeze or audio glitch. Looking at the console, you see `video.currentTime` being set repeatedly to almost identical timestamps. What is happening?

### Hints
1. Check `DRIFT_THRESHOLD` in `WatchPlayer.jsx`.
2. Check how `applyPlayback` calculates the difference between `video.currentTime` and `expectedPosition`.
3. Could network latency or packet jitter cause drift to fluctuate around the threshold?

### Step-by-Step Solution
1. **Diagnosis**:
   - If `DRIFT_THRESHOLD` is set too low (e.g. `0.2s`), ordinary internet packet jitter (50–150ms) causes the viewer's calculated target position to continuously cross the drift threshold.
   - Every time `video.currentTime` is reassigned, the HTML5 video engine pauses decoding, flushes its audio pipeline, and seeks to the nearest keyframe, creating a stutter loop.
2. **Resolution**:
   - In [`frontend/src/WatchPlayer.jsx` Line 6](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L6), ensure `DRIFT_THRESHOLD` is configured to a tolerant value:
     ```javascript
     const DRIFT_THRESHOLD = 1.5; // 1.5 seconds tolerance
     ```
   - Ensure `video.readyState >= 1` before attempting to seek to prevent seeking into unbuffered metadata.
3. **Verification**:
   - Viewers play video smoothly. Only when a true desync occurs (e.g. >1.5s due to a buffer stall or manual host seek) does the player perform a hard seek.

### Relevant Code Reference
- [`frontend/src/WatchPlayer.jsx` Lines 6, 44–70](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L44-L70).

### Underlying Concept
Hysteresis and deadband thresholds in continuous control systems.

---

## Exercise 4: Preventing Duplicate Event Handling & Echo Storms

### Problem Statement
When the Host seeks to timestamp 30.0, the viewer's video seeks to 30.0, but then the Host's video suddenly jumps back to 28.5, then to 30.0 again in an infinite back-and-forth loop. Both browsers freeze within 10 seconds. What is the root cause?

### Hints
1. How does the browser respond when JavaScript executes `video.currentTime = 30.0`?
2. Which event listener on `<video>` detects user scrubbing?
3. How does that listener differentiate between a human dragging the slider vs. a WebSocket message updating the player?

### Step-by-Step Solution
1. **Diagnosis**:
   - Setting `video.currentTime = target` fires the native DOM `timeupdate` and `seeking` events.
   - If the player's `onTimeUpdate` handler reads this new position and treats it as a user-initiated seek, it emits `playback_command` back to the server.
   - The server broadcasts this new command back to all clients, which seek again and emit again, resulting in an exponential echo storm.
2. **Resolution**:
   - Add a ref guard: `const isApplyingPlaybackRef = useRef(false);`.
   - In `applyPlayback`:
     ```javascript
     isApplyingPlaybackRef.current = true;
     video.currentTime = target;
     queueMicrotask(() => {
       isApplyingPlaybackRef.current = false;
     });
     ```
   - In `onTimeUpdate`:
     ```javascript
     if (isDraggingRef.current || isApplyingPlaybackRef.current) {
       return; // Abort: this seek was caused by our own sync engine!
     }
     ```

### Relevant Code Reference
- [`frontend/src/WatchPlayer.jsx` Lines 26, 57, 66–68, 446–451](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/WatchPlayer.jsx#L57-L68).

### Underlying Concept
Asynchronous event loop scheduling, DOM mutation side-effects, and recursion prevention in bi-directional sync engines.

---

## Exercise 5: Fixing a React Stale-State Reconnection Bug

### Problem Statement
A user is in room `XYZ789` as `Ashmit`. Their laptop goes to sleep. When reopened, the Socket.IO client successfully fires its `connect` event, but the user is not returned to their room and the room states do not restore. Why?

### Hints
1. Look at the `useEffect` on line 53 of `App.jsx`. What is its dependency array?
2. What are the values of `username` and `room` inside the `s.on("connect")` closure?

### Step-by-Step Solution
1. **Diagnosis**:
   - The effect has an empty dependency array `[]`, meaning its callback was created during the initial render when `username = ""` and `room = null`.
   - Due to JavaScript lexical closures, `s.on("connect", ...)` permanently captured those initial values.
   - When the socket reconnects minutes later, reading `username` returns `""`, so the reconnect emission never fires.
2. **Resolution**:
   - Use `useRef` to mirror the latest credentials:
     ```javascript
     const currentRoomCodeRef = useRef(null);
     const currentUsernameRef = useRef(null);
     ```
   - Whenever a room is created or joined, update `.current`:
     ```javascript
     currentRoomCodeRef.current = joinedRoom.roomCode;
     currentUsernameRef.current = payload.username;
     ```
   - Inside `s.on("connect")`, read from refs:
     ```javascript
     if (currentRoomCodeRef.current && currentUsernameRef.current) {
       s.emit("reconnect_room", {
         roomCode: currentRoomCodeRef.current,
         username: currentUsernameRef.current,
       });
     }
     ```

### Relevant Code Reference
- [`frontend/src/App.jsx` Lines 20–22, 75–88, 194–196](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L20-L22).

### Underlying Concept
Stale closures in React hook lifecycles and the ref pattern for stable mutable references.

---

## Exercise 6: Handling Participant Disconnect & Host Migration Edge Cases

### Problem Statement
In a room with three participants (Host A, Viewer B, Viewer C), Host A's laptop battery dies. Viewer B and C are left watching the movie, but neither can pause or change videos because the host is gone. Furthermore, when Host A turns their laptop back on 10 minutes later, the room has crashed. How do you design the failover?

### Hints
1. How does the server detect when a host's socket closes?
2. Who should become the new host?
3. How do you inform remaining clients that leadership has transferred?

### Step-by-Step Solution
1. **Detect Disconnection**:
   - In `backend/src/server.js`, listen to `socket.on("disconnect")` and call `leaveCurrentRoom(socket, true)`.
2. **Migrate Host Privileges**:
   - If `room.hostSocketId === socket.id`:
     ```javascript
     const nextHost = [...room.participants.values()]
       .sort((a, b) => a.joinedAt - b.joinedAt)[0]; // Oldest remaining participant
     room.hostSocketId = nextHost.id;
     ```
3. **Persist and Announce**:
   - Update MongoDB: `await Room.updateOne({ roomCode }, { $set: { hostUsername: nextHost.username } });`.
   - Broadcast updated room snapshot to all participants: `sendRoomUpdate(room)`.
4. **Client-Side Reaction**:
   - In `App.jsx`, `isHost` evaluates `participant.id === socketId && participant.isHost`. Viewer B immediately sees host controls unlock in `WatchPlayer`.

### Relevant Code Reference
- [`backend/src/server.js` Lines 444–463](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L444-L463).

### Underlying Concept
Distributed leader election, failover management, and audit persistence.

---

## Exercise 7: Improving Error Handling & Timeout Recovery on Socket Emissions

### Problem Statement
A user on a weak 3G connection clicks "Create Room". The server receives the request, but due to network packet loss, the response packet drops. The frontend button stays permanently disabled showing `"Please wait..."`, and the user is locked out. How do you prevent UI deadlock?

### Hints
1. What happens if the server callback is never invoked?
2. Does Socket.IO provide a built-in timeout mechanism for emissions?

### Step-by-Step Solution
1. **Identify the Flaw**:
   - Calling `socket.emit("create_room", payload, callback)` will wait forever if the network drops the return frame.
2. **Implement Timeout**:
   - Chain `.timeout(5000)` before `.emit()`:
     ```javascript
     s.timeout(5000).emit("create_room", payload, (timeoutError, response) => {
       setBusy(false); // Reset loading state unconditionally
       if (timeoutError) {
         setError("The server did not respond within 5 seconds. Try again.");
         return;
       }
       if (!response?.ok) {
         setError(response?.error || "Failed to create room.");
         return;
       }
       // Proceed with room state setup
     });
     ```
3. **Verification**:
   - If the network stalls, the user receives an actionable error alert within 5 seconds, and buttons are re-enabled.

### Relevant Code Reference
- [`frontend/src/App.jsx` Lines 177–189, 239–250](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/frontend/src/App.jsx#L177-L189).

### Underlying Concept
Fault-tolerant RPCs, idempotent retry patterns, and defensive UI state transitions.

---

## Exercise 8: Reviewing and Securing a Vulnerable Socket Event

### Problem Statement
A junior engineer added the following video change handler to `server.js`:
```javascript
// INSECURE IMPLEMENTATION
socket.on("change_video", (payload) => {
  const room = activeRooms.get(payload.roomCode);
  room.playback.videoUrl = payload.videoUrl;
  io.to(payload.roomCode).emit("playback_updated", room.playback);
});
```
List three severe security and architectural flaws in this implementation and write the hardened version.

### Flaws Identified
1. **No Authorization Check**: Any viewer can change the video without verifying if `socket.id === room.hostSocketId`.
2. **Missing Input Validation & SSRF / XSS Vulnerability**: `payload.videoUrl` is unvalidated. An attacker could send `javascript:alert(1)` or non-HTTP URIs.
3. **Implicit Trust of Room Code**: The handler trusts `payload.roomCode` sent from the client rather than looking up the verified room bound to `socket.id` in `socketRooms`.
4. **No Error Acknowledgment**: No `ack` callback is invoked, leaving the client blind to success/failure.

### Hardened Solution (As implemented in code)
```javascript
socket.on("change_video", (payload = {}, ack) => {
  const roomCode = socketRooms.get(socket.id); // Secure reverse lookup
  const room = roomCode ? activeRooms.get(roomCode) : null;
  if (!room) return reply(ack, { ok: false, error: "Join a room first." });
  
  if (socket.id !== room.hostSocketId) {        // Enforce host role
    return reply(ack, { ok: false, error: "Only the host can change the video." });
  }

  const cleanVideoUrl = cleanUrl(payload.videoUrl); // Protocol validation (http/https only)
  if (!cleanVideoUrl) {
    return reply(ack, { ok: false, error: "Invalid video URL." });
  }

  room.playback = {
    ...room.playback,
    videoUrl: cleanVideoUrl,
    position: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    version: room.playback.version + 1, // Monotonic increment
  };

  io.to(room.roomCode).emit("playback_updated", getPlaybackSnapshot(room.playback));
  reply(ack, { ok: true, playback: getPlaybackSnapshot(room.playback) });
});
```

### Relevant Code Reference
- [`backend/src/server.js` Lines 738–796](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L738-L796).

### Underlying Concept
Zero-trust architecture, backend parameter validation, and secure session mapping.

---

## Exercise 9: Optimizing Room Query Efficiency & Indexing

### Problem Statement
When a room code is generated, the server checks if it already exists:
```javascript
const existsInDatabase = await Room.exists({ roomCode: code });
```
As the database grows to 500,000 historic room records, room creation slows down from 5ms to 800ms. Why is this happening, and how do you ensure $O(1)$ query speed?

### Hints
1. How does MongoDB perform an unindexed search across 500,000 documents?
2. What index is defined on `Room.js`?

### Step-by-Step Solution
1. **Diagnosis**:
   - Without an index on `roomCode`, MongoDB executes a **Collection Scan (COLLSCAN)**, reading every single document from disk to check if `roomCode === code`.
   - As historic documents accumulate, query latency scales linearly $O(N)$.
2. **Resolution**:
   - In [`backend/src/models/Room.js` Line 9](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js#L9), `unique: true` automatically creates a unique B-Tree index:
     ```javascript
     roomCode: {
       type: String,
       required: true,
       unique: true, // Creates an IXSCAN index
     }
     ```
   - With an index, MongoDB executes an **Index Scan (IXSCAN)** with $O(\log N)$ or near $O(1)$ performance, resolving the query in $< 1\text{ms}$ regardless of collection size.
3. **Verification**:
   - Running `db.rooms.find({ roomCode: "ABC123" }).explain("executionStats")` shows `totalDocsExamined: 0` and `stage: "IXSCAN"`.

### Relevant Code Reference
- [`backend/src/models/Room.js` Lines 6–13](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/models/Room.js#L6-L13).

### Underlying Concept
Database indexing, B-Tree lookups, and execution plan profiling (`explain`).

---

## Exercise 10: Designing a Room Lifecycle & Memory Cleanup Strategy

### Problem Statement
After running in production for two weeks, your Node.js backend memory usage grows continuously from 60 MB to 450 MB until Render restarts the service with an Out-of-Memory (OOM) crash. Upon inspection, thousands of dead rooms are still present in the `activeRooms` Map. How do you design an airtight lifecycle cleanup strategy?

### Hints
1. What happens when users close their browser tabs without clicking "Leave Room"?
2. What happens if a cleanup timer is created but never executed?
3. How do you clean up rate-limiting maps?

### Step-by-Step Solution
1. **Diagnose the Leaks**:
   - Disconnected sockets were being removed from `socketRooms`, but if a user simply closed their laptop lid, `activeRooms` retained the room object.
   - Sliding-window rate limit maps (`chatRateLimits`, `reactionRateLimits`) retained arrays of timestamps for old socket IDs.
2. **Implement Multi-Stage Cleanup**:
   - In `leaveCurrentRoom`:
     ```javascript
     room.participants.delete(socket.id);
     if (room.participants.size === 0) {
       // Schedule 15s timer for unexpected disconnects
       const timer = setTimeout(async () => {
         roomCleanupTimers.delete(roomCode);
         activeRooms.delete(roomCode); // Prune from RAM
         await Room.updateOne({ roomCode }, { $set: { status: "ended" } });
       }, 15000);
       roomCleanupTimers.set(roomCode, timer);
     }
     ```
   - In `socket.on("disconnect")`:
     ```javascript
     chatRateLimits.delete(socket.id);     // Prune rate limit buckets
     reactionRateLimits.delete(socket.id);
     ```
3. **Verification**:
   - Memory stays completely flat (~65 MB) over weeks of continuous operation.

### Relevant Code Reference
- [`backend/src/server.js` Lines 414–435, 1433–1443](file:///c:/Users/Ashmit/Vinnovate-recruitment/watch-party/backend/src/server.js#L414-L435).

### Underlying Concept
Garbage collection optimization, V8 heap retention, and automated resource reclamation.
