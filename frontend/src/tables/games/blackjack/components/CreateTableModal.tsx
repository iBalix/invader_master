/**
 * Création d'une table : pseudo, thème, places, manches (avec estimation de
 * durée à 2 / 5 / 8 joueurs), enjeu, rythme, règles, jokers. La prime de
 * manche vaut le double de la mise maximale.
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
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={String(option)}
          className={`min-w-[68px] rounded-xl px-5 py-3 font-display text-xl font-bold transition-colors ${
            option === value ? 'bg-table-cyan text-black' : 'bg-white/8 text-white/75'
          }`}
          onClick={() => onChange(option)}
        >
          {render ? render(option) : String(option)}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`flex items-center gap-2.5 rounded-xl px-5 py-3 font-display text-lg font-bold uppercase ${
        value ? 'bg-table-cyan/20 text-table-cyan' : 'bg-white/8 text-white/55'
      }`}
      onClick={() => onChange(!value)}
    >
      <span className={`h-3.5 w-3.5 rounded-full ${value ? 'bg-table-cyan' : 'bg-white/30'}`} />
      {label}
    </button>
  );
}

export default function CreateTableModal({ open, busy, onClose, onCreate }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const [theme, setTheme] = useState('neon');
  const [maxSeats, setMaxSeats] = useState(6);
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

  const label = 'font-display text-base font-bold uppercase tracking-wider text-white/55';

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.bj.create.title')} size="2xl">
      <div className="flex max-h-[72vh] flex-col gap-5 overflow-y-auto pr-1">
        {/* pseudo */}
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={16}
          placeholder={t('table.bj.create.pseudoPlaceholder')}
          className="w-full rounded-2xl border border-white/15 bg-black/40 px-6 py-4 text-2xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
        />

        {/* thème */}
        <div className="flex flex-col gap-2">
          <span className={label}>{t('table.bj.create.theme')}</span>
          <div className="flex flex-wrap gap-3">
            {BJ_THEMES.map((th) => (
              <button key={th.id} className="flex flex-col items-center gap-1.5" onClick={() => setTheme(th.id)}>
                <BjThemePreview theme={th} size={104} selected={theme === th.id} />
                <span className={`text-base font-bold uppercase ${theme === th.id ? 'text-table-cyan' : 'text-white/55'}`}>
                  {t(th.labelKey)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* table */}
          <div className="flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.seats')}</span>
            <Segment options={[2, 3, 4, 5, 6, 7, 8]} value={maxSeats} onChange={setMaxSeats} />
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.decks')}</span>
            <Segment options={[2, 4, 6]} value={decks} onChange={setDecks} />
          </div>

          {/* manches + estimation */}
          <div className="col-span-2 flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.rounds')}</span>
            <Segment options={[6, 8, 10, 12]} value={rounds} onChange={setRounds} />
            <div className="flex gap-2.5 text-base text-white/55">
              {[2, 5, 8].map((p) => (
                <span key={p} className="rounded-full bg-white/6 px-3.5 py-1.5">
                  {t('table.bj.create.estimate').replace('{players}', String(p)).replace('{min}', String(estimateMinutes(rounds, p)))}
                </span>
              ))}
            </div>
          </div>

          {/* enjeu */}
          <div className="flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.startChips')}</span>
            <Segment options={[200, 500, 1000]} value={startChips} onChange={setStartChips} />
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.decision')}</span>
            <Segment options={[7_000, 10_000, 15_000, 20_000]} value={decisionMs} onChange={setDecisionMs} render={(v) => `${v / 1000}s`} />
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>{t('table.bj.create.minBet')}</span>
            <Segment
              options={[5, 10, 20]}
              value={minBet}
              onChange={(v) => {
                setMinBet(v);
                if (maxBet <= v) setMaxBet(v * 5);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>
              {t('table.bj.create.maxBet')} · {t('table.bj.create.prime').replace('{prime}', String(maxBet * 2))}
            </span>
            <Segment options={[50, 100, 200].filter((v) => v > minBet)} value={maxBet} onChange={setMaxBet} />
          </div>
        </div>

        {/* règles */}
        <div className="flex flex-wrap gap-2">
          <Toggle label={t('table.bj.create.lateJoin')} value={lateJoin} onChange={setLateJoin} />
          <Toggle label={t('table.bj.create.double')} value={allowDouble} onChange={setAllowDouble} />
          <Toggle label={t('table.bj.create.split')} value={allowSplit} onChange={setAllowSplit} />
        </div>

        {/* jokers */}
        <div className="flex flex-col gap-2">
          <span className={label}>{t('table.bj.create.jokers')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {JOKER_TYPES.map((type) => (
              <button
                key={type}
                className="flex flex-col items-center gap-1 rounded-xl p-1.5"
                style={{ opacity: jokers[type] ? 1 : 0.32, background: jokers[type] ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                onClick={() => setJokers((prev) => ({ ...prev, [type]: !prev[type] }))}
              >
                <JokerGlyph type={type} theme={BJ_THEMES.find((th) => th.id === theme) ?? BJ_THEMES[0]} width={64} t={t} compact />
                <span className="text-sm font-bold uppercase text-white/65">{t(`table.bj.joker.${type}`)}</span>
              </button>
            ))}
            <div className="ml-3 flex flex-col gap-1.5">
              <span className={label}>{t('table.bj.create.frequency')}</span>
              <Segment
                options={['rare', 'normal', 'generous'] as const}
                value={jokerFrequency}
                onChange={setJokerFrequency}
                render={(v) => t(`table.bj.create.frequency.${v}`)}
              />
            </div>
          </div>
          {!anyJoker && <span className="text-base font-bold uppercase text-white/45">{t('table.bj.create.noJokers')}</span>}
        </div>

        <ArcadeButton
          variant="accent"
          size="xl"
          fullWidth
          disabled={busy || !isValidPseudo(pseudo)}
          onClick={() =>
            onCreate({
              pseudo: pseudo.trim(),
              maxSeats,
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
