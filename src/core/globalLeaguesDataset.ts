export interface GlobalLeagueReference {
  reep_id: string;
  name: string;
  country?: string;
  code: string;
}

export const GLOBAL_LEAGUES_DATASET: GlobalLeagueReference[] = [
  { reep_id: 'reep_lb3d230cb', name: 'Premier League', country: 'England', code: 'E0' },
  { reep_id: 'reep_ld517cd4f', name: 'La Liga', country: 'Spain', code: 'SP1' },
  { reep_id: 'reep_ld1f8a49a', name: 'Serie A', country: 'Italy', code: 'I1' },
  { reep_id: 'reep_l91f82788', name: 'Bundesliga (Germany)', country: 'Germany', code: 'D1' },
  { reep_id: 'reep_l55ddfaa7', name: 'Ligue 1', country: 'France', code: 'F1' },
  { reep_id: 'reep_l5ffc4aa2', name: 'UEFA Champions League', country: 'Europe', code: 'UCL' },
  { reep_id: 'reep_l74c9a055', name: 'UEFA Europa League', country: 'Europe', code: 'UEL' },
  { reep_id: 'reep_l764c2adf', name: 'UEFA Conference League', country: 'Europe', code: 'UCOL' },
  { reep_id: 'reep_lfe2d9011', name: 'Eredivisie', country: 'Netherlands', code: 'NL1' },
  { reep_id: 'reep_l2e7b8b73', name: 'Primeira Liga', country: 'Portugal', code: 'PO1' },
];
