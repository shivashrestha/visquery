import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Visquery Studio',
  // Private app surface — keep out of the index and override the inherited
  // home canonical so crawlers don't fold /studio into "/".
  alternates: { canonical: '/studio' },
  robots: { index: false, follow: false },
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
