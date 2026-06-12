'use client';

import { motion } from 'framer-motion';
import { FileText, X } from 'lucide-react';
import type { ReportFocus } from '@/lib/api';

interface ReportSelectBarProps {
  count: number;
  focus: ReportFocus | '';
  onFocusChange: (f: ReportFocus | '') => void;
  onGenerate: () => void;
  onCancel: () => void;
}

/** Floating action bar shown while picking images for a precedent report. */
export default function ReportSelectBar({
  count,
  focus,
  onFocusChange,
  onGenerate,
  onCancel,
}: ReportSelectBarProps) {
  return (
    <motion.div
      className="report-select-bar"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <span className="report-select-count">
        {count} selected{count < 2 ? ' · pick at least 2' : ''}
      </span>
      <select
        className="report-select-focus"
        value={focus}
        onChange={(e) => onFocusChange(e.target.value as ReportFocus | '')}
        aria-label="Report focus"
      >
        <option value="">Balanced focus</option>
        <option value="materials">Materials</option>
        <option value="structure">Structure</option>
        <option value="typology">Typology</option>
        <option value="climate">Climate</option>
      </select>
      <button className="btn-primary report-select-go" disabled={count < 2} onClick={onGenerate}>
        <FileText size={12} />
        Generate Precedent Report
      </button>
      <button className="report-select-cancel" onClick={onCancel} aria-label="Cancel selection">
        <X size={13} />
      </button>
    </motion.div>
  );
}
