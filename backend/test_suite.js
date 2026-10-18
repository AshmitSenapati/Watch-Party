import { io } from "../frontend/node_modules/socket.io-client/build/esm/index.js";
import { spawn } from "node:child_process";

const SERVER_URL = "http://localhost:5000";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=== Starting Watch Party End-to-End Test Suite ===");

  // 1. Start server process
  console.log("Starting backend server...");
  const serverProcess = spawn("node", ["src/server.js"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  // Poll server health endpoint until healthy
  let serverReady = false;
  for (let i = 0; i < 35; i++) {
    await delay(500);
    try {
      const res = await fetch("http://localhost:5000/health");
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok" || data.status === "degraded") {
          serverReady = true;
          console.log(`Server health check passed (Status: ${data.status}, Database: ${data.database})! Starting tests...`);
          break;
        }
      }
    } catch {
      // server still starting up
    }
  }

  if (!serverReady) {
    throw new Error("Backend server did not become ready within timeout.");
  }

  let hostSocket = null;
  let viewerSocket = null;
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName) {
    totalCount++;
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // Connect Host
    hostSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => hostSocket.on("connect", resolve));
    assert(hostSocket.connected, "Host socket connected to server");

    // Test 1: Create room
    let roomCode = null;
    let initialRoom = null;
    await new Promise((resolve) => {
      hostSocket.emit("create_room", { username: "HostUser" }, (res) => {
        assert(res.ok === true, "Host creates room");
        assert(res.room.roomCode.length === 6, "Room code is 6 characters");
        assert(res.room.hostUsername === "HostUser", "HostUser is host");
        assert(res.room.participants.length === 1, "Participant count is 1");
        assert(res.room.playlist.length >= 1, "Default playlist item exists");
        roomCode = res.room.roomCode;
        initialRoom = res.room;
        resolve();
      });
    });

    // Connect Viewer
    viewerSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => viewerSocket.on("connect", resolve));
    assert(viewerSocket.connected, "Viewer socket connected to server");

    // Test 2: Viewer joins room
    await new Promise((resolve) => {
      viewerSocket.emit(
        "join_room",
        { username: "ViewerUser", roomCode },
        (res) => {
          assert(res.ok === true, "Viewer joined room");
          assert(res.room.participants.length === 2, "Participants count is 2");
          assert(
            res.room.participants.some((p) => p.username === "ViewerUser" && !p.isHost),
            "Viewer designated as non-host"
          );
          resolve();
        }
      );
    });

    // Test 3: Playback controls (Host only)
    await new Promise((resolve) => {
      hostSocket.emit("playback_command", { action: "play", position: 5 }, (res) => {
        assert(res.ok === true, "Host can send play command");
        assert(res.playback.isPlaying === true, "Playback state is playing");
        assert(res.playback.position === 5, "Playback position updated to 5");
        resolve();
      });
    });

    // Viewer unauthorized playback command rejected
    await new Promise((resolve) => {
      viewerSocket.emit("playback_command", { action: "pause" }, (res) => {
        assert(res.ok === false, "Viewer cannot control playback");
        resolve();
      });
    });

    // Test 4: Host changes video
    const newVideoUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
    await new Promise((resolve) => {
      hostSocket.emit("change_video", { videoUrl: newVideoUrl }, (res) => {
        assert(res.ok === true, "Host can change video URL");
        assert(res.playback.videoUrl === newVideoUrl, "Video URL updated");
        resolve();
      });
    });

    // Viewer change video rejected
    await new Promise((resolve) => {
      viewerSocket.emit("change_video", { videoUrl: newVideoUrl }, (res) => {
        assert(res.ok === false, "Viewer cannot change video URL");
        resolve();
      });
    });

    // Test 4B: Synchronized YouTube Video Playback
    // 1. Host loads a YouTube video using short format
    const ytShortUrl = "https://youtu.be/dQw4w9WgXcQ";
    const ytCanonical = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const viewerYtUpdatePromise = new Promise((resolve) => {
      viewerSocket.once("playback_updated", (playback) => {
        assert(playback.videoUrl === ytCanonical, "Viewer receives canonical YouTube URL");
        assert(playback.isPlaying === false, "YouTube video starts paused");
        assert(playback.position === 0, "YouTube video position initialized to 0");
        resolve();
      });
    });

    await new Promise((resolve) => {
      hostSocket.emit("change_video", { videoUrl: ytShortUrl }, (res) => {
        assert(res.ok === true, "Host can change to YouTube video URL");
        assert(res.playback.videoUrl === ytCanonical, "YouTube URL normalized to canonical watch URL");
        resolve();
      });
    });
    await viewerYtUpdatePromise;

    // 2. Reject invalid YouTube URLs
    await new Promise((resolve) => {
      hostSocket.emit("change_video", { videoUrl: "https://www.youtube.com/watch?v=invalid_short" }, (res) => {
        assert(res.ok === false, "Invalid YouTube video ID is rejected");
        assert(typeof res.error === "string", "Helpful error message returned for invalid YouTube URL");
        resolve();
      });
    });

    // 3. Reject non-URL HTML injection / arbitrary iframes
    await new Promise((resolve) => {
      hostSocket.emit("change_video", { videoUrl: '<iframe src="https://evil.com"></iframe>' }, (res) => {
        assert(res.ok === false, "Arbitrary iframe HTML tag injection is rejected");
        resolve();
      });
    });

    // 4. Host plays YouTube video
    const viewerPlayPromise = new Promise((resolve) => {
      viewerSocket.once("playback_updated", (playback) => {
        assert(playback.isPlaying === true, "Viewer receives play synchronization for YouTube");
        assert(playback.position === 15, "Viewer receives synchronized playback position 15");
        resolve();
      });
    });

    await new Promise((resolve) => {
      hostSocket.emit("playback_command", { action: "play", position: 15 }, (res) => {
        assert(res.ok === true, "Host plays YouTube video at position 15");
        assert(res.playback.isPlaying === true, "Playback state is playing");
        resolve();
      });
    });
    await viewerPlayPromise;

    // 5. Host seeks YouTube video
    const viewerSeekPromise = new Promise((resolve) => {
      viewerSocket.once("playback_updated", (playback) => {
        assert(playback.position === 65, "Viewer receives seek synchronization to position 65");
        resolve();
      });
    });

    await new Promise((resolve) => {
      hostSocket.emit("playback_command", { action: "seek", position: 65 }, (res) => {
        assert(res.ok === true, "Host seeks YouTube video to position 65");
        assert(res.playback.position === 65, "Playback position updated to 65");
        resolve();
      });
    });
    await viewerSeekPromise;

    // 6. Host pauses YouTube video
    await new Promise((resolve) => {
      hostSocket.emit("playback_command", { action: "pause", position: 70 }, (res) => {
        assert(res.ok === true, "Host pauses YouTube video");
        assert(res.playback.isPlaying === false, "Playback is paused");
        resolve();
      });
    });

    // 7. Late joiner test: receives YouTube video and state
    const lateJoinerSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => lateJoinerSocket.on("connect", resolve));
    await new Promise((resolve) => {
      lateJoinerSocket.emit("join_room", { username: "LateJoiner", roomCode }, (res) => {
        assert(res.ok === true, "Late joiner joined room successfully");
        assert(res.room.playback.videoUrl === ytCanonical, "Late joiner receives currently playing YouTube video");
        assert(res.room.playback.position >= 65, "Late joiner receives correct playback position");
        resolve();
      });
    });
    lateJoinerSocket.disconnect();

    // 8. Room isolation test: create Room B and verify no cross-room pollution
    const roomBSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => roomBSocket.on("connect", resolve));
    let roomBCode = null;
    await new Promise((resolve) => {
      roomBSocket.emit("create_room", { username: "RoomBHost" }, (res) => {
        assert(res.ok === true, "Created Room B");
        assert(res.room.roomCode !== roomCode, "Room B code is unique and isolated");
        roomBCode = res.room.roomCode;
        resolve();
      });
    });

    let roomBReceivedPollution = false;
    roomBSocket.on("playback_updated", () => {
      roomBReceivedPollution = true;
    });

    // Host A sends command in Room A
    await new Promise((resolve) => {
      hostSocket.emit("playback_command", { action: "play", position: 80 }, (res) => {
        assert(res.ok === true, "Host A sent playback command in Room A");
        resolve();
      });
    });
    await delay(300);
    assert(!roomBReceivedPollution, "Room B received no cross-room playback events (room isolation preserved)");
    roomBSocket.disconnect();

    // Test 5: Real-Time Chat
    const chatPromise = new Promise((resolve) => {
      viewerSocket.once("chat_message", (msg) => {
        assert(msg.text === "Hello room from Host!", "Viewer receives chat message");
        assert(msg.senderName === "HostUser", "Message sender name is authentic HostUser");
        assert(msg.timestamp > 0, "Message has valid timestamp");
        resolve();
      });
    });

    await new Promise((resolve) => {
      hostSocket.emit(
        "send_chat_message",
        { text: "Hello room from Host!" },
        (res) => {
          assert(res.ok === true, "Host sends chat message");
          resolve();
        }
      );
    });
    await chatPromise;

    // Chat validation: empty and length > 500
    await new Promise((resolve) => {
      hostSocket.emit("send_chat_message", { text: "   " }, (res) => {
        assert(res.ok === false, "Empty chat message rejected");
        resolve();
      });
    });

    await new Promise((resolve) => {
      hostSocket.emit(
        "send_chat_message",
        { text: "a".repeat(501) },
        (res) => {
          assert(res.ok === false, "Overlength (501 char) message rejected");
          resolve();
        }
      );
    });

    // Test 6: Live Emoji Reactions
    const reactionPromise = new Promise((resolve) => {
      hostSocket.once("reaction_received", (reaction) => {
        assert(reaction.emoji === "🔥", "Host receives reaction 🔥");
        assert(reaction.senderName === "ViewerUser", "Reaction sender is ViewerUser");
        resolve();
      });
    });

    await new Promise((resolve) => {
      viewerSocket.emit("send_reaction", { emoji: "🔥" }, (res) => {
        assert(res.ok === true, "Viewer sent emoji reaction 🔥");
        resolve();
      });
    });
    await reactionPromise;

    // Invalid emoji rejected
    await new Promise((resolve) => {
      viewerSocket.emit("send_reaction", { emoji: "INVALID_EMOJI" }, (res) => {
        assert(res.ok === false, "Invalid emoji reaction rejected");
        resolve();
      });
    });

    // Test 7: Shared Playlist
    let addedItemId = null;
    await new Promise((resolve) => {
      hostSocket.emit(
        "add_to_playlist",
        {
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          title: "Big Buck Bunny",
        },
        (res) => {
          assert(res.ok === true, "Host adds item to playlist");
          const item = res.playlist.find((p) => p.title === "Big Buck Bunny");
          assert(!!item, "Item found in playlist");
          addedItemId = item.id;
          resolve();
        }
      );
    });

    // Viewer add to playlist rejected
    await new Promise((resolve) => {
      viewerSocket.emit(
        "add_to_playlist",
        { videoUrl: "https://example.com/test.mp4", title: "Test" },
        (res) => {
          assert(res.ok === false, "Viewer cannot add to playlist");
          resolve();
        }
      );
    });

    // Host plays playlist item
    await new Promise((resolve) => {
      hostSocket.emit("play_playlist_item", { itemId: addedItemId }, (res) => {
        assert(res.ok === true, "Host plays playlist item");
        assert(res.currentPlaylistId === addedItemId, "currentPlaylistId matches item");
        resolve();
      });
    });

    // Host reorders playlist
    await new Promise((resolve) => {
      hostSocket.emit("reorder_playlist", { itemId: addedItemId, direction: "up" }, (res) => {
        assert(res.ok === true, "Host reorders playlist item up");
        resolve();
      });
    });

    // Host removes playlist item
    await new Promise((resolve) => {
      hostSocket.emit("remove_from_playlist", { itemId: addedItemId }, (res) => {
        assert(res.ok === true, "Host removes item from playlist");
        resolve();
      });
    });

    // Test 8: Polls
    let pollId = null;
    await new Promise((resolve) => {
      hostSocket.emit(
        "create_poll",
        {
          question: "What movie should we watch next?",
          options: ["Sci-Fi Thriller", "Comedy Classic", "Action Adventure"],
        },
        (res) => {
          assert(res.ok === true, "Host creates poll");
          assert(res.poll.question === "What movie should we watch next?", "Poll question matches");
          assert(res.poll.options.length === 3, "Poll has 3 options");
          assert(res.poll.isOpen === true, "Poll is open");
          pollId = res.poll.id;
          resolve();
        }
      );
    });

    // Viewer unauthorized create poll rejected
    await new Promise((resolve) => {
      viewerSocket.emit(
        "create_poll",
        { question: "Unauthorized", options: ["A", "B"] },
        (res) => {
          assert(res.ok === false, "Viewer cannot create poll");
          resolve();
        }
      );
    });

    // Viewer votes for option 1
    await new Promise((resolve) => {
      viewerSocket.emit("vote_poll", { pollId, optionIndex: 1 }, (res) => {
        assert(res.ok === true, "Viewer successfully voted for option 1");
        assert(res.votedIndex === 1, "Voted index is 1");
        resolve();
      });
    });

    // Viewer duplicate vote rejected
    await new Promise((resolve) => {
      viewerSocket.emit("vote_poll", { pollId, optionIndex: 0 }, (res) => {
        assert(res.ok === false, "Viewer duplicate vote is rejected");
        resolve();
      });
    });

    // Host votes for option 1
    await new Promise((resolve) => {
      hostSocket.emit("vote_poll", { pollId, optionIndex: 1 }, (res) => {
        assert(res.ok === true, "Host successfully voted for option 1");
        resolve();
      });
    });

    // Host closes poll
    await new Promise((resolve) => {
      hostSocket.emit("close_poll", { pollId }, (res) => {
        assert(res.ok === true, "Host closes poll");
        assert(res.poll.isOpen === false, "Poll is closed");
        assert(res.poll.options[1].votes === 2, "Option 1 has 2 votes");
        assert(res.poll.options[1].percentage === 100, "Option 1 has 100% of votes");
        resolve();
      });
    });

    // Test 9: Reconnection and Page Refresh Simulation
    // Reconnect viewer socket with reconnect_room
    await new Promise((resolve) => {
      viewerSocket.emit("reconnect_room", { roomCode, username: "ViewerUser" }, (res) => {
        assert(res.ok === true, "Viewer reconnected to room successfully");
        assert(res.room.participants.length === 2, "No duplicate participant entries created");
        assert(res.room.roomCode === roomCode, "Room state preserved");
        resolve();
      });
    });

    // Test 10: Host Browser Refresh Simulation (Disconnect -> New Socket -> Reconnect)
    console.log("Simulating Host browser refresh (F5)...");
    hostSocket.disconnect();
    await delay(300);

    const refreshedHostSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => refreshedHostSocket.on("connect", resolve));

    await new Promise((resolve) => {
      refreshedHostSocket.emit(
        "reconnect_room",
        { roomCode, username: "HostUser" },
        (res) => {
          assert(res.ok === true, "Host reconnected with fresh socket after page refresh");
          assert(res.room.hostUsername === "HostUser", "Host retains hostUsername after refresh");
          const hostEntry = res.room.participants.find((p) => p.username === "HostUser");
          assert(Boolean(hostEntry && hostEntry.isHost), "Host participant isHost flag is true");
          assert(res.room.participants.length === 2, "Participants count strictly 2 (no ghost sockets)");
          assert(typeof res.room.playback.videoUrl === "string" && res.room.playback.videoUrl.length > 0, "Video URL preserved on refresh");
          assert(typeof res.room.playback.position === "number", "Playback position preserved on refresh");
          assert(res.room.poll && res.room.poll.isOpen === false, "Closed poll state preserved on refresh");
          assert(res.room.messages.length >= 1, "Chat messages preserved on refresh");
          resolve();
        }
      );
    });

    // Test 11: Reconnect to non-existent or expired room
    await new Promise((resolve) => {
      refreshedHostSocket.emit(
        "reconnect_room",
        { roomCode: "ZZ99XX", username: "HostUser" },
        (res) => {
          assert(res.ok === false, "Reconnect to invalid/expired room is rejected");
          assert(res.error.length > 0, "Error message provided for expired room");
          resolve();
        }
      );
    });

    // Test 12: Solo Room Browser Refresh Simulation
    console.log("Simulating Solo Room browser refresh...");
    const soloSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => soloSocket.on("connect", resolve));

    let soloRoomCode = null;
    await new Promise((resolve) => {
      soloSocket.emit("create_room", { username: "SoloHost" }, (res) => {
        assert(res.ok === true, "SoloHost created room");
        soloRoomCode = res.room.roomCode;
        resolve();
      });
    });

    // Solo host disconnects (simulating browser reload while alone)
    soloSocket.disconnect();
    await delay(300);

    // Fresh socket loads the page
    const reloadedSoloSocket = io(SERVER_URL, { reconnection: false });
    await new Promise((resolve) => reloadedSoloSocket.on("connect", resolve));

    await new Promise((resolve) => {
      reloadedSoloSocket.emit(
        "reconnect_room",
        { roomCode: soloRoomCode, username: "SoloHost" },
        (res) => {
          assert(res.ok === true, "SoloHost rejoins room within disconnect grace period");
          assert(res.room.hostUsername === "SoloHost", "SoloHost is preserved as host");
          assert(res.room.participants.length === 1, "Participant count is exactly 1");
          assert(res.room.participants[0].isHost === true, "SoloHost is marked as host");
          resolve();
        }
      );
    });

    // Test 13: Explicit leave_room terminates room immediately without grace period
    await new Promise((resolve) => {
      reloadedSoloSocket.emit("leave_room", (res) => {
        assert(res.ok === true, "SoloHost explicitly leaves room");
        resolve();
      });
    });

    // Attempting to reconnect to explicitly left room fails
    await new Promise((resolve) => {
      reloadedSoloSocket.emit(
        "reconnect_room",
        { roomCode: soloRoomCode, username: "SoloHost" },
        (res) => {
          assert(res.ok === false, "Cannot reconnect to explicitly ended room");
          resolve();
        }
      );
    });

    refreshedHostSocket.disconnect();
    reloadedSoloSocket.disconnect();

    console.log(`\nAll ${passedCount}/${totalCount} Automated End-to-End Tests Passed Successfully!`);
  } finally {
    if (hostSocket) hostSocket.disconnect();
    if (viewerSocket) viewerSocket.disconnect();
    if (serverProcess && serverProcess.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", serverProcess.pid.toString(), "/T", "/F"]);
      } else {
        serverProcess.kill("SIGTERM");
      }
    }
    await delay(500);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test Suite Error:", err);
    process.exit(1);
  });
