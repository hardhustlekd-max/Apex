import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Fixture } from '../core/types.js';
import { Card, SectionHeader, TeamAvatar } from './ui/index.js';
import { Compass, Zap, ShieldAlert, Swords, TrendingUp, Layers, CheckCircle2 } from 'lucide-react';

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

  const tacticalBattleSummary = useMemo(() => {
    return `The tactical chess match between ${fixture.homeTeam} (${homeProfile.styleName}) and ${fixture.awayTeam} (${awayProfile.styleName}) centers on midfield territory control. Expect ${fixture.homeTeam} to seek territorial dominance, while ${fixture.awayTeam} will look to exploit transition channels.`;
  }, [fixture.homeTeam, fixture.awayTeam, homeProfile.styleName, awayProfile.styleName]);

  return (
    <div className="space-y-4">
      {/* Overview Banner with Framer Motion hover pulsing keywords */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
      >
        <Card surface="elevated" padding="md" radius="2xl" className="space-y-3 cursor-pointer group">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-theme-primary-subtle text-theme-primary">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <SectionHeader title="Tactical Style & Matchup Analysis" size="sm" />
              <p className="text-[11px] text-theme-sub font-mono">
                AI-driven tactical blueprint derived from tactical structures, pressing metrics, and recent performances
              </p>
            </div>
          </div>
          <p className="text-xs text-theme-main font-sans leading-relaxed p-3 rounded-xl bg-theme-card border border-theme">
            The tactical chess match between{' '}
            <motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-bold underline decoration-dotted">
              {fixture.homeTeam}
            </motion.span>{' '}
            (<motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">{homeProfile.styleName}</motion.span>) and{' '}
            <motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-bold underline decoration-dotted">
              {fixture.awayTeam}
            </motion.span>{' '}
            (<motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">{awayProfile.styleName}</motion.span>) centers on{' '}
            <motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">midfield territory control</motion.span>. Expect{' '}
            {fixture.homeTeam} to seek{' '}
            <motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">territorial dominance</motion.span>, while {fixture.awayTeam} will look to exploit{' '}
            <motion.span whileHover={{ scale: 1.08, color: 'var(--color-primary)' }} className="font-semibold underline decoration-dotted">transition channels</motion.span>.
          </p>
        </Card>
      </motion.div>

      {/* Side-by-Side Team Tactical Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Home Team Profile */}
        <Card surface="elevated" padding="md" radius="2xl" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-theme">
            <div className="flex items-center gap-2">
              <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="sm" />
              <div>
                <span className="text-[10px] text-theme-sub font-mono uppercase font-bold block">Home Tactical Identity</span>
                <span className="text-sm font-extrabold text-theme-main">{fixture.homeTeam}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-theme-primary-subtle text-theme-primary">
              {homeProfile.pressingIntensity}
            </span>
          </div>

          <div className="space-y-2.5">
            <div>
              <motion.span whileHover={{ scale: 1.03, color: 'var(--color-primary)' }} className="text-xs font-black text-theme-main block cursor-default">
                {homeProfile.styleName}
              </motion.span>
              <span className="text-[11px] text-theme-sub block leading-snug">{homeProfile.tagline}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                <span className="text-[10px] text-theme-sub block font-mono uppercase">Build-up</span>
                <span className="text-xs font-bold text-theme-main">{homeProfile.buildUpStyle}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                <span className="text-[10px] text-theme-sub block font-mono uppercase">Defensive Shape</span>
                <span className="text-xs font-bold text-theme-main">{homeProfile.defensiveShape}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><strong className="text-theme-main">Strength:</strong> {homeProfile.keyStrength}</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><strong className="text-theme-main">Vulnerability:</strong> {homeProfile.vulnerability}</span>
              </div>
            </div>

            <motion.p whileHover={{ scale: 1.01 }} className="text-[11px] text-theme-sub font-mono leading-relaxed pt-1 cursor-default">
              {homeProfile.summary}
            </motion.p>
          </div>
        </Card>

        {/* Away Team Profile */}
        <Card surface="elevated" padding="md" radius="2xl" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-theme">
            <div className="flex items-center gap-2">
              <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="sm" />
              <div>
                <span className="text-[10px] text-theme-sub font-mono uppercase font-bold block">Away Tactical Identity</span>
                <span className="text-sm font-extrabold text-theme-main">{fixture.awayTeam}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-theme-primary-subtle text-theme-primary">
              {awayProfile.pressingIntensity}
            </span>
          </div>

          <div className="space-y-2.5">
            <div>
              <motion.span whileHover={{ scale: 1.03, color: 'var(--color-primary)' }} className="text-xs font-black text-theme-main block cursor-default">
                {awayProfile.styleName}
              </motion.span>
              <span className="text-[11px] text-theme-sub block leading-snug">{awayProfile.tagline}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                <span className="text-[10px] text-theme-sub block font-mono uppercase">Build-up</span>
                <span className="text-xs font-bold text-theme-main">{awayProfile.buildUpStyle}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                <span className="text-[10px] text-theme-sub block font-mono uppercase">Defensive Shape</span>
                <span className="text-xs font-bold text-theme-main">{awayProfile.defensiveShape}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><strong className="text-theme-main">Strength:</strong> {awayProfile.keyStrength}</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><strong className="text-theme-main">Vulnerability:</strong> {awayProfile.vulnerability}</span>
              </div>
            </div>

            <motion.p whileHover={{ scale: 1.01 }} className="text-[11px] text-theme-sub font-mono leading-relaxed pt-1 cursor-default">
              {awayProfile.summary}
            </motion.p>
          </div>
        </Card>
      </div>

      {/* Key Matchup Battlegrounds */}
      <Card surface="elevated" padding="md" radius="2xl" className="space-y-3">
        <SectionHeader title="Critical Matchup Battlegrounds" size="sm" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-theme-card border border-theme space-y-1">
            <span className="text-[10px] font-mono text-theme-sub uppercase font-bold block">Midfield Battle</span>
            <span className="font-bold text-theme-main block">Territory & Second Balls</span>
            <p className="text-[11px] text-theme-sub">Control of central second balls will dictate which team sustains attacking pressure.</p>
          </div>
          <div className="p-3 rounded-xl bg-theme-card border border-theme space-y-1">
            <span className="text-[10px] font-mono text-theme-sub uppercase font-bold block">Flank Duels</span>
            <span className="font-bold text-theme-main block">Winger vs Fullback</span>
            <p className="text-[11px] text-theme-sub">1v1 isolation duels on the wings will determine cross completion and box entries.</p>
          </div>
          <div className="p-3 rounded-xl bg-theme-card border border-theme space-y-1">
            <span className="text-[10px] font-mono text-theme-sub uppercase font-bold block">Transition Phase</span>
            <span className="font-bold text-theme-main block">Counter-Press Recovery</span>
            <p className="text-[11px] text-theme-sub">Quick recovery runs during defensive transitions will prevent high-danger counter-attacks.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
