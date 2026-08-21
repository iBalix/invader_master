/**
 * Création de partie : pseudo, cadence (presets + personnalisé + sans
 * pendule), couleur, thème (mini-préviews dessinées par les thèmes ; duo
 * déplie ses 6 teintes). Tout est visible, pas de wizard.
 */

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import ThemePreview from './ThemePreview';
import { DUO_TINTS, DUO_TINT_LIST, THEME_CHOICES, duoTheme, getTheme } from '../themes';
import { PieceGlyph } from '../themes/pieces/StandardPieceSet';
import { getLastPseudo } from '../lib/identity';
import { isValidPseudo } from '../lib/pseudo';
import type { ChessColor, CreateChessGameInput } from '../lib/chessTypes';
import type { DuoTint } from '../themes';

interface ClockPreset {
  label: string;
  minutes: number;
  increment: number;
}

const PRESETS: ClockPreset[] = [
  { label: '3+2', minutes: 3, increment: 2 },
  { label: '5+0', minutes: 5, increment: 0 },
  { label: '5+3', minutes: 5, increment: 3 },
  { label: '10+0', minutes: 10, increment: 0 },
  { label: '10+5', minutes: 10, increment: 5 },
  { label: '15+10', minutes: 15, increment: 10 },
  { label: '30+0', minutes: 30, increment: 0 },
];

type ClockChoice = 'none' | 'custom' | number; // number = index de preset

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateChessGameInput) => void;
}

