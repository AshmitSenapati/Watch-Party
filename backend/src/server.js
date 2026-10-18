
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { Server } from "socket.io";
import Room from "./models/Room.js";
import {
  parseYouTubeVideoId,
  validateAndNormalizeVideoUrl,
} from "./youtube.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const DEFAULT_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const KNOWN_PRODUCTION_ORIGINS = [
  "https://watch-party-rlope6gvr-ash-c968.vercel.app",
];

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

// Support both ALLOWED_ORIGINS and CLIENT_URL (single or comma-separated, with wildcard support),
// while always preserving production and local development origins.
function getAllowedOrigins() {
  const custom = [process.env.ALLOWED_ORIGINS, process.env.CLIENT_URL]
    .filter(Boolean)
    .flatMap((val) => val.split(","))
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return Array.from(
    new Set([
      ...custom,
      ...KNOWN_PRODUCTION_ORIGINS,
      "https://*.vercel.app",
      ...LOCAL_DEV_ORIGINS,
    ])
  );
}

function isOriginAllowed(origin, allowedList) {
  if (!origin) return true; // Allow non-browser requests, health checks, curl, server-to-server
  const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();

  return allowedList.some((allowed) => {
    const target = allowed.trim().replace(/\/+$/, "").toLowerCase();
    if (target === normalized) return true;

    // Support wildcard subdomains, e.g. "https://*.vercel.app" or "*.vercel.app"
    if (target.includes("*")) {
      const regexStr = target
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[a-z0-9_.-]+");
      const pattern = new RegExp(`^${regexStr}$`, "i");
      return pattern.test(normalized);
    }

    return false;
  });
}

const MAX_PARTICIPANTS = 10;
const ROOM_CODE_LENGTH = 6;
const USERNAME_MIN = 2;
const USERNAME_MAX = 24;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ALLOWED_REACTIONS = ["❤️", "😂", "🔥", "👍", "😮", "👏"];
const MAX_CHAT_MESSAGE_LENGTH = 500;
const MAX_CHAT_HISTORY = 100;
const MAX_PLAYLIST_ITEMS = 30;

// Active rooms exist in memory, not in MongoDB.
const activeRooms = new Map();

// Prevent one socket from being an active member of multiple rooms.
const socketRooms = new Map();

// Grace period timers for rooms when empty due to disconnection
const roomCleanupTimers = new Map();

// Rate limiting maps (socketId -> Array of timestamps)
const chatRateLimits = new Map();
const reactionRateLimits = new Map();

