import React, { useState, useEffect } from 'react';

export interface TeamAvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-[18px] h-[18px] text-2xs leading-none',
  sm: 'w-[22px] h-[22px] text-2xs leading-none',
  md: 'w-[28px] h-[28px] text-xs leading-none',
  lg: 'w-[36px] h-[36px] text-sm leading-none',
};

export const TeamAvatar: React.FC<TeamAvatarProps> = ({
  src,
  name,
  size = 'sm',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const initial = (name || '?').trim().slice(0, 1).toUpperCase();

  if (!src || hasError) {
    return (
      <div
        className={`${SIZE_MAP[size]} rounded-full bg-theme-subtle border border-theme-subdued font-semibold text-theme-main flex items-center justify-center shrink-0 select-none ${className}`}
        aria-hidden="true"
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={`${SIZE_MAP[size]} object-contain shrink-0 rounded-full ${className}`}
    />
  );
};
