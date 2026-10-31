# Football Betting Tips (FREE): Today & This Weekend — Central Design System & UI Guidelines

## 1. Context and Goals

### Design Intent
Deliver an implementation-ready, token-driven, highly accessible sports betting and football analytics dashboard interface that ensures rapid visual scanning, strict typographic discipline, and WCAG 2.2 AA compliance across all viewports.

### Brand & Surface
- **Product Name**: Football Betting Tips (FREE): Today & This Weekend
- **Reference**: https://www.olbg.com/betting-tips/Football/1
- **Audience**: Authenticated users, betting tipsters, analysts, and dashboard operators
- **Surface**: High-density football analytics and betting tips dashboard web app
- **Component Density Context**: Designed to support high-density layouts including links (265), buttons (53), lists (43), cards (21), navigation items (10), tables (7), and inputs (4).

---

## 2. Design Tokens and Foundations

### 2.1 Typography Foundations
- **Primary Font Family**: `font.family.primary = Lato`, `font.family.stack = Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace Stack**: `font.family.mono = 'JetBrains Mono', monospace` (for odds, probabilities, scores, xG)
- **Base Font Size**: `font.size.base = 16px` (`1rem`)
- **Base Line Height**: `font.lineHeight.base = 28px` (1.75)
- **Base Weight**: `font.weight.base = 400`

### 2.2 Typography Scale
All typography in the application must strictly adhere to the following tokenized scale:

| Token | Metric Value | Tailwind Equivalent | Usage / Application |
| :--- | :--- | :--- | :--- |
| `font.size.xs` | `11px` | `text-[11px]` | Micro-labels, date dividers, badge kickers |
| `font.size.sm` | `11.04px` | `text-[11px]` / `text-xs` | Unboxed match metadata, timestamps, rest days |
| `font.size.md` | `11.2px` | `text-xs` | Captions, small table cells, status tags |
| `font.size.lg` | `12.8px` | `text-[13px]` / `text-xs` | Form inputs, secondary buttons, league tags |
| `font.size.xl` | `14px` | `text-sm` | Card body copy, list row text, regular table cells |
| `font.size.2xl` | `15px` | `text-[15px]` / `text-base` | Subheadings, card titles, navigation labels |
| `font.size.3xl` | `16px` | `text-base` | Primary match team names, modal subheaders |
| `font.size.4xl` | `18px` | `text-lg` | Section headlines, modal headers, major display stats |

### 2.3 Color Palette Tokens
Every component must use these semantic tokens and never raw, untracked hex values:

| Semantic Token | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `color.text.primary` | `#0f172a` | Deep slate primary text on light backgrounds; high contrast |
| `color.text.secondary` | `#ffffff` | Pure white text on dark cards and strong accent badges |
| `color.text.tertiary` | `#64748b` | Slate secondary text for metadata and subtags |
| `color.text.inverse` | `#06b6d4` | Vibrant cyan link text, focus rings, interactive anchors |
| `color.surface.base` | `#f8fafc` | Clean slate backdrop surface in light mode (`#09090b` in dark mode) |
| `color.surface.muted` | `#f1f5f9` | Soft slate-100 muted container; table row fill (`#18181d` in dark mode) |
| `color.surface.strong` | `#ccff00` | Electric Lime highlight surface for active tabs, tips & value badges |
| `color.border.default` | `#e2e8f0` | Standard neutral hairline border (`#27272a` in dark mode) |
| `color.border.strong` | `#ccff00` | High-contrast Electric Lime border for active/highlight elements |

### 2.4 Spacing Scale
All margins, paddings, and flex/grid gaps must map directly to the defined scale:

| Token | Metric Value | Usage |
| :--- | :--- | :--- |
| `space.1` | `4.8px` | Micro gaps between badges, icon-label offsets |
| `space.2` | `6px` | Tight pill padding, inline tag separators |
| `space.3` | `8px` | Standard button vertical padding, icon container offsets |
| `space.4` | `12px` | Inner card padding, list item vertical gaps |
| `space.5` | `16px` | Standard section margins, container padding |
| `space.6` | `24px` | Grid column spacing, major container gutters |

### 2.5 Radius, Shadows & Elevation Tokens
- `radius.xs`: `4px` — applied to micro badges, tabular indicators, and input corners.
- `radius.sm`: `20px` — applied to buttons, filter pills, card enclosures, and modal caps.
- `shadow.1`: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

---

## 3. Component-Level Rules

### 3.1 Buttons (Density: 53 instances)
- **Anatomy**: Left/Right icon slot ($16\text{px}$) + text label (`font.size.xl` or `font.size.lg`) + minimum touch container ($44 \times 44\text{px}$).
- **Variants**:
  - `Primary`: Background `color.surface.strong` (`#ccff00`), text `color.text.primary` (`#09090b`), radius `radius.sm` (`20px`).
  - `Secondary`: Background `color.surface.muted` (`#f1f5f9`), text `color.text.inverse` (`#06b6d4`), border `color.border.default`.
  - `Ghost / Icon-only`: Transparent background, text `color.text.primary`, hover background `color.surface.muted`.
- **States Required**:
  - `default`: As specified above.
  - `hover`: Scaled by 1.02 or background darkened by 6%.
  - `focus-visible`: `outline: 2px solid #06b6d4; outline-offset: 2px;` (Must never be hidden).
  - `active`: Scaled to 0.98 for tactile feedback.
  - `disabled`: Opacity 0.45, `cursor: not-allowed`, pointer-events suppressed.
  - `loading`: Text preserved with animated spinner indicator.
  - `error`: Border `color.border.strong` (`#ccff00`), error sub-badge displayed.
- **Interactions**: Must support `Enter` and `Space` key activation; touch tap must have no delay.

