'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is Visquery?',
  'How does image search work?',
  'What is segment search?',
  'What styles are covered?',
];

export default function AssistantChat({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || 'No response.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Service unavailable. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="assistant-chat-root">
      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="assistant-chat-panel"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {/* Header */}
            <div className="assistant-chat-header">
              <div className="assistant-chat-header-left">
                <span className="assistant-chat-dot" />
                <span className="assistant-chat-title">Visquery Assistant</span>
              </div>
              <button
                className="assistant-chat-close"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
              >
                <X size={13} />
              </button>
            </div>

            {/* Messages */}
            <div className="assistant-chat-messages">
              {messages.length === 0 ? (
                <div className="assistant-chat-welcome">
                  <p className="assistant-chat-welcome-text">
                    Ask me anything about Visquery — search, image upload, style classification, or segments.
                  </p>
                  <div className="assistant-chat-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        className="assistant-chat-suggestion"
                        onClick={() => send(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={`assistant-chat-msg assistant-chat-msg--${m.role}`}
                  >
                    {m.content}
                  </div>
                ))
              )}
              {loading && (
                <div className="assistant-chat-msg assistant-chat-msg--assistant assistant-chat-typing">
                  <Loader2 size={12} strokeWidth={1.5} className="spin" />
                  <span>Thinking…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="assistant-chat-input-row">
              <input
                ref={inputRef}
                className="assistant-chat-input"
                placeholder="Ask about Visquery…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={loading}
                maxLength={300}
              />
              <button
                className="assistant-chat-send"
                onClick={() => send()}
                disabled={loading || !input.trim()}
                aria-label="Send"
              >
                <Send size={13} strokeWidth={1.5} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        className="assistant-chat-fab"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        title="Visquery Assistant"
        aria-label={open ? 'Close assistant' : 'Open assistant'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -80, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 80, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <X size={19} strokeWidth={1.5} />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 80, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -80, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <MessageCircle size={19} strokeWidth={1.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
