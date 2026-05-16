'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, CheckCircle } from 'lucide-react';

interface ContactModalProps {
  onClose: () => void;
}

type Status = 'idle' | 'sending' | 'success' | 'error';

export default function ContactModal({ onClose }: ContactModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg((data as { detail?: string }).detail ?? 'Something went wrong. Please try again.');
        setStatus('error');
      } else {
        setStatus('success');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setStatus('error');
    }
  };

  const canSubmit = name.trim() && email.trim() && message.trim() && status !== 'sending';

  return (
    <div
      className="privacy-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <motion.div
        className="privacy-modal"
        style={{ maxWidth: 540 }}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <div className="privacy-modal-header">
          <span id="contact-modal-title" className="privacy-modal-title">Contact</span>
          <button
            className="privacy-modal-close"
            onClick={onClose}
            aria-label="Close contact form"
          >
            <X size={18} />
          </button>
        </div>

        <div className="privacy-modal-body" style={{ padding: '24px 28px 28px' }}>
          <AnimatePresence mode="wait">
            {status === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ textAlign: 'center', padding: '32px 0' }}
              >
                <CheckCircle
                  size={40}
                  style={{ color: 'var(--accent)', margin: '0 auto 16px', display: 'block' }}
                />
                <p style={{
                  fontFamily: 'var(--serif)',
                  fontSize: '1.15rem',
                  color: 'var(--ink)',
                  margin: '0 0 8px',
                  fontStyle: 'italic',
                }}>
                  Message sent.
                </p>
                <p style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--ink-muted)',
                  letterSpacing: '0.06em',
                  margin: 0,
                }}>
                  We&apos;ll get back to you soon.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                <p style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  color: 'var(--ink-muted)',
                  letterSpacing: '0.06em',
                  margin: '0 0 4px',
                }}>
                  Get in touch — we&apos;ll respond within 48 hours.
                </p>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="contact-label" htmlFor="contact-name">Name</label>
                    <input
                      id="contact-name"
                      className="contact-input"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      required
                      maxLength={120}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="contact-label" htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      className="contact-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="contact-label" htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    className="contact-input contact-textarea"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    required
                    maxLength={4000}
                    rows={5}
                  />
                  <div style={{
                    textAlign: 'right',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    color: 'var(--ink-faint)',
                    marginTop: '4px',
                    letterSpacing: '0.06em',
                  }}>
                    {message.length} / 4000
                  </div>
                </div>

                {status === 'error' && (
                  <p style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    color: 'var(--accent)',
                    margin: 0,
                    letterSpacing: '0.02em',
                  }}>
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    alignSelf: 'flex-end',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    background: canSubmit ? 'var(--accent)' : 'var(--bg-soft)',
                    color: canSubmit ? 'oklch(0.95 0.005 80)' : 'var(--ink-faint)',
                    border: 'none',
                    borderRadius: 'var(--r)',
                    padding: '9px 20px',
                    fontFamily: 'var(--mono)',
                    fontSize: '10px',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    transition: 'opacity .15s, background .15s',
                    opacity: status === 'sending' ? 0.6 : 1,
                    minHeight: '38px',
                  }}
                >
                  {status === 'sending' ? (
                    <>Sending<span className="contact-spinner" /></>
                  ) : (
                    <><Send size={11} /> Send message</>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
