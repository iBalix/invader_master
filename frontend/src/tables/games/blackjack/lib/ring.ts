/**
 * Placement des sièges autour de la table virtuelle.
 *
 * La table virtuelle reproduit la géographie réelle du bar : l'anneau des
 * dalles (même liste que le backend) donne l'ordre autour de la table. Chaque
 * joueur se voit EN BAS AU CENTRE de son propre écran, et le joueur suivant
 * dans l'anneau apparaît À SA GAUCHE. Un spectateur voit la table depuis sa
 * propre position dans l'anneau (le siège le plus proche de lui en bas).
 *
 * Les sièges occupent un arc dans la moitié basse de l'écran, le croupier
 * occupe le haut. Les coordonnées sont en % du conteneur table.
 */

import type { BjSeatView } from './bjTypes';

/** anneau physique du bar (copie assumée de backend/src/games/blackjack/types.ts) */
export const BAR_RING: string[] = [
  'TABLE02-1', 'TABLE03-1', 'TABLE05-1', 'TABLE06-1', 'TABLE07-1',
  'TABLE08-1', 'TABLE09-1', 'TABLE10-1', 'TABLE04-1', 'TABLE01-1',
  'TABLE01-2', 'TABLE04-2', 'TABLE10-2', 'TABLE09-2', 'TABLE08-2',
  'TABLE07-2', 'TABLE06-2', 'TABLE05-2', 'TABLE03-2', 'TABLE02-2',
];

export interface SeatPlacement {
  seat: BjSeatView;
  /** centre du pod, en % du conteneur */
  x: number;
  y: number;
  /** angle sur l'arc (deg, 0 = bas centre, positif = droite) */
  angle: number;
  isViewer: boolean;
}

export interface EmptySlotPlacement {
  x: number;
  y: number;
  angle: number;
}

function ringIndexOf(device: string): number {
  const idx = BAR_RING.indexOf(device.toUpperCase());
  return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
}

/** position (x, y) sur l'arc bas pour un angle en degrés
 * (0° = bas centre y=71 %, ±70° = bords y=40 % : la moitié basse de l'écran,
 * en laissant la place du dock d'actions géant sous le siège du joueur local) */
function arcPoint(angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: 50 + 40 * Math.sin(a), y: 23.9 + 47.1 * Math.cos(a) };
}

/**
 * Répartit `count` éléments sur l'arc avec l'élément `centerIndex` en bas au
 * centre. Retourne l'angle de chaque slot (index 0 = extrémité gauche).
 */
function slotAngles(count: number, centerIndex: number): number[] {
  if (count <= 1) return [0];
  const left = centerIndex;
  const right = count - 1 - centerIndex;
  const step = Math.min(44, 140 / (2 * Math.max(left, right, 1)));
  return Array.from({ length: count }, (_, i) => (i - centerIndex) * step);
}

/**
 * Place les sièges (vue publique, déjà filtrés left) autour de la table telle
 * que vue depuis `viewerId` (siège) ou `viewerDevice` (spectateur).
 * `extraSlots` ajoute des places vides (salle d'attente) après les sièges.
 */
export function placeSeats(
  seats: BjSeatView[],
  viewerId: string | null,
  viewerDevice: string | null,
  extraSlots = 0,
): { placed: SeatPlacement[]; empties: EmptySlotPlacement[] } {
  const sorted = seats
    .slice()
    .sort((a, b) => (a.ringPos === b.ringPos ? a.pseudo.localeCompare(b.pseudo) : a.ringPos - b.ringPos));
  const count = sorted.length + extraSlots;
  if (count === 0) return { placed: [], empties: [] };

  // référence de vue : mon siège, sinon (spectateur) le siège dont la position
  // dans l'anneau est la plus proche de ma dalle
  let viewerIdx = viewerId ? sorted.findIndex((s) => s.playerId === viewerId) : -1;
  if (viewerIdx < 0 && sorted.length > 0) {
    const myRing = viewerDevice ? ringIndexOf(viewerDevice) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(myRing)) {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      sorted.forEach((s, i) => {
        const pos = s.ringPos < 100 ? s.ringPos : ringIndexOf(s.device);
        const dist = Number.isFinite(pos)
          ? Math.min(Math.abs(pos - myRing), BAR_RING.length - Math.abs(pos - myRing))
          : 50;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      viewerIdx = best;
    } else {
      viewerIdx = 0;
    }
  }
  if (viewerIdx < 0) viewerIdx = 0;

  // offset cyclique depuis la référence : 1 = suivant dans l'anneau (à gauche)
  const n = sorted.length;
  const withOffset = sorted.map((seat, i) => ({ seat, offset: (i - viewerIdx + n) % n }));

  // slots de l'arc, de gauche à droite ; la référence est au centre (index L)
  const leftCount = Math.ceil((count - 1) / 2);
  const angles = slotAngles(count, leftCount);

  const placed: SeatPlacement[] = withOffset.map(({ seat, offset }) => {
    // offset 1..L -> côté gauche (slot L-offset) ; au-delà -> côté droit
    const slot = offset === 0 ? leftCount : offset <= leftCount ? leftCount - offset : leftCount + (count - offset);
    const angle = angles[Math.max(0, Math.min(count - 1, slot))];
    const { x, y } = arcPoint(angle);
    return { seat, x, y, angle, isViewer: viewerId !== null && seat.playerId === viewerId };
  });

  // places vides : slots non occupés, de l'extérieur vers l'intérieur
  const used = new Set(placed.map((p) => angles.indexOf(p.angle)));
  const empties: EmptySlotPlacement[] = [];
  for (let i = 0; i < count && empties.length < extraSlots; i++) {
    if (used.has(i)) continue;
    const { x, y } = arcPoint(angles[i]);
    empties.push({ x, y, angle: angles[i] });
  }
  return { placed, empties };
}

/** "TABLE03-1" -> "T03" (badge de table d'origine, comme aux échecs) */
export function tableOriginLabel(device: string): string | null {
  const match = /^TABLE(\d+)/i.exec(device);
  return match ? `T${match[1]}` : null;
}
