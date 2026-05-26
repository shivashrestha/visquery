'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  FolderOpen,
  ScanSearch,
  MessageSquare,
  Download,
  ImageIcon,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Building2,
  Layers,
  Zap,
  LogOut,
  User,
  AlertCircle,
} from 'lucide-react';

interface StudioUser {
  name: string;
  email: string;
  role: string;
  plan: string;
}

// ─── Feature data — "CLIP" replaced with accessible language ──
const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'AI Style Classification',
    desc: 'Our vision language model reads architectural images and identifies historical styles across 120+ taxonomies — from Achaemenid to Deconstructivism — in seconds.',
    tag: 'Vision AI',
    number: '01',
  },
  {
    icon: ScanSearch,
    title: 'Architectural Artifact Extraction',
    desc: 'Automatically isolate and catalogue individual elements — columns, capitals, fenestration patterns, material textures — from any uploaded project image.',
    tag: 'Analysis',
    number: '02',
  },
  {
    icon: FolderOpen,
    title: 'Project Image Library',
    desc: 'Organise client project images into searchable collections. AI-generated metadata tags each image by style, material, structural system, and epoch automatically.',
    tag: 'Management',
    number: '03',
  },
  {
    icon: MessageSquare,
    title: 'Chat with Any Building',
    desc: 'Ask questions about any image in natural language. Our AI answers with architectural history, structural logic, material composition, and regional context.',
    tag: 'Generative AI',
    number: '04',
  },
  {
    icon: ImageIcon,
    title: 'Visual Precedent Search',
    desc: 'Upload a sketch, photograph, or rendering to find the most visually similar precedents from our extensive architectural image index.',
    tag: 'Search',
    number: '05',
  },
  {
    icon: Download,
    title: 'Export & Client Reports',
    desc: 'Generate structured precedent reports — style classification, source attribution, full metadata — ready for client deliverables and design documentation.',
    tag: 'Output',
    number: '06',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Upload project images',
    desc: 'Drag in photographs, site visit shots, renders, or scanned drawings from your architectural project.',
  },
  {
    step: '02',
    title: 'AI analyses and classifies',
    desc: 'Vision language model identifies style, extracts materials, structural elements, and maps historical context.',
  },
  {
    step: '03',
    title: 'Search and retrieve',
    desc: 'Query your library or global index by style, typology, region, or epoch. Find exact visual matches instantly.',
  },
  {
    step: '04',
    title: 'Export for clients',
    desc: 'Generate structured precedent reports with full attribution — ready for design documentation and client presentations.',
  },
];

// ─── Login Form ───────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (u: StudioUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/studio/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Authentication failed.');
      else onLogin(data.user);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sv-form-card">
      <div className="sv-form-header">
        <div className="sv-form-badge">
          <Zap size={10} />
          Studio Access
        </div>
        <h2 className="sv-form-title">Sign in to Studio</h2>
        <p className="sv-form-sub">Access your architectural intelligence workspace.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="sv-form">
        {/* Email */}
        <div className="sv-field-group">
          <label className="sv-field-label" htmlFor="sv-email">Email address</label>
          <div className="sv-input-wrap">
            <input
              ref={emailRef}
              id="sv-email"
              className="sv-field-input"
              type="email"
              autoComplete="email"
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="sv-field-group">
          <div className="sv-field-label-row">
            <label className="sv-field-label" htmlFor="sv-password">Password</label>
          </div>
          <div className="sv-input-wrap sv-input-pw-wrap">
            <input
              id="sv-password"
              className="sv-field-input"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              required
            />
            <button
              type="button"
              className="sv-pw-eye"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="sv-error-box"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AlertCircle size={14} className="sv-error-icon" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button
          type="submit"
          className="sv-submit-btn"
          disabled={loading || !email || !password}
        >
          {loading ? (
            <span className="sv-spinner" />
          ) : (
            <>Sign in <ArrowRight size={14} /></>
          )}
        </button>
      </form>

      <p className="sv-form-footer">
        Don&apos;t have access? <span className="sv-form-contact">Contact us</span> to request Studio credentials.
      </p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────
