'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, ArrowRight, BrainCircuit, Building2, ChevronRight, Cpu,
  Database, Download, Eye, EyeOff, FileText, FolderOpen, Layers,
  MessageSquare, ScanSearch, Search, Sparkles, Upload, CheckCircle2,
} from 'lucide-react';
import ContactModal from '../ContactModal';
import type { LucideIcon } from 'lucide-react';
import duomoImg from './studio-building-sample.jpg';

export interface StudioUser {
  name: string;
  email: string;
  role: string;
  plan: string;
}

interface StudioLandingProps {
  onLogin: (user: StudioUser) => void;
}

const PROOF_POINTS = [
  '120+ architectural styles recognised',
  'Five image-source ingestion methods',
  'Vision-language model + RAG chat per image',
  'Private library, no public exposure',
];

const CAPABILITIES: { n: string; icon: LucideIcon; tag: string; title: string; body: string }[] = [
  { n: '01', icon: BrainCircuit,  tag: 'Vision AI',     title: 'AI Style Classification', body: 'Vision-language model identifies architectural styles across 120+ historical taxonomies.' },
  { n: '02', icon: ScanSearch,    tag: 'Analysis',      title: 'Artifact Extraction',     body: 'Isolate columns, capitals, fenestration, ornament, material textures automatically.' },
  { n: '03', icon: FolderOpen,    tag: 'Management',    title: 'Project Image Library',   body: 'Build searchable collections with AI-generated metadata for every image.' },
  { n: '04', icon: MessageSquare, tag: 'Generative AI', title: 'Chat with Any Building',  body: 'Ask questions about any image in plain language — get expert architectural answers.' },
  { n: '05', icon: Database,      tag: 'Sources',       title: 'Five-source Ingest',      body: 'URL scrape, PDF, PPTX, video frame extraction, and S3 bucket — all in one place.' },
  { n: '06', icon: Download,      tag: 'Output',        title: 'Export & Reports',        body: 'Generate structured precedent reports with full attribution for client deliverables.' },
];

const WORKFLOW_STEPS = [
  {
    n: '01', icon: Upload,
    title: 'Upload project images',
    body: 'Drag in photographs, site visit shots, renders, or scanned drawings from your architectural project.',
  },
  {
    n: '02', icon: Cpu,
    title: 'AI analyses and classifies',
    body: 'Vision language model identifies style, extracts materials, structural elements, and maps historical context.',
  },
  {
    n: '03', icon: Search,
    title: 'Search and retrieve',
    body: 'Query your library or global index by style, typology, region, or epoch. Find exact visual matches instantly.',
  },
  {
    n: '04', icon: FileText,
    title: 'Export for clients',
    body: 'Generate structured precedent reports with full attribution — ready for design documentation and client presentations.',
  },
];

const VLM_FEATURES = [
  'Identifies 120+ architectural styles by image alone',
  'Extracts columns, windows, facades, and ornament',
  'Maps regional and epoch precedents automatically',
  'Generates structured metadata ready for your library',
];

const IMPACT_STATS = [
  { value: '120+', label: 'Architectural styles', sub: 'identified in one pass' },
  { value: '5×',   label: 'Faster precedent research', sub: 'vs. manual archival methods' },
  { value: '98%',  label: 'Classification accuracy', sub: 'on curated benchmark dataset' },
  { value: '<3s',  label: 'Analysis time per image', sub: 'style + artefacts + context' },
];

/* ── 3D wireframe column canvas ─────────────────────────────── */
type Vec3 = { x: number; y: number; z: number };

interface ArchComp { name: string; label: string; es: number; ee: number; scanY: number }

