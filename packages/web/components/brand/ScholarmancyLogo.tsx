import Image from 'next/image';

export interface ScholarmancyLogoProps {
  readonly size?: number;
  readonly className?: string;
}

/**
 * Brand mark used on auth and dashboard shells (uses smaller public asset).
 */
export function ScholarmancyLogo({ size = 32, className }: ScholarmancyLogoProps) {
  return (
    <Image
      src="/logo-128.png"
      alt="Scholarmancy"
      width={size}
      height={size}
      className={className ?? 'rounded-lg'}
      data-testid="logo"
      priority={size >= 48}
    />
  );
}
