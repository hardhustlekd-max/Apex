export type ThemeMode = 'light' | 'dark';

export interface ColorTheme {
  id: 'opta-emerald' | 'champions-crimson' | 'ballon-gold' | 'volt-lime';
  name: string;
  tagline: string;
  description: string;
  accentHex: string;
  accentHoverHex: string;
  accentName: string;
  modelPickHex: string;
  modelPickName: string;
  liveHex: string;
  badgeBg: string;
  colorways: string[];
  previewColors: {
    primary: string;
    hover: string;
    live: string;
    modelPick: string;
    surfaceDark: string;
    surfaceLight: string;
    cardDark: string;
    cardLight: string;
  };
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'opta-emerald',
    name: 'Opta Kinetic Emerald',
    tagline: 'Modern Precision Analytics',
    description: 'Pitch-inspired kinetic emerald green with high-contrast obsidian dark mode & clean platinum light mode.',
    accentHex: '#00E687',
    accentHoverHex: '#00C272',
    accentName: 'Pitch Emerald',
    modelPickHex: '#00E687',
    modelPickName: 'Kinetic Green',
    liveHex: '#FF3B30',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Obsidian Void', 'Platinum Canvas', 'Kinetic Emerald', 'Signal Red'],
    previewColors: {
      primary: '#00E687',
      hover: '#00C975',
      live: '#FF3B4E',
      modelPick: '#00E687',
      surfaceDark: '#070B12',
      surfaceLight: '#F5F7FB',
      cardDark: '#0F1623',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'champions-crimson',
    name: 'Champions Crimson & Mint',
    tagline: 'European Matchday Intensity',
    description: 'Signal matchday red for navigation & live score signaling, paired with cyber mint green for model predictions & value metrics.',
    accentHex: '#E6002A',
    accentHoverHex: '#FF1A43',
    accentName: 'Signal Red & Mint',
    modelPickHex: '#00F5A0',
    modelPickName: 'Cyber Mint',
    liveHex: '#FF2E51',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Midnight Stadium', 'Cold Fog White', 'Matchday Crimson', 'Cyber Mint'],
    previewColors: {
      primary: '#FF234B',
      hover: '#FF3D60',
      live: '#FF2E51',
      modelPick: '#00F5A0',
      surfaceDark: '#090D18',
      surfaceLight: '#F7F8FB',
      cardDark: '#12192B',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'ballon-gold',
    name: "Ballon d'Or Gold",
    tagline: 'Luxury Football Editorial',
    description: 'Championship gold accents with velvet gala onyx surfaces, rich typography contrast, neon coral live highlights, and trophy jade indicators.',
    accentHex: '#F59E0B',
    accentHoverHex: '#FBBF24',
    accentName: 'Championship Gold',
    modelPickHex: '#10B981',
    modelPickName: 'Trophy Jade',
    liveHex: '#FF385C',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Velvet Gala Onyx', 'Gallery Alabaster', '24K Trophy Gold', 'Neon Coral Pink'],
    previewColors: {
      primary: '#F59E0B',
      hover: '#FBBF24',
      live: '#FF385C',
      modelPick: '#10B981',
      surfaceDark: '#090A0F',
      surfaceLight: '#FAF9F6',
      cardDark: '#141724',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'volt-lime',
    name: 'Volt Lime Pro',
    tagline: 'High-Energy Volt Cyber',
    description: 'Electric neon volt lime with technical cyber graphite pitch surfaces, maximum visibility metrics, and laser live accents.',
    accentHex: '#CCFF00',
    accentHoverHex: '#D4FF33',
    accentName: 'Electric Lime',
    modelPickHex: '#CCFF00',
    modelPickName: 'Hyper Volt',
    liveHex: '#FF334B',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Cyber Graphite', 'Technical Gray', 'Hyper Neon Volt', 'Laser Hazard Red'],
    previewColors: {
      primary: '#CCFF00',
      hover: '#D7FF38',
      live: '#FF334B',
      modelPick: '#CCFF00',
      surfaceDark: '#0A0B0E',
      surfaceLight: '#F6F7F9',
      cardDark: '#15171E',
      cardLight: '#FFFFFF',
    },
  },
];

export const DEFAULT_COLOR_THEME_ID = 'opta-emerald';

export function getSavedThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {}
  return 'dark';
}

export function getActiveColorThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_COLOR_THEME_ID;
  try {
    const stored = localStorage.getItem('app_color_theme');
    if (stored && COLOR_THEMES.some((t) => t.id === stored)) {
      return stored;
    }
  } catch {}
  return DEFAULT_COLOR_THEME_ID;
}

/**
 * Robust, Industry-Standard Unified Theme Application
 * Simultaneously updates both mode (light/dark) and color palette (data-color-theme)
 * across both <html> and <body> to prevent attribute desynchronization.
 */
export function applyTheme(options: { mode?: ThemeMode; colorTheme?: string }): { mode: ThemeMode; colorTheme: string } {
  if (typeof window === 'undefined') return { mode: 'dark', colorTheme: DEFAULT_COLOR_THEME_ID };

  const currentMode = getSavedThemeMode();
  const currentColor = getActiveColorThemeId();

  const mode: ThemeMode = options.mode === 'light' || options.mode === 'dark' ? options.mode : currentMode;
  const colorTheme = options.colorTheme && COLOR_THEMES.some((t) => t.id === options.colorTheme) ? options.colorTheme : currentColor;

  try {
    localStorage.setItem('theme', mode);
    localStorage.setItem('app_color_theme', colorTheme);
  } catch {}

  // Apply to <html>
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.setAttribute('data-color-theme', colorTheme);
  root.style.colorScheme = mode;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Apply to <body> if mounted
  if (document.body) {
    const body = document.body;
    body.setAttribute('data-theme', mode);
    body.setAttribute('data-color-theme', colorTheme);
    body.style.colorScheme = mode;
    if (mode === 'dark') {
      body.classList.add('dark');
    } else {
      body.classList.remove('dark');
    }
  }

  // Update meta theme color
  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', mode === 'dark' ? '#070b12' : '#f1f5f9');
  }

  // Dispatch events
  window.dispatchEvent(new CustomEvent('app-theme-mode-changed', { detail: { mode, effectiveTheme: mode } }));
  window.dispatchEvent(new CustomEvent('app-color-theme-changed', { detail: colorTheme }));

  return { mode, colorTheme };
}

export function setThemeMode(mode: ThemeMode): 'light' | 'dark' {
  const res = applyTheme({ mode });
  return res.mode;
}

export function applyColorTheme(themeId: string) {
  applyTheme({ colorTheme: themeId });
}
