# Apex Live Score — Core UI System, Component Library & Design Guidelines

**System ID:** `APEX-UI-CORE-v2.0`  
**Architecture:** Responsive Mobile-First Touch + Desktop Master-Detail Web App  
**Visual Paradigm:** Borderless Editorial Sports Telemetry (Tonal Elevation + Tabular Precision)  
**Target Breakpoints:** Mobile (`375px–639px`), Tablet (`640px–1023px`), Desktop (`1024px–1440px+`)

---

## 1. Preserved UI Structural Blueprint (Non-Negotiable Layout Contract)

Every refactor or feature addition MUST preserve the application's exact multi-viewport structural skeleton:

### 1.1 Application Shell
1. **Top Sticky App Header (`h-12` / `48px`, `sticky top-0 z-30`)**
   - Strictly single-row, 3-zone layout inside `max-w-7xl mx-auto`:
     - **Left Zone:** Compact brand mark (`A` monogram badge + `Apex Live Score` wordmark, `whitespace-nowrap shrink-0`).
     - **Center Zone (`hidden sm:flex`):** Contextual view title (`Today's Matches`).
     - **Right Zone:** Single primary utility trigger (`Settings` gear icon button, `#open-settings-modal-btn`).
2. **Desktop Left Navigation Rail (`w-60` / `240px`, `hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)]`)**
   - **Top Lockup:** Secondary engine identity (`L` mark + `Live Score Engine` / `Poisson Projections`).
   - **Primary Navigation:** 4 core destinations (`Predictions & Live`, `Accumulators`, `Standings Table`, `Prediction History`) with optional live/count indicator.
   - **Quick Competitions Rail:** Curated top-6 leagues + `All Matches`, plus `All >` modal trigger (`LeagueSelectorModal`).
   - **Footer Utility Strip:** Live engine status indicator + 3 quick action buttons (`Light/Dark` toggle, `Terminal`, `Settings`).
3. **Mobile Bottom Navigation Dock (`fixed bottom-0 z-40 lg:hidden`)**
   - Thumb-zone 4-tab bar (`FIXTURES`, `ACCAS`, `STANDINGS`, `HISTORY`) with safe-area inset padding (`pb-[calc(env(safe-area-inset-bottom)+0.35rem)]`) and active accent dot indicator.
   - Aggregate sticky chrome height on mobile (`48px` top header + `~56px` bottom dock = `~104px`) stays under the **15% mobile viewport sticky cap**, leaving ≥85% for scrollable content.
4. **Main Content Canvas (`main max-w-7xl mx-auto pb-16 lg:pb-6`)**
   - Wrapped in `PullToRefresh` with a clean circular SVG loading spinner.
   - Supports conditional full-width `SyncLockOverlay` when background ingestion runs, and an empty-database quick-sync banner when zero fixtures exist.
   - **Active Tab Layouts:**
     - `FIXTURES`: **12-column Master-Detail Split** on `lg:+`:
       - Left Master Feed (`col-span-12 lg:col-span-7`)
       - Right Sticky Detail Inspector (`hidden lg:block lg:col-span-5 sticky top-14 h-[calc(100vh-4.25rem)]`, rendering `<MatchDetailView isPanel />`)
       - Mobile `< lg`: Selecting any fixture opens `<MatchDetailModal />` as a slide-up sheet.
     - `ACCAS`: Centered `max-w-4xl mx-auto` single-column stack (`DailyFeaturedTip` / accumulators).
     - `STANDINGS`: Centered `max-w-5xl mx-auto` workspace (`LeagueStandings`).
     - `HISTORY`: Centered `max-w-4xl mx-auto` workspace (`PredictionHistoryView`).

### 1.2 Fixtures Feed Flow (`FixturesList`)
1. **7-Day Horizontal Selector Bar (`grid-cols-7`)**: Day number stacked above 2-letter weekday (`Mo`, `Tu`, ...), highlighting active single day or multi-day filter range.
2. **Scope Sub-Tabs + Filters Bar**: Segmented switcher (`Upcoming` | `Live` | `History`) aligned opposite the `Filters` modal trigger (`FixturesFilterModal`) with active filter count.
3. **Conditional Active Filter Chips Strip**: Rendered only when `activeFilterCount > 0`, showing removable pills (`League`, `Date`, `Market`, `Search`, `Sort`) + `Clear all`.
4. **Data Display Modes**:
   - **Wireframe Mode (`SimplifiedPredictionsWireframe`):** Grouped by competition (`Competition Header + Column Headers: PICK | 1 X 2` or `O 2.5 U 2.5` / `YES NO` with interactive sort triggers) or flat sorted list; 12-column match rows (`col-span-6` teams/crests/scores/meta, `col-span-6` model pick + probability chips + disclosure chevron).
   - **Cards Mode (`FixtureCard`):** 2-column responsive grid (`grid-cols-1 md:grid-cols-2`) with top league/time bar, 12-column team matchup & score/VS, 1X2 segmented probability bar, predicted pick banner, and footer action cue.
