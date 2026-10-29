/**
 * « *SCORE ADVANCE TABLE* » de l'écran d'attract de la borne : la soucoupe
 * et les trois envahisseurs avec leurs points, en sprites d'origine. Rappel
 * des règles dans la colonne de gauche et vitrine du lobby.
 */

import type { TFunction } from '../../../i18n/useT';
import { ALIEN_SPR, SAUCER_SPR } from '../sim/invSim';
import { INV_COLORS } from '../art/palette';
import SpriteIcon from './SpriteIcon';

interface Props {
  t: TFunction;
  /** agrandissement des sprites */
  scale?: number;
  compact?: boolean;
}

export default function ScoreTable({ t, scale = 4, compact = false }: Props) {
  const rows = [
    { cols: SAUCER_SPR, color: INV_COLORS.red, label: t('table.inv.table.mystery', '= ? MYSTERE') },
    { cols: ALIEN_SPR[0][2], color: INV_COLORS.white, label: t('table.inv.table.points', '= {points} POINTS').replace('{points}', '30') },
    { cols: ALIEN_SPR[1][1], color: INV_COLORS.white, label: t('table.inv.table.points', '= {points} POINTS').replace('{points}', '20') },
    { cols: ALIEN_SPR[0][0], color: INV_COLORS.white, label: t('table.inv.table.points', '= {points} POINTS').replace('{points}', '10') },
  ];
  return (
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      <div className="font-retro text-[16px] tracking-wider text-white/60">{t('table.inv.table.title', '*SCORE ADVANCE TABLE*')}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-5">
          <span className="flex w-[72px] justify-center">
            <SpriteIcon columns={row.cols} color={row.color} scale={scale} />
          </span>
          <span className="font-retro text-[18px] text-white/85">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
