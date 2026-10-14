import { useState } from "react";
import "./PlaylistPanel.css";

export default function PlaylistPanel({
  socket,
  room,
  isHost,
  onError,
}) {
  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const playlist = room?.playlist || [];
  const currentPlaylistId = room?.currentPlaylistId;
  const currentVideoUrl = room?.playback?.videoUrl;

  function handleAdd(e) {
    e.preventDefault();

    const trimmedUrl = videoUrl.trim();
    if (!trimmedUrl) {
      onError?.("Please enter a video URL.");
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        onError?.("Only HTTP and HTTPS URLs are supported.");
        return;
      }
    } catch {
      onError?.("Invalid video URL.");
      return;
    }

    setIsSubmitting(true);

    socket.emit(
      "add_to_playlist",
      { videoUrl: trimmedUrl, title: title.trim() },
      (response) => {
        setIsSubmitting(false);

        if (!response?.ok) {
          onError?.(response?.error || "Could not add video to playlist.");
          return;
        }

        setVideoUrl("");
        setTitle("");
      }
    );
  }

  function handlePlay(itemId) {
    if (!isHost) return;

    socket.emit("play_playlist_item", { itemId }, (response) => {
      if (!response?.ok) {
        onError?.(response?.error || "Could not play playlist item.");
      }
    });
  }

  function handleRemove(itemId) {
    if (!isHost) return;

    socket.emit("remove_from_playlist", { itemId }, (response) => {
      if (!response?.ok) {
        onError?.(response?.error || "Could not remove playlist item.");
      }
    });
  }

  function handleMove(itemId, direction) {
    if (!isHost) return;

    socket.emit("reorder_playlist", { itemId, direction }, (response) => {
      if (!response?.ok) {
        onError?.(response?.error || "Could not reorder playlist.");
      }
    });
  }

  return (
    <div className="playlist-panel">
      {isHost && (
        <form className="playlist-add-form" onSubmit={handleAdd}>
          <div className="playlist-form-heading">Add Video to Playlist</div>
          <input
            type="url"
            className="playlist-input"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Video URL (e.g. direct MP4 link)"
            required
            disabled={isSubmitting}
          />
          <div className="playlist-form-row">
            <input
              type="text"
              className="playlist-input title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={60}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="playlist-add-button"
              disabled={!videoUrl.trim() || isSubmitting}
            >
              {isSubmitting ? "Adding..." : "+ Add"}
            </button>
          </div>
        </form>
      )}

      <div className="playlist-list-container">
        {playlist.length === 0 ? (
          <div className="playlist-empty">
            <span className="empty-icon">📺</span>
            <p className="empty-title">Playlist is empty</p>
            <p className="empty-desc">
              {isHost
                ? "Add your first video link above to get started!"
                : "The host has not added any videos to the playlist yet."}
            </p>
          </div>
        ) : (
          <ul className="playlist-items-list">
            {playlist.map((item, index) => {
              const isPlaying =
                item.id === currentPlaylistId ||
                item.videoUrl === currentVideoUrl;

              return (
                <li
                  key={item.id}
                  className={`playlist-item ${isPlaying ? "playing" : ""}`}
                >
                  <div className="playlist-item-index">{index + 1}</div>

                  <div className="playlist-item-info">
                    <div className="playlist-item-title-row">
                      <span className="playlist-item-title">{item.title}</span>
                      {isPlaying && (
                        <span className="playing-badge">▶ Playing Now</span>
                      )}
                    </div>
                    <span className="playlist-item-meta">
                      Added by {item.addedBy}
                    </span>
                  </div>

                  {isHost && (
                    <div className="playlist-item-actions">
                      <button
                        type="button"
                        className="playlist-action-btn play-btn"
                        onClick={() => handlePlay(item.id)}
                        disabled={isPlaying}
                        title={isPlaying ? "Currently playing" : "Play this video"}
                      >
                        Play
                      </button>

                      <div className="playlist-order-buttons">
                        <button
                          type="button"
                          className="playlist-action-btn icon-btn"
                          onClick={() => handleMove(item.id, "up")}
                          disabled={index === 0}
                          title="Move up"
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="playlist-action-btn icon-btn"
                          onClick={() => handleMove(item.id, "down")}
                          disabled={index === playlist.length - 1}
                          title="Move down"
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>

                      <button
                        type="button"
                        className="playlist-action-btn delete-btn"
                        onClick={() => handleRemove(item.id)}
                        title="Remove from playlist"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
