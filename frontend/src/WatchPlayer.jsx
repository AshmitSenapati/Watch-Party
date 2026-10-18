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
  const ytPlayerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const isYtReadyRef = useRef(false);
  const ytVideoIdRef = useRef(null);

  const playbackRef = useRef(room.playback);
  const pendingSeekRef = useRef(null);
  const endedVersionRef = useRef(null);
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
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [currentPlayback, setCurrentPlayback] = useState(room.playback);
  const [displayPosition, setDisplayPosition] = useState(
    room.playback?.position ?? 0
  );
  const [changingVideo, setChangingVideo] = useState(false);

  // Determine if current video is a YouTube video
  const youtubeVideoId = useMemo(
    () => parseYouTubeVideoId(currentPlayback?.videoUrl),
    [currentPlayback?.videoUrl]
  );
  const isYouTube = Boolean(youtubeVideoId);

  // 1. Apply YouTube playback state
  const applyYouTubePlayback = useCallback((state, forceSeek = false) => {
    const yt = ytPlayerRef.current;
    if (!yt || !isYtReadyRef.current || !state) return;

    const target = Math.max(0, expectedPosition(state));
    isApplyingPlaybackRef.current = true;

    try {
      const currentTime =
        typeof yt.getCurrentTime === "function" ? yt.getCurrentTime() : 0;
      const playerDuration =
        typeof yt.getDuration === "function" ? yt.getDuration() : 0;

      if (Number.isFinite(playerDuration) && playerDuration > 0) {
        setDuration(playerDuration);
      }

      const drift = Math.abs(currentTime - target);
      if (forceSeek || drift > DRIFT_THRESHOLD) {
        const seekTarget =
          playerDuration > 0 ? Math.min(target, playerDuration) : target;
        yt.seekTo(seekTarget, true);
        setDisplayPosition(seekTarget);
        setSeekDraft(seekTarget);
      }

      if (state.isPlaying) {
        const playerState =
          typeof yt.getPlayerState === "function" ? yt.getPlayerState() : -1;
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
          typeof yt.getPlayerState === "function" ? yt.getPlayerState() : -1;
        if (
          window.YT &&
          playerState !== window.YT.PlayerState.PAUSED &&
          playerState !== window.YT.PlayerState.CUED
        ) {
          yt.pauseVideo();
        }
      }
    } catch (error) {
      console.warn("Could not apply YouTube playback:", error);
    } finally {
      setTimeout(() => {
        isApplyingPlaybackRef.current = false;
      }, 400);
    }
  }, []);

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

      const target = Math.max(0, expectedPosition(state));

      if (
        video.readyState >= 1 &&
        (forceSeek || Math.abs(video.currentTime - target) > DRIFT_THRESHOLD)
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
        video
          .play()
          .then(() => {
            setPlayerError("");
          })
          .catch(() => {
            setPlayerError("Playback was blocked. Press Play to retry.");
          });
      } else {
        video.pause();
      }
    },
    [applyYouTubePlayback]
  );

  // 3. Send playback commands to the server
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

  // 4. Handle video ending
  const handleVideoEnded = useCallback(() => {
    setBuffering(false);
    setDisplayPosition(duration || displayPosition || 0);

    if (!isHost) return;

    const state = playbackRef.current;
    if (!state || endedVersionRef.current === state.version) {
      return;
    }

    endedVersionRef.current = state.version;
    sendCommand("ended", duration || 0);
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
          setDuration(dur);
        }
      } catch {
        /* ignore */
      }

      if (ytState === YT.PlayerState.ENDED) {
        handleVideoEnded();
        return;
      }

      // If viewer, keep local player aligned with authoritative room state
      if (!isHost) {
        const current = playbackRef.current;
        if (current) {
          if (current.isPlaying && ytState === YT.PlayerState.PAUSED) {
            try {
              event.target.playVideo();
            } catch {
              /* ignore */
            }
          } else if (!current.isPlaying && ytState === YT.PlayerState.PLAYING) {
            try {
              event.target.pauseVideo();
            } catch {
              /* ignore */
            }
          }
        }
        return;
      }

      const current = playbackRef.current;
      const currentTime =
        typeof event.target.getCurrentTime === "function"
          ? event.target.getCurrentTime()
          : 0;

      if (ytState === YT.PlayerState.PLAYING) {
        if (!current?.isPlaying) {
          sendCommand("play", currentTime);
        }
      } else if (ytState === YT.PlayerState.PAUSED) {
        if (current?.isPlaying) {
          sendCommand("pause", currentTime);
        }
      }
    },
    [isHost, sendCommand, handleVideoEnded]
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
                  setDuration(dur);
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

  // Unified progress tracking & drift synchronization interval
  useEffect(() => {
    function updateProgress() {
      if (isDraggingRef.current) return;

      if (isYouTube) {
        const yt = ytPlayerRef.current;
        if (!yt || !isYtReadyRef.current) return;

        try {
          const time =
            typeof yt.getCurrentTime === "function"
              ? yt.getCurrentTime()
              : 0;
          const dur =
            typeof yt.getDuration === "function" ? yt.getDuration() : 0;

          if (Number.isFinite(dur) && dur > 0) {
            setDuration(dur);
          }

          if (Number.isFinite(time)) {
            setDisplayPosition(time);
            setSeekDraft(time);
          }

          // Drift correction during playback
          const current = playbackRef.current;
          if (
            current?.isPlaying &&
            !isApplyingPlaybackRef.current &&
            Number.isFinite(time)
          ) {
            const target = expectedPosition(current);
            if (Math.abs(time - target) > DRIFT_THRESHOLD) {
              isApplyingPlaybackRef.current = true;
              yt.seekTo(target, true);
              setTimeout(() => {
                isApplyingPlaybackRef.current = false;
              }, 350);
            }
          }
        } catch {
          /* ignore */
        }
      } else {
        const video = videoRef.current;
        if (!video) return;

        const position = Number.isFinite(video.currentTime)
          ? video.currentTime
          : 0;

        setDisplayPosition(position);
        setSeekDraft(position);
      }
    }

    updateProgress();
    const intervalId = setInterval(updateProgress, PROGRESS_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isYouTube]);

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
          setDuration(0);
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
    if (!current) return;

    let ended = false;
    let currentPos = 0;

    if (isYouTube) {
      const yt = ytPlayerRef.current;
      if (yt && isYtReadyRef.current) {
        try {
          currentPos = yt.getCurrentTime() || 0;
          ended = duration > 0 && currentPos >= duration - 0.5;
        } catch {
          /* ignore */
        }
      }
    } else {
      const video = videoRef.current;
      currentPos = video?.currentTime ?? 0;
      ended =
        video?.ended ||
        (duration > 0 && video && video.currentTime >= duration - 0.25);
    }

    if (ended) {
      sendCommand("play", 0);
      return;
    }

    sendCommand(
      current.isPlaying ? "pause" : "play",
      currentPos
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

    sendCommand("seek", position);
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;

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
            if (!isYouTube) {
              setBuffering(false);
              setPlayerError("The video could not be loaded.");
            }
          }}
        />

        <ReactionsOverlay socket={socket} />

        {buffering && (
          <div className="video-overlay">Buffering...</div>
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
