'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Building2, Globe2 } from 'lucide-react';
import architectureStyles from '../../architecture_styles.json';

export function shortStyleTag(style: string): string {
  return style
    .replace(/ architecture$/i, '')
    .replace(/ style$/i, '')
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

// ── Static plate showcase ──────────────────────────────
const SAMPLE_PLATES = [
  {
    img: '/second-empire-mansard-paris.jpg',
    name: 'Second Empire',
    era: '1852–1880s',
    region: 'France',
    materials: ['Limestone', 'Slate', 'Zinc'],
    artifacts: [
      { label: 'Mansard Roof', desc: 'Double-pitched roof with steep lower slope, maximising habitable attic space.' },
      { label: 'Dormer Window', desc: 'Vertical window projecting from the mansard slope, lighting the upper floor.' },
      { label: 'Iron Cresting', desc: 'Ornamental wrought-iron ridge trim tracing the roofline silhouette.' },
      { label: 'Corinthian Pilaster', desc: 'Flattened column with acanthus-leaf capital, framing the facade bays.' },
    ],
  },
  {
    img: '/ottoman-ribbed-dome.jpg',
    name: 'Ottoman',
    era: '15th–19th c.',
    region: 'Middle East',
    materials: ['Copper', 'Stucco', 'Marble'],
    artifacts: [
      { label: 'Ribbed Dome', desc: 'Segmented copper-clad dome with radial ribs converging at a finial spike.' },
      { label: 'Wrought-Iron Balustrade', desc: 'Pierced metal railing with repeating geometric medallions.' },
      { label: 'Composite Capital', desc: 'Column head blending Ionic volutes with Corinthian foliage.' },
      { label: 'Dentil Cornice', desc: 'Row of small rectangular blocks beneath the eave, casting a toothed shadow line.' },
    ],
  },
  {
    img: '/neoclassical-corinthian-facade.jpg',
    name: 'Neoclassical',
    era: '18th–20th c.',
    region: 'Global',
    materials: ['Limestone', 'Cast Stone'],
    artifacts: [
      { label: 'Corinthian Column', desc: 'Fluted shaft topped with an ornate acanthus-leaf capital.' },
      { label: 'Pediment', desc: 'Low triangular gable crowning the portico, framed by raking cornices.' },
      { label: 'Balustrade', desc: 'Row of turned stone balusters forming a low protective parapet.' },
      { label: 'Entablature', desc: 'Continuous horizontal band carried atop the columns, dividing facade and roofline.' },
    ],
  },
  {
    img: '/gothic-revival-tibidabo-spires.jpg',
    name: 'Gothic Revival',
    era: '1840–1960',
    region: 'Europe',
    materials: ['Granite', 'Bronze'],
    artifacts: [
      { label: 'Spire', desc: 'Tapering pinnacle tower drawing the eye upward, capped with a bronze statue.' },
      { label: 'Rose Window', desc: 'Circular tracery window divided into radiating stone mullions.' },
      { label: 'Pointed Arch', desc: 'Two-centred arch distributing load along steep converging curves.' },
      { label: 'Statuary Niche', desc: 'Recessed wall pocket housing carved figural sculpture.' },
    ],
  },
  {
    img: '/mudejar-revival-seville-dome.jpg',
    name: 'Mudéjar Revival',
    era: '1890s–1930s',
    region: 'Spain',
    materials: ['Glazed Ceramic Tile', 'Brick', 'Wrought Iron'],
    artifacts: [
      { label: 'Ribbed Tiled Dome', desc: 'Banded glazed-tile dome alternating colour courses across the shell.' },
      { label: 'Horseshoe Arch', desc: 'Arch curving inward past its springing point, an Islamic-derived profile.' },
      { label: 'Wrought-Iron Balcony', desc: 'Cantilevered balcony enclosed by ornamental forged-iron railing.' },
    ],
  },
  {
    img: '/beaux-arts-cornice-detail.jpg',
    name: 'Beaux-Arts',
    era: '1830–1930',
    region: 'France & U.S.',
    materials: ['Sandstone', 'Copper', 'Slate'],
    artifacts: [
      { label: 'Pedimented Window', desc: 'Window crowned by a miniature triangular pediment on console brackets.' },
      { label: 'Dentil Cornice', desc: 'Toothed stone band running beneath the projecting roofline.' },
      { label: 'Corner Pilaster', desc: 'Engaged rectangular column reinforcing the building’s massed corner.' },
      { label: 'Chimney Stack', desc: 'Tall masonry shaft rising above the roofline, often paired with flues.' },
    ],
  },
  {
    img: '/caucasian-vernacular-balconies.jpg',
    name: 'Caucasian Vernacular',
    era: '19th–early 20th c.',
    region: 'Georgia',
    materials: ['Timber', 'Wrought Iron', 'Stucco'],
    artifacts: [
      { label: 'Carved Wood Balcony', desc: 'Timber-framed balcony with turned posts and fretwork trim.' },
      { label: 'Cantilevered Bay', desc: 'Enclosed bay window projecting from the upper storey on hidden brackets.' },
      { label: 'Lattice Balustrade', desc: 'Crisscross wrought-iron or timber railing pattern enclosing the balcony.' },
    ],
  },
];

const EPOCH_GROUPS = [
  {
    id: 'classical',
    label: 'Historical & Classical',
    styles: ['Achaemenid', 'Ancient Egyptian', 'Byzantine', 'Romanesque', 'Gothic', 'Greek Revival'],
  },
  {
    id: 'renaissance',
    label: 'European & Renaissance',
    styles: ['Palladian', 'Baroque', 'Georgian', 'Beaux-Arts', 'Art Nouveau', 'Edwardian'],
  },
  {
    id: 'modern',
    label: 'Modern Movement',
    styles: ['Chicago school', 'Art Deco', 'Bauhaus', 'International style', 'Deconstructivism', 'Postmodern'],
  },
  {
    id: 'regional',
    label: 'Regional & Vernacular',
    styles: ['Colonial', 'Queen Anne', 'Craftsman', 'American Foursquare', 'Novelty'],
  },
];

/** Fires onActivate on click or Enter/Space — makes a non-button element keyboard-reachable. */
function clickableA11y(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

// ── Atlas Section — CSS masonry with grayscale hover ───
export function AtlasSection({ onSearch }: { onSearch: (q: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <section className="atlas-section">
      <div className="atlas-inner">
        <div className="atlas-head">
          <div>
            <h2 className="atlas-title">The Atlas</h2>
            <p className="atlas-eyebrow">Recently classified precedents</p>
          </div>
          <button className="atlas-view-all" onClick={() => onSearch('architecture')}>
            View All Entries
          </button>
        </div>
        <div className="atlas-grid">
          {SAMPLE_PLATES.map((p) => {
            const isOpen = !!expanded[p.name];
            return (
              <article
                key={p.name}
                className="atlas-card"
                aria-label={`Browse ${p.name} precedents`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="atlas-card-img"
                  src={p.img}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  {...clickableA11y(() => onSearch(p.name))}
                />
                <div className="atlas-card-body">
                  <div className="atlas-card-header">
                    <h4 className="atlas-card-title">{p.name}</h4>
                    <span className="atlas-style-badge">{shortStyleTag(p.name)}</span>
                  </div>
                  <div className="atlas-material-row">
                    {p.materials.map((m) => (
                      <span key={m} className="atlas-material-chip">{m}</span>
                    ))}
                  </div>
                  <div className="atlas-card-meta">
                    <div>
                      <p className="atlas-meta-key">Era</p>
                      <p className="atlas-meta-val">{p.era}</p>
                    </div>
                    <div>
                      <p className="atlas-meta-key">Region</p>
                      <p className="atlas-meta-val">{p.region}</p>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="atlas-artifact-list">
                      {p.artifacts.map((a) => (
                        <div key={a.label} className="atlas-artifact-item">
                          <p className="atlas-artifact-label">{a.label}</p>
                          <p className="atlas-artifact-desc">{a.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="atlas-view-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((prev) => ({ ...prev, [p.name]: !prev[p.name] }));
                    }}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? 'Hide Artifacts' : 'View Artifacts'}
                    <span className={`atlas-view-more-chevron${isOpen ? ' open' : ''}`}>⌄</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Ask the Image Section ──────────────────────────────
export function AskTheImageSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="ask-section">
      <div className="ask-inner">
        {/* Left: dark image with annotation overlay */}
        <div className="ask-image-wrap">
          <span className="ask-image-watermark">Visquery</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ask-image"
            src="/neoclassical-corinthian-facade.jpg"
            alt="Achaemenid column detail"
            loading="lazy"
            decoding="async"
          />
          <div className="ask-annotation">
            <p className="ask-annotation-label">Detected Component</p>
            <p className="ask-annotation-name">Column Capital</p>
            <p className="ask-annotation-meta">
              Order: Achaemenid.<br />
              Material: Limestone.
            </p>
          </div>
        </div>

        {/* Right: content */}
        <div>
          <p className="ask-eyebrow">Interactive Knowledge</p>
          <h2 className="ask-heading">Ask the Image</h2>
          <p className="ask-desc">
            Query specific architectural elements in real-time. Our vision models
            don't just see the building, they understand the technical history
            behind every column and capital.
          </p>

          <div className="ask-chat">
            <div className="ask-chat-user">
              <div className="ask-chat-avatar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </div>
              <div className="ask-chat-bubble">
                &ldquo;What is the structural origin of this specific column capital?&rdquo;
              </div>
            </div>

            <div className="ask-chat-response">
              <p className="ask-chat-response-text">
                <span className="ask-chat-response-mark">✦</span>
                The Achaemenid order originated in Persia during the 6th century BCE under Cyrus the Great. These capitals are characterised by bull or griffin protomes - were used at Persepolis to carry heavy cedar beams, blending Egyptian, Ionic, and indigenous Persian traditions.
              </p>
              <button
                className="ask-chat-response-link"
                onClick={() => onSearch('Achaemenid architecture')}
              >
                Explore Precedents
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Segmentation Section — component-level detection demo ──
const SEGMENT_REGIONS = [
  {
    id: 'entablature',
    label: 'Entablature & Pediment',
    color: '#B45309',
    top: 0, left: 0, width: 100, height: 21,
    desc: 'Horizontal beam-line and triangular gable carried atop the colonnade, historically bearing a sculpted frieze.',
  },
  {
    id: 'capital',
    label: 'Doric Capital',
    color: '#0E7490',
    top: 19, left: 39, width: 16, height: 9,
    desc: 'Plain abacus over rounded echinus — the simplest of the three classical orders, with no base moulding.',
  },
  {
    id: 'shaft',
    label: 'Fluted Column Shaft',
    color: '#15803D',
    top: 27, left: 40, width: 14, height: 56,
    desc: 'Twenty shallow vertical flutes with subtle entasis — a slight outward swell preventing an optical "waist."',
  },
  {
    id: 'stylobate',
    label: 'Stylobate Platform',
    color: '#6D28D9',
    top: 88, left: 0, width: 100, height: 12,
    desc: 'Stepped marble base levelling the sloped bedrock, raising the temple above its precinct.',
  },
];

export function SegmentationSection({ onSearch }: { onSearch: (q: string) => void }) {
  const [activeId, setActiveId] = useState<string>(SEGMENT_REGIONS[0].id);

  return (
    <section className="seg-section">
      <div className="seg-inner">
        <div>
          <p className="seg-eyebrow">Component Detection</p>
          <h2 className="seg-heading">Segment Every Surface</h2>
          <p className="seg-desc">
            Visquery doesn&rsquo;t stop at style. It isolates individual architectural
            components within a single frame, so you can search by capital, cornice,
            or balustrade instead of the whole building.
          </p>

          <div className="seg-region-list">
            {SEGMENT_REGIONS.map((r) => (
              <div
                key={r.id}
                className={`seg-region-item${r.id === activeId ? ' active' : ''}`}
                style={r.id === activeId ? { borderColor: r.color } : undefined}
                aria-label={`Highlight ${r.label}`}
                {...clickableA11y(() => setActiveId(r.id))}
              >
                <p className="seg-region-label">
                  <span className="seg-region-dot" style={{ background: r.color }} />
                  {r.label}
                </p>
                <p className="seg-region-desc">{r.desc}</p>
              </div>
            ))}
          </div>

          <button className="seg-explore-btn" onClick={() => onSearch('Doric architecture')}>
            Explore Classical Precedents
          </button>
        </div>

        <div className="seg-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="seg-image"
            src="/segmented_image.jpg"
            alt="Segmented architectural components of a classical temple"
            loading="lazy"
            decoding="async"
          />
          {SEGMENT_REGIONS.map((r) => (
            <div
              key={r.id}
              className={`seg-box${r.id === activeId ? ' active' : ''}`}
              style={{
                top: `${r.top}%`, left: `${r.left}%`, width: `${r.width}%`, height: `${r.height}%`,
                borderColor: r.color,
                background: r.id === activeId ? `${r.color}33` : `${r.color}14`,
              }}
              aria-label={`Highlight ${r.label}`}
              {...clickableA11y(() => setActiveId(r.id))}
            >
              {r.id === activeId && (
                <span className="seg-box-tag" style={{ background: r.color }}>{r.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Value Props Section ────────────────────────────────
const VALUE_PROPS = [
  {
    icon: <Layers size={30} />,
    title: 'Style Classification',
    desc: 'Instant identification of stylistic periods from raw imagery across historical taxonomies.',
  },
  {
    icon: <Building2 size={30} />,
    title: 'Structural Analysis',
    desc: 'Component-level breakdown of load-bearing systems, ornamentation, and material composition.',
  },
  {
    icon: <Globe2 size={30} />,
    title: 'Precedent Mapping',
    desc: 'Connect visual forms across global regions and time periods to find architectural twins.',
  },
];

export function ValuePropsSection() {
  return (
    <section className="value-section">
      <div className="value-section-inner">
        <div>
          <h2 className="value-heading">Architectural<br />Intelligence</h2>
          <p className="value-desc">
            Our framework deciphers the visual language of the built environment through
            deep learning and historical taxonomy.
          </p>
        </div>
        <div className="value-cards">
          {VALUE_PROPS.map((f) => (
            <div key={f.title} className="value-card">
              <span className="value-card-icon">{f.icon}</span>
              <h3 className="value-card-title">{f.title}</h3>
              <p className="value-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────
export function CtaSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="cta-section grid-background">
      <div className="cta-box">
        <span className="cta-corner cta-corner-tl" />
        <span className="cta-corner cta-corner-tr" />
        <span className="cta-corner cta-corner-bl" />
        <span className="cta-corner cta-corner-br" />
        <h2 className="cta-title">Access the Full Library</h2>
        <p className="cta-desc">
          Explore all architectural styles, exemplars, regions, and epochs
          in our complete visual index.
        </p>
        <div className="cta-actions">
          <button className="btn-primary" onClick={() => onSearch('architecture')}>
            Browse All Styles
          </button>
          <button className="btn-ghost" onClick={() => onSearch('historical architecture')}>
            View Catalogue
          </button>
        </div>
        <p className="cta-note">
          {architectureStyles.length} styles · 46 exemplars · 16 regions · 4 epochs
        </p>
      </div>
    </section>
  );
}

// ── Epoch Strip ────────────────────────────────────────
export function EpochStrip({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="epoch-section">
      <p className="epoch-eyebrow">Ledger · by epoch</p>
      <div className="epoch-rows">
        {EPOCH_GROUPS.map((g, gi) => (
          <motion.div
            key={g.id}
            className="epoch-row"
            aria-label={`Browse ${g.label}`}
            {...clickableA11y(() => onSearch(g.styles[0]))}
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: gi * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="epoch-row-label">
              <span className="epoch-count">{String(g.styles.length).padStart(2, '0')} styles</span>
              <h4>{g.label}</h4>
            </div>
            <div className="epoch-names">
              {g.styles.map((s, i) => (
                <span key={s}>
                  {s}
                  {i < g.styles.length - 1 && <span className="epoch-sep">·</span>}
                </span>
              ))}
            </div>
            <button
              className="epoch-jump"
              onClick={(e) => { e.stopPropagation(); onSearch(g.label); }}
            >
              See all →
            </button>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Try It Out Section — image drop zone on landing ────
export function TryItOutSection({
  onImageSearch,
  error,
}: {
  onImageSearch: (file: File) => void;
  error: string | null;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    onImageSearch(file);
  };

  return (
    <section className="tryout-section">
      <div
        className={`tryout-dropzone${isDragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Drop or select an architectural image to search"
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) processFile(file);
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="tryout-corner tryout-corner-tl" />
        <div className="tryout-corner tryout-corner-tr" />
        <div className="tryout-corner tryout-corner-bl" />
        <div className="tryout-corner tryout-corner-br" />

        <div className="tryout-dz-inner">
          {/* eyebrow */}
          <span className="tryout-eyebrow">Try Visquery · Visual Intelligence</span>

          {/* camera+ icon */}
          <svg className="tryout-icon" width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M48 41a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V19a4 4 0 0 1 4-4h6l4-7h12l4 7h6a4 4 0 0 1 4 4z"/>
            <circle cx="26" cy="29" r="9"/>
            <line x1="40" y1="11" x2="40" y2="18"/>
            <line x1="36.5" y1="14.5" x2="43.5" y2="14.5"/>
          </svg>

          <p className="tryout-dz-title">Drop an architectural image to begin</p>
          <p className="tryout-dz-sub">
            Visquery scans the image, extracts style + artifacts,<br />
            and finds similar precedents from the atlas
          </p>

          {/* flow steps */}
          <div className="tryout-steps">
            <div className="tryout-step">
              <span className="tryout-step-num">01</span>
              <span className="tryout-step-label">Upload</span>
            </div>
            <span className="tryout-step-arrow">→</span>
            <div className="tryout-step">
              <span className="tryout-step-num">02</span>
              <span className="tryout-step-label">Scan &amp; Classify</span>
            </div>
            <span className="tryout-step-arrow">→</span>
            <div className="tryout-step">
              <span className="tryout-step-num">03</span>
              <span className="tryout-step-label">Discover Precedents</span>
            </div>
          </div>

          <button
            className="tryout-file-btn"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            Select Local File
          </button>

          {error && (
            <div className="tryout-error">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
