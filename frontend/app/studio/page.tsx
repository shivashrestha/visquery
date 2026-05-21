'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  BrainCircuit,
  FolderOpen,
  ScanSearch,
  MessageSquare,
  Download,
  ArrowRight,
  Check,
  X,
  Eye,
  EyeOff,
  Sparkles,
  Building2,
  ImageIcon,
  Zap,
  ChevronRight,
  LogOut,
  User,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
interface StudioUser {
  name: string;
  email: string;
  role: string;
  plan: string;
}

// ─── Feature data ─────────────────────────────────────────
const FEATURES = [
  {
    icon: <BrainCircuit size={22} />,
    title: 'AI Style Classification',
    desc: 'CLIP-powered visual embedding identifies architectural styles across 120+ historical taxonomies — from Achaemenid to Deconstructivism — in under 300 ms.',
    tag: 'Vision AI',
  },
  {
    icon: <ScanSearch size={22} />,
    title: 'Artifact Extraction',
    desc: 'Isolate and catalogue individual elements — columns, capitals, fenestration patterns, material textures — from uploaded project images automatically.',
    tag: 'Computer Vision',
  },
  {
    icon: <FolderOpen size={22} />,
    title: 'Project Image Library',
    desc: 'Organise client project images into searchable collections. Tag by style, material, structural system, or epoch with AI-generated metadata.',
    tag: 'Management',
  },
  {
    icon: <MessageSquare size={22} />,
    title: 'Chat with Buildings',
    desc: 'Ephemeral AI conversations grounded in the visual content of any uploaded image. Query structural history, material composition, and regional precedents.',
    tag: 'Generative AI',
  },
  {
    icon: <ImageIcon size={22} />,
    title: 'Reverse Image Search',
    desc: 'Upload a sketch, photograph, or rendering to find the most visually similar precedents across our 40k+ image index using cosine similarity at 0.85 threshold.',
    tag: 'Search',
  },
  {
    icon: <Download size={22} />,
    title: 'Export & Reporting',
    desc: 'Generate structured precedent reports — style classification, source attribution, metadata — for client deliverables and design documentation.',
    tag: 'Output',
  },
];

const PLAN_COMPARISON = [
  { feature: 'Text search', free: true, studio: true },
  { feature: 'Style classification', free: true, studio: true },
  { feature: 'Image upload search', free: false, studio: true },
  { feature: 'Artifact extraction', free: false, studio: true },
  { feature: 'Chat with buildings', free: false, studio: true },
  { feature: 'Project image library', free: false, studio: true },
  { feature: 'Collections & favourites', free: true, studio: true },
  { feature: 'Precedent export / reports', free: false, studio: true },
  { feature: 'Priority processing', free: false, studio: true },
  { feature: 'API access', free: false, studio: true },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Upload your project images',
    desc: 'Drag in photographs, renders, or sketches from your architectural project.',
  },
  {
    step: '02',
    title: 'AI analyses and classifies',
    desc: 'Our vision model extracts style, materials, structural elements, and historical context.',
  },
  {
    step: '03',
    title: 'Search and retrieve',
    desc: 'Query your library by style, typology, region, or epoch. Find exact visual matches across 40k+ precedents.',
  },
  {
    step: '04',
    title: 'Export for clients',
    desc: 'Generate structured precedent reports with full attribution for design documentation.',
  },
];

