import React, { useEffect, useId, useState } from 'react';
import {
  ThemeMode,
  getActiveColorThemeId,
  getSavedThemeMode,
} from '../../core/themeEngine.js';

export type AppLogoVariant =
  | 'opta-emerald'
  | 'champions-crimson'
  | 'ballon-gold'
  | 'volt-lime';

export interface AppLogoProps {
  size?: number;
  variant?: AppLogoVariant;
  mode?: ThemeMode;
  className?: string;
  title?: string;
}

interface LogoPalette {
  primary: string;
  accent: string;
}

export const LOGO_PALETTES: Record<AppLogoVariant, Record<ThemeMode, LogoPalette>> = {
  'opta-emerald': {
    dark: {
      primary: '#ffffff',
      accent: '#00dc82',
    },
    light: {
      primary: '#064e3b',
      accent: '#059669',
    },
  },
  'champions-crimson': {
    dark: {
      primary: '#ffffff',
      accent: '#ff234b',
    },
    light: {
      primary: '#171f54',
      accent: '#e11d48',
    },
  },
  'ballon-gold': {
    dark: {
      primary: '#ffffff',
      accent: '#facc15',
    },
    light: {
      primary: '#29200a',
      accent: '#d97706',
    },
  },
  'volt-lime': {
    dark: {
      primary: '#ffffff',
      accent: '#ccff00',
    },
    light: {
      primary: '#1a2e05',
      accent: '#65a30d',
    },
  },
};

