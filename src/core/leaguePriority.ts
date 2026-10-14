import { Fixture } from './types.js';

/**
 * Calculates priority ranking for football competitions to display major popular leagues first.
 * Lower number = higher display priority.
 */
export function getLeaguePriority(leagueCode?: string, leagueName?: string, stage?: string): number {
  const code = (leagueCode || '').toUpperCase().trim();
  const name = (leagueName || '').toLowerCase().trim();
  const stg = (stage || '').toLowerCase().trim();
  const full = `${stg} | ${name} | ${code}`.toLowerCase();
  const stageCountry = stg.includes(':') ? stg.split(':')[0].trim().toLowerCase() : '';

  // Tier 1: English Premier League
  const isEnglishCountry = stageCountry === '' || stageCountry === 'england' || stageCountry === 'uk';
  if (
    isEnglishCountry &&
    (full.includes('england: premier league') || full.includes('english premier league') || (code === 'E0' && !stg.includes(':')) || (stageCountry === 'england' && full.includes('premier league')))
  ) {
    if (!full.includes('women') && !full.includes('u21') && !full.includes('u18') && !full.includes('premier league 2') && !full.includes('cup')) {
      return 1;
    }
  }

  // Tier 2: UEFA Champions League
  const isEuropeIntl = stageCountry === '' || stageCountry === 'europe' || stageCountry === 'international';
  if (
    code === 'UCL' ||
    (isEuropeIntl && full.includes('champions league') && (full.includes('uefa') || full.includes('europe') || (!full.includes('women') && !full.includes('caf') && !full.includes('afc') && !full.includes('concacaf'))))
  ) {
    if (!full.includes('women') && !full.includes('youth') && !full.includes('futsal')) {
      return 2;
    }
  }

  // Tier 3: Spanish La Liga (Primera División)
  const isSpanishCountry = stageCountry === '' || stageCountry === 'spain';
  if (
    isSpanishCountry &&
    (full.includes('spain: laliga') || full.includes('spanish la liga') || (full.includes('spain: primera') && !full.includes('rfef')) || (code === 'SP1' && !stg.includes(':')) || (stageCountry === 'spain' && (full.includes('laliga') || full.includes('la liga'))))
  ) {
    if (!full.includes('laliga2') && !full.includes('la liga 2') && !full.includes('segunda') && !full.includes('rfef') && !full.includes('women')) {
      return 3;
    }
  }

  // Tier 4: Italian Serie A
  const isItalianCountry = stageCountry === '' || stageCountry === 'italy';
  if (
    isItalianCountry &&
    (full.includes('italy: serie a') || full.includes('italian serie a') || (code === 'I1' && !stg.includes(':')) || (stageCountry === 'italy' && full.includes('serie a')))
  ) {
    if (!full.includes('serie b') && !full.includes('serie c') && !full.includes('women') && !full.includes('primavera') && !full.includes('brazil')) {
      return 4;
    }
  }

  // Tier 5: German Bundesliga
  const isGermanCountry = stageCountry === '' || stageCountry === 'germany';
  if (
    isGermanCountry &&
    (full.includes('germany: bundesliga') || full.includes('german bundesliga') || (code === 'D1' && !stg.includes(':')) || (stageCountry === 'germany' && full.includes('bundesliga')))
  ) {
    if (!full.includes('2. bundesliga') && !full.includes('3. liga') && !full.includes('women') && !full.includes('youth') && !full.includes('austria')) {
      return 5;
    }
  }

  // Tier 6: French Ligue 1
  const isFrenchCountry = stageCountry === '' || stageCountry === 'france';
  if (
    isFrenchCountry &&
    (full.includes('france: ligue 1') || full.includes('french ligue 1') || (code === 'F1' && !stg.includes(':')) || (stageCountry === 'france' && full.includes('ligue 1')))
  ) {
    if (!full.includes('ligue 2') && !full.includes('women') && !full.includes('algeria') && !full.includes('senegal')) {
      return 6;
    }
  }

  // Tier 7: UEFA Europa League
  if (code === 'UEL' || (isEuropeIntl && full.includes('europa league') && !full.includes('conference') && !full.includes('women'))) {
    return 7;
  }

  // Tier 8: UEFA Conference League
  if (code === 'UECL' || code === 'ECL' || (isEuropeIntl && full.includes('conference league') && !full.includes('women'))) {
    return 8;
  }

  // Tier 9: English Championship
  if (isEnglishCountry && (full.includes('england: championship') || full.includes('english championship') || (code === 'E1' && !stg.includes(':')) || (stageCountry === 'england' && full.includes('championship')))) {
    if (!full.includes('women')) return 9;
  }

  // Tier 10-15: Major Domestic Cups
  if (isEnglishCountry && (code === 'FAC' || full.includes('fa cup'))) return 10;
  if (isEnglishCountry && (code === 'CGB' || full.includes('efl cup') || full.includes('carabao cup'))) return 11;
  if (isSpanishCountry && (code === 'CDR' || full.includes('copa del rey'))) return 12;
  if (isGermanCountry && (code === 'DFB' || full.includes('dfb-pokal') || full.includes('dfb pokal'))) return 13;
  if (isItalianCountry && (code === 'CIT' || full.includes('coppa italia'))) return 14;
  if (isFrenchCountry && (code === 'CDF' || full.includes('coupe de france'))) return 15;

  // Tier 16-26: Other Major Top Flights Worldwide
  const isDutch = stageCountry === '' || stageCountry === 'netherlands';
  if (isDutch && (code === 'N1' || code === 'NL1' || full.includes('netherlands: eredivisie') || full.includes('dutch eredivisie') || (stageCountry === 'netherlands' && full.includes('eredivisie')))) {
    if (!full.includes('women') && !full.includes('u21')) return 16;
  }
  const isPortuguese = stageCountry === '' || stageCountry === 'portugal';
  if (isPortuguese && (code === 'P1' || code === 'POR1' || full.includes('portugal: liga portugal') || full.includes('portuguese primeira liga') || (stageCountry === 'portugal' && full.includes('primeira liga')))) {
    if (!full.includes('liga portugal 2') && !full.includes('women')) return 17;
  }
  const isBrazilian = stageCountry === '' || stageCountry === 'brazil';
  if (isBrazilian && (code === 'BRA' || full.includes('brazil: serie a') || full.includes('brazilian série a') || (stageCountry === 'brazil' && (full.includes('serie a') || full.includes('brasileir'))))) {
    if (!full.includes('serie b') && !full.includes('women')) return 18;
  }
  const isUSA = stageCountry === '' || stageCountry === 'usa';
  if (isUSA && (code === 'MLS' || full.includes('usa: mls') || full.includes('major league soccer') || (stageCountry === 'usa' && full.includes('mls')))) return 19;
  const isSaudi = stageCountry === '' || stageCountry === 'saudi arabia';
  if (isSaudi && (code === 'SPL' || full.includes('saudi arabia: saudi professional league') || full.includes('saudi pro league') || (stageCountry === 'saudi arabia' && full.includes('pro league')))) return 20;
  const isTurkish = stageCountry === '' || stageCountry === 'turkey';
  if (isTurkish && (code === 'TUR1' || full.includes('turkey: super lig') || full.includes('turkish süper lig') || (stageCountry === 'turkey' && full.includes('super lig')))) return 21;
  const isScottish = stageCountry === '' || stageCountry === 'scotland';
  if (isScottish && (code === 'SC0' || full.includes('scotland: premiership') || full.includes('scottish premiership') || (stageCountry === 'scotland' && full.includes('premiership')))) return 22;
  const isBelgian = stageCountry === '' || stageCountry === 'belgium';
  if (isBelgian && ((code === 'BE1' && full.includes('belgium')) || full.includes('belgium: jupiler pro league') || (stageCountry === 'belgium' && full.includes('pro league')))) {
    if (!full.includes('challenger') && !full.includes('u21')) return 23;
  }
  const isArgentine = stageCountry === '' || stageCountry === 'argentina';
  if (isArgentine && ((code === 'ARG1' && full.includes('argentina')) || full.includes('argentina: liga profesional') || (stageCountry === 'argentina' && full.includes('liga profesional')))) {
    if (!full.includes('nacional') && !full.includes('primera b') && !full.includes('primera c') && !full.includes('torneo federal')) return 24;
  }
  const isMexican = stageCountry === '' || stageCountry === 'mexico';
  if (isMexican && ((code === 'MEX1' && full.includes('mexico')) || full.includes('mexico: liga mx') || (stageCountry === 'mexico' && full.includes('liga mx')))) {
    if (!full.includes('expansion') && !full.includes('women') && !full.includes('u23')) return 25;
  }
  const isJapanese = stageCountry === '' || stageCountry === 'japan';
  if (isJapanese && (code === 'JPL' || full.includes('japan: j1 league') || (stageCountry === 'japan' && full.includes('j1 league')))) return 26;

  // Tier 27-32: Major International Tournaments
  if (code === 'FIWC' || (full.includes('world cup') && !full.includes('women') && !full.includes('u20') && !full.includes('u17'))) return 27;
  if (code === 'EURO' || (full.includes('euro') && full.includes('qualification') && !full.includes('women') && !full.includes('u21'))) return 28;
  if (code === 'COPA' || full.includes('copa américa') || full.includes('copa america')) return 29;
  if (code === 'ACN' || full.includes('africa cup of nations') || full.includes('afcon')) return 30;
  if (code === 'UNL' || (full.includes('nations league') && !full.includes('women'))) return 31;
  if (code === 'CLI' || full.includes('copa libertadores')) return 32;

  // Tier 33-38: English Tier 2-4 & Top-5 Tier 2
  if (code === 'E2' || full.includes('england: league one')) return 33;
  if (code === 'E3' || full.includes('england: league two')) return 34;
  if (code === 'D2' || full.includes('germany: 2. bundesliga')) return 35;
  if (code === 'SP2' || full.includes('spain: laliga2') || full.includes('spain: la liga 2')) return 36;
  if (code === 'I2' || full.includes('italy: serie b')) return 37;
  if (code === 'F2' || full.includes('france: ligue 2')) return 38;

  return 99;
}

/**
 * Sorts fixtures prioritizing major popular leagues, followed by date and kickoff time.
 */
export function sortFixturesByMajorLeaguePriority(fixtures: Fixture[]): Fixture[] {
  return fixtures.slice().sort((a, b) => {
    const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
    const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.matchDate !== b.matchDate) return a.matchDate.localeCompare(b.matchDate);
    return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
  });
}
