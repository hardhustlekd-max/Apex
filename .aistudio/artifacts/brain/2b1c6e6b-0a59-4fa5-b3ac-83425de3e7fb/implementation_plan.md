# Implementation Plan: Deep Enhancement of the Apex Prediction Engine

## 1. Deep Heavy Analysis of Current Prediction Engine (`src/core/poisson.ts`)

### Current Architecture & Bottlenecks
1. **Global League Baselines vs. League-Specific Dynamics**:
   - Currently, `leagueHomeAvg` and `leagueAwayAvg` compute global averages across all historical matches without segmenting by specific league division (`m.div`), causing high-scoring leagues (e.g. Eredivisie) and low-scoring leagues (e.g. Ligue 1) to share similar baseline scoring expectations.
2. **Static Home Advantage Factor**:
   - `homeAdvantageFactor` is treated as a uniform multiplier (`1.12`), ignoring team-specific home/away scoring splits and league-specific venue dominance.
3. **Hardcoded Blending Weights**:
   - The final 1X2 distribution is rigidly blended (70% Dixon-Coles + 20% CSF + 10% Elo), which can dampen differentiation when models disagree or when match data is sparse.
4. **Goal Matrix Truncation**:
   - The probability matrix sums up to $MAX\_GOALS = 5$. For high-scoring matches, truncation can slightly skew tail probabilities.

---

## 2. Proposed Robust Enhancements

### Phase 1: League-Specific Baseline Scoring Calibration
- Enhance `predictMatch` to calculate league-specific `leagueHomeAvg` and `leagueAwayAvg` filtered strictly by `leagueHistoricalMatches` (division/league matching) with fallback to global averages only if division data is insufficient.

### Phase 2: Dynamic Team Venue Splits & Venue Modifiers
- Refine home advantage using team-specific home scoring/conceding ratios and away scoring/conceding ratios from recent form splits rather than a flat global constant.

### Phase 3: Adaptive Blending & Variance Expansion
- Introduce confidence-weighted blending in `ApexEngine.predictMatch`: scale blending weights based on data availability (e.g., higher weight to team-specific xG and form when 5+ recent matches exist, and higher weight to Elo/CSF when data is sparse).
- Expand goal matrix calculation up to $MAX\_GOALS = 6$ for precision on high-scoring fixtures.

---

## 3. User Review
Please review this deep analysis and enhancement plan. Click **Proceed** to apply the enhancements to the prediction engine.
