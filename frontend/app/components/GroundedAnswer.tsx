'use client';

import { motion } from 'framer-motion';

interface GroundedAnswerProps {
  text: string;
}

export default function GroundedAnswer({ text }: GroundedAnswerProps) {
  if (!text) return null;

  return (
    <motion.p
      className="font-serif italic mb-5"
      style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {text}
    </motion.p>
  );
}