5. **Pagination Bar**: Range readout (`Showing X–Y of Z`), page-size selector (`10 / 25 / 50 / 100`), and First / Prev / Numbered / Next / Last buttons.

### 1.3 Match Detail Inspector / Modal Flow (`MatchDetailModal`)
1. **Sheet/Modal Header**: Mobile drag handle (modal only), Competition/Stage breadcrumb, Close button (modal only).
2. **Compact Hero Scoreboard**: 3-zone horizontal summary (Home Team + Win% | Score or `VS` + Status | Away Team + Win%).
3. **4-Tab Segmented Switcher**: `Overview` | `H2H (N)` | `Teams (N)` | `Preds (N)`.
4. **Tab Panels**:
   - `Overview`: Projections metrics (xG, Team Strength/Elo, Rest Days) + `PoissonMatrixView` (6×6 Scoreline Grid + Top 5 Scorelines).
   - `H2H`: 3-col W/D/L summary + Goal Averages & Adjustment Factor + Past Meetings list.
   - `Teams`: 2-col (`grid-cols-1 md:grid-cols-2`) Home & Away form cards (Form Guide W/D/L tiles, Attack/Defense ratings, Total Goals, Recent Matches).
   - `Preds`: Best Market Predictions list (Market Group, Pick Name, Probability %, Fair Odds) + `PoissonMatrixView`.

---

## 2. Design Tokens (3-Tier Architecture)

### 2.1 Color System & 60-30-10 Allocation
- **60% Dominant Canvas (`--bg-primary`):** Light mode subtly tinted neutral (`#f1f5f9` / `#f5f3ed`); Dark mode deep void (`#070b12`–`#0a0b0e`).
- **30% Structural Surfaces (`--bg-card`, `--bg-card-elevated`, `--bg-subtle`):** Borderless tonal steps separating cards, nested metrics, alternating table rows, and soft-filled inputs without 1px strokes.
- **10% Accent Budget (`--accent-default`, `--accent-hover`, `--accent-subtle`):** Concentrated on active navigation, selected day/tab controls, primary CTAs, focus rings, and model pick signals.
- **Supported Dual-Mode Palettes (`data-color-theme` × `data-theme="light" | "dark"`):**
  1. `opta-emerald` (Default — Kinetic Emerald `#009e5c` light / `#00e687` dark)
  2. `champions-crimson` (European Matchday — Signal Crimson `#d90429` light / `#ff234b` dark + Cyber Mint `#00f5a0` model picks)
  3. `ballon-gold` (Editorial Luxury — Championship Gold `#c26a03` light / `#f59e0b` dark + Trophy Jade `#10b981`)
  4. `volt-lime` (High-Contrast Pro — Olive/Volt `#658700` light / Electric Lime `#ccff00` dark)

### 2.2 Typography & Numeric Alignment
- **Primary UI Sans (`--font-family-sans`):** `"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Telemetry & Data Mono (`--font-family-mono`):** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` with `font-variant-numeric: tabular-nums`.
- **Type Scale:**
  - App Title / Modal Title: `14px–18px`, `font-extrabold`, `tracking-tight`, `text-wrap: balance`.
  - Section Headings: `13px–16px`, `font-extrabold` / `font-bold`, natural title case.
  - Card / Row Primary Labels: `12px–14px`, `font-bold`.
  - Muted Metadata & Captions: `10px–12px`, `--text-secondary` / `--text-muted` (WCAG AA compliant contrast).
  - Tabular Metrics / Hero KPIs: `18px–24px`, `font-black font-mono tabular-nums`.

### 2.3 Elevation, Radii & Motion
- **Borderless Surface Rule:** Do NOT use hard `border`, `border-b`, or `divide-*` dividers on cards, modals, or lists (spinner arcs `border-t-transparent` and CSS `border-collapse` excepted). Separate nested containers via `--bg-card` ↔ `--bg-card-elevated` ↔ `--bg-subtle` shifts and zebra striping (`odd:bg-theme-card even:bg-theme-card-elevated/45`).
- **Radii Scale:** Inputs/Small Badges (`rounded-lg` `8px`), Sub-containers & Rows (`rounded-xl` `12px`), Cards & Modals (`rounded-2xl` `16px` / `rounded-3xl` `24px`), Action Buttons & Controls (`rounded-full` / `rounded-xl`).
- **Shadows:** `--shadow-card` (ambient diffuse), `--shadow-elevated` (floating headers/modals/dock), `--shadow-glow` (primary CTAs & active selection emphasis).
- **Motion Budget:** Interactive transitions settle in `150ms–180ms` using `cubic-bezier(0.16, 1, 0.3, 1)` on `transform`, `opacity`, and `background-color`. Respect `@media (prefers-reduced-motion: reduce)`.

### 2.4 Accessibility & Responsive Ergonomics
- **Focus Navigation:** All interactive buttons, tabs, inputs, selects, and selectable cards expose `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent`.
- **Touch Targets:** Mobile modal close actions, navigation items, day selector cells, and standalone buttons maintain `>= 44px` hit areas on mobile (`min-h-[44px]` or responsive height).
- **Zero-Broken-Image Resilience:** Every club/team crest renders via `<TeamAvatar />` with `referrerPolicy="no-referrer"` and automatic monogram fallback on error or missing URL.
- **Single-Line Controls:** All buttons, navigation links, and segmented tabs enforce `whitespace-nowrap shrink-0` with `truncate` fallbacks for dynamic team/league names.

