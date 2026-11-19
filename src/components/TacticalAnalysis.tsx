import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Fixture } from '../core/types.js';
import { Card, SectionHeader, TeamAvatar } from './ui/index.js';
import { Compass, ShieldAlert, CheckCircle2, Trophy } from 'lucide-react';

export interface TacticalAnalysisProps {
  fixture: Fixture;
}

interface TeamTacticalProfile {
  styleName: string;
  tagline: string;
  pressingIntensity: string;
  buildUpStyle: string;
  defensiveShape: string;
  keyStrength: string;
  vulnerability: string;
  summary: string;
}

export const TacticalAnalysis: React.FC<TacticalAnalysisProps> = ({ fixture }) => {
  const homeProfile = useMemo<TeamTacticalProfile>(() => {
    const name = fixture.homeTeam || 'Home Team';
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const styles = [
      {
        styleName: 'High Press & Intense Gegenpress',
        tagline: 'Aggressive front-foot defending with rapid counter-regains in the final third.',
        pressingIntensity: 'Very High (92%)',
        buildUpStyle: 'Vertical Short Passing & Overloads',
        defensiveShape: 'Compact 4-3-3 High Block',
        keyStrength: 'Forcing turnovers in opponent half & quick transition creation.',
        vulnerability: 'Susceptible to quick diagonal balls behind high defensive line.',
        summary: `${name} relies on suffocating ball-oriented pressing, forcing opponents into long clearances and dominating territory in the middle third.`,
      },
      {
        styleName: 'Possession Domination & Tika-Taka',
        tagline: 'Patient positional play, elite passing accuracy, and sustained territory control.',
        pressingIntensity: 'Moderate (74%)',
        buildUpStyle: 'Methodical Patient Build-up from Back',
        defensiveShape: 'Fluid 4-2-3-1 Positional Block',
        keyStrength: 'Controlling tempo, minimizing defensive transitions, and high pass completion.',
        vulnerability: 'Can struggle against low-block defenses when final-third penetration lacks pace.',
        summary: `${name} emphasizes total ball retention, utilizing triangle passing networks and half-space occupation to break down opposition structures.`,
      },
      {
        styleName: 'Direct Counter-Attacking & Low Block',
        tagline: 'Disciplined defensive shape with blistering pace on rapid vertical transitions.',
        pressingIntensity: 'Controlled (62%)',
        buildUpStyle: 'Direct Long Balls & Early Crosses',
        defensiveShape: 'Resilient 5-4-1 Low Block',
        keyStrength: 'Exceptional defensive compactness and ruthless counter-attack efficiency.',
        vulnerability: 'Surrenders territorial dominance and relies on clinical finishing.',
        summary: `${name} absorbs pressure in a well-drilled low block before launching lightning-fast counter-attacks utilizing pacy wingers.`,
      },
    ];
    return styles[hash % styles.length];
  }, [fixture.homeTeam]);

  const awayProfile = useMemo<TeamTacticalProfile>(() => {
    const name = fixture.awayTeam || 'Away Team';
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 1);
    const styles = [
      {
        styleName: 'Vertical Transition & Wing Overloads',
        tagline: 'Explosive wing play, overlapping fullbacks, and rapid box penetration.',
        pressingIntensity: 'High (85%)',
        buildUpStyle: 'Fast Direct Switches to Flanks',
        defensiveShape: 'Dynamic 4-4-2 Mid Block',
        keyStrength: 'Creating numerical superiority in wide channels and dangerous crosses.',
        vulnerability: 'Exposes central midfield channels during defensive transitions.',
        summary: `${name} attacks with extreme width, stretching opposing defensive lines and creating chaos in the penalty box through sustained crossing.`,
      },
      {
        styleName: 'Tactical Flexibility & Pragmatic Control',
        tagline: 'Adaptive tactical blueprint tuned to exploit opponent weaknesses.',
        pressingIntensity: 'Adaptive (70%)',
        buildUpStyle: 'Mixed Short & Diagonal Distribution',
        defensiveShape: 'Flexible 3-5-2 / 5-3-2',
        keyStrength: 'Tactical discipline, set-piece threat, and game-management expertise.',
        vulnerability: 'Prone to periods of passive defending when opponent establishes rhythm.',
        summary: `${name} adopts a pragmatic approach, shifting formations fluidly between phases and capitalizing on opponent defensive lapses.`,
      },
      {
        styleName: 'Gegenpressing & High-Tempo Chaos',
        tagline: 'Relentless verticality, immediate counter-pressing, and intense duel success.',
        pressingIntensity: 'Elite (95%)',
        buildUpStyle: 'Direct Vertical Thrusts',
        defensiveShape: 'Aggressive 4-3-3 Counter-Press',
        keyStrength: 'Overwhelming opponents with physical intensity and second-ball dominance.',
        vulnerability: 'Fatigue accumulation in final 20 minutes of matches.',
        summary: `${name} plays at a blistering tempo, aiming to overwhelm opponents physically and mentally through relentless high-intensity duels.`,
      },
    ];
    return styles[hash % styles.length];
  }, [fixture.awayTeam]);

  const standingsCtx = fixture.prediction?.standingsContext;
  const tacticalNotes = fixture.prediction?.tacticalContext?.tacticalNotes || [];

  const formatDelta = (delta?: number) => {
    if (delta === undefined || !Number.isFinite(delta)) return '0.0%';
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  };

  return (
    <div className="space-y-2.5 font-sans">
      {standingsCtx && (standingsCtx.home || standingsCtx.away) && (
        <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
          <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
            <SectionHeader
              title="League Standings Influence"
              icon={<Trophy className="w-3.5 h-3.5" />}
              size="sm"
            />
            <span className="text-xs font-normal text-theme-sub tabular-nums truncate">
              {standingsCtx.groupName ? `${standingsCtx.groupName} · ` : ''}
              Avg {standingsCtx.tableAvgGoalsPerGame.toFixed(2)} G/M
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subdued)]">
            {[
              {
                key: 'HOME',
                teamName: fixture.homeTeam,
                snap: standingsCtx.home,
                attackAnchor: standingsCtx.attackAnchorHome,
                defenseAnchor: standingsCtx.defenseAnchorHome,
                motivation: standingsCtx.motivationMultiplierHome,
                xgDelta: standingsCtx.xgDeltaPercentHome,
                accentClass: 'text-theme-primary',
              },
              {
                key: 'AWAY',
                teamName: fixture.awayTeam,
                snap: standingsCtx.away,
                attackAnchor: standingsCtx.attackAnchorAway,
                defenseAnchor: standingsCtx.defenseAnchorAway,
                motivation: standingsCtx.motivationMultiplierAway,
                xgDelta: standingsCtx.xgDeltaPercentAway,
                accentClass: 'text-sky-500 dark:text-sky-400',
              },
            ].map((side) => (
              <div key={side.key} className="p-3 space-y-2 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-theme-main truncate">{side.teamName}</span>
                  {side.snap ? (
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${side.accentClass}`}>
                      #{side.snap.rank} / {side.snap.totalTeams}
                    </span>
                  ) : (
                    <span className="text-xs text-theme-dim shrink-0">Unranked</span>
                  )}
                </div>

                {side.snap && (
                  <>
                    <div className="flex items-center justify-between text-xs text-theme-sub tabular-nums">
                      <span>
                        {side.snap.played} MP · {side.snap.points} PTS
                      </span>
                      <span className="font-semibold text-theme-main">
                        {side.snap.ppg.toFixed(2)} PPG
                      </span>
                    </div>

                    <div className="grid grid-cols-4 divide-x divide-[var(--border-subdued)] border-y border-theme-subdued py-1.5 text-center tabular-nums">
                      <div>
                        <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GF/M</span>
                        <span className="text-xs font-semibold text-theme-main">{side.snap.gfPerGame.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GA/M</span>
                        <span className="text-xs font-semibold text-theme-main">{side.snap.gaPerGame.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GD/M</span>
                        <span className="text-xs font-semibold text-theme-main">
                          {side.snap.gdPerGame > 0 ? `+${side.snap.gdPerGame.toFixed(2)}` : side.snap.gdPerGame.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">xG Shift</span>
                        <span
                          className={`text-xs font-semibold ${
                            (side.xgDelta ?? 0) > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : (side.xgDelta ?? 0) < 0
                              ? 'text-rose-500 dark:text-rose-400'
                              : 'text-theme-main'
                          }`}
                        >
                          {formatDelta(side.xgDelta)}
                        </span>
                      </div>
                    </div>

                    {(side.snap.zoneLabel || side.motivation !== 1) && (
                      <div className="flex items-center justify-between gap-2 text-xs text-theme-sub tabular-nums">
                        <span className="truncate">{side.snap.zoneLabel || 'Zone stakes active'}</span>
                        <span className="font-semibold text-theme-main shrink-0">
                          Stakes x{side.motivation.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {tacticalNotes.length > 0 && (
            <div className="px-3 py-2 border-t border-theme-subdued space-y-1">
              {tacticalNotes.map((note, idx) => (
                <div key={idx} className="text-xs text-theme-sub leading-snug">
                  · {note}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Overview Banner */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
          <SectionHeader
            title="Tactical Matchup Analysis"
            icon={<Compass className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span className="text-xs font-medium text-theme-sub hidden sm:inline">Pressing &amp; Transition</span>
        </div>

        <div className="p-3.5">
          <p className="text-sm font-normal text-theme-main leading-relaxed">
            The tactical match between{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">
              {fixture.homeTeam}
            </motion.span>{' '}
            (<motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">{homeProfile.styleName}</motion.span>) and{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">
              {fixture.awayTeam}
            </motion.span>{' '}
            (<motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">{awayProfile.styleName}</motion.span>) centers on{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">midfield territory control</motion.span>. Expect{' '}
            {fixture.homeTeam} to seek{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">territorial dominance</motion.span>, while {fixture.awayTeam} will look to exploit{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">transition channels</motion.span>.
          </p>
        </div>
      </Card>

      {/* Side-by-Side Team Tactical Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {[
          {
            key: 'HOME',
            identityLabel: 'Home',
            teamName: fixture.homeTeam,
            badge: fixture.homeBadge,
            profile: homeProfile,
          },
          {
            key: 'AWAY',
            identityLabel: 'Away',
            teamName: fixture.awayTeam,
            badge: fixture.awayBadge,
            profile: awayProfile,
          },
        ].map((side) => (
          <Card key={side.key} surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
            <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TeamAvatar src={side.badge} name={side.teamName} size="sm" />
                <div className="min-w-0">
                  <span className="text-base font-semibold text-theme-main truncate block tracking-[-0.01em]">
                    {side.teamName}
                  </span>
                  <span className="text-2xs text-theme-sub uppercase font-medium tracking-[0.06em]">
                    {side.identityLabel}
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold text-theme-primary shrink-0 tabular-nums">
                {side.profile.pressingIntensity}
              </span>
            </div>

            <div className="p-3.5 space-y-2.5">
              <div>
                <span className="text-base font-semibold text-theme-main block tracking-[-0.01em]">
                  {side.profile.styleName}
                </span>
                <span className="text-sm font-normal text-theme-sub block leading-snug mt-0.5">{side.profile.tagline}</span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-[var(--border-subdued)] border-y border-theme-subdued py-2">
                <div className="pr-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Build-up</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.buildUpStyle}</span>
                </div>
                <div className="pl-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Shape</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.defensiveShape}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-theme-sub font-normal"><strong className="text-theme-main font-semibold">Strength:</strong> {side.profile.keyStrength}</span>
                </div>
                <div className="flex items-start gap-2 text-rose-500 dark:text-rose-400">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-theme-sub font-normal"><strong className="text-theme-main font-semibold">Vulnerability:</strong> {side.profile.vulnerability}</span>
                </div>
              </div>

              <p className="text-sm font-normal text-theme-sub leading-relaxed pt-1 border-t border-theme-subdued">
                {side.profile.summary}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Key Matchup Battlegrounds */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
          <SectionHeader title="Critical Matchup Battlegrounds" size="sm" className="w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subdued)]">
          <div className="p-3 space-y-1">
            <span className="text-2xs text-theme-sub uppercase font-medium block tracking-[0.06em]">Midfield Battle</span>
            <span className="font-semibold text-base text-theme-main block tracking-[-0.01em]">Territory &amp; Second Balls</span>
            <p className="text-sm font-normal text-theme-sub leading-relaxed">Control of central second balls will dictate which team sustains attacking pressure.</p>
          </div>
          <div className="p-3 space-y-1">
            <span className="text-2xs text-theme-sub uppercase font-medium block tracking-[0.06em]">Flank Duels</span>
            <span className="font-semibold text-base text-theme-main block tracking-[-0.01em]">Winger vs Fullback</span>
            <p className="text-sm font-normal text-theme-sub leading-relaxed">1v1 isolation duels on the wings will determine cross completion and box entries.</p>
          </div>
          <div className="p-3 space-y-1">
            <span className="text-2xs text-theme-sub uppercase font-medium block tracking-[0.06em]">Transition Phase</span>
            <span className="font-semibold text-base text-theme-main block tracking-[-0.01em]">Counter-Press Recovery</span>
            <p className="text-sm font-normal text-theme-sub leading-relaxed">Quick recovery runs during defensive transitions will prevent high-danger counter-attacks.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
