
import { useCallback, useEffect, useRef, useState } from "react";
import "./WatchPlayer.css";
import { ReactionsOverlay, ReactionButtons } from "./components/EmojiReactions";

const DRIFT_THRESHOLD = 1.5;
const PROGRESS_INTERVAL_MS = 100;

function expectedPosition(playback) {
  if (!playback?.isPlaying) {
    return playback?.position ?? 0;
  }

  return (
    (playback.position ?? 0) +
    Math.max(0, Date.now() - playback.updatedAt) / 1000
  );
}

export default function WatchPlayer({ socket, room, isHost, onError }) {
  const videoRef = useRef(null);
  const playbackRef = useRef(room.playback);
  const pendingSeekRef = useRef(null);
  const endedVersionRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isApplyingPlaybackRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [seekDraft, setSeekDraft] = useState(
    room.playback?.position ?? 0
  );
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [currentPlayback, setCurrentPlayback] = useState(room.playback);
  const [displayPosition, setDisplayPosition] = useState(
    room.playback?.position ?? 0
  );
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [changingVideo, setChangingVideo] = useState(false);

  // Apply server playback updates without continuously forcing
  // the video to a wall-clock estimate.
  const applyPlayback = useCallback(async (state, forceSeek = false) => {
    const video = videoRef.current;

    if (!video || !state) return;

    const target = Math.max(0, expectedPosition(state));

    if (
      video.readyState >= 1 &&
      (forceSeek ||
        Math.abs(video.currentTime - target) > DRIFT_THRESHOLD)
    ) {
      try {
        isApplyingPlaybackRef.current = true;

        video.currentTime = Math.min(
          target,
          Number.isFinite(video.duration) ? video.duration : target
        );
      } catch (error) {
        console.warn("Could not seek video:", error);
      } finally {
        queueMicrotask(() => {
          isApplyingPlaybackRef.current = false;
        });
      }
    }

    if (state.isPlaying) {
      try {
        await video.play();
        setPlayerError("");
      } catch {
        setPlayerError("Playback was blocked. Press Play to retry.");
      }
    } else {
      video.pause();
    }
  }, []);

  // Synchronize room state.
  useEffect(() => {
    if (!room.playback) return;

    const state = room.playback;
    const previous = playbackRef.current;

    if (
      previous?.version != null &&
      state.version != null &&
      state.version < previous.version
    ) {
      return;
    }

    playbackRef.current = state;
    setCurrentPlayback(state);

    if (!isDraggingRef.current) {
      setSeekDraft(
        videoRef.current?.currentTime ?? expectedPosition(state)
      );
    }

    applyPlayback(state, true);
  }, [room.playback, applyPlayback]);

  // Receive playback updates from the server.
  useEffect(() => {
    function onPlaybackUpdated(state) {
      if (!state) return;

      const previous = playbackRef.current;

      if (
        previous?.version != null &&
        state.version != null &&
        state.version <= previous.version
      ) {
        return;
      }

      playbackRef.current = state;
      setCurrentPlayback(state);
      pendingSeekRef.current = null;

      if (!isDraggingRef.current) {
        setSeekDraft(state.position ?? 0);
      }

      applyPlayback(state, true);
    }

    socket.on("playback_updated", onPlaybackUpdated);

    return () => {
      socket.off("playback_updated", onPlaybackUpdated);
    };
  }, [socket, applyPlayback]);

  // The progress bar follows the actual video element.
  useEffect(() => {
    function updateProgress() {
      const video = videoRef.current;

      if (!video || isDraggingRef.current) return;

      const position = Number.isFinite(video.currentTime)
        ? video.currentTime
        : 0;

      setDisplayPosition(position);
      setSeekDraft(position);
    }

    updateProgress();

    const intervalId = setInterval(
      updateProgress,
      PROGRESS_INTERVAL_MS
    );

    return () => clearInterval(intervalId);
  }, []);

  // Send playback commands to the server.
  const sendCommand = useCallback(
    (action, position) => {
      if (!isHost) {
        onError?.("Only the host can control playback.");
        return;
      }

      socket.timeout(5000).emit(
        "playback_command",
        { action, position },
        (timeoutError, response) => {
          if (timeoutError) {
            onError?.("Playback command timed out.");
            return;
          }

          if (!response?.ok) {
            onError?.(
              response?.error || "Playback command failed."
            );
            return;
          }

          const state = response.playback;
          if (!state) return;

          const latest = playbackRef.current;

          if (
            latest?.version != null &&
            state.version != null &&
            state.version < latest.version
          ) {
            return;
          }

          playbackRef.current = state;
          setCurrentPlayback(state);

          if (!isDraggingRef.current) {
            setSeekDraft(state.position ?? 0);
          }

          applyPlayback(state, true);
        }
      );
    },
    [isHost, socket, onError, applyPlayback]
  );

  // Change the video for everyone.
  const handleChangeVideo = (event) => {
    event.preventDefault();

    if (!isHost) {
      onError?.("Only the host can change the video.");
      return;
    }

    const videoUrl = videoUrlInput.trim();

    if (!videoUrl) {
      onError?.("Please enter a video URL.");
      return;
    }

    try {
      const parsedUrl = new URL(videoUrl);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        onError?.("Only HTTP and HTTPS URLs are supported.");
        return;
      }
    } catch {
      onError?.("Please enter a valid video URL.");
      return;
    }

    setChangingVideo(true);

    socket.timeout(5000).emit(
      "change_video",
      { videoUrl },
      (timeoutError, response) => {
        setChangingVideo(false);

        if (timeoutError) {
          onError?.("The server did not respond. Please try again.");
          return;
        }

        if (!response?.ok) {
          onError?.(
            response?.error || "Could not change the video."
          );
          return;
        }

        if (response.playback) {
          const state = response.playback;

          playbackRef.current = state;
          setCurrentPlayback(state);
          setDisplayPosition(0);
          setSeekDraft(0);
          setDuration(0);
          setPlayerError("");
          setBuffering(false);
          pendingSeekRef.current = null;
          isDraggingRef.current = false;
        }

        setVideoUrlInput("");
        onError?.("");
      }
    );
  };

  function togglePlayback() {
    const current = playbackRef.current;
    const video = videoRef.current;

    if (!current) return;

    const ended =
      video?.ended ||
      (duration > 0 &&
        video &&
        video.currentTime >= duration - 0.25);

    if (ended) {
      sendCommand("play", 0);
      return;
    }

    sendCommand(current.isPlaying ? "pause" : "play");
  }

  function handleSeekChange(event) {
    const value = Number(event.target.value);

    isDraggingRef.current = true;
    setIsDragging(true);
    pendingSeekRef.current = value;

    setSeekDraft(value);
    setDisplayPosition(value);
  }

  function commitSeek() {
    setIsDragging(false);
    if (pendingSeekRef.current === null) {
      isDraggingRef.current = false;
      return;
    }

    const position = pendingSeekRef.current;

    pendingSeekRef.current = null;
    isDraggingRef.current = false;

    sendCommand("seek", position);
  }

  function handleVideoEnded() {
    setBuffering(false);
    setDisplayPosition(duration || videoRef.current?.currentTime || 0);

    if (!isHost) return;

    const state = playbackRef.current;

    if (!state || endedVersionRef.current === state.version) {
      return;
    }

    endedVersionRef.current = state.version;

    const video = videoRef.current;
    const finalPosition = video?.duration;

    sendCommand(
      "ended",
      Number.isFinite(finalPosition)
        ? finalPosition
        : video?.currentTime ?? 0
    );
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  const videoPosition = isDragging
    ? seekDraft
    : displayPosition;

  const safeDuration = Number.isFinite(duration)
    ? Math.max(duration, 1)
    : 1;

  const boundedPosition = Math.min(
    Math.max(videoPosition, 0),
    safeDuration
  );

  return (
    <section className="player-panel">
      <div className="player-heading">
        <div>
          <p className="player-eyebrow">NOW WATCHING</p>
          <h2>Shared video</h2>
        </div>

        <span className={isHost ? "player-role host" : "player-role"}>
          {isHost ? "HOST CONTROLS" : "VIEWER"}
        </span>
      </div>

      {isHost && (
        <form
          className="video-url-form"
          onSubmit={handleChangeVideo}
        >
          <label htmlFor="video-url">
            Change video for everyone
          </label>

          <div className="video-url-controls">
            <input
              id="video-url"
              type="url"
              value={videoUrlInput}
              onChange={(event) =>
                setVideoUrlInput(event.target.value)
              }
              placeholder="Paste a direct MP4 video URL"
              required
            />

            <button type="submit" disabled={changingVideo}>
              {changingVideo ? "Changing..." : "Change Video"}
            </button>
          </div>

          <p>Use a direct video URL supported by your browser.</p>
        </form>
      )}

      <div className="video-frame">
        <video
          ref={videoRef}
          src={currentPlayback?.videoUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;

            setDuration(
              Number.isFinite(video.duration) ? video.duration : 0
            );

            applyPlayback(playbackRef.current, true);
          }}
          onDurationChange={(event) => {
            const video = event.currentTarget;

            setDuration(
              Number.isFinite(video.duration) ? video.duration : 0
            );
          }}
          onTimeUpdate={(event) => {
            if (
              isDraggingRef.current ||
              isApplyingPlaybackRef.current
            ) {
              return;
            }

            const video = event.currentTarget;

            const position = Number.isFinite(video.currentTime)
              ? video.currentTime
              : 0;

            setDisplayPosition(position);
            setSeekDraft(position);
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={handleVideoEnded}
          onError={() => {
            setBuffering(false);
            setPlayerError("The video could not be loaded.");
          }}
        />

        <ReactionsOverlay socket={socket} />

        {buffering && (
          <div className="video-overlay">Buffering...</div>
        )}

        {playerError && (
          <div className="video-overlay video-error">
            {playerError}
          </div>
        )}
      </div>

      <div className="player-controls">
        <div className="playback-buttons">
          <button
            className="player-button primary"
            onClick={togglePlayback}
            disabled={!isHost}
            title={
              isHost
                ? "Play or pause"
                : "Only the host can control playback"
            }
          >
            {currentPlayback?.isPlaying ? "Pause" : "Play"}
          </button>

          <span className="playback-status">
            {currentPlayback?.isPlaying ? "Playing" : "Paused"}
          </span>
        </div>

        <div className="seek-row">
          <span>{formatTime(boundedPosition)}</span>

          <input
            type="range"
            min="0"
            max={safeDuration}
            step="0.1"
            value={boundedPosition}
            onChange={handleSeekChange}
            onPointerUp={commitSeek}
            onPointerCancel={commitSeek}
            onKeyUp={(event) => {
              if (
                event.key.startsWith("Arrow") ||
                event.key === "Home" ||
                event.key === "End"
              ) {
                commitSeek();
              }
            }}
            onBlur={commitSeek}
            disabled={!isHost || duration <= 0}
            aria-label="Seek through video"
          />

          <span>{formatTime(duration)}</span>
        </div>

        {!isHost && (
          <p className="viewer-note">
            Playback is controlled by the room host.
          </p>
        )}
      </div>

      <ReactionButtons socket={socket} onError={onError} />
    </section>
  );
}
