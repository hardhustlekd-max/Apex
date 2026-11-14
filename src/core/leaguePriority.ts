import { Fixture } from './types.js';
import { normalizeDateStr, normalizeTimeStr } from './dateUtils.js';

/**
 * Computes a popularity score for a football competition.
 * Higher score = higher popularity (for descending popularity sorting).
 */
export function getLeaguePopularityScore(
  leagueCode?: string,
  leagueName?: string,
  stage?: string
): number {
  const code = (leagueCode || '').toUpperCase().trim();
  const name = (leagueName || '').toLowerCase().trim();
  const stg = (stage || '').toLowerCase().trim();
  const full = `${stg} | ${name} | ${code}`.toLowerCase();

  // Extract country prefix if present (e.g. "england: premier league" -> "england")
  const rawPrefixSource = stg.includes(':') ? stg : name.includes(':') ? name : '';
  const stageCountry = rawPrefixSource
    ? rawPrefixSource.split(':')[0].trim().toLowerCase()
    : '';

  const isWomen =
    /\b(women|women's|womens|wsl|femenina|feminino|frauen|femminile|nwsl|liga f|nsl women|swpl|elitettan|damallsvenskan|premiere ligue women|seconde ligue women|ekstraliga women|superliga women|alagoano women|paraense women)\b/i.test(
      full
    ) ||
    /women/i.test(full) ||
    code.endsWith('W');

  const isYouth =
    /\b(u23|u21|u20|u19|u18|u17|u16|youth|primavera|academy|juniors|diski challenge|next gen)\b/i.test(
      full
    );

  // ==========================================================================
  // 1. WOMEN'S COMPETITIONS (cleanly separated from men's tier hijacking)
  // ==========================================================================
  if (isWomen) {
    if (isYouth) return 190;
    if (full.includes('friendly')) return 140;
    if (full.includes('champions league') || full.includes('world cup')) return 440;
    if (full.includes('euro') && !full.includes('u17') && !full.includes('u19')) return 420;
    if (
      (stageCountry === 'england' && /\bwsl\b/i.test(full) && !full.includes('wsl 2')) ||
      /\bnwsl\b/i.test(full) ||
      /\bliga f\b/i.test(full) ||
      full.includes('bundesliga women') ||
      full.includes('premiere ligue women') ||
      full.includes('serie a women')
    ) {
      if (!full.includes('2. bundesliga')) return 400;
    }
    if (full.includes("women's fa cup") || full.includes('women’s fa cup')) return 385;
    if (
      full.includes('super league women') ||
      full.includes('superliga women') ||
      full.includes('super lig women') ||
      full.includes('supreme division women') ||
      full.includes('ekstraliga women') ||
      full.includes('swpl 1') ||
      full.includes('a-league women')
    ) {
      return 360;
    }
    if (
      full.includes('wsl 2') ||
      full.includes('2. bundesliga women') ||
      full.includes('serie b women') ||
      full.includes('seconde ligue women') ||
      full.includes('elitettan') ||
      full.includes('primera federacion women') ||
      full.includes('1st national women') ||
      full.includes('b-liga women')
    ) {
      return 300;
    }
    return 240;
  }

  // ==========================================================================
  // 2. YOUTH COMPETITIONS (U23 / U21 / U20 / U19 / U17)
  // ==========================================================================
  if (isYouth) {
    if (full.includes('euro u21') || full.includes('afcon u23') || full.includes('africa cup of nations u23')) {
      return 350;
    }
    if (full.includes('premier league cup') || full.includes('premier league 2') || full.includes('u23')) {
      return 330;
    }
    if (full.includes('u21')) return 310;
    if (full.includes('u20') || full.includes('euro u19')) return 280;
    if (full.includes('u19') || full.includes('u18')) return 255;
    if (full.includes('u17') || full.includes('u16')) return 230;
    return 240;
  }

  // ==========================================================================
  // 3. TOP 5 EUROPEAN LEAGUES & MAJOR UEFA CLUB COMPETITIONS (Senior Men)
  // ==========================================================================
  const isEnglish = stageCountry === '' || stageCountry === 'england' || stageCountry === 'uk';
  if (
    isEnglish &&
    (full.includes('england: premier league') ||
      full.includes('english premier league') ||
      code === 'E0' ||
      code === 'ENGLAND_PREMIER_LEAGUE' ||
      (stageCountry === 'england' && /\bpremier league\b/i.test(full))) &&
    !/\b(npl|isthmian|southern|cup|trophy|2|northern)\b/i.test(full)
  ) {
    return 1000;
  }

  const isEuropeIntl =
    stageCountry === '' || stageCountry === 'europe' || stageCountry === 'international';
  if (
    code === 'UCL' ||
    (isEuropeIntl &&
      full.includes('champions league') &&
      !/\b(caf|afc|concacaf|ofc|futsal)\b/i.test(full))
  ) {
    return 980;
  }

  const isSpanish = stageCountry === '' || stageCountry === 'spain';
  if (
    isSpanish &&
    (full.includes('spain: laliga') ||
      full.includes('spain: la liga') ||
      full.includes('spanish la liga') ||
      code === 'SP1' ||
      (stageCountry === 'spain' && /\b(laliga|la liga|primera division)\b/i.test(full))) &&
    !/\b(laliga2|la liga 2|segunda|rfef|tercera|primera rfef)\b/i.test(full)
  ) {
    return 960;
  }

  const isItalian = stageCountry === '' || stageCountry === 'italy';
  if (
    isItalian &&
    (full.includes('italy: serie a') ||
      full.includes('italian serie a') ||
      code === 'I1' ||
      (stageCountry === 'italy' && /\bserie a\b/i.test(full))) &&
    !/\b(serie b|serie c|serie d|brazil)\b/i.test(full)
  ) {
    return 940;
  }

  const isGerman = stageCountry === '' || stageCountry === 'germany';
  if (
    isGerman &&
    (full.includes('germany: bundesliga') ||
      full.includes('german bundesliga') ||
      code === 'D1' ||
      (stageCountry === 'germany' && /\bbundesliga\b/i.test(full))) &&
    !/\b(2\. bundesliga|3\. liga|austria|regionalliga|oberliga)\b/i.test(full)
  ) {
    return 920;
  }

  const isFrench = stageCountry === '' || stageCountry === 'france';
  if (
    isFrench &&
    (full.includes('france: ligue 1') ||
      full.includes('french ligue 1') ||
      code === 'F1' ||
      (stageCountry === 'france' && /\bligue 1\b/i.test(full))) &&
    !/\b(ligue 2|national)\b/i.test(full)
  ) {
    return 900;
  }

  if (
    code === 'UEL' ||
    (isEuropeIntl && full.includes('europa league') && !full.includes('conference'))
  ) {
    return 880;
  }

  if (
    code === 'UECL' ||
    code === 'ECL' ||
    (isEuropeIntl && full.includes('conference league'))
  ) {
    return 860;
  }

  // ==========================================================================
  // 4. MAJOR SENIOR INTERNATIONAL TOURNAMENTS & NATIONS LEAGUES
  // ==========================================================================
  if (code === 'FIWC' || full.includes('fifa world cup')) {
    return full.includes('qualification') ? 835 : 855;
  }
  if (
    (code === 'EURO' || (isEuropeIntl && /\beuro\b/i.test(full))) &&
    !full.includes('europa') &&
    !full.includes('euroleague')
  ) {
    return full.includes('qualification') ? 825 : 845;
  }
  if (code === 'COPA' || full.includes('copa américa') || full.includes('copa america')) {
    return 835;
  }

  if (full.includes('uefa nations league')) {
    if (full.includes('league a')) return 825;
    if (full.includes('league b')) return 810;
    if (full.includes('league c')) return 795;
    if (full.includes('league d')) return 780;
    return 805;
  }

  if (code === 'UNL' || full.includes('nations league')) {
    if (full.includes('concacaf')) {
      if (full.includes('league a')) return 775;
      if (full.includes('league b')) return 755;
      if (full.includes('league c')) return 735;
      return 760;
    }
    return 785;
  }

  if (code === 'ACN' || full.includes('africa cup of nations') || full.includes('afcon')) {
    return full.includes('qualification') ? 795 : 815;
  }

  if (code === 'CLI' || full.includes('copa libertadores')) return 805;
  if (code === 'CSUD' || full.includes('copa sudamericana')) return 775;
  if (full.includes('gold cup') || full.includes('asian cup')) {
    return full.includes('qualification') ? 745 : 785;
  }
  if (
    full.includes('caf champions league') ||
    full.includes('afc champions league') ||
    full.includes('concacaf champions')
  ) {
    return 755;
  }

  // ==========================================================================
  // 5. MAJOR DOMESTIC CUPS & ENGLISH CHAMPIONSHIP
  // ==========================================================================
  if (
    isEnglish &&
    (code === 'E1' ||
      full.includes('england: championship') ||
      full.includes('english championship') ||
      full.includes('efl championship'))
  ) {
    return 790;
  }
  if (isEnglish && (code === 'FAC' || (/\bfa cup\b/i.test(full) && !full.includes('oman')))) {
    return 800;
  }
  if (isEnglish && (code === 'CGB' || full.includes('efl cup') || full.includes('carabao cup'))) {
    return 785;
  }
  if (isSpanish && (code === 'CDR' || full.includes('copa del rey'))) return 780;
  if (isGerman && (code === 'DFB' || full.includes('dfb-pokal') || full.includes('dfb pokal'))) {
    return 775;
  }
  if (isItalian && (code === 'CIT' || full.includes('coppa italia'))) return 770;
  if (isFrench && (code === 'CDF' || full.includes('coupe de france'))) return 765;

  // ==========================================================================
  // 6. OTHER MAJOR TOP FLIGHTS WORLDWIDE
  // ==========================================================================
  const isDutch = stageCountry === '' || stageCountry === 'netherlands';
  if (
    isDutch &&
    (code === 'N1' ||
      code === 'NL1' ||
      full.includes('netherlands: eredivisie') ||
      full.includes('dutch eredivisie') ||
      (stageCountry === 'netherlands' && full.includes('eredivisie')))
  ) {
    return 760;
  }

  const isPortuguese = stageCountry === '' || stageCountry === 'portugal';
  if (
    isPortuguese &&
    (code === 'P1' ||
      code === 'POR1' ||
      full.includes('portugal: liga portugal') ||
      full.includes('portuguese primeira liga') ||
      (stageCountry === 'portugal' && full.includes('primeira liga'))) &&
    !full.includes('liga portugal 2')
  ) {
    return 755;
  }

  const isBrazilian = stageCountry === '' || stageCountry === 'brazil';
  if (
    isBrazilian &&
    (code === 'BRA' ||
      full.includes('brazil: serie a') ||
      full.includes('campeonato brasileiro série a') ||
      full.includes('campeonato brasileiro serie a')) &&
    !full.includes('serie b')
  ) {
    return 750;
  }

  const isUSA = stageCountry === '' || stageCountry === 'usa';
  if (
    isUSA &&
    (code === 'MLS' ||
      full.includes('usa: mls') ||
      full.includes('major league soccer') ||
      (stageCountry === 'usa' && /\bmls\b/i.test(full)))
  ) {
    return 740;
  }

  const isSaudi = stageCountry === '' || stageCountry === 'saudi arabia';
  if (
    isSaudi &&
    (code === 'SPL' ||
      full.includes('saudi pro league') ||
      full.includes('saudi professional league')) &&
    !full.includes('division 2')
  ) {
    return 735;
  }

  const isTurkish = stageCountry === '' || stageCountry === 'turkey';
  if (
    isTurkish &&
    (code === 'TUR1' ||
      full.includes('turkey: super lig') ||
      full.includes('turkish süper lig') ||
      (stageCountry === 'turkey' && /\bsuper lig\b/i.test(full)))
  ) {
    return 730;
  }

  const isScottish = stageCountry === '' || stageCountry === 'scotland';
  if (
    isScottish &&
    (code === 'SC0' ||
      code === 'SCO1' ||
      full.includes('scotland: premiership') ||
      full.includes('scottish premiership'))
  ) {
    return 725;
  }

  const isBelgian = stageCountry === '' || stageCountry === 'belgium';
  if (
    isBelgian &&
    (code === 'BE1' ||
      full.includes('belgium: jupiler pro league') ||
      full.includes('belgian pro league')) &&
    !full.includes('challenger')
  ) {
    return 720;
  }

  const isArgentine = stageCountry === '' || stageCountry === 'argentina';
  if (
    isArgentine &&
    (code === 'ARG1' ||
      full.includes('argentina: liga profesional') ||
      full.includes('argentine primera división')) &&
    !/\b(nacional|primera b|primera c)\b/i.test(full)
  ) {
    return 715;
  }

  const isMexican = stageCountry === '' || stageCountry === 'mexico';
  if (
    isMexican &&
    (code === 'MEX1' || full.includes('mexico: liga mx')) &&
    !/\b(expansion|liga premier)\b/i.test(full)
  ) {
    return 710;
  }

  const isJapanese = stageCountry === '' || stageCountry === 'japan';
  if (isJapanese && (code === 'JPL' || full.includes('japan: j1 league'))) {
    return 705;
  }

  // ==========================================================================
  // 7. ENGLISH TIER 3-4, TOP-5 SECOND TIERS & FRIENDLY INTERNATIONALS
  // ==========================================================================
  if (code === 'E2' || full.includes('efl league one') || full.includes('england: league one')) {
    return 695;
  }
  if (code === 'D2' || full.includes('germany: 2. bundesliga') || full.includes('2. bundesliga')) {
    return 690;
  }
  if (code === 'SP2' || full.includes('spain: laliga2') || full.includes('spain: la liga 2')) {
    return 685;
  }
  if (code === 'I2' || full.includes('italy: serie b')) return 680;
  if (code === 'F2' || full.includes('france: ligue 2')) return 675;
  if (code === 'E3' || full.includes('efl league two') || full.includes('england: league two')) {
    return 670;
  }
  if (full.includes('friendly international')) return 665;

  // ==========================================================================
  // 8. OTHER RECOGNIZED NATIONAL TOP FLIGHTS & STRONG 2ND DIVISIONS
  // ==========================================================================
  if (
    full.includes('austria: bundesliga') ||
    full.includes('bundesliga (austria)') ||
    full.includes('switzerland: super league') ||
    full.includes('denmark: superliga') ||
    full.includes('norway: eliteserien') ||
    full.includes('sweden: allsvenskan') ||
    full.includes('poland: ekstraklasa') ||
    full.includes('greece: super league') && !full.includes('super league 2') ||
    full.includes('czech republic: 1. liga') ||
    full.includes('croatia: hnl') ||
    full.includes('serbia: super liga') ||
    full.includes('romania: superliga') ||
    full.includes('premier league (ukraine)') ||
    full.includes('ukraine: premier league') && !full.includes('premier league 2')
  ) {
    return 650;
  }

  if (
    full.includes('colombia: primera a') ||
    full.includes('categoría primera a') ||
    full.includes('chile: primera') ||
    full.includes('uruguay: liga auf') ||
    full.includes('uruguay: primera') ||
    full.includes('a-league men') ||
    full.includes('k league 1') ||
    full.includes('chinese super league')
  ) {
    return 635;
  }

  if (
    full.includes('brazil: serie b') ||
    full.includes('campeonato brasileiro série b') ||
    full.includes('eerste divisie') ||
    full.includes('liga portugal 2') ||
    full.includes('scottish championship') ||
    full.includes('england: national league') ||
    code === 'EC' ||
    /\bnational league\b/i.test(name) && !full.includes('ireland') ||
    full.includes('argentina: primera nacional')
  ) {
    return 615;
  }

  if (
    full.includes('france: national 1') ||
    full.includes('germany: 3. liga') ||
    code === 'D3' ||
    full.includes('italy: serie c') ||
    full.includes('spain: primera rfef') ||
    full.includes('challenger pro league') ||
    full.includes('turkish 1. lig') ||
    full.includes('germany: 2. bundesliga') ||
    full.includes('obos-ligaen') ||
    full.includes('superettan')
  ) {
    return 575;
  }

  // Secondary/Top-flight national leagues across Europe, Americas, Asia, Africa
  if (
    full.includes('nifl premiership') ||
    full.includes('virsliga') ||
    full.includes('prva crnogorska liga') ||
    full.includes('uzbekistan: super league') ||
    full.includes('austria: 2. liga') ||
    full.includes('czech republic: chnl') ||
    full.includes('russia: fnl') ||
    full.includes('scottish league one') ||
    full.includes('serbia: mozzart bet prva liga') ||
    full.includes('slovakia: 2. liga') ||
    full.includes('slovenia: 2. snl') ||
    full.includes('switzerland: promotion league') ||
    full.includes('greece: super league 2') ||
    full.includes('ukraine: persha liga') ||
    full.includes('croatia: croatian cup') ||
    full.includes('slovakia: slovak cup') ||
    full.includes('wales: faw welsh cup') ||
    full.includes('paraguay: copa paraguay') ||
    full.includes('united arab emirates: league cup')
  ) {
    return 530;
  }

  // Other national 1st-division leagues (Africa, Asia, Central America, etc.)
  if (
    /\b(premier league|ligue 1|premiere division|super league|liga nacional|npfl|elite one|lfa first division|primus league|mocambola|super ligue|australian championship|abfa premier league|lpf)\b/i.test(
      full
    ) &&
    !/\b(npl|isthmian|southern|copa|regional|3\.|4\.|oberliga|tercera|segunda)\b/i.test(full)
  ) {
    return 490;
  }

  // National 2nd divisions & domestic regional cups
  if (
    /\b(division 2|segunda division|liga 2|ligue 2|botola 2|vtora liga|pershaya liga|scottish league two|nifl championship|druga liga|prva liga|division one|national division 1|2nd division|fa trophy|copa)\b/i.test(
      full
    )
  ) {
    return 450;
  }

  // Club friendlies & regional exhibitions
  if (full.includes('club friendly') || full.includes('kings cup')) {
    return 290;
  }

  // 3rd / 4th / 5th tier regional & amateur divisions
  if (
    /\b(regionalliga|oberliga|segunda rfef|tercera rfef|serie d|gamma ethniki|liga 3|iii liga|3\. liga|3\. cfl|3\. msfl|3\. snl|4\. liga|nb iii|srpska liga|tweede divisie|derde divisie|npl premier|southern league|isthmian league|highland league|lowland league|second amateur|third league|druha liga|2\. lig|1\.liga classic|cymru|burgenland|niederosterreich|tirol|vorarlberg|wien|kp\b|prebor)\b/i.test(
      full
    )
  ) {
    return 220;
  }

  return 320;
}