---

## 3. Core UI Component Inventory (`src/components/ui/`)

All application views and modals compose from this standardized primitive library exported via `src/components/ui/index.ts`:

| Component | Variants / Props | Purpose & Responsive Behavior |
| :--- | :--- | :--- |
| **`Button`** | `variant`: `primary \| secondary \| subtle \| ghost \| danger`<br>`size`: `xs \| sm \| md \| lg \| icon`<br>`fullWidth`, `loading` | Standardized tactile button with `whitespace-nowrap shrink-0`, `active:scale-95`, and `focus-visible:ring-2`. |
| **`Card`** | `surface`: `default \| elevated \| subtle \| interactive \| selected`<br>`padding`: `none \| sm \| md \| lg`<br>`radius`: `xl \| 2xl \| 3xl` | Borderless tonal container enforcing single-level depth. |
| **`Modal`** | `isOpen`, `onClose`, `title`, `subtitle`, `icon`, `maxWidth`, `headerActions`, `footer`, `mobileSheet` | Escape-dismissible overlay dialog (`sm:+`) that adapts to a slide-up bottom sheet with drag handle on mobile when `mobileSheet` is enabled. |
| **`SegmentedTabs`** | `items: { id, label, count?, icon? }[]`, `value`, `onChange`, `variant`: `pill \| bar \| compact`, `fullWidth` | Accessible `role="tablist"` segmented control with single-line labels and horizontal scroll safety. |
| **`Input`** | `leftIcon`, `rightElement`, `onClear`, `inputSize`: `sm \| md` | Soft-filled search/text input (`bg-theme-subtle`) with focus ring and clear affordance. |
| **`Select`** | `options?`, `selectSize`: `sm \| md`, `containerClassName` | Soft-filled native select with custom chevron and focus ring. |
| **`Badge`** | `variant`: `default \| accent \| solid \| success \| warning \| danger \| info \| live`<br>`size`: `xs \| sm` | Semantic status indicator (`LIVE`, `Hit`/`Missed`, risk tier, counts). Never wrap static card prose metadata in decorative pill sandwiches. |
| **`StatTile`** | `label`, `value`, `subValue?`, `icon?`, `tone`: `default \| accent \| muted`, `surface`: `card \| elevated \| subtle` | Tabular-numeral metric summary card used in History, Settings, and Match Detail views. |
| **`TeamAvatar`** | `src?`, `name`, `size`: `xs \| sm \| md \| lg` | Resilient team crest image (`referrerPolicy="no-referrer"`) with clean monogram fallback. |
| **`ProgressBar`** | `value`, `max?`, `size`: `sm \| md`, `tone`: `primary \| muted` | Smooth animated progress indicator for background jobs and probability bars. |
| **`LoadingState`** | `label?`, `variant`: `spinner \| skeleton`, `rows?`, `minHeight?` | Standardized spinner card or skeleton placeholder list. |
| **`EmptyState`** | `icon?`, `title`, `description?`, `actions?`, `minHeight?` | Unified empty/zero-data state with clear next-step actions. |
| **`SectionHeader`** | `title`, `icon?`, `action?`, `size`: `sm \| md` | Clean typographic header with optional right-aligned control. |
| **`PaginationBar`** | `currentPage`, `totalPages`, `totalItems`, `startIndex`, `endIndex`, `pageSize`, `onPageChange`, `onPageSizeChange` | Responsive table/feed footer pagination with page-size selector and ellipsis navigation. |
| **`Toast`** | `message`, `visible`, `tone`: `accent \| info \| danger` | Floating status notification anchored above mobile bottom dock / desktop bottom-right corner. |

---

## 4. Feature Component Refactor Map

Every feature module preserves its props, state, event handlers, and DOM structure while consuming `src/components/ui/`:
- **Shell:** `App.tsx`, `Header.tsx`, `DesktopSidebar.tsx`, `BottomNavDock.tsx`, `MainTabBar.tsx`, `LiveScoresTicker.tsx`, `SyncLockOverlay.tsx`, `ErrorBoundary.tsx`
- **Fixtures & Predictions Feed:** `FixturesList.tsx`, `FixtureCard.tsx`, `SimplifiedPredictionsWireframe.tsx`, `FixturesFilterModal.tsx`, `LeagueSelectorModal.tsx`
- **Match Analytics & Standings:** `MatchDetailModal.tsx` (`MatchDetailView`), `PoissonMatrixView.tsx`, `LeagueStandings.tsx`
- **Accumulators, History & Tips:** `DailyFeaturedTip.tsx`, `PrebuiltAccumulators.tsx`, `PredictionHistoryView.tsx`, `TipsSection.tsx`
- **Configuration & Diagnostics:** `SettingsModal.tsx`, `TerminalModal.tsx`
