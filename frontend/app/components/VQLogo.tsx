import Image from 'next/image';

interface VQLogoProps {
  variant: 'header' | 'hero';
}

export default function VQLogo({ variant }: VQLogoProps) {
  if (variant === 'header') {
    return (
      <div className="vq-logo-header">
        <Image
          src="/app-logo.png"
          alt="Visquery"
          width={55}
          height={44}
          quality={100}
          unoptimized
          style={{ objectFit: 'contain', flexShrink: 0 }}
        />
        <div className="vq-logo-header-text">
          <span className="vq-logo-name">VISQUERY</span>
          <div className="vq-logo-divider" aria-hidden="true" />
          <div className="vq-logo-taglines">
            <span>Visual Search.</span>
            <span>Architectural Intelligence.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vq-logo-hero">
      <Image
        src="/app-logo.png"
        alt="Visquery"
        width={200}
        height={120}
        quality={100}
        unoptimized
        style={{ objectFit: 'contain' }}
        priority
      />
      <div className="vq-logo-hero-name">VISQUERY</div>
      <div className="vq-logo-hero-tagline">Visual Search. Architectural Intelligence.</div>
    </div>
  );
}