// Milan Duomo wireframe — Y centred: ground=-3.35, tallest spire=+3.35
function buildDuomo(): { verts: Vec3[]; edges: [number, number][]; comps: ArchComp[] } {
  const V: Vec3[] = [];
  const E: [number, number][] = [];
  const comps: ArchComp[] = [];

  const pv = (x: number, y: number, z: number) => { V.push({ x, y, z }); return V.length - 1; };
  const pe = (a: number, b: number) => { E.push([a, b]); };

  function box(x1: number, x2: number, y1: number, y2: number, z1: number, z2: number) {
    const v0 = pv(x1,y1,z1), v1 = pv(x2,y1,z1), v2 = pv(x2,y1,z2), v3 = pv(x1,y1,z2);
    const v4 = pv(x1,y2,z1), v5 = pv(x2,y2,z1), v6 = pv(x2,y2,z2), v7 = pv(x1,y2,z2);
    pe(v0,v1); pe(v1,v2); pe(v2,v3); pe(v3,v0);
    pe(v4,v5); pe(v5,v6); pe(v6,v7); pe(v7,v4);
    pe(v0,v4); pe(v1,v5); pe(v2,v6); pe(v3,v7);
  }

  // Gothic pointed arch on a flat face (z = zf)
  function arch(cx: number, y0: number, zf: number, w: number, h: number) {
    const bl = pv(cx-w, y0,          zf);
    const br = pv(cx+w, y0,          zf);
    const ml = pv(cx-w, y0 + h*0.62, zf);
    const mr = pv(cx+w, y0 + h*0.62, zf);
    const ap = pv(cx,   y0 + h,      zf);
    pe(bl,br); pe(bl,ml); pe(br,mr); pe(ml,ap); pe(mr,ap);
  }

  // 4-sided pyramid spire
  function spire(cx: number, cz: number, y0: number, ytip: number, w: number, d: number) {
    const b0 = pv(cx-w, y0, cz-d), b1 = pv(cx+w, y0, cz-d);
    const b2 = pv(cx+w, y0, cz+d), b3 = pv(cx-w, y0, cz+d);
    const tp  = pv(cx, ytip, cz);
    pe(b0,b1); pe(b1,b2); pe(b2,b3); pe(b3,b0);
    pe(b0,tp); pe(b1,tp); pe(b2,tp); pe(b3,tp);
  }

  // Rose window — circle of n vertices + spokes
  function rose(cx: number, cy: number, cz: number, r: number, n: number) {
    const base = V.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pv(cx + Math.cos(a)*r, cy + Math.sin(a)*r, cz);
    }
    for (let i = 0; i < n; i++) pe(base+i, base+(i+1)%n);
    const ctr = pv(cx, cy, cz);
    for (let i = 0; i < n; i += 2) pe(ctr, base+i);
  }

  function section(name: string, label: string, scanY: number, fn: () => void) {
    const es = E.length;
    fn();
    comps.push({ name, label, es, ee: E.length, scanY });
  }

  const ZF = -1.7;  // front face Z
  const ZB =  1.7;  // back face Z

  section('plinth', 'Stone Plinth', -3.1, () => {
    box(-4.3, 4.3, -3.35, -2.95, -1.9, 1.9);
    box(-4.1, 4.1, -2.95, -2.7,  -1.8, 1.8);
  });

  section('portals', 'Gothic Portals', -2.3, () => {
    // 5 main portal arches — central widest
    arch( 0.0,  -2.7, ZF, 0.54, 1.08);
    arch(-1.28, -2.7, ZF, 0.42, 0.92);
    arch( 1.28, -2.7, ZF, 0.42, 0.92);
    arch(-2.55, -2.7, ZF, 0.35, 0.80);
    arch( 2.55, -2.7, ZF, 0.35, 0.80);
    // Gabled canopy over-arches
    arch( 0.0,  -1.62, ZF, 0.66, 0.44);
    arch(-1.28, -1.62, ZF, 0.54, 0.40);
    arch( 1.28, -1.62, ZF, 0.54, 0.40);
    arch(-2.55, -1.62, ZF, 0.44, 0.36);
    arch( 2.55, -1.62, ZF, 0.44, 0.36);
  });

  section('nave', 'Nave Walls', -1.4, () => {
    box(-4.1, 4.1, -2.7, -0.08, -1.7, 1.7);
    box(-4.2, 4.2, -0.08, 0.14, -1.75, 1.75);  // main cornice
  });

  section('tracery', 'Window Tracery', 0.0, () => {
    // Central large rose window
    rose(0, 0.08, ZF, 0.40, 16);
    // Flanking oculi
    rose(-1.28, 0.28, ZF, 0.19, 10);
    rose( 1.28, 0.28, ZF, 0.19, 10);
    // Tall lancet windows left & right of rose
    arch(-0.78, -0.5, ZF, 0.21, 1.08);
    arch( 0.78, -0.5, ZF, 0.21, 1.08);
    arch(-2.0,  -0.5, ZF, 0.19, 0.96);
    arch( 2.0,  -0.5, ZF, 0.19, 0.96);
    arch(-3.2,  -0.5, ZF, 0.17, 0.88);
    arch( 3.2,  -0.5, ZF, 0.17, 0.88);
    // Back-face lancets visible when building rotates
    arch( 0.0,  -0.3, ZB, 0.32, 1.02);
    arch(-1.5,  -0.3, ZB, 0.23, 0.90);
    arch( 1.5,  -0.3, ZB, 0.23, 0.90);
  });

  section('triforium', 'Triforium Gallery', 0.4, () => {
    box(-3.9, 3.9, 0.14, 0.62, -1.65, 1.65);
    box(-3.6, 3.6, 0.62, 1.15, -1.55, 1.55);
    box(-4.2, 4.2, 1.15, 1.38, -1.75, 1.75);  // upper cornice
  });

  section('buttresses', 'Flying Buttresses', 0.9, () => {
    // Side flying buttresses — diagonal struts at multiple Z depths
    const bzs = [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5];
    for (const bz of bzs) {
      pe(pv(-2.6, -0.2, bz), pv(-4.1, 0.95, bz));
      pe(pv(-2.6,  0.5, bz), pv(-3.9, 1.35, bz));
      pe(pv( 2.6, -0.2, bz), pv( 4.1, 0.95, bz));
      pe(pv( 2.6,  0.5, bz), pv( 3.9, 1.35, bz));
    }
    // Outer buttress piers
    box(-4.6, -3.9, -0.5, 1.38, -1.75, 1.75);
    box( 3.9,  4.6, -0.5, 1.38, -1.75, 1.75);
  });

  section('pinnacles', 'Pinnacles', 1.4, () => {
    // Outer pier pinnacles
    const oxs = [-4.2, -3.6, -2.9, 2.9, 3.6, 4.2];
    for (const px of oxs) spire(px, 0, 1.38, 2.2, 0.17, 0.17);
    // Intermediate pinnacles between main guglie
    const ixs = [-3.2, -2.1, -0.7, 0.7, 2.1, 3.2];
    for (const px of ixs) {
      spire(px, 0,   1.38, 2.42, 0.14, 0.14);
      spire(px, ZF,  1.22, 2.05, 0.09, 0.07);
      spire(px, ZB,  1.22, 2.05, 0.09, 0.07);
    }
  });

  section('spires', 'Guglie Spires', 2.0, () => {
    // Central Madonnina spire — tallest
    spire(0,     0, 1.38, 3.35, 0.30, 0.30);
    // Primary flanking
    spire(-1.08, 0, 1.32, 2.72, 0.23, 0.23);
    spire( 1.08, 0, 1.32, 2.72, 0.23, 0.23);
    // Secondary
    spire(-2.18, 0, 1.26, 2.32, 0.19, 0.19);
    spire( 2.18, 0, 1.26, 2.32, 0.19, 0.19);
    // Tertiary
    spire(-3.25, 0, 1.20, 1.98, 0.15, 0.15);
    spire( 3.25, 0, 1.20, 1.98, 0.15, 0.15);
    // Quaternary (outermost visible guglie)
    spire(-4.05, 0, 1.05, 1.72, 0.12, 0.12);
    spire( 4.05, 0, 1.05, 1.72, 0.12, 0.12);
  });

  return { verts: V, edges: E, comps };
}