// Trust reverse proxy (crucial when deployed on Render or behind load balancers)
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = getAllowedOrigins();
      if (isOriginAllowed(origin, allowed)) {
        callback(null, true);
      } else {
        console.warn(`[Express CORS Blocked] Origin "${origin}" not in allowed list.`);
        callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// Health check endpoints for deployment monitoring (e.g. Render health checks)
function healthCheckHandler(req, res) {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1
      ? "connected"
      : dbState === 2
      ? "connecting"
      : "disconnected";

  const isHealthy = dbState === 1;

  res.status(200).json({
    status: isHealthy ? "ok" : "degraded",
    message: "Watch Party backend is running",
    database: dbStatus,
    activeRooms: activeRooms.size,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

app.get("/health", healthCheckHandler);
app.get("/api/health", healthCheckHandler);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowed = getAllowedOrigins();
      const isAllowed = isOriginAllowed(origin, allowed);
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(
          `[Socket.IO CORS Blocked] Origin "${origin}" rejected. Allowed origins:`,
          allowed
        );
        // Using callback(null, false) allows CORS to omit the header without throwing a MIDDLEWARE_FAILURE error in Engine.IO
        callback(null, false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Default to HTTP polling first, then upgrade to WebSocket for reliable proxy handling
  transports: ["polling", "websocket"],
});

// Safe diagnostic logging for Socket.IO connection and handshake errors
io.engine.on("connection_error", (err) => {
  const origin = err.req?.headers?.origin || "none";
  const ip =
    err.req?.headers?.["x-forwarded-for"] ||
    err.req?.socket?.remoteAddress ||
    "unknown";
  const transport = err.req?._query?.transport || "unknown";
  const url = err.req?.url || "unknown";

  console.warn(
    `[Socket.IO Handshake Failure] Code: ${err.code} (${err.message}) | Transport: ${transport} | Origin: ${origin} | IP: ${ip} | URL: ${url}`
  );
  if (err.context && Object.keys(err.context).length > 0) {
    console.warn(`[Socket.IO Error Context]:`, JSON.stringify(err.context));
    if (err.context.name === "MIDDLEWARE_FAILURE") {
      console.warn(
        `[Diagnostic] MIDDLEWARE_FAILURE indicates an Engine.IO middleware rejected the request. Verify origin "${origin}" is in allowed list.`
      );
    }
  }
});

// --------------------------------------------------
// Validation helpers
// --------------------------------------------------

function cleanUsername(value) {
  if (typeof value !== "string") return null;

  const username = value.trim().replace(/\s+/g, " ");

  if (
    username.length < USERNAME_MIN ||
    username.length > USERNAME_MAX
  ) {
    return null;
  }

  // Reject control characters and HTML-like markup.
  if (/[\u0000-\u001F\u007F<>]/.test(username)) {
    return null;
  }

  return username;
}

function cleanRoomCode(value) {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase();

  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

function checkRateLimit(limitsMap, socketId, maxCount, windowMs) {
  const now = Date.now();
  const timestamps = limitsMap.get(socketId) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxCount) {
    return false;
  }

  recent.push(now);
  limitsMap.set(socketId, recent);
  return true;
}

function cleanChatMessage(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    return null;
  }

  // Reject non-printable control characters except newline, carriage return, tab
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function isValidReaction(emoji) {
  return typeof emoji === "string" && ALLOWED_REACTIONS.includes(emoji);
}

function cleanUrl(urlString) {
  if (typeof urlString !== "string") return null;
  try {
    const parsed = new URL(urlString.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function getPublicPoll(poll) {
  if (!poll) return null;

  const voteCounts = new Array(poll.options.length).fill(0);
  let totalVotes = 0;

  for (const optIdx of poll.userVotes.values()) {
    if (optIdx >= 0 && optIdx < voteCounts.length) {
      voteCounts[optIdx]++;
      totalVotes++;
    }
  }

  return {
    id: poll.id,
    question: poll.question,
    options: poll.options.map((opt, index) => ({
      id: opt.id,
      text: opt.text,
      votes: voteCounts[index],
      percentage:
        totalVotes > 0
          ? Math.round((voteCounts[index] / totalVotes) * 100)
          : 0,
    })),
    totalVotes,
    isOpen: poll.isOpen,
    createdBy: poll.createdBy,
    createdAt: poll.createdAt,
    userVotes: Object.fromEntries(poll.userVotes),
  };
}

function createRoomCode() {
  let code = "";

  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[
      randomInt(ROOM_CODE_CHARS.length)
    ];
  }

  return code;
}

async function generateUniqueRoomCode() {
  // Retry in the extremely unlikely event of a collision.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = createRoomCode();

    const existsInMemory = activeRooms.has(code);
    const existsInDatabase =
      mongoose.connection.readyState === 1
        ? await Room.exists({ roomCode: code }).catch(() => false)
        : false;

    if (!existsInMemory && !existsInDatabase) {
      return code;
    }
  }

  throw new Error("Could not generate a unique room code");
}

// --------------------------------------------------
// Playback helpers
// --------------------------------------------------

function getExpectedPosition(playback, now = Date.now()) {
  if (!playback.isPlaying || playback.isEnded) {
    return playback.position;
  }

  const elapsedSeconds =
    Math.max(0, now - playback.updatedAt) / 1000;

  const raw = playback.position + elapsedSeconds;
  if (typeof playback.duration === "number" && playback.duration > 0) {
    return Math.min(raw, playback.duration);
  }
  return raw;
}

function getPlaybackSnapshot(playback) {
  const isEnded = Boolean(playback.isEnded);
  const isPlaying = Boolean(playback.isPlaying && !isEnded);

  return {
    videoUrl: playback.videoUrl,
    position: getExpectedPosition(playback),
    isPlaying,
    isEnded,
    duration: typeof playback.duration === "number" ? playback.duration : 0,
    updatedAt: playback.updatedAt,
    version: playback.version,
  };
}

// --------------------------------------------------
// Public room information
// --------------------------------------------------

function getPublicRoom(room) {
  const participants = [...room.participants.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((participant) => ({
      id: participant.id,
      username: participant.username,
      isHost: participant.id === room.hostSocketId,
    }));

  return {
    roomCode: room.roomCode,
    hostUsername:
      room.participants.get(room.hostSocketId)?.username ?? null,
    participants,
    participantCount: participants.length,
    maxParticipants: MAX_PARTICIPANTS,
    playback: getPlaybackSnapshot(room.playback),
    playlist: room.playlist || [],
    currentPlaylistId: room.currentPlaylistId ?? null,
    poll: getPublicPoll(room.poll),
    messages: (room.messages || []).slice(-MAX_CHAT_HISTORY),
    status: room.status || "active",
  };
}

function sendRoomUpdate(room) {
  io.to(room.roomCode).emit("room_updated", getPublicRoom(room));
}

function reply(ack, payload) {
  if (typeof ack === "function") {
    ack(payload);
  }
}

// --------------------------------------------------
// Leave room and transfer host if necessary
// --------------------------------------------------

async function leaveCurrentRoom(socket, isDisconnect = false) {
  const roomCode = socketRooms.get(socket.id);
  if (!roomCode) return;

  const room = activeRooms.get(roomCode);

  socketRooms.delete(socket.id);
  await socket.leave(roomCode);

  if (!room) return;

  const participant = room.participants.get(socket.id);
  const wasHost = room.hostSocketId === socket.id;

  room.participants.delete(socket.id);

  if (isDisconnect && participant) {
    if (!room.disconnectedParticipants) {
      room.disconnectedParticipants = new Map();
    }

    const key = participant.username.toLowerCase();
    if (room.disconnectedParticipants.has(key)) {
      clearTimeout(room.disconnectedParticipants.get(key).timer);
    }

    const timer = setTimeout(async () => {
      if (!room.disconnectedParticipants) return;
      room.disconnectedParticipants.delete(key);

      // If disconnected participant was host, transfer host to next active participant
      if (room.hostSocketId === socket.id || !room.participants.has(room.hostSocketId)) {
        if (room.participants.size > 0) {
          const nextHost = [...room.participants.values()]
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
          room.hostSocketId = nextHost.id;

          if (mongoose.connection.readyState === 1) {
            await Room.updateOne(
              { roomCode },
              { $set: { hostUsername: nextHost.username, status: "active" } }
            ).catch(() => {});
          }
          sendRoomUpdate(room);
        }
      }

      // If room has no active participants and no pending disconnected participants, end room
      if (room.participants.size === 0 && room.disconnectedParticipants.size === 0) {
        activeRooms.delete(roomCode);
        if (mongoose.connection.readyState === 1) {
          await Room.updateOne(
            { roomCode },
            { $set: { status: "ended" } }
          ).catch(() => {});
        }
        console.log(`Room ${roomCode} ended after disconnect grace period.`);
      }
    }, 15000);

    room.disconnectedParticipants.set(key, {
      username: participant.username,
      joinedAt: participant.joinedAt,
      isHost: wasHost,
      timer,
    });

    sendRoomUpdate(room);
    return;
  }

  // Explicit leave (isDisconnect === false)
  if (participant && room.disconnectedParticipants) {
    const key = participant.username.toLowerCase();
    if (room.disconnectedParticipants.has(key)) {
      clearTimeout(room.disconnectedParticipants.get(key).timer);
      room.disconnectedParticipants.delete(key);
    }
  }

  if (room.participants.size === 0 && (!room.disconnectedParticipants || room.disconnectedParticipants.size === 0)) {
    activeRooms.delete(roomCode);

    if (mongoose.connection.readyState === 1) {
      await Room.updateOne(
        { roomCode },
        { $set: { status: "ended" } }
      ).catch(() => {});
    }

    return;
  }

  // Transfer host privileges immediately if explicit leave
  if (wasHost) {
    if (room.participants.size > 0) {
      const nextHost = [...room.participants.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];

      room.hostSocketId = nextHost.id;

      if (mongoose.connection.readyState === 1) {
        await Room.updateOne(
          { roomCode },
          {
            $set: {
              hostUsername: nextHost.username,
              status: "active",
            },
          }
        ).catch(() => {});
      }
    }
  }

  sendRoomUpdate(room);
}

// --------------------------------------------------
// Socket.IO events
// --------------------------------------------------

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create a room.
  socket.on("create_room", async (payload = {}, ack) => {
    try {
      if (socketRooms.has(socket.id)) {
        return reply(ack, {
          ok: false,
          error: "Leave your current room first.",
        });
      }

      const username = cleanUsername(payload.username);

      if (!username) {
        return reply(ack, {
          ok: false,
          error: "Username must be 2–24 valid characters.",
        });
      }

      const roomCode = await generateUniqueRoomCode();
      const now = Date.now();

      const defaultPlaylistItem = {
        id: randomUUID(),
        title: "Default Video (Flower)",
        videoUrl: DEFAULT_VIDEO_URL,
        addedBy: username,
        addedAt: now,
      };

      const room = {
        roomCode,
        hostSocketId: socket.id,
        participants: new Map(),
        createdAt: now,

        playback: {
          videoUrl: DEFAULT_VIDEO_URL,
          position: 0,
          isPlaying: false,
          isEnded: false,
          duration: 0,
          updatedAt: now,
          version: 0,
        },
        messages: [],
        playlist: [defaultPlaylistItem],
        currentPlaylistId: defaultPlaylistItem.id,
        poll: null,
      };

      room.participants.set(socket.id, {
        id: socket.id,
        username,
        joinedAt: now,
      });

      // Save room metadata before announcing success if database is connected.
      if (mongoose.connection.readyState === 1) {
        await Room.create({
          roomCode,
          hostUsername: username,
          status: "active",
        }).catch((err) => {
          console.warn("Could not save room to database:", err.message);
        });
      }

      activeRooms.set(roomCode, room);
      socketRooms.set(socket.id, roomCode);

      await socket.join(roomCode);

      const publicRoom = getPublicRoom(room);

      reply(ack, { ok: true, room: publicRoom });
      sendRoomUpdate(room);

      console.log(`${username} created room ${roomCode}`);
    } catch (error) {
      console.error("create_room error:", error);

      reply(ack, {
        ok: false,
        error: "Could not create room. Please try again.",
      });
    }
  });

  // Join an existing room.
  socket.on("join_room", async (payload = {}, ack) => {
    try {
      if (socketRooms.has(socket.id)) {
        return reply(ack, {
          ok: false,
          error: "Leave your current room first.",
        });
      }

      const username = cleanUsername(payload.username);
      const roomCode = cleanRoomCode(payload.roomCode);

      if (!username) {
        return reply(ack, {
          ok: false,
          error: "Username must be 2–24 valid characters.",
        });
      }

      if (!roomCode) {
        return reply(ack, {
          ok: false,
          error: "Enter a valid six-character room code.",
        });
      }

      const room = activeRooms.get(roomCode);

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Room not found or no longer active.",
        });
      }

      // If room had a cleanup timer pending, cancel it
      if (roomCleanupTimers.has(roomCode)) {
        clearTimeout(roomCleanupTimers.get(roomCode));
        roomCleanupTimers.delete(roomCode);
      }

      if (room.participants.size >= MAX_PARTICIPANTS) {
        return reply(ack, {
          ok: false,
          error: "This room is full.",
        });
      }

      const nameTaken =
        [...room.participants.values()].some(
          (participant) =>
            participant.username.toLowerCase() === username.toLowerCase()
        ) || Boolean(room.disconnectedParticipants?.has(username.toLowerCase()));

      if (nameTaken) {
        return reply(ack, {
          ok: false,
          error: "That username is already in this room.",
        });
      }

      room.participants.set(socket.id, {
        id: socket.id,
        username,
        joinedAt: Date.now(),
      });

      socketRooms.set(socket.id, roomCode);
      await socket.join(roomCode);

      const publicRoom = getPublicRoom(room);

      reply(ack, { ok: true, room: publicRoom });
      sendRoomUpdate(room);

      console.log(`${username} joined room ${roomCode}`);
    } catch (error) {
      console.error("join_room error:", error);

      reply(ack, {
        ok: false,
        error: "Could not join room. Please try again.",
      });
    }
  });

  // Reconnect to an existing room seamlessly.
  socket.on("reconnect_room", async (payload = {}, ack) => {
    try {
      const username = cleanUsername(payload.username);
      const roomCode = cleanRoomCode(payload.roomCode);

      if (!username || !roomCode) {
        return reply(ack, {
          ok: false,
          error: "Invalid reconnect parameters.",
        });
      }

      const room = activeRooms.get(roomCode);

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Room is no longer active.",
        });
      }

      if (roomCleanupTimers.has(roomCode)) {
        clearTimeout(roomCleanupTimers.get(roomCode));
        roomCleanupTimers.delete(roomCode);
      }

      // Find if there is an existing participant entry for this username
      let existingSocketId = null;
      let existingJoinedAt = Date.now();
      let wasHost = false;

      for (const [sId, participant] of room.participants.entries()) {
        if (participant.username.toLowerCase() === username.toLowerCase()) {
          existingSocketId = sId;
          existingJoinedAt = participant.joinedAt;
          if (room.hostSocketId === sId) {
            wasHost = true;
          }
          break;
        }
      }

      // Also check disconnected participants in grace period
      if (!existingSocketId && room.disconnectedParticipants?.has(username.toLowerCase())) {
        const disconnected = room.disconnectedParticipants.get(username.toLowerCase());
        clearTimeout(disconnected.timer);
        room.disconnectedParticipants.delete(username.toLowerCase());
        existingJoinedAt = disconnected.joinedAt;
        if (disconnected.isHost) {
          wasHost = true;
        }
      }

      if (existingSocketId) {
        room.participants.delete(existingSocketId);
        socketRooms.delete(existingSocketId);
      } else if (room.participants.size >= MAX_PARTICIPANTS) {
        return reply(ack, {
          ok: false,
          error: "This room is full.",
        });
      }

      room.participants.set(socket.id, {
        id: socket.id,
        username,
        joinedAt: existingJoinedAt,
      });

      // Ensure room has a host or restore previous host role
      if (wasHost || !room.hostSocketId || !room.participants.has(room.hostSocketId)) {
        room.hostSocketId = socket.id;
        if (mongoose.connection.readyState === 1) {
          await Room.updateOne(
            { roomCode },
            { $set: { hostUsername: username, status: "active" } }
          ).catch(() => {});
        }
      }

      socketRooms.set(socket.id, roomCode);
      await socket.join(roomCode);

      const publicRoom = getPublicRoom(room);

      reply(ack, { ok: true, room: publicRoom });
      sendRoomUpdate(room);

      console.log(`${username} reconnected to room ${roomCode}`);
    } catch (error) {
      console.error("reconnect_room error:", error);
      reply(ack, { ok: false, error: "Could not reconnect to room." });
    }
  });

  // Leave the current room.
  socket.on("leave_room", async (ack) => {
    try {
      chatRateLimits.delete(socket.id);
      reactionRateLimits.delete(socket.id);
      await leaveCurrentRoom(socket, false);
      reply(ack, { ok: true });
    } catch (error) {
      console.error("leave_room error:", error);

      reply(ack, {
        ok: false,
        error: "Could not leave room cleanly.",
      });
    }
  });

  // Host changes the video for everyone in the room
  socket.on("change_video", (payload = {}, ack) => {
    const roomCode = socketRooms.get(socket.id);
    const room = roomCode ? activeRooms.get(roomCode) : null;

    if (!room) {
      return reply(ack, {
        ok: false,
        error: "Join a room first.",
      });
    }

    if (socket.id !== room.hostSocketId) {
      return reply(ack, {
        ok: false,
        error: "Only the host can change the video.",
      });
    }

    const videoUrl = payload.videoUrl?.trim();
    const validation = validateAndNormalizeVideoUrl(videoUrl);

    if (!validation.valid) {
      return reply(ack, {
        ok: false,
        error: validation.error,
      });
    }

    const cleanVideoUrl = validation.canonicalUrl;

    const now = Date.now();

    // Check if this video matches any playlist item
    const matchingItem = (room.playlist || []).find(
      (item) => item.videoUrl === cleanVideoUrl
    );
    room.currentPlaylistId = matchingItem ? matchingItem.id : null;

    room.playback = {
      ...room.playback,
      videoUrl: cleanVideoUrl,
      position: 0,
      isPlaying: false,
      isEnded: false,
      duration: 0,
      updatedAt: now,
      version: room.playback.version + 1,
    };

    const playback = getPlaybackSnapshot(room.playback);

    io.to(room.roomCode).emit("playback_updated", playback);
    io.to(room.roomCode).emit("playlist_updated", {
      playlist: room.playlist || [],
      currentPlaylistId: room.currentPlaylistId,
    });

    return reply(ack, {
      ok: true,
      playback,
      currentPlaylistId: room.currentPlaylistId,
    });
  });

  // ------------------------------------------------
  // Synchronized playback commands
  // ------------------------------------------------

  socket.on("playback_command", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can control playback.",
        });
      }

      const { action, position, duration } = payload;

      if (!["play", "pause", "seek", "ended", "sync_progress"].includes(action)) {
        return reply(ack, {
          ok: false,
          error: "Unsupported playback action.",
        });
      }

      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        room.playback.duration = duration;
      }

      // Handle periodic progress sync heartbeat from host without bumping version or broadcasting
      if (action === "sync_progress") {
        if (
          typeof position === "number" &&
          Number.isFinite(position) &&
          position >= 0 &&
          position <= 86400
        ) {
          room.playback.position = position;
          room.playback.updatedAt = Date.now();
        }
        return reply(ack, { ok: true });
      }

      const currentPosition = getExpectedPosition(room.playback);
      let nextPosition = currentPosition;
      let nextIsPlaying = room.playback.isPlaying;
      let nextIsEnded = Boolean(room.playback.isEnded);

      if (action === "play") {
        nextIsPlaying = true;
        nextIsEnded = false;

        if (
          typeof position === "number" &&
          Number.isFinite(position) &&
          position >= 0 &&
          position <= 86400
        ) {
          nextPosition = position;
        } else if (room.playback.isEnded) {
          nextPosition = 0;
        }
      } else if (action === "pause") {
        nextIsPlaying = false;
        if (
          typeof position === "number" &&
          Number.isFinite(position) &&
          position >= 0 &&
          position <= 86400
        ) {
          nextPosition = position;
        }
      } else if (action === "seek") {
        if (
          typeof position !== "number" ||
          !Number.isFinite(position) ||
          position < 0 ||
          position > 86400
        ) {
          return reply(ack, {
            ok: false,
            error: "Invalid playback position.",
          });
        }

        nextPosition = position;
        if (room.playback.isEnded) {
          const dur = room.playback.duration || 0;
          if (dur <= 0 || position < dur - 0.5) {
            nextIsEnded = false;
          }
        }
      } else if (action === "ended") {
        const finalDuration =
          typeof duration === "number" && duration > 0
            ? duration
            : room.playback.duration || 0;

        nextPosition =
          typeof position === "number" && Number.isFinite(position) && position > 0
            ? position
            : finalDuration || currentPosition;

        nextIsPlaying = false;
        nextIsEnded = true;
      }

      room.playback = {
        ...room.playback,
        position: nextPosition,
        isPlaying: nextIsPlaying,
        isEnded: nextIsEnded,
        updatedAt: Date.now(),
        version: room.playback.version + 1,
      };

      const playback = getPlaybackSnapshot(room.playback);

      io.to(room.roomCode).emit("playback_updated", playback);

      return reply(ack, {
        ok: true,
        playback,
      });
    } catch (error) {
      console.error("playback_command error:", error);

      return reply(ack, {
        ok: false,
        error: "Could not update playback.",
      });
    }
  });

  // ------------------------------------------------
  // Real-Time Chat
  // ------------------------------------------------

  socket.on("send_chat_message", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      const participant = room.participants.get(socket.id);
      if (!participant) {
        return reply(ack, {
          ok: false,
          error: "Participant not found in room.",
        });
      }

      // Rate limit: max 5 messages per 3 seconds per socket
      if (!checkRateLimit(chatRateLimits, socket.id, 5, 3000)) {
        return reply(ack, {
          ok: false,
          error: "You are sending messages too quickly. Please slow down.",
        });
      }

      const text = cleanChatMessage(payload.text);
      if (!text) {
        return reply(ack, {
          ok: false,
          error: "Message must be between 1 and 500 valid characters.",
        });
      }

      const message = {
        id: randomUUID(),
        senderId: socket.id,
        senderName: participant.username,
        text,
        timestamp: Date.now(),
      };

      if (!room.messages) room.messages = [];
      room.messages.push(message);

      if (room.messages.length > MAX_CHAT_HISTORY) {
        room.messages.shift();
      }

      io.to(room.roomCode).emit("chat_message", message);

      return reply(ack, { ok: true, message });
    } catch (error) {
      console.error("send_chat_message error:", error);
      return reply(ack, { ok: false, error: "Could not send message." });
    }
  });

  // ------------------------------------------------
  // Live Emoji Reactions
  // ------------------------------------------------

  socket.on("send_reaction", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      const participant = room.participants.get(socket.id);
      if (!participant) {
        return reply(ack, {
          ok: false,
          error: "Participant not found in room.",
        });
      }

      // Rate limit: max 8 reactions per 3 seconds per socket
      if (!checkRateLimit(reactionRateLimits, socket.id, 8, 3000)) {
        return reply(ack, {
          ok: false,
          error: "You are reacting too fast! Take a breath.",
        });
      }

      const emoji = payload.emoji;
      if (!isValidReaction(emoji)) {
        return reply(ack, {
          ok: false,
          error: "Invalid reaction emoji.",
        });
      }

      const reaction = {
        id: randomUUID(),
        emoji,
        senderId: socket.id,
        senderName: participant.username,
        timestamp: Date.now(),
      };

      // Broadcast reaction to everyone in the room
      io.to(room.roomCode).emit("reaction_received", reaction);

      return reply(ack, { ok: true });
    } catch (error) {
      console.error("send_reaction error:", error);
      return reply(ack, { ok: false, error: "Could not broadcast reaction." });
    }
  });

  // ------------------------------------------------
  // Shared Playlist Support
  // ------------------------------------------------

  socket.on("add_to_playlist", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can add videos to the playlist.",
        });
      }

      if (!room.playlist) room.playlist = [];

      if (room.playlist.length >= MAX_PLAYLIST_ITEMS) {
        return reply(ack, {
          ok: false,
          error: `Playlist is full (maximum ${MAX_PLAYLIST_ITEMS} items).`,
        });
      }

      const validation = validateAndNormalizeVideoUrl(payload.videoUrl);
      if (!validation.valid) {
        return reply(ack, {
          ok: false,
          error: validation.error,
        });
      }

      const cleanVideoUrl = validation.canonicalUrl;
      const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
      const defaultTitle = validation.isYouTube
        ? `YouTube (${validation.videoId})`
        : `Video ${room.playlist.length + 1}`;
      const title = rawTitle.slice(0, 60) || defaultTitle;

      const participant = room.participants.get(socket.id);
      const newItem = {
        id: randomUUID(),
        title,
        videoUrl: cleanVideoUrl,
        addedBy: participant?.username ?? "Host",
        addedAt: Date.now(),
      };

      room.playlist.push(newItem);

      io.to(room.roomCode).emit("playlist_updated", {
        playlist: room.playlist,
        currentPlaylistId: room.currentPlaylistId,
      });

      return reply(ack, { ok: true, playlist: room.playlist });
    } catch (error) {
      console.error("add_to_playlist error:", error);
      return reply(ack, { ok: false, error: "Could not add video to playlist." });
    }
  });

  socket.on("remove_from_playlist", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can remove playlist items.",
        });
      }

      const itemId = payload.itemId;
      if (!itemId) {
        return reply(ack, { ok: false, error: "Item ID required." });
      }

      room.playlist = (room.playlist || []).filter((item) => item.id !== itemId);
      if (room.currentPlaylistId === itemId) {
        room.currentPlaylistId = null;
      }

      io.to(room.roomCode).emit("playlist_updated", {
        playlist: room.playlist,
        currentPlaylistId: room.currentPlaylistId,
      });

      return reply(ack, { ok: true, playlist: room.playlist });
    } catch (error) {
      console.error("remove_from_playlist error:", error);
      return reply(ack, { ok: false, error: "Could not remove item." });
    }
  });

  socket.on("reorder_playlist", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can reorder the playlist.",
        });
      }

      const { itemId, direction } = payload;
      if (!itemId || !["up", "down"].includes(direction)) {
        return reply(ack, { ok: false, error: "Invalid reorder request." });
      }

      const playlist = room.playlist || [];
      const index = playlist.findIndex((item) => item.id === itemId);

      if (index === -1) {
        return reply(ack, { ok: false, error: "Item not found in playlist." });
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= playlist.length) {
        return reply(ack, { ok: true, playlist });
      }

      const temp = playlist[index];
      playlist[index] = playlist[targetIndex];
      playlist[targetIndex] = temp;
      room.playlist = playlist;

      io.to(room.roomCode).emit("playlist_updated", {
        playlist: room.playlist,
        currentPlaylistId: room.currentPlaylistId,
      });

      return reply(ack, { ok: true, playlist: room.playlist });
    } catch (error) {
      console.error("reorder_playlist error:", error);
      return reply(ack, { ok: false, error: "Could not reorder playlist." });
    }
  });

  socket.on("play_playlist_item", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can select playlist items.",
        });
      }

      const itemId = payload.itemId;
      const item = (room.playlist || []).find((i) => i.id === itemId);

      if (!item) {
        return reply(ack, { ok: false, error: "Playlist item not found." });
      }

      const now = Date.now();
      room.currentPlaylistId = item.id;
      room.playback = {
        ...room.playback,
        videoUrl: item.videoUrl,
        position: 0,
        isPlaying: true,
        isEnded: false,
        duration: 0,
        updatedAt: now,
        version: room.playback.version + 1,
      };

      const playback = getPlaybackSnapshot(room.playback);
      io.to(room.roomCode).emit("playback_updated", playback);
      io.to(room.roomCode).emit("playlist_updated", {
        playlist: room.playlist,
        currentPlaylistId: room.currentPlaylistId,
      });

      return reply(ack, { ok: true, playback, currentPlaylistId: item.id });
    } catch (error) {
      console.error("play_playlist_item error:", error);
      return reply(ack, { ok: false, error: "Could not play playlist item." });
    }
  });

  // ------------------------------------------------
  // Lightweight Room Features: Polls
  // ------------------------------------------------

  socket.on("create_poll", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can create a poll.",
        });
      }

      const rawQuestion =
        typeof payload.question === "string" ? payload.question.trim() : "";
      if (rawQuestion.length < 3 || rawQuestion.length > 150) {
        return reply(ack, {
          ok: false,
          error: "Question must be between 3 and 150 characters.",
        });
      }

      if (
        !Array.isArray(payload.options) ||
        payload.options.length < 2 ||
        payload.options.length > 6
      ) {
        return reply(ack, {
          ok: false,
          error: "A poll must have between 2 and 6 options.",
        });
      }

      const cleanedOptions = [];
      for (const opt of payload.options) {
        if (typeof opt !== "string" || opt.trim().length === 0) {
          return reply(ack, {
            ok: false,
            error: "Poll options cannot be empty.",
          });
        }
        cleanedOptions.push({
          id: randomUUID(),
          text: opt.trim().slice(0, 60),
        });
      }

      const participant = room.participants.get(socket.id);
      room.poll = {
        id: randomUUID(),
        question: rawQuestion,
        options: cleanedOptions,
        userVotes: new Map(),
        isOpen: true,
        createdBy: participant?.username ?? "Host",
        createdAt: Date.now(),
      };

      const publicPoll = getPublicPoll(room.poll);
      io.to(room.roomCode).emit("poll_updated", publicPoll);

      return reply(ack, { ok: true, poll: publicPoll });
    } catch (error) {
      console.error("create_poll error:", error);
      return reply(ack, { ok: false, error: "Could not create poll." });
    }
  });

  socket.on("vote_poll", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      const participant = room.participants.get(socket.id);
      if (!participant) {
        return reply(ack, { ok: false, error: "Participant not found." });
      }

      if (!room.poll || !room.poll.isOpen) {
        return reply(ack, {
          ok: false,
          error: "No active poll is open for voting.",
        });
      }

      if (payload.pollId && payload.pollId !== room.poll.id) {
        return reply(ack, {
          ok: false,
          error: "Poll ID does not match active poll.",
        });
      }

      const optionIndex = Number(payload.optionIndex);
      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= room.poll.options.length
      ) {
        return reply(ack, { ok: false, error: "Invalid option selected." });
      }

      if (room.poll.userVotes.has(participant.username)) {
        return reply(ack, {
          ok: false,
          error: "You have already voted in this poll.",
        });
      }

      room.poll.userVotes.set(participant.username, optionIndex);

      const publicPoll = getPublicPoll(room.poll);
      io.to(room.roomCode).emit("poll_updated", publicPoll);

      return reply(ack, { ok: true, votedIndex: optionIndex });
    } catch (error) {
      console.error("vote_poll error:", error);
      return reply(ack, { ok: false, error: "Could not submit vote." });
    }
  });

  socket.on("close_poll", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can close the poll.",
        });
      }

      if (!room.poll) {
        return reply(ack, { ok: false, error: "No poll is active." });
      }

      room.poll.isOpen = false;

      const publicPoll = getPublicPoll(room.poll);
      io.to(room.roomCode).emit("poll_updated", publicPoll);

      return reply(ack, { ok: true, poll: publicPoll });
    } catch (error) {
      console.error("close_poll error:", error);
      return reply(ack, { ok: false, error: "Could not close poll." });
    }
  });

  socket.on("delete_poll", (payload = {}, ack) => {
    try {
      const roomCode = socketRooms.get(socket.id);
      const room = roomCode ? activeRooms.get(roomCode) : null;

      if (!room) {
        return reply(ack, {
          ok: false,
          error: "Join an active room first.",
        });
      }

      if (socket.id !== room.hostSocketId) {
        return reply(ack, {
          ok: false,
          error: "Only the host can delete the poll.",
        });
      }

      room.poll = null;
      io.to(room.roomCode).emit("poll_updated", null);

      return reply(ack, { ok: true });
    } catch (error) {
      console.error("delete_poll error:", error);
      return reply(ack, { ok: false, error: "Could not delete poll." });
    }
  });

  // Handle disconnects.
  socket.on("disconnect", async () => {
    try {
      chatRateLimits.delete(socket.id);
      reactionRateLimits.delete(socket.id);
      await leaveCurrentRoom(socket, true);
    } catch (error) {
      console.error("disconnect cleanup error:", error);
    }

    console.log(`Client disconnected: ${socket.id}`);
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    let connected = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 2000,
        });
        connected = true;
        console.log("MongoDB connected");
        break;
      } catch (err) {
        console.warn(`MongoDB connection attempt ${attempt} failed: ${err.message}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    if (!connected) {
      console.warn("MongoDB Atlas is unreachable (e.g. IP address not whitelisted). Server will continue with in-memory room management.");
    }

    const logServerStart = () => {
      const hostDisplay = process.env.HOST ? `http://${process.env.HOST}:${PORT}` : `port ${PORT}`;
      console.log(`Watch Party API running on ${hostDisplay}`);
      console.log(`Allowed CORS origins: ${getAllowedOrigins().join(", ")}`);
      console.log(`Socket.IO initialized on path: ${io.path()}`);
      console.log(`Socket.IO transports enabled: ${io.engine.opts.transports.join(", ")}`);
    };

    if (process.env.HOST) {
      httpServer.listen(PORT, process.env.HOST, logServerStart);
    } else {
      httpServer.listen(PORT, logServerStart);
    }
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