function StudioDashboard({ user, onLogout }: { user: StudioUser; onLogout: () => void }) {
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <motion.div
      className="sv-dashboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {/* Top bar */}
      <div className="sv-dash-topbar">
        <div className="sv-dash-status">
          <Sparkles size={12} />
          Studio Plan · Active
        </div>
        <div className="sv-dash-profile">
          <div className="sv-avatar-circle">{initials}</div>
          <div className="sv-dash-meta">
            <span className="sv-dash-name">{user.name}</span>
            <span className="sv-dash-role">{user.role}</span>
          </div>
          <button className="sv-logout-btn" onClick={onLogout} title="Sign out">
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Welcome card */}
      <div className="sv-welcome-card">
        <div className="sv-welcome-body">
          <p className="sv-eyebrow">Welcome back</p>
          <h2 className="sv-welcome-name">{user.name.split(' ')[0]}, your workspace is ready.</h2>
          <p className="sv-welcome-desc">
            Your architectural intelligence workspace is active. Upload project images,
            build searchable precedent libraries, and generate client-ready reports.
          </p>
          <div className="sv-welcome-tags">
            {['Image Library', 'Artifact Extraction', 'Chat with Buildings', 'Precedent Export'].map((f) => (
              <span key={f} className="sv-tag">
                <Check size={10} /> {f}
              </span>
            ))}
          </div>
        </div>
        <div className="sv-welcome-grid" aria-hidden>
          {[Building2, ImageIcon, Layers, ScanSearch, BrainCircuit, Download].map((Icon, i) => (
            <div key={i} className="sv-welcome-cell">
              <Icon size={18} />
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <div className="sv-dash-grid">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="sv-dash-card">
              <div className="sv-dash-card-icon"><Icon size={18} /></div>
              <h4 className="sv-dash-card-title">{f.title}</h4>
              <span className="sv-dash-card-tag">{f.tag}</span>
            </div>
          );
        })}
      </div>

      <div className="sv-coming-soon-bar">
        Full Studio dashboard coming soon — your account is active and ready for early access.
      </div>
    </motion.div>
  );
}