// ─── Studio Dashboard (post-login) ────────────────────────
function StudioDashboard({ user, onLogout }: { user: StudioUser; onLogout: () => void }) {
  return (
    <motion.div
      className="studio-dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {/* Dashboard header */}
      <div className="dash-header">
        <div className="dash-logo">
          <span className="dash-logo-vq">VQ</span>
          <div>
            <p className="dash-logo-title">Visquery Studio</p>
            <p className="dash-logo-plan">Studio Plan · Active</p>
          </div>
        </div>
        <div className="dash-user">
          <div className="dash-avatar">
            <User size={16} />
          </div>
          <div>
            <p className="dash-user-name">{user.name}</p>
            <p className="dash-user-role">{user.role}</p>
          </div>
          <button className="dash-logout" onClick={onLogout} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Welcome banner */}
      <div className="dash-welcome">
        <div className="dash-welcome-content">
          <p className="dash-welcome-eyebrow">
            <Sparkles size={12} style={{ display: 'inline', marginRight: 6 }} />
            Studio Access
          </p>
          <h2 className="dash-welcome-title">Welcome back, {user.name.split(' ')[0]}.</h2>
          <p className="dash-welcome-desc">
            Your architectural intelligence workspace is ready. Upload images, build precedent libraries,
            and generate client-ready reports.
          </p>
          <a href="/" className="dash-cta-btn">
            Open Visquery App
            <ArrowRight size={14} />
          </a>
        </div>
        <div className="dash-welcome-visual">
          <div className="dash-grid-visual">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="dash-grid-cell">
                {i % 3 === 0 && <Building2 size={18} />}
                {i % 3 === 1 && <ImageIcon size={18} />}
                {i % 3 === 2 && <Layers size={18} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick-access feature cards */}
      <div className="dash-features">
        {FEATURES.slice(0, 4).map((f) => (
          <div key={f.title} className="dash-feature-card">
            <span className="dash-feature-icon">{f.icon}</span>
            <p className="dash-feature-title">{f.title}</p>
            <span className="dash-feature-tag">{f.tag}</span>
          </div>
        ))}
      </div>

      <p className="dash-coming-soon">
        Full Studio dashboard coming soon — your account is active and ready for early access.
      </p>
    </motion.div>
  );
}

