/**
 * YouTube URL and Video ID Parser & Validator
 *
 * Supports common YouTube formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 *
 * YouTube video IDs are strictly 11 characters long and contain only
 * alphanumeric characters, dashes, and underscores.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

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
      if (segments.length >= 2 && ["embed", "shorts", "v", "live"].includes(segments[0])) {
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

export function isYouTubeAttempt(input) {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (YOUTUBE_ID_REGEX.test(trimmed)) return true;
  return /youtube\.com|youtu\.be/i.test(trimmed);
}

export function validateAndNormalizeVideoUrl(urlString) {
  if (typeof urlString !== "string") {
    return { valid: false, error: "Please enter a valid video URL." };
  }

  const trimmed = urlString.trim();
  if (!trimmed) {
    return { valid: false, error: "Please enter a video URL." };
  }

  if (isYouTubeAttempt(trimmed)) {
    const videoId = parseYouTubeVideoId(trimmed);
    if (!videoId) {
      return {
        valid: false,
        error:
          "Invalid YouTube URL or unsupported video ID. Supported formats: watch?v=ID, youtu.be/ID, embed/ID, shorts/ID (with 11-character video ID).",
      };
    }

    return {
      valid: true,
      isYouTube: true,
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  // Direct video URL validation
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        error: "Only HTTP and HTTPS URLs are supported.",
      };
    }

    return {
      valid: true,
      isYouTube: false,
      videoId: null,
      canonicalUrl: parsed.href,
    };
  } catch {
    return {
      valid: false,
      error: "Invalid video URL. Please enter a valid HTTP or HTTPS URL.",
    };
  }
}