export default function CreateGameModal({ open, busy, onClose, onCreate }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const [clockChoice, setClockChoice] = useState<ClockChoice>(1); // 5+0 par défaut
  const [customMinutes, setCustomMinutes] = useState(10);
  const [customIncrement, setCustomIncrement] = useState(5);
  const [color, setColor] = useState<ChessColor | 'random'>('random');
  const [themeBase, setThemeBase] = useState('neon');
  const [duoTint, setDuoTint] = useState<DuoTint>('violet');

  const themeValue = themeBase === 'duo' ? `duo:${duoTint}` : themeBase;
  const pseudoOk = isValidPseudo(pseudo);

  const clock = useMemo(() => {
    if (clockChoice === 'none') return null;
    if (clockChoice === 'custom') {
      return { initialMinutes: customMinutes, incrementSeconds: customIncrement };
    }
    const preset = PRESETS[clockChoice];
    return { initialMinutes: preset.minutes, incrementSeconds: preset.increment };
  }, [clockChoice, customMinutes, customIncrement]);

  function chipClass(active: boolean): string {
    return [
      'h-14 rounded-2xl border px-5 font-display text-lg uppercase tracking-wider transition-colors',
      active
        ? 'border-table-cyan/70 bg-table-cyan/20 text-table-cyan'
        : 'border-white/15 bg-white/5 text-table-ink-soft',
    ].join(' ');
  }

  function stepper(
    value: number,
    setValue: (v: number) => void,
    min: number,
    max: number,
    step: number,
    label: string,
  ) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-24 text-sm uppercase tracking-wider text-table-ink-muted">{label}</span>
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-table-ink active:scale-95 disabled:opacity-40"
          disabled={value - step < min}
          onClick={() => setValue(Math.max(min, value - step))}
        >
          <Minus className="h-6 w-6" />
        </button>
        <span className="w-14 text-center font-display text-3xl tabular-nums text-table-ink">{value}</span>
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-table-ink active:scale-95 disabled:opacity-40"
          disabled={value + step > max}
          onClick={() => setValue(Math.min(max, value + step))}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>
    );
  }

  const previewTheme = getTheme(themeValue);

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.chess.create.title')} size="xl">
      {/* tout tient sans scroll sur une dalle 1080p : jamais de défilement dans une modale */}
      <div className="flex flex-col gap-4">
        {/* pseudo */}
        <section>
          <div className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-table-cyan/85">
            {t('table.chess.create.pseudo')}
          </div>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            maxLength={16}
            placeholder={t('table.chess.create.pseudoPlaceholder')}
            className="w-full rounded-2xl border border-white/15 bg-black/40 px-5 py-3.5 text-xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
          />
        </section>

        {/* cadence */}
        <section>
          <div className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-table-cyan/85">
            {t('table.chess.create.cadence')}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chipClass(clockChoice === 'none')} onClick={() => setClockChoice('none')}>
              {t('table.chess.create.noClock')}
            </button>
            {PRESETS.map((preset, i) => (
              <button key={preset.label} type="button" className={chipClass(clockChoice === i)} onClick={() => setClockChoice(i)}>
                {preset.label}
              </button>
            ))}
            <button type="button" className={chipClass(clockChoice === 'custom')} onClick={() => setClockChoice('custom')}>
              {t('table.chess.create.custom')}
            </button>
          </div>
          {clockChoice === 'custom' && (
            <div className="mt-4 flex flex-wrap gap-8">
              {stepper(customMinutes, setCustomMinutes, 1, 60, 1, t('table.chess.create.minutes'))}
              {stepper(customIncrement, setCustomIncrement, 0, 30, 1, t('table.chess.create.increment'))}
            </div>
          )}
        </section>

        {/* couleur */}
        <section>
          <div className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-table-cyan/85">
            {t('table.chess.create.color')}
          </div>
          <div className="flex gap-3">
            {(['random', 'w', 'b'] as const).map((choice) => {
              const active = color === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setColor(choice)}
                  className={[
                    'flex h-16 flex-1 items-center justify-center gap-1 rounded-2xl border transition-colors',
                    active ? 'border-table-cyan/70 bg-table-cyan/15' : 'border-white/15 bg-white/5',
                  ].join(' ')}
                >
                  {choice !== 'b' && (
                    <span className="h-11 w-11">
                      <PieceGlyph type="k" color="w" style={{ body: '#FDF6E3', stroke: '#2B2430', strokeWidth: 2 }} size="100%" />
                    </span>
                  )}
                  {choice !== 'w' && (
                    <span className="h-11 w-11">
                      <PieceGlyph type="k" color="b" style={{ body: '#3B3542', stroke: '#EDE4F2', strokeWidth: 2 }} size="100%" />
                    </span>
                  )}
                  <span className="ml-1 font-display uppercase tracking-wider text-table-ink-soft">
                    {t(`table.chess.create.color.${choice === 'w' ? 'white' : choice === 'b' ? 'black' : 'random'}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* thème */}
        <section>
          <div className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-table-cyan/85">
            {t('table.chess.create.theme')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {THEME_CHOICES.map((choice) => {
              const active = themeBase === choice.value;
              const tileTheme = choice.value === 'duo' ? duoTheme(duoTint) : choice.theme;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setThemeBase(choice.value)}
                  className={[
                    'flex items-center gap-3 rounded-2xl border p-2 transition-colors',
                    active ? 'border-table-cyan/70 bg-table-cyan/12' : 'border-white/15 bg-white/5',
                  ].join(' ')}
                >
                  <ThemePreview theme={tileTheme} size={56} />
                  <span className="font-display text-base uppercase tracking-wider text-table-ink">
                    {t(choice.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
          {themeBase === 'duo' && (
            <div className="mt-2.5 flex gap-3">
              {DUO_TINT_LIST.map((tint) => (
                <button
                  key={tint}
                  type="button"
                  onClick={() => setDuoTint(tint)}
                  aria-label={tint}
                  className={[
                    'h-10 w-10 rounded-full border-2 transition-transform active:scale-95',
                    duoTint === tint ? 'scale-110 border-white' : 'border-white/25',
                  ].join(' ')}
                  style={{ background: DUO_TINTS[tint].accent }}
                />
              ))}
            </div>
          )}
        </section>

        <ArcadeButton
          variant="primary"
          size="xl"
          fullWidth
          disabled={busy || !pseudoOk}
          onClick={() =>
            onCreate({ pseudo: pseudo.trim(), clock, color, theme: previewTheme.id })
          }
        >
          {t('table.chess.create.submit')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
