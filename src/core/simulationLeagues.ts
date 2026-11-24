/**
 * Simulation, Virtual & Esports Football Competition Exclusion Registry.
 * Unconditionally blocks Simulated Reality League (SRL), eSoccer, eFootball,
 * Virtual Football, Cyber Football, and short-format electronic leagues across
 * all ingestion feeds, scrapers, databases, API workers, and UI views.
 *
 * NOTE: Keep false-positive safe against real competitions such as
 * "FIFA Arab Cup", "FIFA Series", "FIFA World Cup", "Mineiro", "Preliminary",
 * "Play Offs", "Real Madrid", and "Volta Redonda".
 */

function normalizeForTokenMatch(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SIMULATION_COMPETITION_PATTERNS: RegExp[] = [
  /\bsrl\b/,
  /\bsimulated(?:\s+reality)?\b/,
  /\bsimulation\b/,
  /\be\s*soccer\b/,
  /\be\s*football\b/,
  /\be\s*sports?\b/,
  /\bvirtuals?\b/,
  /\bcyber\b/,
  /\be\s*fifa\b/,
  /\befifa\b/,
  /\bfifa\s*(?:esports?|battle|volta|ultimate|\d+x\d+)\b/,
  /\bea\s*sports?\s*fc\b/,
  /\beafc\b/,
  /\bpro\s*evolution\s*soccer\b/,
  /\bgt\s*(?:sports?\s*)?leagues?\b/,
  /\bh2h\s*gg\s*league\b/,
  /\bvalhalla\s*cup\b/,
  /\bshort\s*football\b/,
  /\bfantasy\s*(?:league|cup|football|soccer)\b/,
  /\b(?:2x\d+|6|8|10|12)\s*mins?\b/,
  /(?:\be\s*soccer|\bfifa|\be\s*football).*\bvolta\b/,
  /\bvolta\b.*(?:\be\s*soccer|\bfifa|\bmins?\b|\b3x3\b|\b4x4\b|\b5x5\b)/,
];

const SIMULATION_URL_PATTERNS: RegExp[] = [
  /\/(?:esoccer|e-soccer|esports?|efootball|e-football|virtual(?:-football|-soccer|-sports?)?|simulated-reality|cyber-football|gt-sports-league|short-football)(?:\/|$)/i,
  /-srl(?:\/|$)/i,
  /\/srl(?:\/|$)/i,
];

const SIMULATION_TEAM_PATTERNS: RegExp[] = [
  /\(\s*(?:srl|sim|simulated|virtual|esports?|e-?soccer|e-?football|e-?fifa|cyber)\s*\)/,
  /\bsimulated\s+reality\b/,
  /\b(?:e\s*soccer|e\s*football|esports?)\b/,
];

function matchesSimulationCompetitionText(raw?: string | null): boolean {
  const spaced = normalizeForTokenMatch(raw);
  if (!spaced) return false;
  return SIMULATION_COMPETITION_PATTERNS.some((re) => re.test(spaced));
}

function matchesSimulationTeamText(raw?: string | null): boolean {
  if (!raw) return false;
  const lowered = String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lowered) return false;
  if (SIMULATION_TEAM_PATTERNS.some((re) => re.test(lowered))) {
    return true;
  }
  const spaced = normalizeForTokenMatch(raw);
  return /\(\s*srl\s*\)/.test(lowered) || /\bsrl\b/.test(spaced);
}

/**
 * Unconditionally identifies whether a competition, match, or standings entry
 * belongs to a simulated, virtual, SRL, cyber, or esports football league.
 */
export function isSimulationLeague(
  league?: string | null,
  leagueName?: string | null,
  country?: string | null,
  leagueUrl?: string | null,
  stage?: string | null,
  homeTeam?: string | null,
  awayTeam?: string | null
): boolean {
  if (
    matchesSimulationCompetitionText(league) ||
    matchesSimulationCompetitionText(leagueName) ||
    matchesSimulationCompetitionText(country) ||
    matchesSimulationCompetitionText(stage)
  ) {
    return true;
  }

  if (leagueUrl) {
    const urlLower = String(leagueUrl).trim().toLowerCase();
    if (SIMULATION_URL_PATTERNS.some((re) => re.test(urlLower))) {
      return true;
    }
  }

  if (matchesSimulationTeamText(homeTeam) || matchesSimulationTeamText(awayTeam)) {
    return true;
  }

  return false;
}