// ─── Login Panel ───────────────────────────────────────────
function LoginPanel({ onLogin }: { onLogin: (user: StudioUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

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
      if (!res.ok) {
        setError(data.error ?? 'Authentication failed.');
      } else {
        onLogin(data.user);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      className="login-panel"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div className="login-panel-head">
        <p className="login-eyebrow">Visquery Studio</p>
        <h3 className="login-title">Sign in to Studio</h3>
        <p className="login-sub">Premium access for architectural professionals.</p>
      </div>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <div className="login-field">
          <label className="login-label" htmlFor="studio-email">Email</label>
          <input
            ref={emailRef}
            id="studio-email"
            className="login-input"
            type="email"
            autoComplete="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="studio-password">Password</label>
          <div className="login-pw-wrap">
            <input
              id="studio-password"
              className="login-input login-input-pw"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-pw-toggle"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              className="login-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          className="login-submit"
          disabled={loading || !email || !password}
        >
          {loading ? (
            <span className="login-spinner" />
          ) : (
            <>Sign in to Studio <ArrowRight size={14} /></>
          )}
        </button>
      </form>

      <p className="login-note">
        No account? Contact us to request Studio access.
      </p>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function StudioPage() {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  // Persist session in sessionStorage
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

  // If logged in — show dashboard
  if (user) {
    return (
      <div className="studio-root" data-theme="studio-dark">
        <style>{studioStyles}</style>
        <StudioDashboard user={user} onLogout={handleLogout} />
      </div>
    );
  }

  return (
    <div className="studio-root" data-theme="studio-dark">
      <style>{studioStyles}</style>

      {/* ── Nav ─────────────────────────── */}
      <nav className="studio-nav">
        <a href="/" className="studio-nav-logo">
          <span className="nav-vq">VQ</span>
          <span className="nav-studio">Studio</span>
        </a>
        <div className="studio-nav-right">
          <a href="/" className="nav-link">App</a>
          <button className="nav-signin-btn" onClick={() => setShowLogin(true)}>
            Sign in
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────── */}
      <section className="studio-hero">
        <div className="hero-noise" />
        <div className="hero-grid-lines" />

        <motion.div
          className="studio-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Zap size={11} />
            Premium Plan
          </motion.div>

          <motion.h1
            className="studio-hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
          >
            The professional workspace
            <br />
            <em>for architectural intelligence.</em>
          </motion.h1>

          <motion.p
            className="studio-hero-desc"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.55 }}
          >
            Visquery Studio gives architects and designers AI-powered image management,
            style classification, artifact extraction, and precedent search — all in one
            professional workspace built for real project workflows.
          </motion.p>

          <motion.div
            className="studio-hero-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <button className="hero-primary-btn" onClick={() => setShowLogin(true)}>
              Access Studio
              <ArrowRight size={15} />
            </button>
            <a href="/" className="hero-ghost-btn">
              Try free version
            </a>
          </motion.div>

          <motion.p
            className="hero-cred"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            120+ architectural styles · 40k+ precedent images · CLIP vision AI
          </motion.p>
        </motion.div>

        {/* Floating feature pills */}
        <motion.div
          className="hero-pills"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          {['AI Style Classification', 'Artifact Extraction', 'Image Library', 'Chat with Buildings', 'Precedent Export'].map((p, i) => (
            <motion.div
              key={p}
              className="hero-pill"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
            >
              <Check size={11} className="pill-check" />
              {p}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── How it works ────────────────── */}
      <section className="studio-how">
        <div className="studio-section-inner">
          <div className="section-head">
            <p className="section-eyebrow">Workflow</p>
            <h2 className="section-title">How Studio works</h2>
          </div>
          <div className="how-steps">
            {HOW_IT_WORKS.map((s, i) => (
              <motion.div
                key={s.step}
                className="how-step"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <span className="how-step-num">{s.step}</span>
                <div className="how-step-connector" />
                <h4 className="how-step-title">{s.title}</h4>
                <p className="how-step-desc">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ───────────────── */}
      <section className="studio-features">
        <div className="studio-section-inner">
          <div className="section-head">
            <p className="section-eyebrow">Capabilities</p>
            <h2 className="section-title">Every tool your practice needs</h2>
            <p className="section-desc">
              Powered by CLIP vision embeddings and large language models, Studio brings
              production-grade architectural AI to your daily workflow.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="feature-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
              >
                <div className="feature-card-top">
                  <span className="feature-icon">{f.icon}</span>
                  <span className="feature-tag">{f.tag}</span>
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
                <div className="feature-arrow">
                  <ChevronRight size={14} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo visual ─────────────────── */}
      <section className="studio-demo">
        <div className="studio-section-inner">
          <div className="demo-split">
            <div className="demo-text">
              <p className="section-eyebrow">AI Vision</p>
              <h2 className="section-title">Understand any building, instantly.</h2>
              <p className="section-desc">
                Upload a photograph — from site visit, archive, or sketch — and Studio&apos;s
                vision model returns style classification, component identification, material
                analysis, and historical context in seconds.
              </p>
              <ul className="demo-bullets">
                <li><Check size={13} /> Identifies 120+ architectural styles</li>
                <li><Check size={13} /> Extracts columns, windows, facades, ornament</li>
                <li><Check size={13} /> Maps regional and epoch precedents</li>
                <li><Check size={13} /> Generates structured metadata for your library</li>
              </ul>
              <button className="demo-cta-btn" onClick={() => setShowLogin(true)}>
                Start with Studio
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Animated mock scan */}
            <div className="demo-visual">
              <div className="demo-scan-frame">
                <div className="demo-scan-grid" />
                <div className="demo-scan-line" />
                <div className="demo-scan-corner demo-scan-tl" />
                <div className="demo-scan-corner demo-scan-tr" />
                <div className="demo-scan-corner demo-scan-bl" />
                <div className="demo-scan-corner demo-scan-br" />
                <div className="demo-scan-placeholder">
                  <Building2 size={48} className="demo-scan-icon" />
                  <p>Analysing architecture</p>
                </div>
                <div className="demo-result-chip demo-chip-1">
                  <Sparkles size={10} />
                  Beaux-Arts · 92%
                </div>
                <div className="demo-result-chip demo-chip-2">
                  <Layers size={10} />
                  Limestone · Classical
                </div>
                <div className="demo-result-chip demo-chip-3">
                  <ScanSearch size={10} />
                  12 artifacts found
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plan comparison ─────────────── */}
      <section className="studio-pricing">
        <div className="studio-section-inner">
          <div className="section-head">
            <p className="section-eyebrow">Plans</p>
            <h2 className="section-title">Free vs Studio</h2>
          </div>

          <div className="pricing-cards">
            {/* Free card */}
            <div className="pricing-card pricing-free">
              <div className="pricing-card-head">
                <p className="plan-name">Free</p>
                <p className="plan-price">£0<span>/mo</span></p>
                <p className="plan-sub">For individuals exploring architectural search.</p>
              </div>
              <ul className="plan-features">
                {PLAN_COMPARISON.map((row) => (
                  <li key={row.feature} className={row.free ? '' : 'plan-feature-missing'}>
                    {row.free
                      ? <Check size={13} className="feat-check" />
                      : <X size={13} className="feat-x" />
                    }
                    {row.feature}
                  </li>
                ))}
              </ul>
              <a href="/" className="plan-btn plan-btn-ghost">Use for free</a>
            </div>

            {/* Studio card */}
            <div className="pricing-card pricing-studio">
              <div className="studio-popular-badge">
                <Sparkles size={10} /> Recommended
              </div>
              <div className="pricing-card-head">
                <p className="plan-name">Studio</p>
                <p className="plan-price">£49<span>/mo</span></p>
                <p className="plan-sub">For architectural practices and design studios.</p>
              </div>
              <ul className="plan-features">
                {PLAN_COMPARISON.map((row) => (
                  <li key={row.feature}>
                    <Check size={13} className="feat-check feat-check-gold" />
                    {row.feature}
                  </li>
                ))}
              </ul>
              <button className="plan-btn plan-btn-primary" onClick={() => setShowLogin(true)}>
                Access Studio <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA footer ──────────────────── */}
      <section className="studio-footer-cta">
        <div className="studio-section-inner">
          <motion.div
            className="footer-cta-box"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="footer-cta-eyebrow">Ready to upgrade?</p>
            <h2 className="footer-cta-title">Bring AI to your architectural practice.</h2>
            <p className="footer-cta-desc">
              Join the architectural professionals using Visquery Studio to accelerate
              precedent research and image management.
            </p>
            <button className="hero-primary-btn" onClick={() => setShowLogin(true)}>
              Sign in to Studio
              <ArrowRight size={15} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Login modal ─────────────────── */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            className="login-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}
          >
            <motion.div
              className="login-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <button
                className="login-close"
                onClick={() => setShowLogin(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
              <LoginPanel onLogin={(u) => { handleLogin(u); setShowLogin(false); }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scoped styles ─────────────────────────────────────────
const studioStyles = `
  /* ── Reset & root ── */
  .studio-root {
    min-height: 100vh;
    background: #080C14;
    color: #E8E4DC;
    font-family: 'Inter', system-ui, sans-serif;
    overflow-x: hidden;
  }

  /* ── Nav ── */
  .studio-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem;
    height: 56px;
    background: rgba(8,12,20,0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .studio-nav-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .nav-vq {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #D97706;
    letter-spacing: -0.02em;
  }
  .nav-studio {
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(232,228,220,0.5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .studio-nav-right {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .nav-link {
    font-size: 0.82rem;
    color: rgba(232,228,220,0.55);
    text-decoration: none;
    transition: color 0.2s;
  }
  .nav-link:hover { color: #E8E4DC; }
  .nav-signin-btn {
    background: rgba(217,119,6,0.12);
    border: 1px solid rgba(217,119,6,0.35);
    color: #D97706;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .nav-signin-btn:hover {
    background: rgba(217,119,6,0.22);
    border-color: rgba(217,119,6,0.6);
  }

  /* ── Hero ── */
  .studio-hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 100px 2rem 80px;
    overflow: hidden;
  }
  .hero-noise {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: 0.4;
    pointer-events: none;
  }
  .hero-grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
  }
  .studio-hero-content {
    position: relative;
    z-index: 2;
    max-width: 680px;
    text-align: center;
  }
  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #D97706;
    background: rgba(217,119,6,0.1);
    border: 1px solid rgba(217,119,6,0.25);
    padding: 5px 12px;
    border-radius: 20px;
    margin-bottom: 1.5rem;
  }
  .studio-hero-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(2.2rem, 5vw, 3.8rem);
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: -0.02em;
    color: #F0EDE6;
    margin-bottom: 1.25rem;
  }
  .studio-hero-title em {
    font-style: italic;
    color: #D97706;
  }
  .studio-hero-desc {
    font-size: 1rem;
    line-height: 1.7;
    color: rgba(232,228,220,0.6);
    max-width: 560px;
    margin: 0 auto 2rem;
  }
  .studio-hero-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .hero-primary-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #D97706;
    color: #080C14;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 12px 24px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }
  .hero-primary-btn:hover {
    background: #B45309;
    transform: translateY(-1px);
  }
  .hero-ghost-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: rgba(232,228,220,0.6);
    text-decoration: none;
    border: 1px solid rgba(255,255,255,0.1);
    padding: 11px 20px;
    border-radius: 4px;
    transition: color 0.2s, border-color 0.2s;
  }
  .hero-ghost-btn:hover {
    color: #E8E4DC;
    border-color: rgba(255,255,255,0.2);
  }
  .hero-cred {
    font-size: 0.72rem;
    color: rgba(232,228,220,0.3);
    letter-spacing: 0.04em;
  }
  .hero-pills {
    position: absolute;
    right: 8%;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 2;
  }
  .hero-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: rgba(232,228,220,0.7);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 8px 14px;
    border-radius: 4px;
    white-space: nowrap;
    backdrop-filter: blur(8px);
  }
  .pill-check { color: #D97706; flex-shrink: 0; }

  @media (max-width: 900px) { .hero-pills { display: none; } }

  /* ── Section commons ── */
  .studio-section-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 2rem;
  }
  .section-head {
    margin-bottom: 3rem;
  }
  .section-eyebrow {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #D97706;
    margin-bottom: 0.6rem;
  }
  .section-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(1.7rem, 3.5vw, 2.6rem);
    font-weight: 700;
    line-height: 1.18;
    letter-spacing: -0.02em;
    color: #F0EDE6;
    margin-bottom: 0.75rem;
  }
  .section-desc {
    font-size: 0.95rem;
    line-height: 1.7;
    color: rgba(232,228,220,0.55);
    max-width: 560px;
  }

  /* ── How it works ── */
  .studio-how {
    padding: 100px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .how-steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
  }
  @media (max-width: 768px) { .how-steps { grid-template-columns: 1fr 1fr; gap: 2rem; } }
  @media (max-width: 480px) { .how-steps { grid-template-columns: 1fr; } }
  .how-step {
    padding: 0 2rem 0 0;
    position: relative;
  }
  .how-step-num {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: #D97706;
    letter-spacing: 0.06em;
    margin-bottom: 0.75rem;
  }
  .how-step-connector {
    width: 40px;
    height: 1px;
    background: linear-gradient(90deg, #D97706, transparent);
    margin-bottom: 1rem;
  }
  .how-step-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #F0EDE6;
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }
  .how-step-desc {
    font-size: 0.82rem;
    line-height: 1.65;
    color: rgba(232,228,220,0.5);
  }

  /* ── Features grid ── */
  .studio-features {
    padding: 100px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    overflow: hidden;
  }
  @media (max-width: 768px) { .features-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .features-grid { grid-template-columns: 1fr; } }
  .feature-card {
    background: #0C1120;
    padding: 1.75rem;
    position: relative;
    transition: background 0.2s;
    cursor: default;
  }
  .feature-card:hover { background: #111827; }
  .feature-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .feature-icon {
    color: #D97706;
    opacity: 0.85;
  }
  .feature-tag {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(217,119,6,0.6);
    background: rgba(217,119,6,0.08);
    border: 1px solid rgba(217,119,6,0.15);
    padding: 3px 8px;
    border-radius: 3px;
  }
  .feature-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: #F0EDE6;
    margin-bottom: 0.5rem;
    line-height: 1.35;
  }
  .feature-desc {
    font-size: 0.79rem;
    line-height: 1.65;
    color: rgba(232,228,220,0.45);
  }
  .feature-arrow {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    color: rgba(217,119,6,0.3);
    opacity: 0;
    transition: opacity 0.2s, color 0.2s;
  }
  .feature-card:hover .feature-arrow { opacity: 1; color: #D97706; }

  /* ── Demo ── */
  .studio-demo {
    padding: 100px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
    background: linear-gradient(180deg, #080C14 0%, #0C1120 100%);
  }
  .demo-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5rem;
    align-items: center;
  }
  @media (max-width: 768px) { .demo-split { grid-template-columns: 1fr; gap: 3rem; } }
  .demo-bullets {
    list-style: none;
    margin: 1.25rem 0 2rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .demo-bullets li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.84rem;
    color: rgba(232,228,220,0.65);
  }
  .demo-bullets li svg { color: #D97706; flex-shrink: 0; }
  .demo-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1px solid rgba(217,119,6,0.4);
    color: #D97706;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .demo-cta-btn:hover {
    background: rgba(217,119,6,0.1);
    border-color: rgba(217,119,6,0.7);
  }

  /* Animated scan mock */
  .demo-visual { display: flex; justify-content: center; }
  .demo-scan-frame {
    position: relative;
    width: 360px;
    height: 300px;
    background: #0a0f1a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .demo-scan-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(217,119,6,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(217,119,6,0.06) 1px, transparent 1px);
    background-size: 30px 30px;
  }
  .demo-scan-line {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #D97706, transparent);
    animation: scanDown 3s ease-in-out infinite;
    box-shadow: 0 0 12px rgba(217,119,6,0.6);
  }
  @keyframes scanDown {
    0% { top: 0; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  .demo-scan-corner {
    position: absolute;
    width: 16px; height: 16px;
    border-color: #D97706;
    border-style: solid;
    opacity: 0.7;
  }
  .demo-scan-tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
  .demo-scan-tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
  .demo-scan-bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
  .demo-scan-br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }
  .demo-scan-placeholder {
    position: relative;
    z-index: 2;
    text-align: center;
    color: rgba(232,228,220,0.2);
    font-size: 0.75rem;
  }
  .demo-scan-icon { margin: 0 auto 0.5rem; display: block; opacity: 0.3; }
  .demo-result-chip {
    position: absolute;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    font-weight: 500;
    background: rgba(8,12,20,0.9);
    border: 1px solid rgba(217,119,6,0.3);
    color: #D97706;
    padding: 5px 10px;
    border-radius: 20px;
    backdrop-filter: blur(6px);
    animation: fadeInChip 0.4s ease forwards;
    opacity: 0;
  }
  .demo-chip-1 { bottom: 28px; left: 12px; animation-delay: 0.8s; }
  .demo-chip-2 { bottom: 60px; left: 50%; transform: translateX(-50%); animation-delay: 1.4s; }
  .demo-chip-3 { bottom: 28px; right: 12px; animation-delay: 2s; }
  @keyframes fadeInChip {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Pricing ── */
  .studio-pricing {
    padding: 100px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .pricing-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    max-width: 720px;
  }
  @media (max-width: 600px) { .pricing-cards { grid-template-columns: 1fr; } }
  .pricing-card {
    background: #0C1120;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    padding: 2rem;
    position: relative;
  }
  .pricing-studio {
    border-color: rgba(217,119,6,0.3);
    background: linear-gradient(160deg, #0f1624 0%, #0C1120 100%);
  }
  .studio-popular-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #D97706;
    background: rgba(217,119,6,0.1);
    border: 1px solid rgba(217,119,6,0.2);
    padding: 4px 10px;
    border-radius: 20px;
    margin-bottom: 1rem;
  }
  .pricing-card-head { margin-bottom: 1.5rem; }
  .plan-name {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(232,228,220,0.5);
    margin-bottom: 0.5rem;
  }
  .plan-price {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 2.2rem;
    font-weight: 700;
    color: #F0EDE6;
    line-height: 1;
    margin-bottom: 0.5rem;
  }
  .plan-price span { font-size: 0.9rem; color: rgba(232,228,220,0.4); font-family: 'Inter', sans-serif; font-weight: 400; }
  .plan-sub { font-size: 0.78rem; color: rgba(232,228,220,0.4); line-height: 1.5; }
  .plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .plan-features li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: rgba(232,228,220,0.7);
  }
  .plan-feature-missing { color: rgba(232,228,220,0.25) !important; text-decoration: line-through; }
  .feat-check { color: #22C55E; flex-shrink: 0; }
  .feat-check-gold { color: #D97706 !important; }
  .feat-x { color: rgba(232,228,220,0.2); flex-shrink: 0; }
  .plan-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 11px;
    border-radius: 4px;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    border: none;
  }
  .plan-btn-ghost {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(232,228,220,0.6);
  }
  .plan-btn-ghost:hover { border-color: rgba(255,255,255,0.2); color: #E8E4DC; }
  .plan-btn-primary {
    background: #D97706;
    color: #080C14;
    font-weight: 600;
  }
  .plan-btn-primary:hover { background: #B45309; transform: translateY(-1px); }

  /* ── Footer CTA ── */
  .studio-footer-cta {
    padding: 100px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .footer-cta-box {
    text-align: center;
    max-width: 560px;
    margin: 0 auto;
  }
  .footer-cta-eyebrow {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #D97706;
    margin-bottom: 0.75rem;
  }
  .footer-cta-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    font-weight: 700;
    color: #F0EDE6;
    line-height: 1.2;
    margin-bottom: 0.75rem;
    letter-spacing: -0.02em;
  }
  .footer-cta-desc {
    font-size: 0.9rem;
    color: rgba(232,228,220,0.5);
    line-height: 1.7;
    margin-bottom: 2rem;
  }

  /* ── Login overlay ── */
  .login-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .login-modal {
    position: relative;
    background: #0D1421;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    width: 100%;
    max-width: 400px;
    padding: 2.5rem;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(217,119,6,0.1);
  }
  .login-close {
    position: absolute;
    top: 1rem; right: 1rem;
    background: transparent;
    border: none;
    color: rgba(232,228,220,0.4);
    cursor: pointer;
    padding: 4px;
    transition: color 0.2s;
  }
  .login-close:hover { color: #E8E4DC; }

  /* Login panel internals */
  .login-panel-head { margin-bottom: 1.75rem; }
  .login-eyebrow {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #D97706;
    margin-bottom: 0.4rem;
  }
  .login-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 1.6rem;
    font-weight: 700;
    color: #F0EDE6;
    margin-bottom: 0.25rem;
    letter-spacing: -0.01em;
  }
  .login-sub { font-size: 0.8rem; color: rgba(232,228,220,0.45); }
  .login-form { display: flex; flex-direction: column; gap: 1rem; }
  .login-field { display: flex; flex-direction: column; gap: 6px; }
  .login-label { font-size: 0.75rem; font-weight: 500; color: rgba(232,228,220,0.6); letter-spacing: 0.02em; }
  .login-input {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 10px 12px;
    font-size: 0.88rem;
    color: #F0EDE6;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s;
    font-family: inherit;
  }
  .login-input::placeholder { color: rgba(232,228,220,0.25); }
  .login-input:focus { border-color: rgba(217,119,6,0.5); }
  .login-pw-wrap { position: relative; }
  .login-input-pw { padding-right: 40px; }
  .login-pw-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: rgba(232,228,220,0.35);
    cursor: pointer;
    padding: 2px;
    display: flex;
    transition: color 0.2s;
  }
  .login-pw-toggle:hover { color: rgba(232,228,220,0.7); }
  .login-error {
    font-size: 0.78rem;
    color: #F87171;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.2);
    border-radius: 4px;
    padding: 8px 12px;
  }
  .login-submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #D97706;
    color: #080C14;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 11px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    margin-top: 0.25rem;
    font-family: inherit;
  }
  .login-submit:hover:not(:disabled) { background: #B45309; }
  .login-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .login-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(8,12,20,0.3);
    border-top-color: #080C14;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .login-note {
    font-size: 0.72rem;
    color: rgba(232,228,220,0.3);
    text-align: center;
    margin-top: 1rem;
  }

  /* ── Dashboard ── */
  .studio-dashboard {
    min-height: 100vh;
    padding: 2rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  .dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0 2rem;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    margin-bottom: 2rem;
  }
  .dash-logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .dash-logo-vq {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 1.4rem;
    font-weight: 700;
    color: #D97706;
    background: rgba(217,119,6,0.1);
    border: 1px solid rgba(217,119,6,0.2);
    width: 42px; height: 42px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dash-logo-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: #F0EDE6;
  }
  .dash-logo-plan {
    font-size: 0.68rem;
    color: #D97706;
    letter-spacing: 0.04em;
  }
  .dash-user {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dash-avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(217,119,6,0.15);
    border: 1px solid rgba(217,119,6,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #D97706;
  }
  .dash-user-name { font-size: 0.82rem; font-weight: 500; color: #F0EDE6; }
  .dash-user-role { font-size: 0.68rem; color: rgba(232,228,220,0.4); text-transform: capitalize; }
  .dash-logout {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(232,228,220,0.4);
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    transition: all 0.2s;
  }
  .dash-logout:hover { color: #E8E4DC; border-color: rgba(255,255,255,0.2); }

  .dash-welcome {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3rem;
    background: linear-gradient(135deg, #0f1624 0%, #111827 100%);
    border: 1px solid rgba(217,119,6,0.15);
    border-radius: 10px;
    padding: 2.5rem;
    margin-bottom: 2rem;
    align-items: center;
    overflow: hidden;
  }
  @media (max-width: 600px) { .dash-welcome { grid-template-columns: 1fr; } }
  .dash-welcome-eyebrow {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #D97706;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
  }
  .dash-welcome-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(1.4rem, 3vw, 2rem);
    font-weight: 700;
    color: #F0EDE6;
    margin-bottom: 0.6rem;
    letter-spacing: -0.02em;
  }
  .dash-welcome-desc {
    font-size: 0.85rem;
    line-height: 1.65;
    color: rgba(232,228,220,0.5);
    max-width: 440px;
    margin-bottom: 1.5rem;
  }
  .dash-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #D97706;
    color: #080C14;
    font-size: 0.84rem;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 4px;
    text-decoration: none;
    transition: background 0.2s;
  }
  .dash-cta-btn:hover { background: #B45309; }
  .dash-grid-visual {
    display: grid;
    grid-template-columns: repeat(3, 60px);
    gap: 8px;
  }
  .dash-grid-cell {
    width: 60px; height: 60px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(217,119,6,0.25);
  }

  .dash-features {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  @media (max-width: 768px) { .dash-features { grid-template-columns: 1fr 1fr; } }
  .dash-feature-card {
    background: #0C1120;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .dash-feature-icon { color: #D97706; margin-bottom: 0.75rem; display: block; }
  .dash-feature-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #F0EDE6;
    margin-bottom: 0.4rem;
  }
  .dash-feature-tag {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(217,119,6,0.55);
  }

  .dash-coming-soon {
    font-size: 0.78rem;
    color: rgba(232,228,220,0.25);
    text-align: center;
    padding: 2rem;
    border: 1px dashed rgba(255,255,255,0.06);
    border-radius: 6px;
  }
`;
