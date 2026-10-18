/**
 * YouTube Utility functions for Watch Party
 *
 * Provides URL parsing, IFrame API script loader, and error code translations.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts and validates an 11-character YouTube video ID.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Direct 11-character video ID
 */
export function parseYouTubeVideoId(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct 11-character video ID
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Prepend protocol if missing so URL parser works
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");

    // 1. youtu.be/<id>
    if (host === "youtu.be") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const id = segments[0];
        if (YOUTUBE_ID_REGEX.test(id)) {
          return id;
        }
      }
      return null;
    }

    // 2. youtube.com or youtube-nocookie.com
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      // Standard watch page: /watch?v=<id>
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        if (id && YOUTUBE_ID_REGEX.test(id)) {
          return id;
        }
        return null;
      }

      // /embed/<id>, /shorts/<id>, /v/<id>, /live/<id>
      const segments = url.pathname.split("/").filter(Boolean);
      if (
        segments.length >= 2 &&
        ["embed", "shorts", "v", "live"].includes(segments[0])
      ) {
        const id = segments[1];
        if (YOUTUBE_ID_REGEX.test(id)) {
          return id;
        }
      }

      return null;
    }
  } catch {
    return null;
  }

  return null;
}

export function isYouTubeUrl(input) {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (YOUTUBE_ID_REGEX.test(trimmed)) return true;
  return /youtube\.com|youtu\.be/i.test(trimmed);
}

/**
 * Returns human-readable error explanations for YouTube Player error codes.
 */
export function getYouTubeErrorMessage(errorCode) {
  switch (errorCode) {
    case 2:
      return "The requested video ID is invalid or contains malformed parameters (Error 2).";
    case 5:
      return "The requested content cannot be played in an HTML5 embedded player (Error 5).";
    case 100:
      return "This YouTube video was not found, or has been removed or marked private (Error 100).";
    case 101:
    case 150:
      return "The video owner does not allow this video to be played in embedded players (Error 101/150). Please select another video.";
    default:
      return `YouTube playback encountered an error (Code ${errorCode}).`;
  }
}

let ytApiPromise = null;

/**
 * Loads the official YouTube IFrame Player API script singleton.
 * Resolves with the `window.YT` object once ready.
 */
export function loadYouTubeIFrameAPI() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is not defined"));
  }

  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[src*="youtube.com/iframe_api"]'
    );

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === "function") {
        try {
          prevReady();
        } catch (e) {
          console.warn("Previous onYouTubeIframeAPIReady error:", e);
        }
      }
      resolve(window.YT);
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API script."));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}
