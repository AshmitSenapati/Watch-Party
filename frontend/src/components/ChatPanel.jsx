import { useEffect, useRef, useState, useCallback } from "react";
import "./ChatPanel.css";

function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPanel({
  socket,
  room,
  currentUsername,
  isVisible,
  onUnreadCountChange,
  onError,
}) {
  const [messages, setMessages] = useState(() => room?.messages || []);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasScrolledUp, setHasScrolledUp] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const unreadCountRef = useRef(0);


  // Handle incoming chat messages via socket
  useEffect(() => {
    if (!socket) return;

    function handleNewMessage(msg) {
      if (!msg) return;

      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (!isVisible) {
        unreadCountRef.current += 1;
        onUnreadCountChange?.(unreadCountRef.current);
      }
    }

    socket.on("chat_message", handleNewMessage);

    return () => {
      socket.off("chat_message", handleNewMessage);
    };
  }, [socket, isVisible, onUnreadCountChange]);

  // Clear unread count when panel becomes visible
  useEffect(() => {
    if (isVisible && unreadCountRef.current > 0) {
      unreadCountRef.current = 0;
      onUnreadCountChange?.(0);
    }
  }, [isVisible, onUnreadCountChange]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
      setHasScrolledUp(false);
    }
  }, []);

  // Detect when user scrolls away from bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;

    const scrolledAway = distanceFromBottom > 60;
    setHasScrolledUp(scrolledAway);
  }, []);

  // Auto-scroll on new message unless user has scrolled up
  useEffect(() => {
    if (!hasScrolledUp) {
      scrollToBottom(false);
    }
  }, [messages, hasScrolledUp, scrollToBottom]);

  function handleSendMessage(e) {
    if (e) e.preventDefault();

    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    if (!socket?.connected) {
      onError?.("Cannot send message: Not connected.");
      return;
    }

    if (trimmed.length > 500) {
      onError?.("Message exceeds 500 characters.");
      return;
    }

    setIsSending(true);

    socket.emit("send_chat_message", { text: trimmed }, (response) => {
      setIsSending(false);

      if (!response?.ok) {
        onError?.(response?.error || "Failed to send message.");
        return;
      }

      setInputText("");
      scrollToBottom(true);
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  return (
    <div className="chat-panel">
      <div
        className="chat-messages"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span className="empty-icon">💬</span>
            <p className="empty-title">No messages yet</p>
            <p className="empty-desc">
              Say hello and start the party conversation!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe =
              msg.senderName?.toLowerCase() ===
              currentUsername?.trim().toLowerCase();

            return (
              <div
                key={msg.id}
                className={`chat-message-item ${isMe ? "from-me" : "from-them"}`}
              >
                <div className="chat-message-meta">
                  <span className="chat-sender-name">
                    {isMe ? "You" : msg.senderName}
                  </span>
                  <span className="chat-timestamp">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                </div>
                <div className="chat-bubble">{msg.text}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {hasScrolledUp && (
        <button
          type="button"
          className="jump-to-bottom-button"
          onClick={() => scrollToBottom(true)}
        >
          ↓ New messages below
        </button>
      )}

      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <div className="chat-input-wrapper">
          <textarea
            className="chat-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message (Enter to send, Shift+Enter for new line)..."
            rows={1}
            maxLength={500}
            disabled={isSending}
          />
          <div className="chat-form-footer">
            <span
              className={`char-counter ${
                inputText.length > 450 ? "warning" : ""
              }`}
            >
              {inputText.length}/500
            </span>
            <button
              type="submit"
              className="chat-send-button"
              disabled={!inputText.trim() || isSending}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
