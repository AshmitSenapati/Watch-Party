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
  for (let i = 0; i < 25; i++) {
    await delay(500);
    try {
      const res = await fetch("http://localhost:5000/health");
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok" && data.database === "connected") {
          serverReady = true;
          console.log("Server health check passed! Starting tests...");
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

    // Test 9: Reconnection
    // Reconnect viewer socket with reconnect_room
    await new Promise((resolve) => {
      viewerSocket.emit("reconnect_room", { roomCode, username: "ViewerUser" }, (res) => {
        assert(res.ok === true, "Viewer reconnected to room successfully");
        assert(res.room.participants.length === 2, "No duplicate participant entries created");
        assert(res.room.roomCode === roomCode, "Room state preserved");
        resolve();
      });
    });

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
