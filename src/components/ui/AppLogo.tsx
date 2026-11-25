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

  const ballClipId = `sharp-crest-ball-clip-${uid}`;
  const headMaskId = `sharp-crest-head-mask-${uid}`;
  const pitchMaskId = `sharp-crest-pitch-mask-${uid}`;

  // Sharp faceted leopard head silhouette for clean backdrop knockout masks
  const leopardKnockoutPath =
    'M73 43 L62 31 L45 32 L39 45 L42 64 L34 92 L40 96 L33 114 L43 119 L55 130 L68 136 L73 158 L87 168 L113 168 L127 158 L132 136 L145 130 L157 119 L167 114 L160 96 L166 92 L158 64 L161 45 L155 32 L138 31 L127 43 L112 37 L88 37 Z';

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
          <circle cx="100" cy="96" r="78" />
        </clipPath>
        <mask id={headMaskId}>
          <rect x="0" y="0" width="200" height="200" fill="white" />
          <path
            d={leopardKnockoutPath}
            fill="black"
            stroke="black"
            strokeWidth="8"
            strokeLinejoin="miter"
          />
        </mask>
        <mask id={pitchMaskId}>
          <rect x="0" y="0" width="200" height="200" fill="white" />
          <path
            d={leopardKnockoutPath}
            fill="black"
            stroke="black"
            strokeWidth="7"
            strokeLinejoin="miter"
          />
          {/* Clear whiskers zone so razor whiskers slice cleanly over the pitch */}
          <polygon points="18,115 76,118 76,144 24,146" fill="black" />
          <polygon points="182,115 124,118 124,144 176,146" fill="black" />
        </mask>
      </defs>

      {/* LAYER 1: Sharp Football Pitch Perspective Lines */}
      <g
        mask={`url(#${pitchMaskId})`}
        stroke={pal.primary}
        strokeWidth="4"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      >
        {/* Pitch Touchline Perimeter Trapezoid */}
        <polygon points="41,123 159,123 184,183 16,183" fill="none" />
        {/* 18-Yard Penalty Box */}
        <polyline points="52,183 59,147 141,147 148,183" fill="none" />
        {/* 6-Yard Goal Box */}
        <polyline points="75,183 78,166 122,166 125,183" fill="none" />
        {/* Corner Flags */}
        <polyline points="19,173 28,173 28,183" fill="none" strokeWidth="3.2" />
        <polyline points="181,173 172,173 172,183" fill="none" strokeWidth="3.2" />
      </g>

      {/* LAYER 2: Sharp Geometric Soccer Ball Panels Behind Leopard */}
      <g clipPath={`url(#${ballClipId})`} mask={`url(#${headMaskId})`}>
        <polygon points="97,20 97,36 75,41 59,30 77,20" fill={pal.accent} />
        <polygon points="103,20 103,36 125,41 141,30 123,20" fill={pal.accent} />
        <polygon points="53,33 70,44 50,59 33,55 40,40" fill={pal.accent} />
        <polygon points="147,33 130,44 150,59 167,55 160,40" fill={pal.accent} />
        <polygon points="30,61 48,63 40,94 25,116 21,88" fill={pal.accent} />
        <polygon points="170,61 152,63 160,94 175,116 179,88" fill={pal.accent} />
        <polygon points="31,119 44,98 56,121 29,121" fill={pal.accent} />
        <polygon points="169,119 156,98 144,121 171,121" fill={pal.accent} />
      </g>

      {/* Crisp Outer Ball Frame */}
      <circle
        cx="100"
        cy="96"
        r="83"
        stroke={pal.primary}
        strokeWidth="6"
      />

      {/* LAYER 3: Aggressive Snarling Leopard Face (Razor-Sharp Angular Vector) */}
      {/* Ears with Sharp Zigzag Inner Fur */}
      <polyline
        points="44,63 40,43 47,32 62,33 74,44"
        stroke={pal.primary}
        strokeWidth="5.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polygon
        points="49,54 45,42 54,45 52,38 64,43 56,49 59,54"
        fill={pal.primary}
      />

      <polyline
        points="156,63 160,43 153,32 138,33 126,44"
        stroke={pal.primary}
        strokeWidth="5.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polygon
        points="151,54 155,42 146,45 148,38 136,43 144,49 141,54"
        fill={pal.primary}
      />

      {/* Angular Crown & Jagged Cheek Fur Spikes */}
      <polyline
        points="74,44 88,39 112,39 126,44"
        stroke={pal.primary}
        strokeWidth="5.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polyline
        points="44,63 36,91 43,95 35,113 45,117 61,130"
        stroke={pal.primary}
        strokeWidth="5"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polyline
        points="156,63 164,91 157,95 165,113 155,117 139,130"
        stroke={pal.primary}
        strokeWidth="5"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />

      {/* Sharp Forehead & Temple Leopard Markings */}
      <polygon points="100,43 103,54 100,67 97,54" fill={pal.primary} />
      <polygon points="75,46 92,52 89,57 71,50" fill={pal.primary} />
      <polygon points="125,46 108,52 111,57 129,50" fill={pal.primary} />
      <polygon points="69,56 89,64 86,69 65,61" fill={pal.primary} />
      <polygon points="131,56 111,64 114,69 135,61" fill={pal.primary} />
      <polygon points="61,48 68,51 64,57 58,53" fill={pal.primary} />
      <polygon points="139,48 132,51 136,57 142,53" fill={pal.primary} />
      <polygon points="52,61 59,64 56,71 49,67" fill={pal.primary} />
      <polygon points="148,61 141,64 144,71 151,67" fill={pal.primary} />

      {/* Fierce Furrowed V-Brows & Nasal Bridge */}
      <polyline
        points="51,76 69,72 89,84 91,102"
        stroke={pal.primary}
        strokeWidth="5.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polyline
        points="149,76 131,72 111,84 109,102"
        stroke={pal.primary}
        strokeWidth="5.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />

      {/* Sharp Nose-Bridge Snarl Wrinkles */}
      <polyline points="93,86 100,90 107,86" stroke={pal.primary} strokeWidth="2.8" strokeLinejoin="miter" />
      <polyline points="92,92 100,96 108,92" stroke={pal.primary} strokeWidth="2.8" strokeLinejoin="miter" />
      <polyline points="93,98 100,101 107,98" stroke={pal.primary} strokeWidth="2.6" strokeLinejoin="miter" />

      {/* Piercing Forward-Staring Predator Eyes */}
      <polygon points="56,77 73,77 87,85 81,91 66,90" fill={pal.primary} />
      <polygon points="64,81 84,85 80,89 67,89" fill={pal.accent} />
      <polygon points="73,82 77,82 75,89 72,86" fill={pal.primary} />

      <polygon points="144,77 127,77 113,85 119,91 134,90" fill={pal.primary} />
      <polygon points="136,81 116,85 120,89 133,89" fill={pal.accent} />
      <polygon points="127,82 123,82 125,89 128,86" fill={pal.primary} />

      {/* Sharp Cheekbone Stripes & Leopard Spots */}
      <polygon points="56,88 67,96 63,109 53,99" fill={pal.primary} />
      <polygon points="144,88 133,96 137,109 147,99" fill={pal.primary} />
      <polygon points="48,99 54,104 49,112 44,106" fill={pal.primary} />
      <polygon points="152,99 146,104 151,112 156,106" fill={pal.primary} />
      <polygon points="72,96 86,102 74,109 67,103" fill={pal.primary} />
      <polygon points="128,96 114,102 126,109 133,103" fill={pal.primary} />
      <polygon points="62,110 69,113 64,119 58,115" fill={pal.primary} />
      <polygon points="138,110 131,113 136,119 142,115" fill={pal.primary} />

      {/* Broad Angular Leopard Nose */}
      <polygon points="86,104 100,106 114,104 109,113 100,118 91,113" fill={pal.primary} />

      {/* Snarling Upper Muzzle Pads */}
      <polyline
        points="99,118 99,125 87,129 67,128 63,121 76,113"
        stroke={pal.primary}
        strokeWidth="4.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polyline
        points="101,125 113,129 133,128 137,121 124,113"
        stroke={pal.primary}
        strokeWidth="4.2"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />

      {/* Razor-Tapered Aggressive Whiskers */}
      <polygon points="73,120 26,116 72,123" fill={pal.primary} />
      <polygon points="70,125 21,129 70,128" fill={pal.primary} />
      <polygon points="73,130 29,143 74,133" fill={pal.primary} />

      <polygon points="127,120 174,116 128,123" fill={pal.primary} />
      <polygon points="130,125 179,129 130,128" fill={pal.primary} />
      <polygon points="127,130 171,143 126,133" fill={pal.primary} />

      {/* Open Roaring Jaw, Sharp Fangs, Incisors & Tongue */}
      {/* Upper Canines (Fangs) */}
      <polygon points="80,129 87,129 83,144" fill={pal.primary} />
      <polygon points="120,129 113,129 117,144" fill={pal.primary} />
      {/* Upper Incisors */}
      <polygon points="90,129 94,129 92,135" fill={pal.primary} />
      <polygon points="95,129 99,129 97,135" fill={pal.primary} />
      <polygon points="101,129 105,129 103,135" fill={pal.primary} />
      <polygon points="106,129 110,129 108,135" fill={pal.primary} />

      {/* Lower Canines (Fangs) */}
      <polygon points="80,156 88,156 84,142" fill={pal.primary} />
      <polygon points="120,156 112,156 116,142" fill={pal.primary} />
      {/* Lower Incisors */}
      <polygon points="90,156 94,156 92,150" fill={pal.primary} />
      <polygon points="95,156 99,156 97,150" fill={pal.primary} />
      <polygon points="101,156 105,156 103,150" fill={pal.primary} />
      <polygon points="106,156 110,156 108,150" fill={pal.primary} />

      {/* Roaring Tongue */}
      <polygon points="92,143 100,147 108,143 106,151 100,153 94,151" fill={pal.accent} />

      {/* Angular Lower Jaw & Chin Contour */}
      <polyline
        points="71,129 74,157 88,167 112,167 126,157 129,129"
        stroke={pal.primary}
        strokeWidth="5"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <polyline
        points="82,158 91,161 109,161 118,158"
        stroke={pal.primary}
        strokeWidth="2.8"
        strokeLinejoin="miter"
      />
    </svg>
  );
};
