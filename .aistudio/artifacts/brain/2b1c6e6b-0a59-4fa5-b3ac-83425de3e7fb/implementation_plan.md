# Apex UI Design System: Pure Visual, Spatial Grid & Mobile Touch Optimization

Architectural blueprint and implementation plan for upgrading the visual styling, spatial geometry, responsive breakpoints, and touchscreen ergonomics of the Apex Football Engine while preserving 100% of existing content, views, filters, and data fields with zero additions or removals.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Strict Content Preservation (Zero Additions / Zero Removals)**: Every existing screen, view, tab, metric, filter, modal, and button remains strictly preserved in place. No existing data points or features will be removed, and no extraneous or unrequested content will be added.
> - **In-Place Visual & Spatial Polish**: The modernization is purely visual, layout, and ergonomic—applying a deterministic hybrid 4-pt/8-pt grid, scalable Deep Obsidian color palette, and 48px touch target hitboxes directly to the existing UI architecture.
> - **Color Tokens**: Deep Obsidian canvas (`#09090B`), subtle dark structural surfaces (`#121216` / `#18181D`), crisp hairline borders (`#27272A`), and high-intent Electric Volt (`#CCFF00`) accents for active states and primary actions.
> - **Strict MUI Iconography & Zero Emojis**: Continues strict compliance with the directive: no emojis anywhere; Material UI (MUI) icons for all controls, status anchors, and buttons.

---

## 1. Overview & Scope

### Scope Boundary
This revision is dedicated exclusively to enhancing the presentation, readability, touch responsiveness, and spatial geometry of the application:
- **Preserved Existing Features**: Top Bar, Upcoming Fixtures, Live Matches, History View, Acca Builder, Simplified Wireframe view, Market Choice Filters (Best Value, 1X2, Over/Under, BTTS), Date Selector, Search Input, Match Detail Inspection Modal (Head-to-Head, Form, Probability Matrix, Value Bets), Settings Modal (Engine parameters, Data Sync, Appearance), Terminal Logs Drawer, Bottom Nav Dock.
- **Upgraded Design Attributes**: Spatial math (hybrid 4-pt/8-pt spacing), typography scaling with tabular figures, mobile touch target hitboxes ($\ge 48\text{px}$), and dark/light color palette refinement.

---

## 2. Spatial Grid, Color System & Ergonomics

### A. Hybrid 4-Point & 8-Point Spatial Grid
Applied directly across all existing containers, cards, and modal dialogs:

- **Micro-Scale (4-Point)**: 
  - `4px` (`gap-1`, `p-1`) for inline badge spacing, icon-to-text gaps, and border offsets.
  - `8px` (`gap-2`, `p-2`) for tight list rows, button internal icon gaps, and secondary metadata spacing.
  - `12px` (`gap-3`, `p-3`) for compact card padding and segmented control tabs.
- **Macro-Scale (8-Point)**:
  - `16px` (`gap-4`, `p-4`) standard container inner padding, card gutters, and form control padding.
  - `24px` (`gap-6`, `p-6`) for section dividers and modal body padding.
  - `32px` (`gap-8`, `p-8`) for desktop container gutters and hero vertical margins.
  - `48px` (`min-h-[48px]`, `h-12`) ergonomic minimum touch target hitbox across all mobile buttons, tabs, and filters.
  - `64px` (`h-16`) standard fixed header and bottom dock height.

---

### B. Scalable UI Color Palette (60-30-10 Distribution)

All existing UI elements mapped cleanly to structured theme tokens:

- **60% Dominant Neutral Canvas**:
  - Dark Mode: `#09090B` (Canvas), `#121216` (Card Surfaces).
  - Light Mode: `#F8FAFC` (Canvas), `#FFFFFF` (Card Surfaces).
- **30% Structural Surfaces & Typography**:
  - Borders: `#27272A` (Dark hairline), `#E2E8F0` (Light hairline).
  - Text Primary: `#FAFAFA` (Dark), `#0F172A` (Light).
  - Text Muted: `#A1A1AA` (Dark Zinc 400), `#64748B` (Light Slate 500).
- **10% High-Intent Accents**:
  - Primary Accent: `#CCFF00` (Electric Volt) for active tabs, selected states, and value tips.
  - Success / Hit: `#22C55E` (Emerald 500).
  - Danger / Missed: `#EF4444` (Rose 500).
  - Live Indicator: High-contrast amber/volt pulse.

