# Architectural Data Consistency Redesign: Backend-to-Frontend Unified Precision & Market Semantics

## 1. Executive Summary & Problem Root Cause
Following the deep-dive investigation into discrepancies between the fixture list wireframe and the match details modal, three structural inconsistencies were identified:
1. **Mathematical Precision Asymmetry**: The wireframe rounded probabilities via `Math.round(prob * 100)` (e.g. `40%`), whereas the match detail modal formatted them via `Math.round(prob * 1000) / 10` (e.g. `39.5%`), and `FixtureCard.tsx` suffered an integer truncation bug rendering `0% Conf`.
2. **Semantic Conflation of "TIP"**: The wireframe's single `TIP` badge was overloaded with two distinct concepts:
   - **Model Pick / Most Likely Outcome**: The mathematically highest probability outcome (e.g. Home Win 58.2%).
   - **Value Bet (+EV)**: Mispriced bookmaker odds generating positive expected value $EV = (prob \times odds) - 1 > 0$ (e.g. Underdog Away Win at 31.4% with odds 3.80 generating +19.3% EV).
   - Furthermore, sorting by `TIP %` was sorting by `Math.max(h, d, a)` rather than the actual probability of the displayed value bet, causing visual disorientation.
3. **Decentralized Calculation vs Server Single Source of Truth**: Different components had disconnected local fallbacks and inconsistent inline calculation logic.

Per your decisions:
- **Precision**: Exactly **one decimal place (e.g. `39.5%`)** standardized across all tables, pills, cards, tooltips, and modals.
- **Tip & Value Separation**: Distinct, unambiguous visual indicators separating the **Highest Probability Pick** (e.g., `PICK: 1 (58.2%)`) from the **Value Bet (+EV)** (e.g., `VALUE: +18.4% EV`).
- **Authoritative Source**: The backend server engine (`serverEngine.ts` / Dixon-Coles 5-pillar engine) is the single authoritative source; all frontend components consume normalized fields with zero divergence.

---

## 2. User Review & Architectural Decisions Confirmed
- [x] **Format Standard**: Single shared formatter `formatProb(prob, 1)` -> `39.5%` across all surfaces.
- [x] **Market Separation**:
  - **Most Likely Outcome / Pick**: Dedicated badge showing 1X2 most probable result (or market pick) and exact 1-decimal win probability.
  - **Value Bet (+EV)**: Distinct badge showing the market selection and EV percentage edge when $EV \ge +2\%$.
- [x] **Server-Authoritative Contract**: Client-side re-computation with empty match histories is eliminated. All views consume authoritative pre-calculated properties on `Fixture.prediction`, `Fixture.mostLikelyOutcome`, and `Fixture.profitableBet`.

---

## 3. Proposed Changes & Technical Architecture

### Phase 1: Shared Mathematical Formatting & Normalization Library
#### `src/core/formatters.ts` (New module)
Create an authoritative utility module ensuring 100% numerical and label consistency:
- `formatProb(prob: number | undefined, decimals = 1): string`
  - Normalizes any probability (0.0 to 1.0 or 0 to 100) to standard 1-decimal percentage string (e.g. `0.3952` -> `39.5%`, `0.28` -> `28.0%`).
- `getProbValue(prob: number | undefined, decimals = 1): number`
  - Returns exact floating value rounded to specified decimal (e.g. `39.5`) for sorting, threshold comparisons, and progress bar widths.
- `formatOdds(odds: number | undefined): string`
  - Returns standard European decimal odds (e.g. `2.45`).
- `formatEV(ev: number | undefined): string`
  - Formats expected value with explicit sign (e.g. `+18.4%` or `-6.2%`).
- `get1X2Selection(prediction: PoissonPrediction): { key: '1' | 'X' | '2'; label: string; prob: number; probFormatted: string }`
  - Determines the highest likelihood 1X2 outcome deterministically.

---

### Phase 2: Authoritative Server-Side Pipeline & Type Contract
#### `src/core/types.ts`
- Ensure `Fixture` strictly includes:
  - `mostLikelyOutcome`: `{ selection: string; marketKey: MarketOption['key']; probability: number; odds: number; expectedValue: number; isProfitable: boolean; commentary: string }`
  - `profitableBet`: `{ selection: string; marketKey: MarketOption['key']; probability: number; odds: number; expectedValue: number; edgePercent: number; fairOdds: number; kellyStakePercent: number; commentary: string }`
  - Normalized 1-decimal probability properties or helper accessors.