/**
 * Calculates legacy priority ranking for football competitions.
 * Lower number = higher display priority.
 */
export function getLeaguePriority(
  leagueCode?: string,
  leagueName?: string,
  stage?: string
): number {
  return 10000 - getLeaguePopularityScore(leagueCode, leagueName, stage);
}

/**
 * Returns a numeric timestamp (ms) representing combined match date and kickoff time
 * for deterministic sorting. Scheduled HH:mm kickoffs take precedence over status text
 * like FT/POSTPONED/CANCELLED within the same date.
 */
export function getFixtureSortableDateTime(f: Pick<Fixture, 'matchDate' | 'kickOffTime' | 'timestamp' | 'status'>): number {
  if (f.timestamp && f.timestamp > 0) {
    return f.timestamp > 1e11 ? f.timestamp : f.timestamp * 1000;
  }

  const normDate = normalizeDateStr(f.matchDate || '');
  const parts = normDate.split('-').map((n) => parseInt(n, 10));
  const baseDayMs =
    parts.length === 3 && !parts.some(isNaN)
      ? Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
      : 0;

  const normTime = normalizeTimeStr(f.kickOffTime || '');
  const upper = normTime.toUpperCase();

  if (/^\d{2}:\d{2}$/.test(normTime)) {
    const [hh, mm] = normTime.split(':').map((n) => parseInt(n, 10));
    return baseDayMs + (hh * 60 + mm) * 60_000 + 10_000;
  }

  if (f.status === 'LIVE' || upper === 'LIVE' || upper === 'HT' || upper.endsWith("'")) {
    return baseDayMs + 24 * 3600_000;
  }
  if (upper === 'TBD') {
    return baseDayMs + 5_000;
  }
  if (upper === 'FT' || upper === 'AET' || upper === 'AP' || upper === 'FINISHED') {
    return baseDayMs + 2_000;
  }
  if (upper === 'POSTPONED' || upper === 'PST' || upper === 'CANCELLED' || upper === 'CAN') {
    return baseDayMs + 1_000;
  }

  return baseDayMs + 3_000;
}

/**
 * Comparator sorting fixtures in descending order of league popularity
 * combined with match date and kickoff time descending.
 */
export function compareFixturesByPopularityAndDateTimeDesc(a: Fixture, b: Fixture): number {
  const popA = getLeaguePopularityScore(a.league, a.leagueName, a.stage);
  const popB = getLeaguePopularityScore(b.league, b.leagueName, b.stage);
  if (popA !== popB) return popB - popA;

  const dtA = getFixtureSortableDateTime(a);
  const dtB = getFixtureSortableDateTime(b);
  if (dtA !== dtB) return dtB - dtA;

  const nameA = (a.leagueName || a.league || '').toLowerCase();
  const nameB = (b.leagueName || b.league || '').toLowerCase();
  if (nameA !== nameB) return nameA.localeCompare(nameB);

  return (a.homeTeam || '').localeCompare(b.homeTeam || '');
}

/**
 * Sorts fixtures in descending order by league popularity combined with match date and time.
 */
export function sortFixturesByMajorLeaguePriority(fixtures: Fixture[]): Fixture[] {
  return fixtures.slice().sort(compareFixturesByPopularityAndDateTimeDesc);
}
