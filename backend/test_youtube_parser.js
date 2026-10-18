import assert from "node:assert";
import {
  parseYouTubeVideoId,
  isYouTubeAttempt,
  validateAndNormalizeVideoUrl,
} from "./src/youtube.js";

console.log("=== Running YouTube Parser & Validator Unit Tests ===");

// 1. Standard watch URL
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "Standard watch URL should extract ID"
);

// 2. Watch URL with extra query params
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s&feature=shared"),
  "dQw4w9WgXcQ",
  "Watch URL with extra query parameters"
);

// 3. Mobile watch URL
assert.strictEqual(
  parseYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "Mobile watch URL"
);

// 4. Short youtu.be URL
assert.strictEqual(
  parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "youtu.be short URL"
);

// 5. Short youtu.be URL with timestamp
assert.strictEqual(
  parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=12"),
  "dQw4w9WgXcQ",
  "youtu.be URL with timestamp"
);

// 6. Embed URL
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "Embed URL"
);

// 7. Embed URL with params
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&enablejsapi=1"),
  "dQw4w9WgXcQ",
  "Embed URL with params"
);

// 8. Shorts URL
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "Shorts URL"
);

// 9. Shorts URL with query param
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share"),
  "dQw4w9WgXcQ",
  "Shorts URL with query param"
);

// 10. Raw 11-char video ID
assert.strictEqual(
  parseYouTubeVideoId("dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "Raw 11-character video ID"
);

// 11. youtube-nocookie.com embed
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "youtube-nocookie embed URL"
);

// 12. URL without protocol
assert.strictEqual(
  parseYouTubeVideoId("youtube.com/watch?v=dQw4w9WgXcQ"),
  "dQw4w9WgXcQ",
  "URL without protocol"
);

// Invalid cases
assert.strictEqual(parseYouTubeVideoId(""), null, "Empty string should return null");
assert.strictEqual(parseYouTubeVideoId("not a url"), null, "Non-URL should return null");
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/watch?v=short"),
  null,
  "ID with fewer than 11 characters should return null"
);
assert.strictEqual(
  parseYouTubeVideoId("https://www.youtube.com/watch?v=toolong12345678"),
  null,
  "ID with more than 11 characters should return null"
);
assert.strictEqual(
  parseYouTubeVideoId("https://youtu.be/"),
  null,
  "Empty youtu.be path should return null"
);
assert.strictEqual(
  parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"),
  null,
  "Non-YouTube domain should return null"
);
assert.strictEqual(
  parseYouTubeVideoId("<iframe src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\"></iframe>"),
  null,
  "Arbitrary iframe HTML should be rejected"
);

// Test validateAndNormalizeVideoUrl
const ytResult = validateAndNormalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=5");
assert.strictEqual(ytResult.valid, true);
assert.strictEqual(ytResult.isYouTube, true);
assert.strictEqual(ytResult.videoId, "dQw4w9WgXcQ");
assert.strictEqual(ytResult.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

const directResult = validateAndNormalizeVideoUrl("https://example.com/video.mp4");
assert.strictEqual(directResult.valid, true);
assert.strictEqual(directResult.isYouTube, false);
assert.strictEqual(directResult.canonicalUrl, "https://example.com/video.mp4");

const invalidYt = validateAndNormalizeVideoUrl("https://www.youtube.com/watch?v=bad");
assert.strictEqual(invalidYt.valid, false);
assert.ok(invalidYt.error.includes("Invalid YouTube URL"));

console.log("All YouTube parser unit tests passed successfully! ✓");
