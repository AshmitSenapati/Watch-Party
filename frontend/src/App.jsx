import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import WatchPlayer from "./WatchPlayer";
import ChatPanel from "./components/ChatPanel";
import PlaylistPanel from "./components/PlaylistPanel";
import PollPanel from "./components/PollPanel";

const API_URL =
  (import.meta.env.VITE_SERVER_URL || "").trim().replace(/\/+$/, "") ||
  "http://localhost:5000";

function App() {
  const socketRef = useRef(null);
  const currentRoomCodeRef = useRef(null);
  const currentUsernameRef = useRef(null);

  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [username, setUsername] = useState("");

  const [invitedRoomCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get("room");
      if (inviteCode && /^[A-Za-z0-9]{6}$/.test(inviteCode.trim())) {
        return inviteCode.trim().toUpperCase();
      }
    } catch {
      // ignore
    }
    return "";
  });

  const [roomCodeInput, setRoomCodeInput] = useState(() => invitedRoomCode);

  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Room navigation tabs: "chat" | "playlist" | "poll" | "people"
  const [activeTab, setActiveTab] = useState("chat");
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    const s = io(API_URL, {
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      transports: ["websocket", "polling"],
    });

    socketRef.current = s;

    s.on("connect", () => {
      setSocket(s);
      setConnectionStatus("connected");
      setSocketId(s.id);

      // Automatic state restoration on reconnection
      if (currentRoomCodeRef.current && currentUsernameRef.current) {
        s.emit(
          "reconnect_room",
          {
            roomCode: currentRoomCodeRef.current,
            username: currentUsernameRef.current,
          },
          (response) => {
            if (response?.ok && response.room) {
              setRoom(response.room);
              setNotice("Reconnected to room successfully!");
            }
          }
        );
      }
    });

    s.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    s.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    s.io.on("reconnect", () => {
      setConnectionStatus("connected");
      setSocketId(s.id);
    });

    s.io.on("reconnect_error", () => {
      setConnectionStatus("reconnecting");
    });

    s.on("room_updated", (updatedRoom) => {
      setRoom((currentRoom) => {
        if (currentRoom?.roomCode === updatedRoom.roomCode) {
          return updatedRoom;
        }
        return currentRoom;
      });
    });

    s.on("poll_updated", (updatedPoll) => {
      setRoom((currentRoom) => {
        if (!currentRoom) return null;
        return {
          ...currentRoom,
          poll: updatedPoll,
        };
      });
    });

    s.on("playlist_updated", ({ playlist, currentPlaylistId }) => {
      setRoom((currentRoom) => {
        if (!currentRoom) return null;
        return {
          ...currentRoom,
          playlist,
          currentPlaylistId,
        };
      });
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  function validateUsername() {
    const cleaned = username.trim().replace(/\s+/g, " ");

    if (cleaned.length < 2 || cleaned.length > 24) {
      setError("Enter a username between 2 and 24 characters.");
      return null;
    }

    return cleaned;
  }

  function requestRoom(eventName, payload) {
    const s = socketRef.current;

    if (!s?.connected) {
      setError("Not connected to the server. Please wait.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    s.timeout(5000).emit(eventName, payload, (timeoutError, response) => {
      setBusy(false);

      if (timeoutError) {
        setError("The server did not respond. Try again.");
        return;
      }

      if (!response?.ok) {
        setError(response?.error || "Something went wrong.");
        return;
      }

      const joinedRoom = response.room || null;
      setRoom(joinedRoom);

      if (joinedRoom) {
        currentRoomCodeRef.current = joinedRoom.roomCode;
        currentUsernameRef.current = payload.username;
      }

      setNotice(
        eventName === "create_room"
          ? "Room created successfully!"
          : "You joined the room successfully!"
      );
    });
  }

  function createRoom(event) {
    event.preventDefault();

    const cleanName = validateUsername();
    if (!cleanName) return;

    requestRoom("create_room", { username: cleanName });
  }

  function joinRoom(event) {
    event.preventDefault();

    const cleanName = validateUsername();
    if (!cleanName) return;

    requestRoom("join_room", {
      username: cleanName,
      roomCode: roomCodeInput.trim().toUpperCase(),
    });
  }

  function leaveRoom() {
    const s = socketRef.current;

    if (!s?.connected) {
      setError("Reconnect before leaving the room.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    s.timeout(5000).emit("leave_room", (timeoutError, response) => {
      setBusy(false);

      if (timeoutError || !response?.ok) {
        setError("Could not leave the room cleanly. Resetting local state.");
      }

      currentRoomCodeRef.current = null;
      currentUsernameRef.current = null;
      setRoom(null);
      setNotice("You left the room.");
    });
  }

  async function copyInvite() {
    if (!room) return;

    const inviteUrl = new URL(window.location.origin);
    inviteUrl.searchParams.set("room", room.roomCode);

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setNotice(`Invite link copied to clipboard: ${inviteUrl.toString()}`);
    } catch {
      setNotice(`Share this link to invite friends: ${inviteUrl.toString()}`);
    }
  }

  const isHost =
    room?.participants?.some(
      (participant) =>
        participant.id === socketId && participant.isHost
    ) ||
    room?.hostUsername?.toLowerCase() === username.trim().toLowerCase();

  const isConnected = connectionStatus === "connected";

  return (
    <main className="app">
      <header className="navbar">
        <a className="brand" href="/">
          <span className="brand-icon">W</span>
          Watch Party
        </a>

        <span className={`connection ${connectionStatus}`}>
          <span className="status-dot" />
          {connectionStatus === "connected" && "Connected"}
          {connectionStatus === "connecting" && "Connecting..."}
          {connectionStatus === "reconnecting" && "Reconnecting..."}
          {connectionStatus === "disconnected" && "Disconnected"}
        </span>
      </header>

      {!room && (
        <section className="hero">
          <p className="eyebrow">WATCH TOGETHER, ANYWHERE</p>
          <h1>
            Your people.
            <br />
            <span>Your movie night.</span>
          </h1>
          <p className="description">
            Create a room, invite your friends, and get ready
            for a synchronized streaming experience with live chat, reactions,
            shared playlists, and real-time polls.
          </p>
        </section>
      )}

      {invitedRoomCode && !room && (
        <div className="message invite-banner" role="status">
          🎉 You were invited to join room <strong>{invitedRoomCode}</strong>! Choose your username and click Join Room below.
        </div>
      )}

      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}

      {!isConnected && room && (
        <div className="message warning" role="status">
          Connection lost. Reconnecting to room {room.roomCode}...
        </div>
      )}

      {!room ? (
        <section className="room-actions">
          <form className="action-card" onSubmit={createRoom}>
            <span className="card-icon">01</span>
            <h2>Create a room</h2>
            <p>Start a watch party and become its host.</p>

            <label htmlFor="create-username">Your username</label>
            <input
              id="create-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. Ashmit"
              minLength={2}
              maxLength={24}
              required
              disabled={busy}
            />

            <button
              className="primary-button"
              disabled={busy || !isConnected}
            >
              {busy ? "Please wait..." : "Create room"}
            </button>
          </form>

          <form className="action-card" onSubmit={joinRoom}>
            <span className="card-icon">02</span>
            <h2>Join a room</h2>
            <p>Enter a friend's room code to join the party.</p>

            <label htmlFor="join-username">Your username</label>
            <input
              id="join-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Choose a username"
              minLength={2}
              maxLength={24}
              required
              disabled={busy}
            />

            <label htmlFor="room-code">Room code</label>
            <input
              id="room-code"
              value={roomCodeInput}
              onChange={(event) =>
                setRoomCodeInput(event.target.value.toUpperCase())
              }
              placeholder="ABC123"
              minLength={6}
              maxLength={6}
              required
              disabled={busy}
            />

            <button
              className="secondary-button"
              disabled={busy || !isConnected}
            >
              {busy ? "Please wait..." : "Join room"}
            </button>
          </form>
        </section>
      ) : (
        <section className="room-experience">
          {/* Room Top Bar */}
          <div className="room-top-bar">
            <div className="room-top-left">
              <span className="room-code-tag">ROOM {room.roomCode}</span>
              <span className="room-meta-pill">
                Host: <strong>{room.hostUsername || "Assigning..."}</strong>
              </span>
              <span className="room-meta-pill">
                👥 {room.participantCount}/{room.maxParticipants} online
              </span>
            </div>

            <div className="room-actions-inline">
              <button
                className="secondary-button"
                onClick={copyInvite}
                disabled={busy}
                title="Copy shareable link"
              >
                Copy Invite Link
              </button>
              <button
                className="secondary-button leave-button"
                onClick={leaveRoom}
                disabled={busy}
              >
                Leave Room
              </button>
            </div>
          </div>

          {/* Main 2-Column Layout */}
          <div className="room-layout-grid">
            {/* Left: Video Player Area */}
            <div className="room-player-column">
              <WatchPlayer
                socket={socket}
                room={room}
                isHost={isHost}
                onError={setError}
              />
            </div>

            {/* Right: Interactive Sidebar (Chat, Playlist, Poll, People) */}
            <div className="room-sidebar-column">
              <div className="sidebar-tab-nav" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "chat"}
                  className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
                  onClick={() => setActiveTab("chat")}
                >
                  💬 Chat
                  {activeTab !== "chat" && unreadChatCount > 0 && (
                    <span className="unread-dot-badge">
                      {unreadChatCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "playlist"}
                  className={`tab-btn ${
                    activeTab === "playlist" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("playlist")}
                >
                  📋 Playlist
                  {room.playlist?.length > 0 && (
                    <span className="tab-count-badge">
                      {room.playlist.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "poll"}
                  className={`tab-btn ${activeTab === "poll" ? "active" : ""}`}
                  onClick={() => setActiveTab("poll")}
                >
                  📊 Poll
                  {room.poll?.isOpen && (
                    <span className="poll-live-indicator" title="Poll is live" />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "people"}
                  className={`tab-btn ${
                    activeTab === "people" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("people")}
                >
                  👥 People
                  <span className="tab-count-badge">
                    {room.participants.length}
                  </span>
                </button>
              </div>

              <div className="sidebar-tab-content">
                <div style={{ display: activeTab === "chat" ? "block" : "none" }}>
                  <ChatPanel
                    socket={socket}
                    room={room}
                    currentUsername={username}
                    isVisible={activeTab === "chat"}
                    onUnreadCountChange={setUnreadChatCount}
                    onError={setError}
                  />
                </div>

                {activeTab === "playlist" && (
                  <PlaylistPanel
                    socket={socket}
                    room={room}
                    isHost={isHost}
                    onError={setError}
                  />
                )}

                {activeTab === "poll" && (
                  <PollPanel
                    socket={socket}
                    room={room}
                    isHost={isHost}
                    currentUsername={username}
                    onError={setError}
                  />
                )}

                {activeTab === "people" && (
                  <div className="people-panel">
                    <h3 className="participants-title">
                      Participants ({room.participantCount}/{room.maxParticipants})
                    </h3>
                    <ul className="participant-list">
                      {room.participants.map((participant) => (
                        <li key={participant.id} className="participant">
                          <span className="avatar">
                            {participant.username.charAt(0).toUpperCase()}
                          </span>
                          <span className="participant-name">
                            {participant.username}
                            {participant.id === socketId && (
                              <span className="you-label"> YOU</span>
                            )}
                          </span>
                          {participant.isHost && (
                            <span className="host-badge">HOST</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <footer>
        Watch Party &bull; Real-time synchronized video, chat & reactions.
      </footer>
    </main>
  );
}

export default App;
