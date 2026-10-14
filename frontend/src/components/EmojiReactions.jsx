import { useEffect, useState, useCallback } from "react";
import "./EmojiReactions.css";

const ALLOWED_REACTIONS = ["❤️", "😂", "🔥", "👍", "😮", "👏"];

export function ReactionsOverlay({ socket }) {
  const [reactions, setReactions] = useState([]);

  useEffect(() => {
    if (!socket) return;

    function handleReaction(reaction) {
      if (!reaction || !reaction.emoji) return;

      const newReaction = {
        id: reaction.id || `${Date.now()}-${Math.random()}`,
        emoji: reaction.emoji,
        senderName: reaction.senderName || "Friend",
        left: Math.floor(Math.random() * 65) + 15, // between 15% and 80%
      };

      setReactions((prev) => [...prev.slice(-20), newReaction]);

      // Remove after 2.6s
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 2600);
    }

    socket.on("reaction_received", handleReaction);

    return () => {
      socket.off("reaction_received", handleReaction);
    };
  }, [socket]);

  return (
    <div className="reactions-overlay" aria-hidden="true">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="floating-reaction"
          style={{ left: `${r.left}%` }}
        >
          <span className="reaction-emoji">{r.emoji}</span>
          <span className="reaction-sender">{r.senderName}</span>
        </div>
      ))}
    </div>
  );
}

export function ReactionButtons({ socket, onError }) {
  const [cooldown, setCooldown] = useState(false);

  const handleSendReaction = useCallback(
    (emoji) => {
      if (!socket?.connected) {
        onError?.("Connecting to room... please wait.");
        return;
      }

      if (cooldown) return;

      socket.emit("send_reaction", { emoji }, (response) => {
        if (response && !response.ok) {
          onError?.(response.error || "Could not send reaction.");
        }
      });

      // Subtle frontend debounce
      setCooldown(true);
      setTimeout(() => setCooldown(false), 250);
    },
    [socket, cooldown, onError]
  );

  return (
    <div className="reaction-bar" aria-label="Quick Emoji Reactions">
      <span className="reaction-bar-label">Reactions:</span>
      <div className="reaction-buttons-list">
        {ALLOWED_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-button"
            onClick={() => handleSendReaction(emoji)}
            title={`React with ${emoji}`}
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
