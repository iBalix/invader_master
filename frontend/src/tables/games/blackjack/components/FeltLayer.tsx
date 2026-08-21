/**
 * Le tapis : la composition dessinée du feutre, épurée comme une vraie table
 * de casino. Doubles arcs de marquage resserrés vers le croupier, règles
 * écrites EN COURBE le long des arcs, la marque du casino (banner Invader)
 * au-dessus de l'arrondi, et deux manoirs en filigrane dans les coins bas.
 *
 * Entièrement statique (aucune animation) : un seul SVG plein écran calé sur
 * la géométrie 1920x1080 des dalles, plus les filigranes positionnés.
 */

import { InvaderBannerMark, InvaderManorMark } from '../themes/brand';
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

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* baselines centrées dans la bande [343, 478] : lettres du grand
              texte ~382-406, du petit ~422-436, marges hautes et basses égales */}
          <path id="bj-felt-t1" d={arcPath(406, 62)} fill="none" />
          <path id="bj-felt-t2" d={arcPath(436, 58)} fill="none" />
        </defs>

        {/* les liserés concentriques, comme le double filet des vraies tables */}
        <path d={arcPath(330, 74)} fill="none" stroke={line} strokeWidth="3" opacity="0.5" />
        <path d={arcPath(343, 72)} fill="none" stroke={line} strokeWidth="1.2" opacity="0.35" />
        <path d={arcPath(478, 62)} fill="none" stroke={line} strokeWidth="1.2" opacity="0.35" />
        <path d={arcPath(491, 60)} fill="none" stroke={line} strokeWidth="3" opacity="0.5" />

        {/* les règles écrites en courbe */}
        <text fill={ink} opacity="0.75" fontSize="33" fontWeight="700" letterSpacing="8" className="font-display uppercase">
          <textPath href="#bj-felt-t1" startOffset="50%" textAnchor="middle">
            {t('table.bj.felt.blackjack32')}
          </textPath>
        </text>
        <text fill={ink} opacity="0.5" fontSize="20" fontWeight="600" letterSpacing="5" className="font-display uppercase">
          <textPath href="#bj-felt-t2" startOffset="50%" textAnchor="middle">
            {t('table.bj.felt.dealerRule')}
          </textPath>
        </text>
      </svg>

      {/* la marque du casino, au-dessus de l'arrondi, sous le poste du croupier */}
      <div className="absolute left-1/2 top-[26.5%] -translate-x-1/2 -translate-y-1/2">
        <InvaderBannerMark color={ink} opacity={minimal ? 0.12 : 0.2} width={250} />
      </div>

      {/* deux manoirs en filigrane dans les coins bas, rien de plus */}
      {!minimal && (
        <>
          <div className="absolute left-[6%] top-[74%]">
            <InvaderManorMark color={ink} opacity={0.09} width={160} />
          </div>
          <div className="absolute right-[6%] top-[74%]">
            <InvaderManorMark color={ink} opacity={0.09} width={160} />
          </div>
        </>
      )}
    </div>
  );
}
