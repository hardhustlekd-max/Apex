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
    gradient: string;
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
    tagline: 'Emerald & Slate',
    description: 'Clean emerald accents on flat obsidian slate with hairline borders and crisp daylight contrast.',
    accentHex: '#00DC82',
    accentHoverHex: '#2BFFAD',
    accentName: 'Emerald',
    modelPickHex: '#2BFFAD',
    modelPickName: 'Mint',
    liveHex: '#FF385C',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Obsidian Pitch', 'Alabaster Light', 'Emerald', 'Signal Crimson'],
    previewColors: {
      primary: '#00DC82',
      hover: '#2BFFAD',
      gradient: '#00DC82',
      live: '#FF385C',
      modelPick: '#2BFFAD',
      surfaceDark: '#060908',
      surfaceLight: '#F2F6F4',
      cardDark: '#0E1612',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'champions-crimson',
    name: 'Champions Crimson & Mint',
    tagline: 'Matchday Contrast',
    description: 'Crisp matchday crimson accents paired with mint model highlights and flat dark midnight surfaces.',
    accentHex: '#FF234B',
    accentHoverHex: '#FF4D6D',
    accentName: 'Crimson',
    modelPickHex: '#00F5A0',
    modelPickName: 'Mint',
    liveHex: '#FF2E51',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Midnight Arena', 'Cold Stadium Mist', 'Matchday Crimson', 'Mint'],
    previewColors: {
      primary: '#FF234B',
      hover: '#FF4D6D',
      gradient: '#FF234B',
      live: '#FF2E51',
      modelPick: '#00F5A0',
      surfaceDark: '#07080F',
      surfaceLight: '#F3F4F9',
      cardDark: '#121528',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'ballon-gold',
    name: "Ballon d'Or Gold & Jade",
    tagline: 'Amber Gold & Jade',
    description: 'Clean gold accents and warm ivory or dark onyx flat surfaces paired with jade win metrics.',
    accentHex: '#FACC15',
    accentHoverHex: '#FDE047',
    accentName: 'Solar Gold',
    modelPickHex: '#10D982',
    modelPickName: 'Jade',
    liveHex: '#FF385C',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Obsidian Onyx', 'Warm Ivory', 'Solar Gold', 'Jade'],
    previewColors: {
      primary: '#FACC15',
      hover: '#FDE047',
      gradient: '#FACC15',
      live: '#FF385C',
      modelPick: '#10D982',
      surfaceDark: '#060908',
      surfaceLight: '#F6F4EE',
      cardDark: '#101611',
      cardLight: '#FFFFFF',
    },
  },
  {
    id: 'volt-lime',
    name: 'Volt Lime Pro',
    tagline: 'Volt & Carbon',
    description: 'High-contrast volt lime accents over flat carbon surfaces with clean hairline borders.',
    accentHex: '#CCFF00',
    accentHoverHex: '#E5FF4F',
    accentName: 'Electric Volt',
    modelPickHex: '#CCFF00',
    modelPickName: 'Volt',
    liveHex: '#FF334B',
    badgeBg: 'bg-theme-primary-subtle text-theme-primary',
    colorways: ['Carbon', 'Technical Silver', 'Electric Volt', 'Laser Crimson'],
    previewColors: {
      primary: '#CCFF00',
      hover: '#E5FF4F',
      gradient: '#CCFF00',
      live: '#FF334B',
      modelPick: '#CCFF00',
      surfaceDark: '#070907',
      surfaceLight: '#F1F4F0',
      cardDark: '#121710',
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

const META_BG_BY_THEME: Record<string, { dark: string; light: string }> = {
  'opta-emerald': { dark: '#060908', light: '#f2f6f4' },
  'champions-crimson': { dark: '#07080f', light: '#f3f4f9' },
  'ballon-gold': { dark: '#060908', light: '#f6f4ee' },
  'volt-lime': { dark: '#070907', light: '#f1f4f0' },
};

/**
 * Unified Theme Application across <html>, <body>, and theme-color meta tag.
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

  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.setAttribute('data-color-theme', colorTheme);
  root.style.colorScheme = mode;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

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

  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    const palette = META_BG_BY_THEME[colorTheme] || META_BG_BY_THEME['opta-emerald'];
    metaTheme.setAttribute('content', mode === 'dark' ? palette.dark : palette.light);
  }

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
