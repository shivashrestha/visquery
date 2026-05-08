'use client';

import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { submitFeedback } from '@/lib/api';

interface FeedbackButtonsProps {
  imageId: string;
  buildingId: string;
  query: string;
  currentRating?: 'up' | 'down';
  onRatingChange?: (imageId: string, rating: 'up' | 'down') => void;
  compact?: boolean;
}

export default function FeedbackButtons({
  imageId,
  buildingId,
  query,
  currentRating,
  onRatingChange,
  compact = false,
}: FeedbackButtonsProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');

  const handleRate = useCallback(
    async (rating: 'up' | 'down') => {
      if (submitting) return;
      if (currentRating === rating) return;

      setSubmitting(true);
      try {
        await submitFeedback({ imageId, buildingId, query, rating });
        onRatingChange?.(imageId, rating);
        if (rating === 'down') setShowReason(true);
      } catch {
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, currentRating, imageId, buildingId, query, onRatingChange],
  );

  const handleReasonSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!reason.trim()) {
        setShowReason(false);
        return;
      }
      try {
        await submitFeedback({
          imageId,
          buildingId,
          query,
          rating: 'down',
          reason,
        });
      } catch {
      } finally {
        setShowReason(false);
        setReason('');
      }
    },
    [reason, imageId, buildingId, query],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center gap-1 ${compact ? '' : 'gap-2'}`}>
        <button
          onClick={() => handleRate('up')}
          disabled={submitting}
          aria-label="Relevant result"
          aria-pressed={currentRating === 'up'}
          className={[
            'p-1.5 rounded transition-colors',
            compact ? 'p-1' : 'p-1.5',
            currentRating === 'up'
              ? 'text-accent bg-amber-50'
              : 'text-muted hover:text-near-black hover:bg-surface',
          ].join(' ')}
        >
          <ThumbsUp className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
        <button
          onClick={() => handleRate('down')}
          disabled={submitting}
          aria-label="Not relevant"
          aria-pressed={currentRating === 'down'}
          className={[
            'rounded transition-colors',
            compact ? 'p-1' : 'p-1.5',
            currentRating === 'down'
              ? 'text-red-600 bg-red-50'
              : 'text-muted hover:text-near-black hover:bg-surface',
          ].join(' ')}
        >
          <ThumbsDown className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {showReason && !compact && (
        <form onSubmit={handleReasonSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why not relevant? (optional)"
            autoFocus
            className="flex-1 text-xs border border-border rounded px-2 py-1 bg-white outline-none focus:border-accent/60 placeholder:text-muted/50"
          />
          <button
            type="submit"
            className="text-xs px-2 py-1 bg-surface border border-border rounded hover:border-accent/60 transition-colors"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
