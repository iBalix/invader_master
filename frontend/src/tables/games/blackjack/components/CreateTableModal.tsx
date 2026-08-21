/**
 * Création d'une table : pseudo, thème, table, manches (avec estimation de
 * durée à 2 / 5 / 8 joueurs), enjeu, rythme, règles, jokers. La prime de
 * manche vaut le double de la mise maximale.
 *
 * Tout tient SANS SCROLL sur une dalle 1080p : réglages regroupés en
 * sections encadrées sur deux colonnes, chaque groupe de choix dans son
 * propre cadre (segmented control), jamais de chiffres flottants.
 */

import { useState } from 'react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import BjThemePreview from './BjThemePreview';
import JokerGlyph from './JokerGlyph';
import { BJ_THEMES } from '../themes';
import { getLastPseudo, isValidPseudo } from '../lib/identity';
import { estimateMinutes, JOKER_TYPES, type CreateBjInput, type JokerType } from '../lib/bjTypes';

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateBjInput) => void;
}

/** groupe de choix encadré : les options vivent dans un cadre, pas en vrac */
function Segment<T extends string | number>({
  options,
  value,
  onChange,
  render,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-white/10 bg-black/35 p-1">
      {options.map((option) => (
        <button
          key={String(option)}
          className={`h-11 min-w-[52px] rounded-lg px-3.5 font-display text-lg font-bold transition-colors ${
            option === value ? 'bg-table-cyan text-black' : 'text-white/70'
          }`}
          onClick={() => onChange(option)}
        >
          {render ? render(option) : String(option)}
        </button>
      ))}
    </div>
  );
}

/** une ligne de réglage : libellé à gauche, choix encadrés à droite */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-display text-base font-bold uppercase tracking-wide text-white/65">{label}</span>
      {children}
    </div>
  );
}

