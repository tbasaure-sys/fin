"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/portfolio-chat.module.css";

const STARTER_QUESTIONS = [
  "Is my portfolio too concentrated right now?",
  "What does the current market stance mean for me specifically?",
  "Which of my positions adds the least real diversification?",
  "Should I be worried about what the alerts are flagging?",
  "What would I need to see before adding more risk to the portfolio?",
  "Explain my recoverability score in plain English.",
];

function AssistantMessage({ content, streaming }) {
  return (
    <div className={styles.message} data-role="assistant">
      <span className={styles.messageRole}>Workspace</span>
      <div className={styles.messageBody}>
        {content}
        {streaming && <span className={styles.cursor} aria-hidden="true" />}
      </div>
    </div>
  );
}

function UserMessage({ content }) {
  return (
    <div className={styles.message} data-role="user">
      <span className={styles.messageRole}>You</span>
      <div className={styles.messageBody}>{content}</div>
    </div>
  );
}

export default function PortfolioChat({ workspaceId, dashboard, onClose }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, streaming]);

  async function sendMessage(text) {
    const trimmed = (text || input).trim();
    if (!trimmed || streaming) return;

    setInput("");
    setError("");

    const userMessage = { role: "user", content: trimmed };
    const newHistory = [...history, userMessage];
    setHistory(newHistory);

    // Add a placeholder for the assistant reply
    setHistory((h) => [...h, { role: "assistant", content: "", _streaming: true }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: newHistory.slice(-12),
          dashboard,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `Server error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
          if (!trimmedLine.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(trimmedLine.slice(6));
            if (json.error) throw new Error(json.error);
            if (json.delta) {
              accumulated += json.delta;
              setHistory((h) =>
                h.map((m, i) =>
                  i === h.length - 1 ? { ...m, content: accumulated } : m,
                ),
              );
            }
          } catch (parseError) {
            if (parseError.message !== "Unexpected end of JSON input") {
              throw parseError;
            }
          }
        }
      }

      // Finalize — remove streaming flag
      setHistory((h) =>
        h.map((m, i) => (i === h.length - 1 ? { ...m, _streaming: false } : m)),
      );
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Something went wrong. Try again.");
      // Remove the streaming placeholder
      setHistory((h) => h.filter((m) => !m._streaming));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function stopStream() {
    abortRef.current?.abort();
  }

  const isEmpty = history.length === 0;

  return (
    <div className={styles.drawer} role="dialog" aria-label="Portfolio chat">
      <div className={styles.drawerHead}>
        <div className={styles.drawerHeadLeft}>
          <span className={styles.drawerBadge}>Ask your portfolio</span>
          <p className={styles.drawerSub}>
            Powered by {process.env.NEXT_PUBLIC_CHAT_MODEL_LABEL || "GPT-4o"} with your live workspace data
          </p>
        </div>
        <button
          aria-label="Close chat"
          className={styles.closeBtn}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className={styles.messages}>
        {isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Ask anything about your portfolio</p>
            <p className={styles.emptySub}>
              I have full context of your holdings, market state, risk metrics,
              and alerts. Ask me in plain English — no jargon needed.
            </p>
            <div className={styles.starters}>
              {STARTER_QUESTIONS.map((q) => (
                <button
                  className={styles.starter}
                  key={q}
                  onClick={() => sendMessage(q)}
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) =>
          msg.role === "user" ? (
            <UserMessage content={msg.content} key={i} />
          ) : (
            <AssistantMessage
              content={msg.content}
              key={i}
              streaming={!!msg._streaming}
            />
          ),
        )}

        {error && (
          <div className={styles.errorRow}>
            {error}
            <button
              className={styles.retryBtn}
              onClick={() => {
                setError("");
                const last = history.findLast((m) => m.role === "user");
                if (last) sendMessage(last.content);
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          disabled={streaming}
          onKeyDown={handleKeyDown}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your portfolio, any position, or any metric..."
          ref={inputRef}
          rows={2}
          value={input}
        />
        {streaming ? (
          <button className={styles.stopBtn} onClick={stopStream} type="button">
            Stop
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            disabled={!input.trim()}
            onClick={() => sendMessage()}
            type="button"
          >
            Send
          </button>
        )}
      </div>

      <p className={styles.disclaimer}>
        Answers are grounded in your workspace data but are not financial advice.
        Always verify before acting.
      </p>
    </div>
  );
}
