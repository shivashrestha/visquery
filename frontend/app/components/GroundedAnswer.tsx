'use client';

interface GroundedAnswerProps {
  text: string;
}

export default function GroundedAnswer({ text }: GroundedAnswerProps) {
  if (!text) return null;

  return (
    <p className="text-sm italic text-muted mb-5 animate-fade-in">
      {text}
    </p>
  );
}
