'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Layers, AlertCircle } from 'lucide-react';
import { getArtifacts } from '@/lib/api';
import type { ArchitecturalArtifacts, ArtifactRelationship } from '@/lib/types';

interface ArtifactsModalProps {
  open: boolean;
  imageId: string;
  buildingName?: string;
  prefetched?: ArchitecturalArtifacts | null;
  skipFetch?: boolean;
  onClose: () => void;
}

function Tag({ label }: { label: string }) {
  return (
    <span className="artifact-tag">{label.replace(/_/g, ' ')}</span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="artifact-section">
      <h4 className="artifact-section-title">{title}</h4>
      {children}
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="artifact-confidence">
      <div
        className="artifact-confidence-bar"
        style={{ width: `${pct}%` }}
      />
      <span className="artifact-confidence-label">{pct}%</span>
    </div>
  );
}

function ArtifactsDisplay({ data }: { data: ArchitecturalArtifacts }) {
  return (
    <div className="artifacts-display">
      {data.style && (
        <Section title="Architectural Style">
          <div className="artifact-style-row">
            {data.style.primary && (
              <span className="artifact-style-primary">{data.style.primary.replace(/_/g, ' ')}</span>
            )}
            {data.style.secondary && data.style.secondary.length > 0 && (
              <div className="artifact-tag-row">
                {data.style.secondary.map((s) => <Tag key={s} label={s} />)}
              </div>
            )}
          </div>
          {data.style.confidence != null && (
            <Confidence value={data.style.confidence} />
          )}
        </Section>
      )}

      {data.architectural_elements && (
        <Section title="Architectural Elements">
          {data.architectural_elements.structural && data.architectural_elements.structural.length > 0 && (
            <div className="artifact-element-group">
              <span className="artifact-element-label">Structural</span>
              <div className="artifact-tag-row">
                {data.architectural_elements.structural.map((e) => <Tag key={e} label={e} />)}
              </div>
            </div>
          )}
          {data.architectural_elements.facade && data.architectural_elements.facade.length > 0 && (
            <div className="artifact-element-group">
              <span className="artifact-element-label">Facade</span>
              <div className="artifact-tag-row">
                {data.architectural_elements.facade.map((e) => <Tag key={e} label={e} />)}
              </div>
            </div>
          )}
          {data.architectural_elements.ornamental && data.architectural_elements.ornamental.length > 0 && (
            <div className="artifact-element-group">
              <span className="artifact-element-label">Ornamental</span>
              <div className="artifact-tag-row">
                {data.architectural_elements.ornamental.map((e) => <Tag key={e} label={e} />)}
              </div>
            </div>
          )}
        </Section>
      )}

      {data.materials && data.materials.length > 0 && (
        <Section title="Materials">
          <div className="artifact-tag-row">
            {data.materials.map((m) => <Tag key={m} label={m} />)}
          </div>
        </Section>
      )}

      {data.spatial_features && data.spatial_features.length > 0 && (
        <Section title="Spatial Features">
          <div className="artifact-tag-row">
            {data.spatial_features.map((f) => <Tag key={f} label={f} />)}
          </div>
        </Section>
      )}

      {data.relationships && data.relationships.length > 0 && (
        <Section title="Structural Relationships">
          <div className="artifact-relations">
            {data.relationships.map((r: ArtifactRelationship, i: number) => (
              <div key={i} className="artifact-relation-row">
                <span className="artifact-rel-node">{r.source.replace(/_/g, ' ')}</span>
                <span className="artifact-rel-arrow">→</span>
                <span className="artifact-rel-type">{r.relation.replace(/_/g, ' ')}</span>
                <span className="artifact-rel-arrow">→</span>
                <span className="artifact-rel-node">{r.target.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export default function ArtifactsModal({
  open,
  imageId,
  buildingName,
  prefetched,
  skipFetch = false,
  onClose,
}: ArtifactsModalProps) {
  const [artifacts, setArtifacts] = useState<ArchitecturalArtifacts | null>(prefetched ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (artifacts || skipFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getArtifacts(imageId);
      setArtifacts(res.artifacts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [imageId, artifacts, skipFetch]);

  useEffect(() => {
    if (open && !artifacts) {
      load();
    }
  }, [open, load, artifacts]);

  // Reset when image changes
  useEffect(() => {
    setArtifacts(prefetched ?? null);
    setError(null);
  }, [imageId, prefetched]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const isEmpty = artifacts && Object.keys(artifacts).length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="artifacts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleBackdrop}
        >
          <motion.div
            className="artifacts-modal"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="artifacts-modal-header">
              <div>
                <p className="artifacts-modal-eyebrow">
                  <Layers size={11} /> Artifact Extraction
                </p>
                <h3 className="artifacts-modal-title">
                  {buildingName ? buildingName : 'Architectural Artifacts'}
                </h3>
              </div>
              <button
                className="artifacts-modal-close"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="artifacts-modal-body">
              {loading && (
                <div className="artifacts-loading">
                  <Loader2 size={20} className="animate-spin" />
                  <p>Extracting artifacts…</p>
                </div>
              )}

              {error && !loading && (
                <div className="artifacts-error">
                  <AlertCircle size={16} />
                  <p>{error}</p>
                  <button onClick={load} className="artifacts-retry">Retry</button>
                </div>
              )}

              {isEmpty && !loading && (
                <div className="artifacts-empty">
                  <p>No artifacts extracted for this image yet.</p>
                </div>
              )}

              {artifacts && !isEmpty && !loading && (
                <ArtifactsDisplay data={artifacts} />
              )}
            </div>

            <div className="artifacts-modal-footer">
              <p className="artifacts-footer-note">
                Artifacts serve as documentation, semantic retrieval, and ontology graph sources.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
