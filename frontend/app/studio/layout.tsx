import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Visquery Studio',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      {children}
    </div>
  );
}
