import React, { useState, useEffect } from 'react';

export interface TeamAvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-3.5 h-3.5 text-[7.5px]',
  sm: 'w-4 h-4 text-[10px]',
  md: 'w-5.5 h-5.5 text-xs',
  lg: 'w-7 h-7 text-xs',
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
        className={`${SIZE_MAP[size]} rounded-full bg-theme-subtle font-bold text-theme-main flex items-center justify-center shrink-0 select-none ${className}`}
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