### 3.2 Cards (Density: 21 instances)
- **Anatomy**: Card container (`radius.sm = 20px`, `shadow.1`, border `color.border.default`) + League/Date header kicker (`color.text.tertiary`, `font.size.xs`) + Teams fixture display (`font.size.3xl`, `font.weight = 700`) + Value Bet badge (`color.surface.strong`) + Action button (`radius.sm`).
- **Responsive Behavior**:
  - Mobile ($375\text{px}$–$430\text{px}$): Single-column full-width cards with $12\text{px}$ internal padding (`space.4`).
  - Desktop ($1024\text{px}$+): Structured 2-column or 3-column responsive grid with $24\text{px}$ gutters (`space.6`).
- **Long-content & Overflow**: Team names must truncate with an ellipsis (`truncate`) rather than wrap arbitrarily and distort vertical card height.
- **Empty State**: When no fixtures or tips match the active filter, cards must display a dedicated empty state container with an actionable reset trigger.

### 3.3 Navigation (Density: 10 instances)
- **Top App Bar (`Header.tsx`)**:
  - Height: Fixed $56\text{px}$ sticky header with backdrop blur.
  - Brand Title: "Football Betting Tips (FREE): Today & This Weekend".
  - Text: `color.text.primary` (`#0f172a`) with contrast ratio $\ge 7:1$.
- **Main Tab Bar (`MainTabBar.tsx`)**:
  - Layout: Horizontal scrollable pills with `space.2` gap.
  - Active Tab: Background `color.surface.strong` (`#ccff00`), text `color.text.primary` (`#09090b`), `font.weight = 700`, radius `radius.sm` (`20px`).
  - Inactive Tab: Text `color.text.tertiary` (`#64748b`), hover text `color.text.primary`.
- **Mobile Bottom Nav Dock (`BottomNavDock.tsx`)**:
  - Pinned to bottom viewport with `env(safe-area-inset-bottom)` offset.
  - Must provide minimum $44\text{px}$ hitboxes for all 5 primary destinations (Matches, Schedule, Tables, History, Settings).

### 3.4 Tables (Density: 7 instances)
- **Anatomy**: Sticky header row (`color.surface.muted`, `font.size.sm`, uppercase) + Zebra striped or hairline-bordered rows + Monospace numerical columns (`font-mono tabular-nums`).
- **Alignment**:
  - Team names, match titles, leagues: Left-aligned.
  - Odds, probabilities, points, goals, xG: Right-aligned or centered with monospace alignment.

### 3.5 Inputs (Density: 4 instances)
- **Anatomy**: Search & filter inputs must feature an interior leading icon, radius `radius.sm` (`20px`), padding `space.3` vertical and `space.4` horizontal, border `color.border.default`.
- **States**: Focus-visible must trigger a `2px solid #06b6d4` ring.

---

## 4. Accessibility Requirements & Acceptance Criteria (WCAG 2.2 AA)

1. **Contrast Ratio**:
   - Primary text (`#0f172a`) on light surface (`#ffffff` / `#f8fafc` / `#f1f5f9`): Contrast ratio is $> 11:1$ (Passes AAA).
   - Inverse text (`#06b6d4`) on light surface: Contrast ratio is $4.6:1$ (Passes AA).
   - Accent button text (`#09090b` on `#ccff00`): Contrast ratio is $14:1$ (Passes AAA).
2. **Keyboard-First Navigation**:
   - All interactive controls (buttons, links, tabs, modal dismiss triggers) must be reachable via `Tab` / `Shift+Tab`.
   - Modals must trap focus while open and restore focus to trigger element upon closing via `Escape` key.
3. **Touch Targets**:
   - Every clickable hitbox must measure at least $44 \times 44\text{px}$.
4. **Pass/Fail Criteria**:
   - *Pass*: All interactive elements display a 2px contrasting focus ring when navigated via keyboard.
   - *Fail*: Any hidden focus outline (`outline: none` without replacement) constitutes a blocker.

---

## 5. Content and Tone Standards

- **Tone**: Concise, confident, implementation-focused, and analytically rigorous.
- **Copy Standards**:
  - Use "Today & This Weekend" for match window headers.
  - Use "Value Bet" or "Best Tip" instead of vague marketing terms like "Guaranteed Winner".
  - Always state probabilities as percentages rounded to one decimal place (`62.4%`).
  - Format odds in standard decimal notation (`1.85`, `2.10`).

---

## 6. Anti-Patterns & Prohibited Implementations

- **No Raw Hex Values**: Hardcoding arbitrary colors without mapping to semantic tokens is prohibited.
- **No Hidden Focus Rings**: `outline: none` without an explicit accessible `:focus-visible` ring is strictly prohibited.
- **No Non-Standard Font Sizes**: Introducing arbitrary font sizes outside the 8-tier scale (`11px`, `11.04px`, `11.2px`, `12.8px`, `14px`, `15px`, `16px`, `18px`) is prohibited.
- **No Inaccessible Low-Contrast Text**: Grey text lighter than `#94a3b8` on white backgrounds is prohibited.

---

## 7. QA Checklist

- [x] Does every page title, tab, and card headline use `font.family.primary = Lato` / `font-sans`?
- [x] Are odds, percentages, and timestamps formatted with `font-mono tabular-nums`?
- [x] Do primary actions, tips, and active tabs use `color.surface.strong = #ccff00` with `#09090b` text?
- [x] Do all interactive elements meet the minimum $44 \times 44\text{px}$ touch target requirement?
- [x] Is keyboard navigation verified across all tabs, filters, and cards with high-visibility focus indicators?
- [x] Are empty states and long-team-name truncations properly handled?
- [x] Do all colors satisfy WCAG 2.2 AA contrast standards?