---

### C. Mobile Touchscreen Ergonomics (Thumb-Zone Optimization)

- **48px Minimum Hitbox**: Every existing interactive element—including calendar date pills, league filters, scope switchers (Upcoming/Live/History), search clear buttons, and card click areas—receives explicit `min-h-[48px] min-w-[48px]` touch envelopes to eliminate mis-taps.
- **Lower 40% Reach Zone**: Bottom Dock and modal action buttons positioned comfortably in the natural thumb zone.
- **15% Fixed Surface Cap**: Header (56px) + Bottom Dock (64px) aggregate to 120px, guaranteeing over 85% of mobile viewport space remains open for fluid content scrolling.

---

## 3. Component-by-Component In-Place Refinement

Every existing component is polished in-place without removing or adding elements:

1. **Top Bar & Navigation (`TopAppBar.tsx`)**:
   - Preserves existing brand title, provider status indicator, theme toggle, and settings triggers.
   - Restyles with 56px height, single-line alignment, and clean border separator.
2. **Calendar & Date Filter Strip (`FixturesList.tsx`)**:
   - Preserves 6-day calendar pills and date filter modes (Today, Tomorrow, 3 Days, Week, Custom).
   - Upgrades date pills to ergonomic 48px touch targets with smooth scroll snap on mobile.
3. **Fixture Card (`FixtureCard.tsx` / `SimplifiedPredictionsWireframe.tsx`)**:
   - Preserves all club badges, names, kick-off times, league labels, 1X2 market odds, model probabilities, and best value market badges.
   - Refines layout using 4-pt/8-pt padding (`p-4`), unboxed metadata with `·` separators, and tabular numerals (`tabular-nums`) for odds and percentages.
4. **Match Detail Modal (`MatchDetailModal.tsx`)**:
   - Preserves Head-to-Head stats, recent form, probability matrix, Dixon-Coles parameters, and Poisson calculations.
   - Adapts responsively: fluid full-width bottom sheet on mobile (`< 768px`) with drag handle and 48px touch buttons; centered modal on desktop (`≥ 768px`).
5. **Settings & Terminal Modals (`SettingsModal.tsx`, `TerminalModal.tsx`)**:
   - Preserves Engine settings, Ingestion controls, Turso status, and Terminal logs viewer.
   - Refines form inputs, progress indicators, and button padding to standard 4-pt/8-pt tokens.
6. **Bottom Dock (`BottomNavDock.tsx`)**:
   - Preserves Upcoming, Live, History, Acca, and Settings destinations.
   - Upgrades touch targets to 48px with safe-area padding (`pb-safe`) for edge-to-edge mobile screens.

---

## 4. Technical Architecture & File Plan

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RESPONSIVE VIEWPORT CANVAS                      │
│                                                                        │
│  TopAppBar (56px fixed, 48px touch controls, single line)             │
├────────────────────────────────────────────────────────────────────────┤
│  Scope Switcher (Upcoming │ Live │ History │ Acca)                     │
│  Calendar Date Strip (48px Touch Targets, Horizontal Scroll-Snap)      │
│  League Filter & Search Bar (Hairline border, 48px touch input)        │
├────────────────────────────────────────────────────────────────────────┤
│  Fixture List & Prediction Stream                                      │
│  ├── Desktop (≥ 768px): 2-Column Responsive Grid                       │
│  └── Mobile (< 768px): 1-Column Fluid Stream (16px gutters, 4-pt gaps) │
├────────────────────────────────────────────────────────────────────────┤
│  BottomNavDock (64px fixed, 48px touch targets, pb-safe)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
[ Mobile: Bottom Sheet Responsive Layout ]         [ Desktop: Centered Responsive Layout ]
- MatchDetailModal (Bottom Sheet on mobile)        - MatchDetailModal (Centered Dialog)
- SettingsModal (Bottom Sheet on mobile)           - SettingsModal (Centered Dialog)
- TerminalModal (Bottom Sheet on mobile)           - TerminalModal (Centered Dialog)
```

### Pure Styling In-Place Scope
- **Zero changes to database schemas, queries, or API endpoints**.
- **Zero modifications to business logic, Poisson modeling, or state management**.
- All edits target CSS classes, layout containers, responsive breakpoints (`sm:`, `md:`, `lg:`), and touch hitbox dimensions.
