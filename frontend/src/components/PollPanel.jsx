import { useState } from "react";
import "./PollPanel.css";

export default function PollPanel({
  socket,
  room,
  isHost,
  currentUsername,
  onError,
}) {
  const poll = room?.poll;

  // Poll creation form state
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if current user has already voted
  const userVoteIndex =
    poll && currentUsername && poll.userVotes
      ? poll.userVotes[currentUsername]
      : undefined;

  const hasVoted = userVoteIndex !== undefined;

  function handleOptionChange(index, value) {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  }

  function handleAddOptionField() {
    if (options.length < 5) {
      setOptions([...options, ""]);
    }
  }

  function handleRemoveOptionField(index) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  function handleCreatePoll(e) {
    e.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      onError?.("Enter a question for the poll.");
      return;
    }

    const cleanedOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) {
      onError?.("Provide at least 2 non-empty options.");
      return;
    }

    setIsSubmitting(true);

    socket.emit(
      "create_poll",
      { question: trimmedQuestion, options: cleanedOptions },
      (response) => {
        setIsSubmitting(false);

        if (!response?.ok) {
          onError?.(response?.error || "Could not create poll.");
          return;
        }

        setQuestion("");
        setOptions(["", ""]);
      }
    );
  }

  function handleVote(optionIndex) {
    if (!poll?.isOpen || hasVoted) return;

    socket.emit(
      "vote_poll",
      { pollId: poll.id, optionIndex },
      (response) => {
        if (!response?.ok) {
          onError?.(response?.error || "Could not submit vote.");
        }
      }
    );
  }

  function handleClosePoll() {
    if (!isHost || !poll) return;

    socket.emit("close_poll", { pollId: poll.id }, (response) => {
      if (!response?.ok) {
        onError?.(response?.error || "Could not close poll.");
      }
    });
  }

  function handleDeletePoll() {
    if (!isHost || !poll) return;

    socket.emit("delete_poll", { pollId: poll.id }, (response) => {
      if (!response?.ok) {
        onError?.(response?.error || "Could not delete poll.");
      }
    });
  }

  return (
    <div className="poll-panel">
      {!poll ? (
        <div className="poll-empty-state">
          {isHost ? (
            <form className="poll-create-form" onSubmit={handleCreatePoll}>
              <div className="poll-create-title">Create a Room Poll</div>

              <label className="poll-label" htmlFor="poll-question-input">
                Question
              </label>
              <input
                id="poll-question-input"
                className="poll-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Which movie next? What snacks?"
                maxLength={150}
                required
                disabled={isSubmitting}
              />

              <label className="poll-label">Options (2 to 5)</label>
              <div className="poll-options-input-list">
                {options.map((opt, i) => (
                  <div key={i} className="poll-option-input-row">
                    <input
                      className="poll-input"
                      value={opt}
                      onChange={(e) => handleOptionChange(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      maxLength={60}
                      required
                      disabled={isSubmitting}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="poll-remove-opt-btn"
                        onClick={() => handleRemoveOptionField(i)}
                        title="Remove option"
                        aria-label="Remove option"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {options.length < 5 && (
                <button
                  type="button"
                  className="poll-add-opt-btn"
                  onClick={handleAddOptionField}
                  disabled={isSubmitting}
                >
                  + Add another option
                </button>
              )}

              <button
                type="submit"
                className="poll-create-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Starting Poll..." : "Launch Poll"}
              </button>
            </form>
          ) : (
            <div className="poll-no-active">
              <span className="empty-icon">📊</span>
              <p className="empty-title">No Active Poll</p>
              <p className="empty-desc">
                When the host creates a poll, it will appear here so you can vote!
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="active-poll-container">
          <div className="active-poll-header">
            <div>
              <span
                className={`poll-status-tag ${
                  poll.isOpen ? "open" : "closed"
                }`}
              >
                {poll.isOpen ? "● Live Poll" : "Ended"}
              </span>
              <h3 className="active-poll-question">{poll.question}</h3>
            </div>

            <div className="poll-meta-info">
              <span>{poll.totalVotes} total votes</span>
              <span>By {poll.createdBy}</span>
            </div>
          </div>

          <div className="poll-options-list">
            {poll.options.map((opt, index) => {
              const isSelected = userVoteIndex === index;
              const canClickVote = poll.isOpen && !hasVoted;

              return (
                <div
                  key={opt.id}
                  className={`poll-option-card ${
                    isSelected ? "user-selected" : ""
                  } ${canClickVote ? "clickable" : ""}`}
                  onClick={() => canClickVote && handleVote(index)}
                  role={canClickVote ? "button" : undefined}
                  tabIndex={canClickVote ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (canClickVote && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      handleVote(index);
                    }
                  }}
                >
                  <div className="poll-option-content">
                    <div className="poll-option-title-row">
                      <span className="poll-option-text">{opt.text}</span>
                      {isSelected && (
                        <span className="voted-check">✓ Your vote</span>
                      )}
                    </div>

                    <div className="poll-option-stats">
                      <span className="poll-percentage">
                        {opt.percentage}%
                      </span>
                      <span className="poll-count">({opt.votes})</span>
                    </div>
                  </div>

                  <div className="poll-progress-track">
                    <div
                      className="poll-progress-bar"
                      style={{ width: `${opt.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="poll-footer">
            {poll.isOpen && !hasVoted && (
              <p className="poll-prompt-hint">Click an option to cast your vote!</p>
            )}

            {hasVoted && poll.isOpen && (
              <p className="poll-prompt-hint voted-hint">
                ✓ Your vote has been recorded.
              </p>
            )}

            {isHost && (
              <div className="poll-host-actions">
                {poll.isOpen ? (
                  <button
                    type="button"
                    className="poll-host-btn close-btn"
                    onClick={handleClosePoll}
                  >
                    End Poll
                  </button>
                ) : (
                  <button
                    type="button"
                    className="poll-host-btn reset-btn"
                    onClick={handleDeletePoll}
                  >
                    Create New Poll
                  </button>
                )}
                <button
                  type="button"
                  className="poll-host-btn delete-btn"
                  onClick={handleDeletePoll}
                  title="Remove poll"
                >
                  Remove Poll
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