function normalizeVariant(id?: string | null): AppLogoVariant {
  if (
    id === 'opta-emerald' ||
    id === 'champions-crimson' ||
    id === 'ballon-gold' ||
    id === 'volt-lime'
  ) {
    return id;
  }
  return 'opta-emerald';
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 32,
  variant,
  mode,
  className = '',
  title = 'Apex Live Score',
}) => {
  const uid = useId().replace(/:/g, '');
  const [liveVariant, setLiveVariant] = useState<AppLogoVariant>(() =>
    normalizeVariant(getActiveColorThemeId())
  );
  const [liveMode, setLiveMode] = useState<ThemeMode>(() => getSavedThemeMode());

  useEffect(() => {
    if (variant && mode) return;
    if (typeof window === 'undefined') return;

    const syncFromDom = () => {
      const root = document.documentElement;
      const domTheme = root.getAttribute('data-theme');
      const domColor = root.getAttribute('data-color-theme');
      setLiveMode(domTheme === 'light' || domTheme === 'dark' ? domTheme : getSavedThemeMode());
      setLiveVariant(normalizeVariant(domColor || getActiveColorThemeId()));
    };

    syncFromDom();

    const onModeChange = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: ThemeMode }>).detail;
      if (detail?.mode) setLiveMode(detail.mode);
      else syncFromDom();
    };
    const onColorChange = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setLiveVariant(normalizeVariant(detail));
      else syncFromDom();
    };

    window.addEventListener('app-theme-mode-changed', onModeChange);
    window.addEventListener('app-color-theme-changed', onColorChange);

    const observer = new MutationObserver(syncFromDom);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-color-theme', 'class'],
    });

    return () => {
      window.removeEventListener('app-theme-mode-changed', onModeChange);
      window.removeEventListener('app-color-theme-changed', onColorChange);
      observer.disconnect();
    };
  }, [variant, mode]);

  const activeVariant = variant ?? liveVariant;
  const activeMode = mode ?? liveMode;
  const pal = LOGO_PALETTES[activeVariant][activeMode];

  const ballClipId = `flat-crest-ball-clip-${uid}`;
  const ballMaskId = `flat-crest-ball-mask-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={`shrink-0 block ${className}`}
      style={{ background: 'transparent' }}
    >
      <defs>
        <clipPath id={ballClipId}>
          <circle cx="100" cy="100" r="79" />
        </clipPath>
        <mask id={ballMaskId}>
          <rect x="0" y="0" width="200" height="200" fill="white" />
          <path
            d="M78 43 C74 33 67 27 59 27 C46 28 45 43 54 55 C44 67 39 84 42 99 C44 109 50 116 54 120 C59 132 70 142 84 148 C91 151 96 153 100 153 C104 153 109 151 116 148 C130 142 141 132 146 120 C150 116 156 109 158 99 C161 84 156 67 146 55 C155 43 154 28 141 27 C133 27 126 33 122 43 C110 38 90 38 78 43 Z"
            fill="black"
            stroke="black"
            strokeWidth="12"
            strokeLinejoin="round"
          />
        </mask>
      </defs>

      {/* LAYER 1: Minimalist Flat Soccer Ball Backdrop (transparent cutouts + clean negative-space mask) */}
      <g clipPath={`url(#${ballClipId})`} mask={`url(#${ballMaskId})`}>
        {/* Classic Perimeter Soccer Ball Pentagons */}
        <polygon points="100,156 120,169 113,186 87,186 80,169" fill={pal.accent} />
        <polygon points="24,128 42,121 52,142 34,158 16,146" fill={pal.accent} />
        <polygon points="176,128 184,146 166,158 148,142 158,121" fill={pal.accent} />
        <polygon points="22,72 40,64 48,84 32,98 14,88" fill={pal.accent} />
        <polygon points="178,72 186,88 168,98 152,84 160,64" fill={pal.accent} />

        {/* Flat Soccer Ball Panel Seams */}
        <g
          stroke={pal.primary}
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeOpacity="0.34"
        >
          <line x1="42" y1="121" x2="48" y2="84" />
          <line x1="158" y1="121" x2="152" y2="84" />
          <line x1="52" y1="142" x2="80" y2="169" />
          <line x1="148" y1="142" x2="120" y2="169" />
          <line x1="48" y1="84" x2="74" y2="72" />
          <line x1="152" y1="84" x2="126" y2="72" />
          <line x1="42" y1="121" x2="68" y2="118" />
          <line x1="158" y1="121" x2="132" y2="118" />
          <line x1="100" y1="156" x2="100" y2="138" />
        </g>
      </g>

      {/* Bold Open Sports Crest Ring Framing the Ball & Leopard */}
      <path
        d="M 166 48 A 84 84 0 1 1 34 48"
        stroke={pal.primary}
        strokeWidth="9.5"
        strokeLinecap="butt"
      />

      {/* LAYER 2: Bold Flat Straight-Facing Leopard Face (Linework + Negative Space) */}
      {/* Left & Right Rounded Big-Cat Ears */}
      <path
        d="M58 56 C46 46 47 30 61 29 C69 29 75 36 78 44"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M57 47 C54 41 58 37 64 39"
        stroke={pal.primary}
        strokeWidth="4.4"
        strokeLinecap="round"
      />

      <path
        d="M142 56 C154 46 153 30 139 29 C131 29 125 36 122 44"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M143 47 C146 41 142 37 136 39"
        stroke={pal.primary}
        strokeWidth="4.4"
        strokeLinecap="round"
      />

      {/* Crown, Cheekbones & Tapered Jawline Contour */}
      <path
        d="M78 43 C90 38 110 38 122 43"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M58 56 C47 68 42 84 45 98 C47 107 53 114 60 119"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M142 56 C153 68 158 84 155 98 C153 107 147 114 140 119"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M55 113 C58 127 69 138 84 144 C91 147 96 149 100 149 C104 149 109 147 116 144 C131 138 142 127 145 113"
        stroke={pal.primary}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sweeping Cheek Fur Lines (Flat Crest Rhythm) */}
      <path
        d="M55 96 C61 105 69 112 77 116"
        stroke={pal.primary}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M145 96 C139 105 131 112 123 116"
        stroke={pal.primary}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Fierce Straight-Looking Brow Ridge & Nasal Bridge */}
      <path
        d="M59 71 C70 67 83 70 91 79 L93 102"
        stroke={pal.primary}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M141 71 C130 67 117 70 109 79 L107 102"
        stroke={pal.primary}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Intense Forward-Staring Almond Eyes */}
      <path
        d="M64 81 C71 77 81 79 86 85 C81 90 71 90 64 85 Z"
        fill={pal.accent}
      />
      <path
        d="M136 81 C129 77 119 79 114 85 C119 90 129 90 136 85 Z"
        fill={pal.accent}
      />

      {/* Broad Leopard Nose & Split Muzzle */}
      <path
        d="M89 104 C95 101 105 101 111 104 C112 109 105 115 100 116 C95 115 88 109 89 104 Z"
        fill={pal.primary}
      />
      <path
        d="M100 115 V127"
        stroke={pal.primary}
        strokeWidth="5.4"
        strokeLinecap="round"
      />
      <path
        d="M81 128 C88 134 95 133 100 127 C105 133 112 134 119 128"
        stroke={pal.primary}
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M91 139 C96 141 104 141 109 139"
        stroke={pal.primary}
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {/* Bold Geometric-Organic Leopard Spots */}
      <ellipse cx="100" cy="54" rx="3.2" ry="5.5" fill={pal.primary} />
      <ellipse
        cx="86"
        cy="55"
        rx="2.9"
        ry="4.4"
        transform="rotate(-12 86 55)"
        fill={pal.primary}
      />
      <ellipse
        cx="114"
        cy="55"
        rx="2.9"
        ry="4.4"
        transform="rotate(12 114 55)"
        fill={pal.primary}
      />
      <path d="M68 57 C72 54 76 57 74 61 C72 64 67 62 68 57 Z" fill={pal.primary} />
      <path d="M132 57 C128 54 124 57 126 61 C128 64 133 62 132 57 Z" fill={pal.primary} />
      <circle cx="62" cy="96" r="3.4" fill={pal.primary} />
      <circle cx="138" cy="96" r="3.4" fill={pal.primary} />
      <circle cx="72" cy="105" r="3" fill={pal.primary} />
      <circle cx="128" cy="105" r="3" fill={pal.primary} />
    </svg>
  );
};