// ─── Landing page ─────────────────────────────────────────
export default function StudioView() {
  const [user, setUser] = useState<StudioUser | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vq_studio_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  function handleLogin(u: StudioUser) {
    setUser(u);
    try { sessionStorage.setItem('vq_studio_user', JSON.stringify(u)); } catch {}
  }

  function handleLogout() {
    setUser(null);
    try { sessionStorage.removeItem('vq_studio_user'); } catch {}
  }

  return (
    <div className="sv-root">
      <style>{CSS}</style>

      <AnimatePresence mode="wait">

        {/* ── Dashboard ── */}
        {user ? (
          <motion.div key="dash" className="sv-scroll"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <StudioDashboard user={user} onLogout={handleLogout} />
          </motion.div>
        ) : (

        /* ── Landing ── */
        <motion.div key="land" className="sv-scroll"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >

          {/* ══ Hero — 2-col: pitch left, login right ══ */}
          <section className="sv-hero">
            <div className="sv-hero-bg" />

            <div className="sv-hero-inner">
              {/* Left — pitch */}
              <motion.div
                className="sv-pitch"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <div className="sv-hero-badge">
                  <Zap size={10} /> Premium Workspace
                </div>

                <h1 className="sv-hero-title">
                  The professional workspace
                  <br />
                  <em>for architectural intelligence.</em>
                </h1>

                <p className="sv-hero-desc">
                  Visquery Studio gives architects and designers AI-powered image management,
                  style classification, artifact extraction, and precedent search —
                  in one workspace built for real project workflows.
                </p>

                {/* Key proof points */}
                <ul className="sv-proof-list">
                  {[
                    '120+ architectural styles recognised',
                    'Vision language model trained on architecture',
                    'Extensive precedent image index',
                    'Instant artifact extraction from any image',
                  ].map((pt) => (
                    <li key={pt}>
                      <Check size={13} className="sv-proof-check" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Right — login */}
              <motion.div
                className="sv-login-col"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <LoginForm onLogin={handleLogin} />
              </motion.div>
            </div>
          </section>

          {/* ══ Features — 3-col card grid ══ */}
          <section className="sv-features">
            <div className="sv-section-head">
              <p className="sv-eyebrow">Capabilities</p>
              <h2 className="sv-section-title">Every tool your practice needs</h2>
              <p className="sv-section-sub">
                Powered by vision language models and generative AI, Studio brings
                architectural intelligence to your daily workflow.
              </p>
            </div>

            <div className="sv-feat-grid">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    className="sv-feat-card"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                  >
                    <div className="sv-feat-top">
                      <div className="sv-feat-icon-wrap"><Icon size={18} /></div>
                      <span className="sv-feat-num">{f.number}</span>
                    </div>
                    <h3 className="sv-feat-title">{f.title}</h3>
                    <p className="sv-feat-desc">{f.desc}</p>
                    <div className="sv-feat-footer">
                      <span className="sv-feat-tag">{f.tag}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ══ How it works ══ */}
          <section className="sv-how">
            <div className="sv-section-head">
              <p className="sv-eyebrow">Workflow</p>
              <h2 className="sv-section-title">How Studio works</h2>
            </div>
            <div className="sv-how-grid">
              {HOW_IT_WORKS.map((s, i) => (
                <motion.div
                  key={s.step}
                  className="sv-how-card"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <span className="sv-how-num">{s.step}</span>
                  <div className="sv-how-bar" />
                  <h4 className="sv-how-title">{s.title}</h4>
                  <p className="sv-how-desc">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ══ AI Vision demo ══ */}
          <section className="sv-demo">
            <div className="sv-demo-inner">
              <div className="sv-demo-text">
                <p className="sv-eyebrow">Vision Language Model</p>
                <h2 className="sv-section-title">Understand any building, instantly.</h2>
                <p className="sv-demo-desc">
                  Upload a photograph — from a site visit, archive, or sketch — and Studio&apos;s
                  vision language model returns style classification, component identification,
                  material analysis, and historical context within seconds.
                </p>
                <ul className="sv-demo-bullets">
                  {[
                    'Identifies 120+ architectural styles by image alone',
                    'Extracts columns, windows, facades, and ornament',
                    'Maps regional and epoch precedents automatically',
                    'Generates structured metadata ready for your library',
                  ].map((b) => (
                    <li key={b}>
                      <Check size={12} className="sv-proof-check" /> {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Animated scan mock */}
              <div className="sv-scan-frame">
                <div className="sv-scan-grid" />
                <div className="sv-scan-line" />
                <div className="sv-scan-corner sv-tl" />
                <div className="sv-scan-corner sv-tr" />
                <div className="sv-scan-corner sv-bl" />
                <div className="sv-scan-corner sv-br" />
                <div className="sv-scan-center">
                  <Building2 size={36} className="sv-scan-icon" />
                  <p className="sv-scan-label">Analysing architecture</p>
                </div>
                <div className="sv-chip sv-chip-1"><Sparkles size={9} /> Beaux-Arts · 92%</div>
                <div className="sv-chip sv-chip-2"><Layers size={9} /> Limestone · Classical</div>
                <div className="sv-chip sv-chip-3"><ScanSearch size={9} /> 12 artifacts</div>
              </div>
            </div>
          </section>

        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scoped CSS — uses main app CSS vars ──────────────────
const CSS = `
  /* Root */
  .sv-root {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--sans);
  }
  .sv-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
  }

  /* ── Shared typography ── */
  .sv-eyebrow {
    font-size: 0.63rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sv-section-head { margin-bottom: 2.5rem; }
  .sv-section-title {
    font-family: var(--serif);
    font-size: clamp(1.4rem, 2.8vw, 2rem);
    font-weight: 700;
    line-height: 1.18;
    letter-spacing: -0.02em;
    color: var(--ink);
    margin-bottom: 0.6rem;
  }
  .sv-section-sub {
    font-size: 0.88rem;
    line-height: 1.65;
    color: var(--ink-muted);
    max-width: 520px;
  }
  .sv-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.15);
    padding: 3px 9px;
    border-radius: 20px;
  }

  /* ── Hero ── */
  .sv-hero {
    position: relative;
    padding: clamp(40px, 6vw, 72px) clamp(20px, 5vw, 56px);
    border-bottom: 1px solid var(--line);
    overflow: hidden;
  }
  .sv-hero-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 70% -10%, rgba(180,83,9,0.07) 0%, transparent 60%);
    pointer-events: none;
  }
  .sv-hero-inner {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 3rem;
    align-items: start;
    max-width: 1080px;
  }
  @media (max-width: 860px) {
    .sv-hero-inner { grid-template-columns: 1fr; gap: 2rem; }
  }

  /* Pitch side */
  .sv-pitch {}
  .sv-hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.63rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.2);
    padding: 4px 12px;
    border-radius: 20px;
    margin-bottom: 1.2rem;
  }
  .sv-hero-title {
    font-family: var(--serif);
    font-size: clamp(1.7rem, 3.5vw, 2.75rem);
    font-weight: 700;
    line-height: 1.14;
    letter-spacing: -0.025em;
    color: var(--ink);
    margin-bottom: 1rem;
  }
  .sv-hero-title em {
    font-style: italic;
    color: var(--accent);
  }
  .sv-hero-desc {
    font-size: 0.93rem;
    line-height: 1.72;
    color: var(--ink-muted);
    max-width: 500px;
    margin-bottom: 1.5rem;
  }
  .sv-proof-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .sv-proof-list li {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 0.84rem;
    color: var(--ink-soft);
    font-weight: 500;
  }
  .sv-proof-check { color: var(--accent); flex-shrink: 0; }

  /* ── Login form card ── */
  .sv-login-col {}
  .sv-form-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 1.75rem 1.75rem 1.5rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.04);
  }
  .sv-form-header { margin-bottom: 1.4rem; }
  .sv-form-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.18);
    padding: 3px 10px;
    border-radius: 20px;
    margin-bottom: 0.85rem;
  }
  .sv-form-title {
    font-family: var(--serif);
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--ink);
    margin-bottom: 0.2rem;
    line-height: 1.2;
  }
  .sv-form-sub {
    font-size: 0.78rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .sv-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sv-field-group { display: flex; flex-direction: column; gap: 6px; }
  .sv-field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sv-field-label {
    font-size: 0.73rem;
    font-weight: 600;
    color: var(--ink-soft);
    letter-spacing: 0.01em;
  }
  .sv-input-wrap { position: relative; }
  .sv-input-pw-wrap {}
  .sv-field-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-soft);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    padding: 10px 13px;
    font-size: 0.875rem;
    color: var(--ink);
    outline: none;
    font-family: var(--sans);
    transition: border-color 0.18s, box-shadow 0.18s;
    -webkit-appearance: none;
  }
  .sv-field-input::placeholder { color: var(--ink-muted); opacity: 0.5; }
  .sv-field-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(180,83,9,0.1);
    background: var(--paper);
  }
  .sv-input-pw-wrap .sv-field-input { padding-right: 42px; }
  .sv-pw-eye {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .sv-pw-eye:hover { color: var(--ink); background: var(--bg-soft); }
  .sv-error-box {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: #B91C1C;
    background: rgba(185,28,28,0.06);
    border: 1px solid rgba(185,28,28,0.18);
    border-radius: 6px;
    padding: 8px 12px;
    overflow: hidden;
  }
  .sv-error-icon { flex-shrink: 0; }
  .sv-submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    background: var(--accent);
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    padding: 11px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-family: var(--sans);
    transition: background 0.18s, transform 0.12s, opacity 0.18s;
    margin-top: 0.25rem;
  }
  .sv-submit-btn:hover:not(:disabled) {
    background: var(--clay-deep);
    transform: translateY(-1px);
  }
  .sv-submit-btn:active:not(:disabled) { transform: translateY(0); }
  .sv-submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .sv-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: sv-spin 0.65s linear infinite;
  }
  @keyframes sv-spin { to { transform: rotate(360deg); } }
  .sv-form-footer {
    font-size: 0.71rem;
    color: var(--ink-muted);
    text-align: center;
    margin-top: 1rem;
    line-height: 1.6;
  }
  .sv-form-contact {
    color: var(--accent);
    cursor: pointer;
    font-weight: 500;
  }
  .sv-form-contact:hover { text-decoration: underline; }

  /* ── Features grid ── */
  .sv-features {
    padding: clamp(40px, 6vw, 64px) clamp(20px, 5vw, 56px);
    border-bottom: 1px solid var(--line);
  }
  .sv-feat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  @media (max-width: 860px) { .sv-feat-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) { .sv-feat-grid { grid-template-columns: 1fr; } }
  .sv-feat-card {
    background: var(--paper);
    padding: 1.6rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    transition: background 0.15s;
    position: relative;
  }
  .sv-feat-card:hover { background: var(--bg-soft); }
  .sv-feat-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.9rem;
  }
  .sv-feat-icon-wrap {
    width: 36px; height: 36px;
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.15);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
  }
  .sv-feat-num {
    font-family: var(--mono);
    font-size: 0.6rem;
    color: var(--ink-muted);
    opacity: 0.5;
    letter-spacing: 0.06em;
  }
  .sv-feat-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 0.45rem;
    line-height: 1.3;
    font-family: var(--sans);
  }
  .sv-feat-desc {
    font-size: 0.78rem;
    line-height: 1.65;
    color: var(--ink-muted);
    flex: 1;
    margin-bottom: 0.9rem;
  }
  .sv-feat-footer { margin-top: auto; }
  .sv-feat-tag {
    display: inline-block;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    opacity: 0.7;
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.12);
    padding: 2px 8px;
    border-radius: 3px;
  }

  /* ── How it works ── */
  .sv-how {
    padding: clamp(40px, 6vw, 64px) clamp(20px, 5vw, 56px);
    border-bottom: 1px solid var(--line);
    background: var(--bg-soft);
  }
  .sv-how-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
  }
  @media (max-width: 768px) { .sv-how-grid { grid-template-columns: 1fr 1fr; gap: 1.25rem; } }
  @media (max-width: 420px) { .sv-how-grid { grid-template-columns: 1fr; } }
  .sv-how-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 1.4rem;
  }
  .sv-how-num {
    display: block;
    font-family: var(--mono);
    font-size: 0.62rem;
    color: var(--accent);
    letter-spacing: 0.08em;
    margin-bottom: 0.6rem;
    font-weight: 600;
  }
  .sv-how-bar {
    width: 28px; height: 2px;
    background: var(--accent);
    border-radius: 1px;
    margin-bottom: 0.8rem;
    opacity: 0.6;
  }
  .sv-how-title {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 0.4rem;
    font-family: var(--sans);
    line-height: 1.35;
  }
  .sv-how-desc {
    font-size: 0.76rem;
    line-height: 1.62;
    color: var(--ink-muted);
  }

  /* ── AI Vision demo ── */
  .sv-demo {
    padding: clamp(40px, 6vw, 64px) clamp(20px, 5vw, 56px);
    border-bottom: 1px solid var(--line);
  }
  .sv-demo-inner {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 4rem;
    align-items: center;
    max-width: 1080px;
  }
  @media (max-width: 860px) {
    .sv-demo-inner { grid-template-columns: 1fr; gap: 2rem; }
    .sv-scan-frame { display: none; }
  }
  .sv-demo-desc {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--ink-muted);
    margin: 0.75rem 0 1.25rem;
  }
  .sv-demo-bullets {
    list-style: none;
    padding: 0; margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .sv-demo-bullets li {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 0.83rem;
    color: var(--ink-soft);
  }

  /* Scan animation */
  .sv-scan-frame {
    position: relative;
    width: 100%;
    max-width: 360px;
    height: 280px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sv-scan-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(180,83,9,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(180,83,9,0.05) 1px, transparent 1px);
    background-size: 26px 26px;
  }
  .sv-scan-line {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: sv-scandown 3s ease-in-out infinite;
    box-shadow: 0 0 10px rgba(180,83,9,0.35);
  }
  @keyframes sv-scandown {
    0%   { top: 0; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  .sv-scan-corner {
    position: absolute;
    width: 13px; height: 13px;
    border-color: var(--accent);
    border-style: solid;
    opacity: 0.55;
  }
  .sv-tl { top: 7px; left: 7px; border-width: 2px 0 0 2px; }
  .sv-tr { top: 7px; right: 7px; border-width: 2px 2px 0 0; }
  .sv-bl { bottom: 7px; left: 7px; border-width: 0 0 2px 2px; }
  .sv-br { bottom: 7px; right: 7px; border-width: 0 2px 2px 0; }
  .sv-scan-center {
    position: relative;
    z-index: 2;
    text-align: center;
    color: var(--ink-muted);
    opacity: 0.25;
  }
  .sv-scan-icon { display: block; margin: 0 auto 6px; }
  .sv-scan-label { font-size: 0.7rem; }
  .sv-chip {
    position: absolute;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.64rem;
    font-weight: 600;
    background: var(--paper);
    border: 1px solid var(--line);
    color: var(--accent);
    padding: 4px 10px;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    opacity: 0;
    animation: sv-chipin 0.35s ease forwards;
  }
  .sv-chip-1 { bottom: 24px; left: 10px; animation-delay: 0.9s; }
  .sv-chip-3 { bottom: 24px; right: 10px; animation-delay: 2.1s; }
  .sv-chip-2 {
    bottom: 58px;
    left: 50%; transform: translateX(-50%);
    animation-delay: 1.5s;
    animation-name: sv-chipin-center;
  }
  @keyframes sv-chipin {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sv-chipin-center {
    from { opacity: 0; transform: translateX(-50%) translateY(5px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Dashboard ── */
  .sv-dashboard {
    padding: clamp(28px, 4vw, 44px) clamp(20px, 5vw, 52px);
    max-width: 1020px;
  }
  .sv-dash-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .sv-dash-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.63rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid rgba(180,83,9,0.18);
    padding: 4px 12px;
    border-radius: 20px;
  }
  .sv-dash-profile {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sv-avatar-circle {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    letter-spacing: 0.04em;
  }
  .sv-dash-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sv-dash-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); }
  .sv-dash-role { font-size: 0.65rem; color: var(--ink-muted); text-transform: capitalize; }
  .sv-logout-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink-muted);
    font-size: 0.75rem;
    font-family: var(--sans);
    padding: 5px 11px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .sv-logout-btn:hover { color: var(--ink); border-color: var(--ink-muted); }

  /* Welcome card */
  .sv-welcome-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 2rem;
    margin-bottom: 1.25rem;
    align-items: center;
  }
  @media (max-width: 560px) { .sv-welcome-card { grid-template-columns: 1fr; } .sv-welcome-grid { display: none; } }
  .sv-welcome-name {
    font-family: var(--serif);
    font-size: clamp(1.15rem, 2.5vw, 1.55rem);
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
    line-height: 1.2;
  }
  .sv-welcome-desc {
    font-size: 0.84rem;
    line-height: 1.65;
    color: var(--ink-muted);
    max-width: 430px;
    margin-bottom: 1.1rem;
  }
  .sv-welcome-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .sv-welcome-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
  }
  .sv-welcome-cell {
    width: 46px; height: 46px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    opacity: 0.4;
  }

  /* Dashboard feature grid */
  .sv-dash-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  @media (max-width: 640px) { .sv-dash-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 360px) { .sv-dash-grid { grid-template-columns: 1fr; } }
  .sv-dash-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 1.15rem 1.1rem;
    transition: border-color 0.15s;
  }
  .sv-dash-card:hover { border-color: rgba(180,83,9,0.25); }
  .sv-dash-card-icon {
    color: var(--accent);
    margin-bottom: 0.6rem;
    opacity: 0.85;
  }
  .sv-dash-card-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 0.3rem;
    line-height: 1.3;
    font-family: var(--sans);
  }
  .sv-dash-card-tag {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
    opacity: 0.6;
  }
  .sv-coming-soon-bar {
    font-size: 0.75rem;
    color: var(--ink-muted);
    text-align: center;
    padding: 1.25rem;
    border: 1px dashed var(--line);
    border-radius: 6px;
    opacity: 0.65;
  }
`;
