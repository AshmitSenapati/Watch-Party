import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./WatchPlayer.css";
import { ReactionsOverlay, ReactionButtons } from "./components/EmojiReactions";
import {
  parseYouTubeVideoId,
  isYouTubeUrl,
  loadYouTubeIFrameAPI,
  getYouTubeErrorMessage,
} from "./utils/youtube";

const DRIFT_THRESHOLD = 1.5;
const PROGRESS_INTERVAL_MS = 100;

function expectedPosition(playback) {
  if (!playback?.isPlaying || playback?.isEnded) {
    return playback?.position ?? 0;
  }

  const raw =
    (playback.position ?? 0) +
    Math.max(0, Date.now() - playback.updatedAt) / 1000;

  if (typeof playback.duration === "number" && playback.duration > 0) {
    return Math.min(raw, playback.duration);
  }
  return raw;
}

export default function WatchPlayer({ socket, room, isHost, onError }) {
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const isYtReadyRef = useRef(false);
  const ytVideoIdRef = useRef(null);

  const playbackRef = useRef(room.playback);
  const pendingSeekRef = useRef(null);
  const lastSeekTimeRef = useRef(0);
  const playPendingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isApplyingPlaybackRef = useRef(false);

  const [inputSourceType, setInputSourceType] = useState("youtube");
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [inputValidationError, setInputValidationError] = useState("");

  const [isDragging, setIsDragging] = useState(false);
  const [seekDraft, setSeekDraft] = useState(
    room.playback?.position ?? 0
  );
  const [mediaDuration, setMediaDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState(room.playback);
  const [displayPosition, setDisplayPosition] = useState(
    room.playback?.position ?? 0
  );
  const [changingVideo, setChangingVideo] = useState(false);

  const duration =
    mediaDuration > 0
      ? mediaDuration
      : typeof currentPlayback?.duration === "number" &&
        currentPlayback.duration > 0
      ? currentPlayback.duration
      : 0;

  // Determine if current video is a YouTube video
  const youtubeVideoId = useMemo(
    () => parseYouTubeVideoId(currentPlayback?.videoUrl),
    [currentPlayback?.videoUrl]
  );
  const isYouTube = Boolean(youtubeVideoId);

  // 1. Apply YouTube playback state
  const applyYouTubePlayback = useCallback(
    (state, forceSeek = false) => {
      const yt = ytPlayerRef.current;
      if (!yt || !isYtReadyRef.current || !state) return;

      isApplyingPlaybackRef.current = true;

      try {
        const currentTime =
          typeof yt.getCurrentTime === "function" ? yt.getCurrentTime() : 0;
        const playerDuration =
          typeof yt.getDuration === "function" ? yt.getDuration() : 0;

        const effectiveDuration =
          playerDuration > 0
            ? playerDuration
            : state.duration > 0
            ? state.duration
            : duration;

        // If the video has ended: pause it and pin to duration, DO NOT seek or loop
        if (state.isEnded) {
          try {
            const pState =
              typeof yt.getPlayerState === "function"
                ? yt.getPlayerState()
                : -1;
            if (
              window.YT &&
              pState !== window.YT.PlayerState.PAUSED &&
              pState !== window.YT.PlayerState.ENDED
            ) {
              yt.pauseVideo();
            }
          } catch {
            /* ignore */
          }
          const endPos =
            effectiveDuration > 0 ? effectiveDuration : state.position || 0;
          setDisplayPosition(endPos);
          setSeekDraft(endPos);
          setBuffering(false);
          return;
        }

        const target = Math.max(0, expectedPosition(state));
        const drift = Math.abs(currentTime - target);
        const now = Date.now();
        const canSeekDrift =
          !isHost && now - lastSeekTimeRef.current > 3000;

        if (forceSeek || (drift > DRIFT_THRESHOLD && canSeekDrift)) {
          const seekTarget =
            effectiveDuration > 0
              ? Math.min(target, effectiveDuration)
              : target;
          yt.seekTo(seekTarget, true);
          lastSeekTimeRef.current = now;
          setDisplayPosition(seekTarget);
          if (!isDraggingRef.current) {
            setSeekDraft(seekTarget);
          }
        }

        if (state.isPlaying) {
          const playerState =
            typeof yt.getPlayerState === "function"
              ? yt.getPlayerState()
              : -1;
          if (
            window.YT &&
            playerState !== window.YT.PlayerState.PLAYING &&
            playerState !== window.YT.PlayerState.BUFFERING
          ) {
            yt.playVideo();
          }
          setPlayerError("");
        } else {
          const playerState =
            typeof yt.getPlayerState === "function"
              ? yt.getPlayerState()
              : -1;
          if (
            window.YT &&
            playerState !== window.YT.PlayerState.PAUSED &&
            playerState !== window.YT.PlayerState.CUED &&
            playerState !== window.YT.PlayerState.ENDED
          ) {
            yt.pauseVideo();
          }
        }
      } catch (error) {
        console.warn("Could not apply YouTube playback:", error);
      } finally {
        setTimeout(() => {
          isApplyingPlaybackRef.current = false;
        }, 500);
      }
    },
    [duration, isHost]
  );

  // 2. Apply playback updates to whichever player is active
  const applyPlayback = useCallback(
    (state, forceSeek = false) => {
      if (!state) return;

      const ytId = parseYouTubeVideoId(state.videoUrl);
      if (ytId) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        applyYouTubePlayback(state, forceSeek);
        return;
      }

      // Pause YouTube player if active
      if (ytPlayerRef.current && isYtReadyRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          /* ignore */
        }
      }

      const video = videoRef.current;
      if (!video) return;

      const effectiveDuration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : state.duration > 0
          ? state.duration
          : duration;

      // If the video has ended: pause it and pin to duration, DO NOT seek or loop
      if (state.isEnded) {
        video.pause();
        const endPos =
          effectiveDuration > 0 ? effectiveDuration : state.position || 0;
        setDisplayPosition(endPos);
        setSeekDraft(endPos);
        setBuffering(false);
        return;
      }

      const target = Math.max(0, expectedPosition(state));
      const drift = Math.abs(video.currentTime - target);
      const now = Date.now();
      const canSeekDrift =
        !isHost && now - lastSeekTimeRef.current > 3000;

      if (
        video.readyState >= 1 &&
        (forceSeek || (drift > DRIFT_THRESHOLD && canSeekDrift))
      ) {
        try {
          isApplyingPlaybackRef.current = true;
          video.currentTime = Math.min(
            target,
            effectiveDuration > 0 ? effectiveDuration : target
          );
          lastSeekTimeRef.current = now;
        } catch (error) {
          console.warn("Could not seek video:", error);
        } finally {
          setTimeout(() => {
            isApplyingPlaybackRef.current = false;
          }, 300);
        }
      }

      if (state.isPlaying) {
        if (video.readyState >= 2) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                setAutoplayBlocked(false);
                setPlayerError("");
              })
              .catch((err) => {
                if (err.name === "AbortError") {
                  return; // Expected if pause immediately interrupted play
                }
                if (err.name === "NotAllowedError") {
                  setAutoplayBlocked(true);
                  return;
                }
                setPlayerError(
                  "Playback error: " + (err.message || "Failed to play.")
                );
              });
          }
        } else {
          // Media not ready yet, queue play for onCanPlay / onLoadedMetadata
          playPendingRef.current = true;
        }
      } else {
        playPendingRef.current = false;
        video.pause();
      }
    },
    [applyYouTubePlayback, duration, isHost]
  );

  // 3. Send playback commands to the server
  const sendCommand = useCallback(
    (action, position, durationParam) => {
      if (!isHost) {
        onError?.("Only the host can control playback.");
        return;
      }

      const dur =
        durationParam ||
        duration ||
        playbackRef.current?.duration ||
        0;

      socket.timeout(5000).emit(
        "playback_command",
        { action, position, duration: dur },
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

          applyPlayback(state, action === "seek");
        }
      );
    },
    [isHost, socket, onError, applyPlayback, duration]
  );

  // 4. Handle video ending
  const handleVideoEnded = useCallback(() => {
    setBuffering(false);
    const endPosition =
      duration > 0
        ? duration
        : displayPosition || playbackRef.current?.position || 0;

    setDisplayPosition(endPosition);
    setSeekDraft(endPosition);

    if (!isHost) return;

    const state = playbackRef.current;
    if (!state || state.isEnded) {
      return;
    }

    // Immediately mark local ended state to prevent auto-restart feedback loops
    playbackRef.current = {
      ...state,
      isEnded: true,
      isPlaying: false,
      position: endPosition,
    };
    setCurrentPlayback(playbackRef.current);

    sendCommand("ended", endPosition, duration);
  }, [isHost, duration, displayPosition, sendCommand]);

  // 5. Handle YouTube Player state changes
  const handleYouTubeStateChange = useCallback(
    (event) => {
      const ytState = event.data;
      const YT = window.YT;
      if (!YT) return;

      if (ytState === YT.PlayerState.BUFFERING) {
        setBuffering(true);
        return;
      }
      setBuffering(false);

      if (isApplyingPlaybackRef.current) {
        return;
      }

      try {
        const dur = event.target.getDuration();
        if (Number.isFinite(dur) && dur > 0) {
          setMediaDuration(dur);
        }
      } catch {
        /* ignore */
      }

      if (ytState === YT.PlayerState.ENDED) {
        handleVideoEnded();
        return;
      }

      // If playback is ended, suppress auto-restart loop
      if (playbackRef.current?.isEnded) {
        if (ytState === YT.PlayerState.PLAYING) {
          try {
            event.target.pauseVideo();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // Viewers never broadcast commands or fight the player
      if (!isHost) {
        return;
      }

      const current = playbackRef.current;
      const currentTime =
        typeof event.target.getCurrentTime === "function"
          ? event.target.getCurrentTime()
          : 0;

      if (ytState === YT.PlayerState.PLAYING) {
        if (!current?.isPlaying) {
          sendCommand("play", currentTime, duration);
        }
      } else if (ytState === YT.PlayerState.PAUSED) {
        if (current?.isPlaying) {
          sendCommand("pause", currentTime, duration);
        }
      }
    },
    [isHost, sendCommand, handleVideoEnded, duration]
  );

  // Initialize and update YouTube IFrame Player
  useEffect(() => {
    if (!isYouTube || !youtubeVideoId) {
      if (ytPlayerRef.current && isYtReadyRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    let isMounted = true;

    loadYouTubeIFrameAPI()
      .then((YT) => {
        if (!isMounted) return;

        // If player already exists, check if video changed
        if (ytPlayerRef.current && isYtReadyRef.current) {
          if (ytVideoIdRef.current !== youtubeVideoId) {
            ytVideoIdRef.current = youtubeVideoId;
            setPlayerError("");
            setBuffering(true);
            const targetPos = Math.max(
              0,
              expectedPosition(playbackRef.current)
            );
            const shouldPlay = Boolean(playbackRef.current?.isPlaying);

            try {
              if (shouldPlay) {
                ytPlayerRef.current.loadVideoById({
                  videoId: youtubeVideoId,
                  startSeconds: targetPos,
                });
              } else {
                ytPlayerRef.current.cueVideoById({
                  videoId: youtubeVideoId,
                  startSeconds: targetPos,
                });
              }
            } catch (err) {
              console.warn("Could not switch YouTube video:", err);
            }
          }
          return;
        }

        // Initialize new YouTube Player
        if (!ytContainerRef.current) return;

        const targetPos = Math.max(
          0,
          expectedPosition(playbackRef.current)
        );
        const shouldPlay = Boolean(playbackRef.current?.isPlaying);

        ytPlayerRef.current = new YT.Player(ytContainerRef.current, {
          videoId: youtubeVideoId,
          playerVars: {
            autoplay: shouldPlay ? 1 : 0,
            start: Math.floor(targetPos),
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (!isMounted) return;
              isYtReadyRef.current = true;
              ytVideoIdRef.current = youtubeVideoId;
              setBuffering(false);
              setPlayerError("");

              try {
                const dur = event.target.getDuration();
                if (Number.isFinite(dur) && dur > 0) {
                  setMediaDuration(dur);
                }
              } catch {
                /* ignore */
              }

              applyYouTubePlayback(playbackRef.current, true);
            },
            onStateChange: handleYouTubeStateChange,
            onError: (event) => {
              if (!isMounted) return;
              setBuffering(false);
              const errorMsg = getYouTubeErrorMessage(event.data);
              setPlayerError(errorMsg);
              onError?.(errorMsg);
            },
          },
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setPlayerError(
          "Failed to load YouTube IFrame API. Please check your network connection."
        );
        onError?.("Failed to load YouTube IFrame API.");
        console.error(err);
      });

    return () => {
      isMounted = false;
    };
  }, [
    isYouTube,
    youtubeVideoId,
    applyYouTubePlayback,
    handleYouTubeStateChange,
    onError,
  ]);

  // Cleanup YouTube Player on unmount
  useEffect(() => {
    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
        isYtReadyRef.current = false;
        ytVideoIdRef.current = null;
      }
    };
  }, []);

  // Synchronize room state
  useEffect(() => {
    if (!room.playback) return;

    const state = room.playback;
    const previous = playbackRef.current;

    const isNewer =
      previous?.version == null ||
      (state.version != null && state.version > previous.version);
    const isUrlChange = state.videoUrl !== previous?.videoUrl;

    if (!isNewer && !isUrlChange) {
      return;
    }

    playbackRef.current = state;
    setCurrentPlayback(state);

    if (!isDraggingRef.current) {
      setSeekDraft(state.position ?? 0);
    }

    applyPlayback(state, isUrlChange);
  }, [room.playback, applyPlayback]);

  // Receive playback updates from the server
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

      const isUrlChange = state.videoUrl !== previous?.videoUrl;
      const isExplicitSeek =
        !state.isEnded &&
        !isUrlChange &&
        previous &&
        Math.abs(state.position - expectedPosition(previous)) > 2.0;

      playbackRef.current = state;
      setCurrentPlayback(state);
      pendingSeekRef.current = null;

      if (!isDraggingRef.current) {
        setSeekDraft(state.position ?? 0);
      }

      applyPlayback(state, isUrlChange || isExplicitSeek);
    }

    socket.on("playback_updated", onPlaybackUpdated);

    return () => {
      socket.off("playback_updated", onPlaybackUpdated);
    };
  }, [socket, applyPlayback]);

  // Host periodic progress sync to server
  useEffect(() => {
    if (!isHost) return;

    const intervalId = setInterval(() => {
      const current = playbackRef.current;
      if (!current?.isPlaying || current?.isEnded) return;

      let pos = 0;
      if (isYouTube) {
        const yt = ytPlayerRef.current;
        if (
          yt &&
          isYtReadyRef.current &&
          typeof yt.getCurrentTime === "function"
        ) {
          pos = yt.getCurrentTime() || 0;
        }
      } else {
        const video = videoRef.current;
        if (video) {
          pos = video.currentTime || 0;
        }
      }

      if (pos > 0) {
        socket.emit("playback_command", {
          action: "sync_progress",
          position: pos,
          duration: duration || current.duration || 0,
        });
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isHost, isYouTube, socket, duration]);

  // Unified progress tracking & smooth UI update
  useEffect(() => {
    function updateProgress() {
      if (isDraggingRef.current) return;

      const current = playbackRef.current;

      if (current?.isEnded) {
        const endPos =
          duration > 0 ? duration : current.position || 0;
        setDisplayPosition(endPos);
        setSeekDraft(endPos);
        return;
      }

      if (isYouTube) {
        const yt = ytPlayerRef.current;
        if (!yt || !isYtReadyRef.current) {
          if (current?.isPlaying) {
            const exp = expectedPosition(current);
            const capped = duration > 0 ? Math.min(exp, duration) : exp;
            setDisplayPosition(capped);
            setSeekDraft(capped);
          }
          return;
        }

        try {
          const time =
            typeof yt.getCurrentTime === "function"
              ? yt.getCurrentTime()
              : 0;
          const dur =
            typeof yt.getDuration === "function" ? yt.getDuration() : 0;

          if (Number.isFinite(dur) && dur > 0) {
            setMediaDuration((prev) => (prev !== dur ? dur : prev));
          }

          if (Number.isFinite(time)) {
            setDisplayPosition(time);
            setSeekDraft(time);
          }

          // Viewer-only drift correction with cooldown
          if (
            !isHost &&
            current?.isPlaying &&
            !isApplyingPlaybackRef.current &&
            Number.isFinite(time) &&
            !buffering
          ) {
            const target = expectedPosition(current);
            const drift = Math.abs(time - target);
            const now = Date.now();
            if (
              drift > DRIFT_THRESHOLD &&
              now - lastSeekTimeRef.current > 3500
            ) {
              isApplyingPlaybackRef.current = true;
              lastSeekTimeRef.current = now;
              yt.seekTo(target, true);
              setTimeout(() => {
                isApplyingPlaybackRef.current = false;
              }, 400);
            }
          }
        } catch {
          /* ignore */
        }
      } else {
        const video = videoRef.current;
        if (!video) {
          if (current?.isPlaying) {
            const exp = expectedPosition(current);
            const capped = duration > 0 ? Math.min(exp, duration) : exp;
            setDisplayPosition(capped);
            setSeekDraft(capped);
          }
          return;
        }

        const position = Number.isFinite(video.currentTime)
          ? video.currentTime
          : 0;

        setDisplayPosition(position);
        setSeekDraft(position);

        if (Number.isFinite(video.duration) && video.duration > 0) {
          setMediaDuration((prev) =>
            prev !== video.duration ? video.duration : prev
          );
        }

        // Viewer-only drift correction with cooldown for HTML5
        if (
          !isHost &&
          current?.isPlaying &&
          !isApplyingPlaybackRef.current &&
          video.readyState >= 3 &&
          !buffering
        ) {
          const target = expectedPosition(current);
          const drift = Math.abs(position - target);
          const now = Date.now();
          if (
            drift > DRIFT_THRESHOLD &&
            now - lastSeekTimeRef.current > 3500
          ) {
            isApplyingPlaybackRef.current = true;
            lastSeekTimeRef.current = now;
            video.currentTime = target;
            setTimeout(() => {
              isApplyingPlaybackRef.current = false;
            }, 300);
          }
        }
      }
    }

    updateProgress();
    const intervalId = setInterval(updateProgress, PROGRESS_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isYouTube, isHost, duration, buffering]);

  // Load YouTube Video Form Submission
  const handleLoadYouTubeVideo = (event) => {
    event.preventDefault();

    if (!isHost) {
      onError?.("Only the host can change the video.");
      return;
    }

    const rawUrl = youtubeUrlInput.trim();
    if (!rawUrl) {
      setInputValidationError("Please enter a YouTube video URL.");
      return;
    }

    // Disallow HTML tags or arbitrary iframe injection
    if (/<[a-z][\s\S]*>/i.test(rawUrl)) {
      setInputValidationError(
        "HTML tags or iframe snippets are not allowed. Please enter a valid YouTube video URL."
      );
      return;
    }

    const videoId = parseYouTubeVideoId(rawUrl);
    if (!videoId) {
      setInputValidationError(
        "Invalid YouTube URL or unsupported video ID. Supported formats: watch?v=ID, youtu.be/ID, embed/ID, shorts/ID (with 11-character video ID)."
      );
      return;
    }

    setInputValidationError("");
    setChangingVideo(true);

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    socket.timeout(5000).emit(
      "change_video",
      { videoUrl: canonicalUrl },
      (timeoutError, response) => {
        setChangingVideo(false);

        if (timeoutError) {
          onError?.("The server did not respond. Please try again.");
          return;
        }

        if (!response?.ok) {
          onError?.(response?.error || "Could not change the video.");
          return;
        }

        if (response.playback) {
          const state = response.playback;
          playbackRef.current = state;
          setCurrentPlayback(state);
          setDisplayPosition(0);
          setSeekDraft(0);
          setMediaDuration(0);
          setPlayerError("");
          setBuffering(false);
          pendingSeekRef.current = null;
          isDraggingRef.current = false;
        }

        setYoutubeUrlInput("");
        onError?.("");
      }
    );
  };

  // Change Direct MP4 Video Form Submission
  const handleChangeDirectVideo = (event) => {
    event.preventDefault();

    if (!isHost) {
      onError?.("Only the host can change the video.");
      return;
    }

    const videoUrl = videoUrlInput.trim();
    if (!videoUrl) {
      setInputValidationError("Please enter a video URL.");
      return;
    }

    // If host pasted a YouTube URL in direct mode, handle it seamlessly
    if (isYouTubeUrl(videoUrl)) {
      const ytId = parseYouTubeVideoId(videoUrl);
      if (ytId) {
        setYoutubeUrlInput(videoUrl);
        setInputSourceType("youtube");
      }
    }

    try {
      const parsedUrl = new URL(videoUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        setInputValidationError(
          "Only HTTP and HTTPS URLs are supported."
        );
        return;
      }
    } catch {
      setInputValidationError("Please enter a valid video URL.");
      return;
    }

    setInputValidationError("");
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
          onError?.(response?.error || "Could not change the video.");
          return;
        }

        if (response.playback) {
          const state = response.playback;
          playbackRef.current = state;
          setCurrentPlayback(state);
          setDisplayPosition(0);
          setSeekDraft(0);
          setMediaDuration(0);
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

  function handleUnblockAutoplay() {
    setAutoplayBlocked(false);
    setPlayerError("");

    if (isYouTube) {
      const yt = ytPlayerRef.current;
      if (yt && isYtReadyRef.current) {
        try {
          yt.playVideo();
        } catch {
          /* ignore */
        }
      }
    } else {
      const video = videoRef.current;
      if (video) {
        video.play().catch(() => {});
      }
    }
  }

  function togglePlayback() {
    const current = playbackRef.current;
    if (!current || !isHost) return;

    if (current.isEnded) {
      // Replay intentionally from beginning
      sendCommand("play", 0, duration);
      return;
    }

    let currentPos = 0;
    if (isYouTube) {
      const yt = ytPlayerRef.current;
      if (yt && isYtReadyRef.current) {
        try {
          currentPos = yt.getCurrentTime() || 0;
        } catch {
          /* ignore */
        }
      }
    } else {
      const video = videoRef.current;
      currentPos = video?.currentTime ?? current.position ?? 0;
    }

    sendCommand(
      current.isPlaying ? "pause" : "play",
      currentPos,
      duration
    );
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

    sendCommand("seek", position, duration);
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = safe % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        remainder
      ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  const videoPosition = isDragging ? seekDraft : displayPosition;

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
          <h2>{isYouTube ? "YouTube Video" : "Shared Video"}</h2>
        </div>

        <span className={isHost ? "player-role host" : "player-role"}>
          {isHost ? "HOST CONTROLS" : "VIEWER"}
        </span>
      </div>

      {isHost && (
        <div className="video-url-form-container">
          <div className="source-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={inputSourceType === "youtube"}
              className={`source-tab-btn ${
                inputSourceType === "youtube" ? "active" : ""
              }`}
              onClick={() => {
                setInputSourceType("youtube");
                setInputValidationError("");
              }}
            >
              📺 YouTube Video
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputSourceType === "direct"}
              className={`source-tab-btn ${
                inputSourceType === "direct" ? "active" : ""
              }`}
              onClick={() => {
                setInputSourceType("direct");
                setInputValidationError("");
              }}
            >
              🎬 Direct Video (MP4)
            </button>
          </div>

          {inputSourceType === "youtube" ? (
            <form
              className="video-url-form"
              onSubmit={handleLoadYouTubeVideo}
            >
              <label htmlFor="youtube-url-input">
                Load YouTube video for everyone
              </label>

              <div className="video-url-controls">
                <input
                  id="youtube-url-input"
                  type="text"
                  value={youtubeUrlInput}
                  onChange={(event) => {
                    setYoutubeUrlInput(event.target.value);
                    setInputValidationError("");
                  }}
                  placeholder="Paste YouTube link (watch, youtu.be, shorts, embed)"
                  disabled={changingVideo}
                  required
                />

                <button
                  type="submit"
                  disabled={changingVideo || !youtubeUrlInput.trim()}
                >
                  {changingVideo
                    ? "Loading..."
                    : "Load YouTube Video"}
                </button>
              </div>

              {inputValidationError && (
                <p className="input-validation-error">
                  {inputValidationError}
                </p>
              )}

              <p className="video-url-hint">
                Supports standard <code>watch?v=...</code>,{" "}
                <code>youtu.be/...</code>, <code>shorts/...</code>, and{" "}
                <code>embed/...</code> links.
              </p>
            </form>
          ) : (
            <form
              className="video-url-form"
              onSubmit={handleChangeDirectVideo}
            >
              <label htmlFor="direct-video-url">
                Change direct video for everyone
              </label>

              <div className="video-url-controls">
                <input
                  id="direct-video-url"
                  type="url"
                  value={videoUrlInput}
                  onChange={(event) => {
                    setVideoUrlInput(event.target.value);
                    setInputValidationError("");
                  }}
                  placeholder="Paste a direct MP4 video URL"
                  disabled={changingVideo}
                  required
                />

                <button
                  type="submit"
                  disabled={changingVideo || !videoUrlInput.trim()}
                >
                  {changingVideo ? "Changing..." : "Change Video"}
                </button>
              </div>

              {inputValidationError && (
                <p className="input-validation-error">
                  {inputValidationError}
                </p>
              )}

              <p className="video-url-hint">
                Use a direct video URL supported by your browser (e.g. MP4 or WebM).
              </p>
            </form>
          )}
        </div>
      )}

      <div className="video-frame">
        {/* YouTube Player Container */}
        <div
          className="yt-player-container"
          style={{ display: isYouTube ? "block" : "none" }}
        >
          <div
            id="yt-player-target"
            ref={ytContainerRef}
            className="yt-player-target"
          />
        </div>

        {/* Direct HTML5 Video Player */}
        <video
          ref={videoRef}
          src={!isYouTube ? currentPlayback?.videoUrl : undefined}
          playsInline
          preload="auto"
          style={{ display: !isYouTube ? "block" : "none" }}
          onClick={isHost ? togglePlayback : handleUnblockAutoplay}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const dur = Number.isFinite(video.duration) ? video.duration : 0;
            if (dur > 0) {
              setMediaDuration(dur);
            }
            applyPlayback(playbackRef.current, true);
          }}
          onDurationChange={(event) => {
            const video = event.currentTarget;
            const dur = Number.isFinite(video.duration) ? video.duration : 0;
            if (dur > 0) {
              setMediaDuration(dur);
            }
          }}
          onCanPlay={() => {
            setBuffering(false);
            if (
              playPendingRef.current &&
              playbackRef.current?.isPlaying &&
              !playbackRef.current?.isEnded
            ) {
              playPendingRef.current = false;
              videoRef.current
                ?.play()
                .then(() => {
                  setAutoplayBlocked(false);
                  setPlayerError("");
                })
                .catch((err) => {
                  if (err.name === "AbortError") return;
                  if (err.name === "NotAllowedError") {
                    setAutoplayBlocked(true);
                    return;
                  }
                  setPlayerError(
                    "Playback error: " + (err.message || "Failed to play.")
                  );
                });
            }
          }}
          onSeeked={() => {
            isApplyingPlaybackRef.current = false;
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
          onPlaying={() => {
            setBuffering(false);
            setAutoplayBlocked(false);
          }}
          onPause={() => setBuffering(false)}
          onEnded={handleVideoEnded}
          onError={() => {
            if (!isYouTube) {
              setBuffering(false);
              setPlayerError(
                "The video could not be loaded or the format is unsupported."
              );
            }
          }}
        />

        <ReactionsOverlay socket={socket} />

        {buffering && (
          <div className="video-overlay">Buffering...</div>
        )}

        {autoplayBlocked && (
          <div
            className="video-overlay autoplay-overlay"
            onClick={handleUnblockAutoplay}
          >
            <div className="autoplay-card">
              <span className="autoplay-icon">▶</span>
              <p className="autoplay-title">
                Playback is paused by your browser
              </p>
              <button
                type="button"
                className="player-button primary autoplay-btn"
                onClick={handleUnblockAutoplay}
              >
                Click to Sync &amp; Watch
              </button>
            </div>
          </div>
        )}

        {playerError && (
          <div className="video-overlay video-error">
            <div className="video-error-card">
              <span className="error-icon">⚠️</span>
              <p className="error-text">{playerError}</p>
              {isHost ? (
                <p className="error-subtext">
                  You can paste another YouTube or MP4 video URL above.
                </p>
              ) : (
                <p className="error-subtext">
                  Waiting for the room host to select an available video.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="player-controls">
        <div className="playback-buttons">
          <button
            className={`player-button primary ${
              currentPlayback?.isEnded ? "replay" : ""
            }`}
            onClick={togglePlayback}
            disabled={!isHost}
            title={
              isHost
                ? currentPlayback?.isEnded
                  ? "Replay video from start"
                  : currentPlayback?.isPlaying
                  ? "Pause playback"
                  : "Start playback"
                : "Only the host can control playback"
            }
          >
            {currentPlayback?.isEnded
              ? "Replay"
              : currentPlayback?.isPlaying
              ? "Pause"
              : "Play"}
          </button>

          <span className="playback-status">
            {currentPlayback?.isEnded
              ? "Ended"
              : currentPlayback?.isPlaying
              ? "Playing"
              : "Paused"}
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
