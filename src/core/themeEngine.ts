export type ThemeMode = 'light' | 'dark' | 'system';

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
      hover: '#00C272',
      live: '#FF3B30',
      modelPick: '#00E687',
      surfaceDark: '#080C14',
      surfaceLight: '#F4F6FA',
      cardDark: '#101520',
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
      primary: '#E6002A',
      hover: '#FF1A43',
      live: '#FF2E51',
      modelPick: '#00F5A0',
      surfaceDark: '#0A0E1A',
      surfaceLight: '#F8FAFC',
      cardDark: '#121828',
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
      surfaceLight: '#FAFAFC',
      cardDark: '#141622',
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
      hover: '#D4FF33',
      live: '#FF334B',
      modelPick: '#CCFF00',
      surfaceDark: '#0B0C0E',
      surfaceLight: '#F8F9FA',
      cardDark: '#15161C',
      cardLight: '#FFFFFF',
    },
  },
];

export const DEFAULT_COLOR_THEME_ID = 'opta-emerald';

/**
 * Gets the current effective theme mode ('light' or 'dark') taking system preferences into account.
 */
export function getSystemThemePreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Gets saved ThemeMode preference from localStorage ('light', 'dark', or 'system')
 */
export function getSavedThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme') as ThemeMode | null;
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'dark';
}

/**
 * Context Switcher Handler & DOM Attractor:
 * Updates root HTML attributes `data-theme` and class `dark` dynamically,
 * syncs choice to localStorage, and dispatches custom state events.
 */
export function setThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';

  localStorage.setItem('theme', mode);

  const effectiveTheme = mode === 'system' ? getSystemThemePreference() : mode;

  // Set semantic data-theme attribute on <html> element
  document.documentElement.setAttribute('data-theme', effectiveTheme);

  // Sync Tailwind class for fallback/compatibility
  if (effectiveTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  window.dispatchEvent(new CustomEvent('app-theme-mode-changed', {
    detail: { mode, effectiveTheme }
  }));

  return effectiveTheme;
}

export function getActiveColorThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_COLOR_THEME_ID;
  const stored = localStorage.getItem('app_color_theme');
  if (stored && COLOR_THEMES.some((t) => t.id === stored)) {
    return stored;
  }
  return DEFAULT_COLOR_THEME_ID;
}

export function applyColorTheme(themeId: string) {
  if (typeof window === 'undefined') return;
  const validTheme = COLOR_THEMES.find((t) => t.id === themeId) ? themeId : DEFAULT_COLOR_THEME_ID;
  document.documentElement.setAttribute('data-color-theme', validTheme);
  localStorage.setItem('app_color_theme', validTheme);
  window.dispatchEvent(new CustomEvent('app-color-theme-changed', { detail: validTheme }));
}