#### `src/core/serverEngine.ts` & `src/core/poisson.ts`
- Guarantee that whenever a fixture is processed or served:
  - Dixon-Coles 1X2 distribution sums exactly to 1.000 (100.0%).
  - Both `mostLikelyOutcome` and `profitableBet` (if EV threshold met) are populated on the fixture object.
  - Eliminate any discrepancy where odds or probabilities could be evaluated under divergent rules.

---

### Phase 3: Wireframe Table Redesign (`src/components/SimplifiedPredictionsWireframe.tsx`)
Redesign the wireframe table header and row layout to cleanly separate Model Pick from Value Bet:
1. **Header Columns**:
   - `Match & Competition`
   - `MODEL PICK` (shows most likely 1X2 outcome, e.g. `1 54.2%`)
   - `VALUE (+EV)` (shows highest EV market edge if positive, e.g. `+14.2% EV` or `None`)
   - `1 | X | 2` (or `O 2.5 | U 2.5` or `BTTS YES | NO`) probability pills.
2. **Pill Formatting**:
   - Update all pills from integer `Math.round(prob * 100)` (e.g. `40`) to uniform 1-decimal pills (e.g. `39.5%` or compact `39.5` with consistent mono font).
   - Ensure color thresholds (e.g. $\ge 50.0\%$, $35.0\% - 49.9\%$, $< 35.0\%$) use `getProbValue(prob, 1)`.
3. **Sorting Consistency**:
   - `PROB_DESC` / `PROB_ASC`: Sorts by the actual `mostLikelyOutcome.probability`.
   - `EV_DESC`: Sorts by `profitableBet.expectedValue`.
   - `HOME_DESC`, `DRAW_DESC`, `AWAY_DESC`: Sorts by `prediction.homeWinProb`, `prediction.drawProb`, `prediction.awayWinProb` using exact values.

---

### Phase 4: Match Detail Modal Alignment (`src/components/MatchDetailModal.tsx`)
Synchronize the modal's hero card, breakdown tabs, and prediction summaries:
1. **Hero Section**:
   - Display both **Most Likely Outcome** (Pick & 1-decimal probability) and **Best Value Bet** (+EV edge & Kelly stake) side-by-side with clear visual badges.
   - Match the exact 1-decimal percentage strings generated by `formatProb`.
2. **1X2 & Market Grids**:
   - Render identical Home/Draw/Away win probabilities as in the wireframe table row (e.g. wireframe `39.5%` matches modal `39.5%`).
   - Eliminate any ad-hoc local calculations or conversions.

---

### Phase 5: Component-Wide Uniformity Audit
Apply the same precision standards and bug fixes across all secondary views:
1. **`src/components/FixtureCard.tsx`**:
   - Fix confidence badge bug (`Math.round(Math.max(...))` -> `formatProb(Math.max(...))`).
   - Format Home/Draw/Away percentage labels to 1 decimal place (`39.5%`, `28.0%`, `32.5%`).
2. **`src/components/PrebuiltAccumulators.tsx`**:
   - Ensure acca leg probabilities and combined slip odds/probabilities use `formatProb` and `formatEV`.
3. **`src/components/PoissonMatrixView.tsx`**:
   - Correct scores and matrix cells formatted uniformly.

---

## 4. Verification & Testing Plan
1. **Compilation & Syntax**:
   - Run `compile_applet` to confirm zero TypeScript compilation errors and bundle integrity.
2. **Data Consistency Audit**:
   - Inspect a sample match (e.g. Manchester City vs Arsenal).
   - Verify that:
     - Wireframe Row: Home % is `39.5%`, Draw % is `28.0%`, Away % is `32.5%`.
     - Match Detail Modal: Home % is `39.5%`, Draw % is `28.0%`, Away % is `32.5%`.
     - Fixture Card (if viewed): Home % is `39.5%`, Confidence matches top probability.
   - Verify that the Model Pick column displays the true maximum likelihood outcome, and the Value Bet badge only displays when $+EV > 0$.
3. **Sorting Integrity**:
   - Sort by Model Pick % (High $\to$ Low) and verify rows are in strictly descending order without anomalies.
   - Sort by Value Bet EV and verify positive EV bets surface to the top.