const COMP_HL: Record<string, string> = {
  plinth:      'rgba(251,146,60,{a})',
  portals:     'rgba(249,115,22,{a})',
  nave:        'rgba(251,160,40,{a})',
  tracery:     'rgba(251,191,36,{a})',
  triforium:   'rgba(253,208,55,{a})',
  buttresses:  'rgba(250,220,50,{a})',
  pinnacles:   'rgba(253,224,71,{a})',
  spires:      'rgba(254,240,138,{a})',
};

function fa(tpl: string, a: number) { return tpl.replace('{a}', a.toFixed(3)); }

function ArchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const stRef     = useRef({
    angle:  0.25,
    scanY: -3.0,
    det:    new Set<string>(),
    la:     {} as Record<string, number>,
    mx:     0.2,
    my:     0.2,
    hover:  false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { verts, edges, comps } = buildDuomo();

    const edgeComp = new Array<ArchComp | undefined>(edges.length);
    for (const c of comps) for (let i = c.es; i < c.ee; i++) edgeComp[i] = c;

    // Load real Duomo photo for scan-reveal backdrop
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = (duomoImg as unknown as { src: string }).src;

    const resize = () => {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      stRef.current.mx    = (ev.clientX - r.left) / r.width;
      stRef.current.my    = (ev.clientY - r.top)  / r.height;
      stRef.current.hover = true;
    };
    const onLeave = () => { stRef.current.hover = false; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    function frame() {
      if (!canvas || !ctx) return;
      const W = canvas.width, H = canvas.height;
      if (!W || !H) { rafRef.current = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, W, H);

      // Dark background
      ctx.fillStyle = 'rgba(15,23,42,0.97)';
      ctx.fillRect(0, 0, W, H);

      const st = stRef.current;
      st.angle += st.hover ? 0.0004 : 0.0008;
      const yaw   = st.hover ? st.angle + (st.mx - 0.5) * 0.45 : st.angle;
      const pitch = st.hover ? -0.2 + (st.my - 0.5) * 0.22 : -0.2;

      st.scanY += 0.007;
      if (st.scanY > 4.2) { st.scanY = -3.6; st.det.clear(); st.la = {}; }
      for (const c of comps) {
        if (!st.det.has(c.name) && st.scanY >= c.scanY) { st.det.add(c.name); st.la[c.name] = 0; }
        if (st.det.has(c.name)) st.la[c.name] = Math.min(1, (st.la[c.name] ?? 0) + 0.018);
      }

      const cosYaw = Math.cos(yaw),   sinYaw = Math.sin(yaw);
      const cosPit = Math.cos(pitch), sinPit = Math.sin(pitch);
      const FOV = 8, SC = Math.min(W, H) * 0.088;

      // Screen Y of scan plane centre (for image clip)
      const ryScan = st.scanY * cosPit;
      const rzScan = st.scanY * sinPit;
      const dScan  = rzScan + FOV;
      const scanSY = dScan > 0.1 ? H / 2 - ryScan * (FOV / dScan) * SC : H / 2;

      // Real photo scan-reveal: dim above scan, brighter below (= "already analysed")
      const imgEl = imgRef.current;
      if (imgEl) {
        // Cover-crop helper
        const ar = imgEl.naturalWidth / imgEl.naturalHeight;
        const caR = W / H;
        let sx = 0, sy = 0, sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
        if (ar > caR) { sw = sh * caR; sx = (imgEl.naturalWidth - sw) / 2; }
        else          { sh = sw / caR; sy = (imgEl.naturalHeight - sh) / 2; }

        // Above scan — not yet analysed (very dim)
        const clipTop = Math.max(0, Math.min(scanSY, H));
        if (clipTop > 0) {
          ctx.save();
          ctx.beginPath(); ctx.rect(0, 0, W, clipTop); ctx.clip();
          ctx.globalAlpha = 0.13;
          ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, W, H);
          ctx.restore();
        }

        // Below scan — analysed (photo revealed)
        if (clipTop < H) {
          ctx.save();
          ctx.beginPath(); ctx.rect(0, clipTop, W, H - clipTop); ctx.clip();
          ctx.globalAlpha = 0.45;
          ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, W, H);
          // Warm amber tint over revealed area to unify palette
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = 'rgba(120,53,15,1)';
          ctx.fillRect(0, clipTop, W, H - clipTop);
          ctx.restore();
        }
      }

      const proj = verts.map(v3 => {
        const rx  = v3.x * cosYaw - v3.z * sinYaw;
        const rz0 = v3.x * sinYaw + v3.z * cosYaw;
        const ry  = v3.y * cosPit - rz0 * sinPit;
        const rz  = v3.y * sinPit + rz0 * cosPit;
        const d   = rz + FOV;
        const sf  = d > 0.1 ? (FOV / d) * SC : 0;
        return { sx: W / 2 + rx * sf, sy: H / 2 - ry * sf, d };
      });

      const ds = proj.map(p => p.d);
      const dMin = Math.min(...ds), dMax = Math.max(...ds), dR = dMax - dMin + 0.001;

      // Scan plane
      const spl = [
        { x: -4.8, z: -1.95 }, { x: 4.8, z: -1.95 },
        { x:  4.8, z:  1.95 }, { x: -4.8, z:  1.95 },
      ].map(pt => {
        const rx  = pt.x * cosYaw - pt.z * sinYaw;
        const rz0 = pt.x * sinYaw + pt.z * cosYaw;
        const ry  = st.scanY * cosPit - rz0 * sinPit;
        const rz  = st.scanY * sinPit + rz0 * cosPit;
        const d   = rz + FOV;
        const sf  = d > 0.1 ? (FOV / d) * SC : 0;
        return { sx: W / 2 + rx * sf, sy: H / 2 - ry * sf };
      });
      const pulse = 0.12 + 0.07 * Math.sin(Date.now() * 0.005);
      ctx.beginPath();
      ctx.moveTo(spl[0].sx, spl[0].sy);
      for (let i = 1; i < spl.length; i++) ctx.lineTo(spl[i].sx, spl[i].sy);
      ctx.closePath();
      ctx.strokeStyle = `rgba(251,191,36,${pulse.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = `rgba(251,191,36,${(pulse * 0.1).toFixed(3)})`;
      ctx.fill();

      // Edges
      for (let ei = 0; ei < edges.length; ei++) {
        const [a, b] = edges[ei];
        const pa = proj[a], pb = proj[b];
        const t   = ((pa.d + pb.d) / 2 - dMin) / dR;
        const c   = edgeComp[ei];
        const mwy = (verts[a].y + verts[b].y) / 2;
        const near = Math.abs(mwy - st.scanY) < 0.45;
        let sc: string, lw = 0.7;
        if (near) {
          sc = 'rgba(251,191,36,0.88)'; lw = 1.6;
        } else if (c && st.det.has(c.name)) {
          const hl = COMP_HL[c.name] ?? 'rgba(251,146,60,{a})';
          sc = fa(hl, Math.max(0.07, (0.5 - t * 0.28) * (st.la[c.name] ?? 0)));
        } else {
          sc = `rgba(180,83,9,${(0.3 - t * 0.18).toFixed(3)})`;
        }
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.strokeStyle = sc;
        ctx.lineWidth = lw;
        ctx.stroke();
      }

      // Dots
      for (const p of proj) {
        const t = (p.d - dMin) / dR;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(0.35, 1.4 - t * 0.85), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,83,9,${(0.6 - t * 0.42).toFixed(3)})`;
        ctx.fill();
      }

      // Component labels
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      for (const c of comps) {
        const la = st.la[c.name] ?? 0;
        if (la < 0.03) continue;
        let maxX = -Infinity, sumY = 0, cnt = 0;
        for (let ei = c.es; ei < c.ee; ei++) {
          const [ai, bi] = edges[ei];
          if (proj[ai].sx > maxX) maxX = proj[ai].sx;
          if (proj[bi].sx > maxX) maxX = proj[bi].sx;
          sumY += proj[ai].sy + proj[bi].sy;
          cnt += 2;
        }
        const lx = maxX + 10, ly = sumY / cnt;
        const txt = `◀ ${c.label}`;
        const tw  = ctx.measureText(txt).width;
        if (lx + tw + 10 > W || ly < 12 || ly > H - 6) continue;
        ctx.save();
        ctx.globalAlpha = la;
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.fillRect(lx - 2, ly - 11, tw + 8, 17);
        ctx.strokeStyle = 'rgba(251,191,36,0.4)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(lx - 2, ly - 11, tw + 8, 17);
        ctx.fillStyle = 'rgba(251,191,36,1)';
        ctx.fillText(txt, lx + 1, ly + 2);
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(251,191,36,0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(maxX, ly); ctx.lineTo(lx - 2, ly); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    frame();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="vqs-arch-canvas" style={{ cursor: 'crosshair' }} />;
}

/* ── Main component ──────────────────────────────────────────── */
export default function StudioLanding({ onLogin }: StudioLandingProps) {
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [showContact, setShowContact] = useState(false);
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
      const res  = await fetch('/api/studio/auth', {
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
    <div className="vqs-landing">
      <div className="vqs-landing-wrap">

        {/* ── Hero ────────────────────────────────────────── */}
        <div className="vqs-landing-hero">
          <motion.div
            className="vqs-landing-pitch"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="vqs-pill">
              <Sparkles size={13} /> Premium workspace
            </span>
            <h1 className="vqs-serif">
              The professional workspace <em>for architectural intelligence.</em>
            </h1>
            <p>
              Visquery Studio gives architects and design practices AI-powered image management,
              style classification, artifact extraction, multi-source ingest, and precedent search with
              all in one workspace built for real project workflows.
            </p>
            <ul className="vqs-proof-list">
              {PROOF_POINTS.map((p) => (
                <li key={p}>
                  <ChevronRight size={15} className="vqs-proof-check" /> {p}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className="vqs-login-card"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            <span className="vqs-pill" style={{ marginBottom: 18 }}>
              <Sparkles size={12} /> Studio access
            </span>
            <h2 className="vqs-serif vqs-login-title">Sign in to Studio</h2>
            <p className="vqs-login-sub">Access your architectural intelligence workspace.</p>

            <form onSubmit={handleSubmit} noValidate>
              <label className="vqs-field">
                <span className="vqs-field-label">Email address</span>
                <input
                  ref={emailRef}
                  type="email"
                  className="vqs-input"
                  autoComplete="email"
                  placeholder="you@studio.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                />
              </label>

              <label className="vqs-field">
                <span className="vqs-field-label">Password</span>
                <div className="vqs-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="vqs-input"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    style={{ paddingRight: 42 }}
                    required
                  />
                  <button
                    type="button"
                    className="vqs-pw-eye"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <AnimatePresence>
                {error && (
                  <motion.div
                    className="vqs-error-box"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  >
                    <AlertCircle size={14} /> <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                className="vqs-btn vqs-btn--primary vqs-login-submit"
                disabled={loading || !email || !password}
              >
                {loading ? <span className="vqs-spinner" /> : (<>Sign in <ArrowRight size={16} /></>)}
              </button>
            </form>

            <p className="vqs-login-foot">
              Don&apos;t have access? <a href="#contact">Contact us</a> to request Studio credentials.
            </p>
          </motion.div>
        </div>

        {/* ── Vision Language Model ───────────────────────── */}
        <section className="vqs-vlm">
          <div className="vqs-vlm-inner">
            <motion.div
              className="vqs-vlm-text"
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6 }}
            >
              <p className="vqs-eyebrow">Vision Language Model</p>
              <h2 className="vqs-serif vqs-vlm-h2">
                Understand any building, <em>instantly.</em>
              </h2>
              <p className="vqs-vlm-body">
                Upload a photograph - from a site visit, archive, or sketch - and Studio&apos;s
                vision language model returns style classification, component identification,
                material analysis, and historical context within seconds.
              </p>
              <ul className="vqs-vlm-features">
                {VLM_FEATURES.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                  >
                    <CheckCircle2 size={16} className="vqs-vlm-check" />
                    <span>{f}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              className="vqs-vlm-canvas-wrap"
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <ArchCanvas />
              <div className="vqs-vlm-canvas-badge">
                <span className="vqs-vlm-badge-dot" />
                Scanning architecture
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── How Studio Works ────────────────────────────── */}
        <section className="vqs-workflow">
          <div className="vqs-workflow-head">
            <p className="vqs-eyebrow">Workflow</p>
            <h2 className="vqs-serif vqs-workflow-h2">How Studio works</h2>
            <p className="vqs-workflow-sub">
              From raw photographs to structured precedent intelligence - four steps, seconds per image.
            </p>
          </div>
          <div className="vqs-workflow-steps">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.n}
                  className="vqs-wf-step"
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <div className="vqs-wf-top">
                    <span className="vqs-wf-ico"><Icon size={22} /></span>
                    <span className="vqs-wf-num">{step.n}</span>
                  </div>
                  <h3 className="vqs-serif vqs-wf-title">{step.title}</h3>
                  <p className="vqs-wf-body">{step.body}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Capabilities ────────────────────────────────── */}
        <section className="vqs-caps">
          <div className="vqs-caps-head">
            <p className="vqs-eyebrow">Capabilities</p>
            <h2 className="vqs-serif vqs-caps-h2">Every tool your practice needs</h2>
          </div>
          <div className="vqs-cap-grid">
            {CAPABILITIES.map((c, i) => {
              const Icon = c.icon;
              return (
                <motion.div
                  key={c.title}
                  className="vqs-cap-card"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <div className="vqs-cap-top">
                    <span className="vqs-cap-ico"><Icon size={20} /></span>
                    <span className="vqs-cap-num">{c.n}</span>
                  </div>
                  <h3 className="vqs-serif vqs-cap-title">{c.title}</h3>
                  <p className="vqs-cap-desc">{c.body}</p>
                  <span className="vqs-cap-tag">{c.tag}</span>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Who Studio is for ───────────────────────────── */}
        <section className="vqs-audience">
          <div className="vqs-audience-head">
            <p className="vqs-eyebrow">Built for professionals</p>
            <h2 className="vqs-serif vqs-audience-h2">Who Studio is designed for</h2>
          </div>
          <div className="vqs-audience-grid">
            <motion.div
              className="vqs-audience-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="vqs-audience-ico"><Building2 size={26} /></div>
              <h3 className="vqs-serif vqs-audience-title">Architects &amp; Practices</h3>
              <p className="vqs-audience-body">
                Speed up precedent research from days to minutes. Build living image libraries
                that grow with every project. Generate client-ready reference documents
                with full attribution and structured metadata.
              </p>
              <ul className="vqs-audience-list">
                <li><ChevronRight size={14} /> Precedent and typology research</li>
                <li><ChevronRight size={14} /> Style consistency across project phases</li>
                <li><ChevronRight size={14} /> Client documentation and presentations</li>
                <li><ChevronRight size={14} /> Archive digitisation and cataloguing</li>
              </ul>
            </motion.div>

            <motion.div
              className="vqs-audience-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.12 }}
            >
              <div className="vqs-audience-ico"><Layers size={26} /></div>
              <h3 className="vqs-serif vqs-audience-title">Researchers &amp; Historians</h3>
              <p className="vqs-audience-body">
                Cross-reference visual evidence across regions, epochs, and cultures at scale.
                Extract structured data from photograph collections for academic publication.
                Map material and formal evolution across centuries of built form.
              </p>
              <ul className="vqs-audience-list">
                <li><ChevronRight size={14} /> Cross-cultural morphology analysis</li>
                <li><ChevronRight size={14} /> Epoch and regional precedent mapping</li>
                <li><ChevronRight size={14} /> Citation-ready metadata generation</li>
                <li><ChevronRight size={14} /> Visual evidence pattern recognition</li>
              </ul>
            </motion.div>
          </div>
        </section>

        {/* ── Impact stats ─────────────────────────────────── */}
        <section className="vqs-impact">
          {IMPACT_STATS.map((s, i) => (
            <motion.div
              key={s.label}
              className="vqs-impact-stat"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <span className="vqs-serif vqs-impact-value">{s.value}</span>
              <span className="vqs-impact-label">{s.label}</span>
              <span className="vqs-impact-sub">{s.sub}</span>
            </motion.div>
          ))}
        </section>

        {/* ── CTA Banner ───────────────────────────────────── */}
        <motion.section
          className="vqs-cta-banner"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="vqs-cta-banner-inner">
            <div className="vqs-cta-text">
              <p className="vqs-eyebrow vqs-cta-eyebrow">Ready to begin?</p>
              <h2 className="vqs-serif vqs-cta-h2">
                Bring intelligence to your image library
              </h2>
              <p className="vqs-cta-body">
                Studio is a premium, invitation-only workspace. If you represent an architectural
                practice or research institution, reach out to start your onboarding.
              </p>
            </div>
            <div className="vqs-cta-actions">
              <button className="vqs-cta-btn-primary" onClick={() => setShowContact(true)}>
                Request access <ArrowRight size={16} />
              </button>
              <button className="vqs-cta-btn-ghost" onClick={() => setShowContact(true)}>
                Contact the team
              </button>
            </div>
          </div>
        </motion.section>

      </div>

      <AnimatePresence>
        {showContact && <ContactModal onClose={() => setShowContact(false)} />}
      </AnimatePresence>
    </div>
  );
}