/** section encadrée de la modale */
function Section({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${className ?? ''}`}>
      {title && (
        <div className="mb-3 font-display text-sm font-bold uppercase tracking-[0.2em] text-table-cyan/80">{title}</div>
      )}
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`flex h-11 items-center gap-2 rounded-xl border px-4 font-display text-base font-bold uppercase ${
        value ? 'border-table-cyan/50 bg-table-cyan/15 text-table-cyan' : 'border-white/10 bg-black/30 text-white/50'
      }`}
      onClick={() => onChange(!value)}
    >
      <span className={`h-3 w-3 rounded-full ${value ? 'bg-table-cyan' : 'bg-white/25'}`} />
      {label}
    </button>
  );
}

export default function CreateTableModal({ open, busy, onClose, onCreate }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const [theme, setTheme] = useState('neon');
  const [rounds, setRounds] = useState(8);
  const [startChips, setStartChips] = useState(500);
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(100);
  const [decisionMs, setDecisionMs] = useState(10_000);
  const [decks, setDecks] = useState(4);
  const [lateJoin, setLateJoin] = useState(true);
  const [allowDouble, setAllowDouble] = useState(true);
  const [allowSplit, setAllowSplit] = useState(true);
  const [jokerFrequency, setJokerFrequency] = useState<'rare' | 'normal' | 'generous'>('normal');
  const [jokers, setJokers] = useState<Record<JokerType, boolean>>({
    force: true,
    lock: true,
    steal: true,
    filet: true,
    shield: true,
    redraw: true,
  });

  const anyJoker = JOKER_TYPES.some((type) => jokers[type]);
  const selectedTheme = BJ_THEMES.find((th) => th.id === theme) ?? BJ_THEMES[0];

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.bj.create.title')} size="2xl">
      <div className="flex flex-col gap-4">
        {/* pseudo */}
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={16}
          placeholder={t('table.bj.create.pseudoPlaceholder')}
          className="w-full rounded-2xl border border-white/15 bg-black/40 px-5 py-3 text-xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
        />

        {/* thème */}
        <Section title={t('table.bj.create.theme')}>
          <div className="flex items-start gap-4">
            {BJ_THEMES.map((th) => (
              <button key={th.id} className="flex flex-col items-center gap-1.5" onClick={() => setTheme(th.id)}>
                <BjThemePreview theme={th} size={80} selected={theme === th.id} />
                <span className={`text-sm font-bold uppercase ${theme === th.id ? 'text-table-cyan' : 'text-white/55'}`}>
                  {t(th.labelKey)}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-4">
          {/* table */}
          <Section title={t('table.bj.create.sectionTable')} className="flex flex-col gap-3">
            <Row label={t('table.bj.create.decks')}>
              <Segment options={[2, 4, 6]} value={decks} onChange={setDecks} />
            </Row>
            <Row label={t('table.bj.create.rounds')}>
              <Segment options={[6, 8, 10, 12]} value={rounds} onChange={setRounds} />
            </Row>
            <div className="flex justify-end gap-2 text-sm text-white/50">
              {[2, 5, 8].map((p) => (
                <span key={p} className="rounded-full bg-black/30 px-3 py-1">
                  {t('table.bj.create.estimate').replace('{players}', String(p)).replace('{min}', String(estimateMinutes(rounds, p)))}
                </span>
              ))}
            </div>
          </Section>

          {/* enjeu */}
          <Section title={t('table.bj.create.sectionStakes')} className="flex flex-col gap-3">
            <Row label={t('table.bj.create.startChips')}>
              <Segment options={[200, 500, 1000]} value={startChips} onChange={setStartChips} />
            </Row>
            <Row label={t('table.bj.create.minBet')}>
              <Segment
                options={[5, 10, 20]}
                value={minBet}
                onChange={(v) => {
                  setMinBet(v);
                  if (maxBet <= v) setMaxBet(v * 5);
                }}
              />
            </Row>
            <Row label={t('table.bj.create.maxBet')}>
              <Segment options={[50, 100, 200].filter((v) => v > minBet)} value={maxBet} onChange={setMaxBet} />
            </Row>
            <div className="flex justify-end text-sm text-white/50">
              <span className="rounded-full bg-black/30 px-3 py-1">{t('table.bj.create.prime').replace('{prime}', String(maxBet * 2))}</span>
            </div>
          </Section>
        </div>

        {/* rythme et règles */}
        <Section title={t('table.bj.create.sectionRules')}>
          <div className="flex items-center justify-between gap-4">
            <Row label={t('table.bj.create.decision')}>
              <Segment options={[7_000, 10_000, 15_000, 20_000]} value={decisionMs} onChange={setDecisionMs} render={(v) => `${v / 1000}s`} />
            </Row>
            <div className="flex gap-2">
              <Toggle label={t('table.bj.create.lateJoin')} value={lateJoin} onChange={setLateJoin} />
              <Toggle label={t('table.bj.create.double')} value={allowDouble} onChange={setAllowDouble} />
              <Toggle label={t('table.bj.create.split')} value={allowSplit} onChange={setAllowSplit} />
            </div>
          </div>
        </Section>

        {/* jokers */}
        <Section title={t('table.bj.create.jokers')}>
          <div className="flex items-center justify-between gap-6">
            {/* tuiles de largeur identique, label sur hauteur fixe : la
                rangée reste régulière quel que soit le nom du joker */}
            <div className="flex gap-2.5">
              {JOKER_TYPES.map((type) => (
                <button
                  key={type}
                  className={`flex w-[118px] flex-col items-center gap-1.5 rounded-xl border p-2 outline-none transition-opacity ${
                    jokers[type]
                      ? 'border-table-cyan/45 bg-table-cyan/10'
                      : 'border-white/10 bg-black/25 opacity-35'
                  }`}
                  onClick={() => setJokers((prev) => ({ ...prev, [type]: !prev[type] }))}
                >
                  <JokerGlyph type={type} theme={selectedTheme} width={52} t={t} compact />
                  <span className="flex h-8 items-center text-center text-xs font-bold uppercase leading-tight text-white/70">
                    {t(`table.bj.joker.${type}`)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="font-display text-base font-bold uppercase tracking-wide text-white/65">{t('table.bj.create.frequency')}</span>
              <Segment
                options={['rare', 'normal', 'generous'] as const}
                value={jokerFrequency}
                onChange={setJokerFrequency}
                render={(v) => t(`table.bj.create.frequency.${v}`)}
              />
              {!anyJoker && <span className="text-sm font-bold uppercase text-white/40">{t('table.bj.create.noJokers')}</span>}
            </div>
          </div>
        </Section>

        <ArcadeButton
          variant="accent"
          size="xl"
          fullWidth
          disabled={busy || !isValidPseudo(pseudo)}
          onClick={() =>
            onCreate({
              pseudo: pseudo.trim(),
              // le groupe qui rejoint fait la table : la seule borne est la
              // limite du jeu, ce n'est pas un choix à faire peser au créateur
              maxSeats: 8,
              lateJoin,
              decks,
              startChips,
              minBet,
              maxBet,
              rounds,
              decisionMs,
              allowDouble,
              allowSplit,
              jokersEnabled: jokers,
              jokerFrequency,
              theme,
            })
          }
        >
          {t('table.bj.create.submit')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
