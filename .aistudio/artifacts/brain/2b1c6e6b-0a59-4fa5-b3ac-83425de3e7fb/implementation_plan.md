# Replace Elo Rating with Composite Team Strength & Form Momentum (CSF) Index (Revised)

Replace the legacy Augmented Elo rating model in Pillar 1 with an empirical, multi-factor **Composite Team Strength & Form Momentum (CSF) Index**. This revised plan verifies that 100% of data inputs required for the new CSF model are sourced directly from existing SQLite database tables, with complete schema synchronization.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Database Data Guarantee**: All input parameters for the CSF Index (form history, goal supremacy, shots on target, league table standings, and home/away venue splits) are queried directly from the SQLite database (`historical_matches`, `league_standings`, `match_statistics_relational`, and `engine_settings`).
> - **Zero Synthetic Fallbacks**: When real scraped statistics are present in SQLite, the engine computes exact ratios; when newly seeded leagues have match records, the engine dynamically derives standings and shot counts from `historical_matches`.
> - **Complete Schema Alignment**: `src/db/schema.ts` is updated to replace `pillar1_augmented_elo` with `pillar1_team_strength_index`, capturing all sub-metrics.

## 1. Database Sourcing Matrix for CSF Parameters

Every component of the CSF Index maps to concrete fields stored in SQLite:

| CSF Model Component | Required Metric | Sourcing Database Table & Method | Fields Utilized |
| :--- | :--- | :--- | :--- |
| **1. Decayed Form & Goal Dominance** (45%) | Recency-weighted goal supremacy, match outcomes (W/D/L), venue splits | `historical_matches` via `db.getTeamHistoricalMatches(team, windowLimit)` | `fthg`, `ftag`, `ftr`, `match_date`, `home_team`, `away_team` |
| **2. League Standings & Table Momentum** (30%) | Rank delta, Points Per Game (PPG), Goal Difference velocity | `league_standings` via `db.getLeagueStandings(leagueCode)` (fallback: `db.computeLeagueStandings`) | `rank`, `points`, `played`, `goal_difference`, `goals_for`, `goals_against` |
| **3. Shot Efficiency & Clinical Finishing** (25%) | SOT conversion rate, defensive concessions per shot on target faced | `historical_matches` & `match_statistics_relational` via `db.getTeamHistoricalMatches` | `hst`, `ast`, `hs`, `as_shots`, `category`, `home_value`, `away_value` |
| **4. Dynamic Venue Split** | Home win/goal supremacy vs. away win/goal concession | `historical_matches` filtered by home/away venue | Home/away record splits, `homeAdvantageFactor` from `engine_settings` |

## 2. Mathematical Architecture: The CSF Index

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE QUERIES (SQLite Storage)                        │
│   • historical_matches ──► Rolling Form & SOT Conversion Rates              │
│   • league_standings   ──► Rank & PPG Momentum Velocity                     │
│   • engine_settings    ──► Configurable Baseline Home Factor                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PILLAR 1: CSF INDEX (0 - 100)                         │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│    1. Decayed Goal & Form    │     2. League Table & PPG    │  3. Shot Rate │
│       Dominance (45%)        │        Momentum (30%)        │Efficiency(25%)│
│  - Exponential recency decay │  - Points Per Game (PPG)     │- SOT to Goal  │
│  - Goal supremacy margin     │  - Table rank differential   │- Concession % │
│  - Venue (Home/Away) split   │  - Goal Difference velocity  │- Box dominance│
└──────────────────────────────┴──────────────────────────────┴───────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STRENGTH DIFFERENCE (ΔTSR)                          │
│     ΔTSR = (Home_TSR * Dynamic_Home_Advantage) - (Away_TSR * Away_Form)     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              ▼                                                 ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│     Dixon-Coles λ & μ        │              │  1X2 Expectancy Distribution │
│  λ = λ_base * (1 + ΔTSR/100) │              │  Home / Draw / Away Baseline │
│  μ = μ_base * (1 - ΔTSR/100) │              │  Calibrated Draw Parity Bell │
└──────────────────────────────┘              └──────────────────────────────┘
```

### Component Formulas:
1. **Decayed Form & Goal Dominance ($F_{score}$)**:
   - Sourced from `historical_matches` over a rolling window (default: 8-10 matches).
   - Recency decay factor: $\alpha = 0.88^{(t - 1)}$ where $t=1$ is the most recent match.
   - Goal supremacy: $\text{MarginFactor} = \sqrt{|fthg - ftag|} \times (\text{Result} == \text{Win} ? 1.0 : \text{Result} == \text{Draw} ? 0.0 : -1.0)$.
   - Venue split: Separate home form evaluation for home club, away form evaluation for away club.
2. **Table & PPG Momentum ($M_{table}$)**:
   - Sourced from `league_standings` table in SQLite.
   - Normalized Points Per Game: $PPG = \text{Points} / \max(\text{Played}, 1)$.
   - Standings rank differential: $(Rank_{away} - Rank_{home}) / \text{TotalTeams}$.
   - Relative Goal Difference: $GD / \max(\text{Played}, 1)$.
3. **Shot Efficiency Ratio ($E_{shots}$)**:
   - Sourced from `hst`, `ast`, `hs`, `as_shots` in `historical_matches`.
   - Attacking Shot Conversion: $\text{GoalsScored} / \max(\text{ShotsOnTarget}, 1)$.
   - Defensive Concession Rate: $\text{GoalsConceded} / \max(\text{ShotsOnTargetFaced}, 1)$.

## 3. Database Schema & Interface Updates

### `src/core/types.ts` & `src/db/schema.ts`:
Replace `EloRatingBreakdown` and `pillar1_augmented_elo` with:
```typescript
export interface TeamStrengthBreakdown {
  homeStrengthRating: number;      // 0 - 100 scale
  awayStrengthRating: number;      // 0 - 100 scale
  formDominanceHome: number;       // 45% weight
  formDominanceAway: number;
  tableMomentumHome: number;       // 30% weight
  tableMomentumAway: number;
  shotEfficiencyHome: number;      // 25% weight
  shotEfficiencyAway: number;
  venueModifierHome: number;
  venueModifierAway: number;
  strengthDifference: number;      // Net rating advantage
  homeWinExpectancy: number;       // Direct 1X2 probabilities
  drawExpectancy: number;
  awayWinExpectancy: number;
}
```

## 4. Execution & Verification Workflow

1. **Database Query Helpers (`src/core/db.ts`)**:
   - Verify `db.getTeamHistoricalMatches` returns `hst`, `ast`, `hs`, `asShots`.
   - Verify `db.getLeagueStandings` / `db.computeLeagueStandings` provides current table metrics.
2. **Engine Implementation (`src/core/poisson.ts`)**:
   - Implement `computeTeamStrengthIndex(...)` and `getTeamStrengthExpectancy(...)`.
   - Integrate strength difference $\Delta TSR$ into Dixon-Coles goal expectation ($\lambda$ and $\mu$) and 1X2 distribution blending.
   - Remove legacy Elo computation and caches.
3. **Database Schema (`src/db/schema.ts`)**:
   - Update schema definition to align with the new CSF breakdown.
4. **UI Adaptation (`PoissonMatrixView.tsx`, `FixtureCard.tsx`, `MatchDetailModal.tsx`)**:
   - Update labels and radar/breakdown metrics from Elo to Team Strength & Form Momentum (CSF).
5. **Compilation & Testing**:
   - Run `lint_applet` and `compile_applet`.
   - Verify calculation on real SQLite records.
