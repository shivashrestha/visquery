'use client';

import Image from 'next/image';
import { useState } from 'react';
import { isLoaded, markLoaded } from '@/lib/imageCache';

interface CachedImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  onError?: () => void;
  style?: React.CSSProperties;
}

const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==';

/**
 * Wraps Next.js Image with a module+session level cache so that
 * images already seen in this session skip the shimmer/blur placeholder
 * on component remount (e.g. navigating back to results).
 */
export default function CachedImage({
  src,
  alt,
  fill,
  width,
  height,
  className,
  sizes,
  priority,
  onError,
  style,
}: CachedImageProps) {
  const alreadyLoaded = isLoaded(src);
  const [showPlaceholder, setShowPlaceholder] = useState(!alreadyLoaded);

  const handleLoad = () => {
    markLoaded(src);
    setShowPlaceholder(false);
  };

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      placeholder={showPlaceholder ? 'blur' : 'empty'}
      blurDataURL={showPlaceholder ? BLUR_PLACEHOLDER : undefined}
      onLoad={handleLoad}
      onError={onError}
      unoptimized
      style={style}
    />
  );
}
