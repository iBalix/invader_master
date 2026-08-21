/**
 * Le tapis : la composition dessinée du feutre, comme une vraie table de
 * blackjack brandée par le casino. Doubles arcs de marquage centrés sur le
 * croupier, règles écrites EN COURBE le long des arcs, médaillons de mise
 * décoratifs, et le branding Invader ton sur ton (banner au centre du tapis,
 * manoirs en filigrane dans les coins).
 *
 * Entièrement statique (aucune animation) : un seul SVG plein écran calé sur
 * la géométrie 1920x1080 des dalles, plus les filigranes positionnés.
 */

import { InvaderBannerMark, InvaderManorMark, MANOR_PATH } from '../themes/brand';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  theme: BjTheme;
  t: TFunction;
}

/** centre des arcs : au niveau du croupier, au-dessus de l'écran visible */
const CX = 960;
const CY = 30;

/** point sur le cercle ; angle en degrés, 0 = plein bas, positif vers la droite */
function pt(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY + r * Math.cos(a)];
}

/** arc "souriant" de gauche à droite en passant par le bas du cercle */
function arcPath(r: number, halfDeg: number): string {
  const [x1, y1] = pt(r, -halfDeg);
  const [x2, y2] = pt(r, halfDeg);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export default function FeltLayer({ theme, t }: Props) {
  const line = theme.feltLine;
  const ink = theme.feltText;
  const minimal = theme.id === 'duo';

  // positions des médaillons de mise décoratifs (jamais au centre : le
  // banner y est) et des manoirs de coin
  const medallions = [-52, -27, 27, 52].map((deg) => pt(660, deg));

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        <defs>
          <path id="bj-felt-t1" d={arcPath(452, 60)} fill="none" />
          <path id="bj-felt-t2" d={arcPath(520, 60)} fill="none" />
          <g id="bj-felt-manor">
            <path d={MANOR_PATH} transform="translate(-284 -278) scale(1)" />
          </g>
        </defs>

        {/* les liserés concentriques, comme le double filet des vraies tables */}
        <path d={arcPath(408, 78)} fill="none" stroke={line} strokeWidth="3" opacity="0.5" />
        <path d={arcPath(422, 76)} fill="none" stroke={line} strokeWidth="1.2" opacity="0.35" />
        <path d={arcPath(560, 68)} fill="none" stroke={line} strokeWidth="1.2" opacity="0.35" />
        <path d={arcPath(574, 66)} fill="none" stroke={line} strokeWidth="3" opacity="0.5" />

        {/* les règles écrites en courbe */}
        <text fill={ink} opacity="0.75" fontSize="34" fontWeight="700" letterSpacing="8" className="font-display uppercase">
          <textPath href="#bj-felt-t1" startOffset="50%" textAnchor="middle">
            {t('table.bj.felt.blackjack32')}
          </textPath>
        </text>
        <text fill={ink} opacity="0.5" fontSize="21" fontWeight="600" letterSpacing="5" className="font-display uppercase">
          <textPath href="#bj-felt-t2" startOffset="50%" textAnchor="middle">
            {t('table.bj.felt.dealerRule')}
          </textPath>
        </text>

        {/* médaillons de mise décoratifs, manoir en leur centre */}
        {!minimal &&
          medallions.map(([x, y], i) => (
            <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              <circle r="52" fill="none" stroke={line} strokeWidth="1.8" opacity="0.4" />
              <circle r="43" fill="none" stroke={line} strokeWidth="1" opacity="0.28" strokeDasharray="5 6" />
              <g transform="scale(0.17)" opacity="0.3">
                <use href="#bj-felt-manor" fill={ink} />
              </g>
            </g>
          ))}

        {/* la pointe basse du tapis : un chevron sous le siège du joueur */}
        <path d={arcPath(760, 26)} fill="none" stroke={line} strokeWidth="1.5" opacity="0.22" />
      </svg>

      {/* le branding du casino, ton sur ton au centre du tapis */}
      <div className="absolute left-1/2 top-[57%] -translate-x-1/2 -translate-y-1/2">
        <InvaderBannerMark color={ink} opacity={minimal ? 0.09 : 0.14} width={470} />
      </div>
      {!minimal && (
        <>
          <div className="absolute left-[7%] top-[76%]">
            <InvaderManorMark color={ink} opacity={0.09} width={150} />
          </div>
          <div className="absolute right-[7%] top-[76%]">
            <InvaderManorMark color={ink} opacity={0.09} width={150} />
          </div>
        </>
      )}
    </div>
  );
}
