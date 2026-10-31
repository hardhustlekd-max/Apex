# Apex UI Design System Guidelines

Extracted directly from the Apex visual reference system (`/public/assets/aistudio/still-00cfb568e8ba042b781dcc1f13312fe7_dd7f4d26.png`).

---

## 1. Vision & Core Principles

**Apex UI** is a high-contrast, modern athletic design system built on high-energy electric accents, pitch-black charcoal surfaces, squircle geometry, and ultra-readable geometric typography. It balances maximum data density with clean, spacious hierarchy.

Key Tenets:
- **Electric Accent Contrast**: Vibrantly contrast pitch-black (`#121212`) and crisp white (`#FFFFFF`) with signature Electric Lime (`#CCFF00`).
- **Super-rounded Geometry**: 24px–32px radii (`rounded-3xl`) for major containers/cards, 16px–20px radii (`rounded-2xl`) for date/time tiles, and full capsules (`rounded-full`) for circular action buttons and navigation pills.
- **Circular Action Icon Buttons**: Primary and secondary action triggers rely on clean circular icon buttons containing bold directional arrows (`→`), plus signs (`+`), or checkmarks (`✓`).
- **Micro-pills & Unboxed Metadata**: Sub-pills and unboxed text for metadata (match stats, odds, rest days, trainers/slots) with high legibility.

---

## 2. Color System Tokens

| Token Name | Hex Value | Usage |
| :--- | :--- | :--- |
| `apex-lime` | `#CCFF00` (Electric Lime) | Primary brand accent, active tabs, hero highlight cards, primary circular buttons (`→`), selected grid tiles |
| `apex-lime-hover` | `#B8E600` | Hover state for primary buttons and active pills |
| `apex-black` | `#121212` / `#161616` | Pitch black surfaces, hero metric cards, active date capsules, dark buttons, bottom nav shell |
| `apex-dark-card` | `#1E1E1E` | Sub-card depth in dark mode |
| `apex-bg-light` | `#F4F5F7` | Crisp off-white light mode field background |
| `apex-bg-dark` | `#0A0A0A` | Ultra-dark mode field background |
| `apex-surface-white` | `#FFFFFF` | Standard fixture cards, date pills, market selection tiles |
| `apex-surface-muted` | `#EFEFEF` | Inactive date/time tiles, subtle disabled backdrops |
| `apex-text-dark` | `#0F0F0F` | Deep pitch black titles, team names, odds, scores |
| `apex-text-muted` | `#6B7280` | Secondary metadata (timestamps, rest days, venue) |
| `apex-text-lime` | `#CCFF00` | Accent kicker text on dark cards |

---

## 3. Typography Hierarchy

- **Primary Font Family**: Geometric Sans (`Plus Jakarta Sans`, `Outfit`, `Urbanist`, or `Inter` heavy weights 700/800/900).
- **Tabular Numerals**: `font-mono tabular-nums` for precision alignment of scores, odds, and probabilities.
- **Hero Numbers**: `text-2xl` to `text-4xl` ExtraBold (800/900 weight), e.g. "14 classes available", "24 Matches Today".
- **Card Headings**: `text-base` to `text-xl` Bold (700/800 weight), title-case clean typography.
- **Metadata Pills & Tags**: `text-xs` to `text-sm` SemiBold (600 weight), single-line (`whitespace-nowrap`).

---

## 4. Geometry & Elevation Tokens

- **Card Radius**: `rounded-3xl` (24px–32px) for main containers, hero dark cards, and match cards.
- **Tile Radius**: `rounded-2xl` (16px–20px) for date tiles, market selection tiles, time slot grids.
- **Pill Radius**: `rounded-full` for active filter tabs, action buttons, status chips, bottom navigation shell.
- **Circular Action Icon Buttons**: `w-10 h-10 rounded-full flex items-center justify-center font-bold transition-transform active:scale-95`.

---

## 5. Component Patterns

### A. Hero Summary / Accumulator Header Card
- **Background**: Pitch Black (`#161616`) or Electric Lime (`#CCFF00`).
- **Kicker**: Electric Lime (`text-[#CCFF00]`) on dark backgrounds, uppercase tracking.
- **Metrics**: Large bold counts with mini sub-pills (`bg-[#262626]` or `bg-white/80`).
- **Action Button**: Circular Electric Lime or Pitch Black button with `ArrowForwardIcon`.

### B. Standard Fixture Card (`FixtureCard.tsx`)
- **Container**: Crisp White (`bg-white dark:bg-[#161616] rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-800`).
- **Header**: Team badges, bold pitch black team titles, status pills.
- **Odds & Prediction Bar**: Market buttons with clear probability bars and EV badges.
- **Action**: Circular Electric Lime arrow button (`bg-[#CCFF00] text-[#0F0F0F] w-9 h-9 rounded-full flex items-center justify-center hover:scale-105 transition-transform`).

### C. Date Calendar Pill Bar (`MainTabBar.tsx`)
- **Layout**: Full horizontal width scroll (`w-full overflow-x-auto no-scrollbar`).
- **Active Pill**: Pitch Black capsule (`bg-[#161616] text-white font-bold rounded-full px-4 py-2 shadow-sm`).
- **Inactive Pill**: Soft white capsule or unboxed text (`bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full px-3.5 py-2`).

### D. Bottom Navigation Dock (`BottomNavDock.tsx`)
- **Shell**: Light/Dark adaptive floating shell (`bg-white/95 dark:bg-[#161616]/95 backdrop-blur-md p-2 border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] dark:shadow-2xl`).
- **Active Nav Item**: Electric Lime capsule (`bg-[#CCFF00] text-slate-950 font-bold rounded-full px-4 py-2.5 flex items-center gap-2`).
- **Inactive Nav Item**: Adaptive muted icon with sub-label (`text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white px-3 py-2`).

---

## 6. Mobile & Touch-Friendly Scaling (Apex UI Mobile)

- **Minimum Touch Targets**: All interactive elements (buttons, nav items, pills, filter selects) MUST maintain a minimum clickable area of `44px x 44px` to ensure comfortable interaction on touchscreens.
- **Padding & Spacing Strategy**:
  - **Major Containers**: Use `p-4` or `p-5` for cards/modals on mobile to ensure content isn't flush with edges.
  - **Button Padding**: Use `px-5 py-2.5` or `px-6 py-3` for primary action buttons.
  - **Gutter Spacing**: Maintain `gap-3` or `gap-4` between sibling elements to avoid accidental taps.
- **Responsive Font Scaling**:
  - **Headings**: `text-base` for sub-sections, `text-sm` for compact lists.
  - **Metadata/Pills**: Strictly `text-xs` (12px) to ensure no overflow on narrow devices.
- **Viewport Constraints**: Ensure horizontal padding is `px-3` or `px-4` on all screen widths to prevent content from touching device bezels. Use `max-w-6xl mx-auto` to contain content on tablet/desktop.
