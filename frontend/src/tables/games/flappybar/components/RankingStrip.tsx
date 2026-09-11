/**
 * Mini-classement live sur le bord droit : vivants d'abord (tous à la même
 * distance), puis les tombés par distance. Top 7 + ma ligne épinglée si je
 * suis plus bas. Lignes de 48 px, lisibles de biais.
 */

import type { RankingRow } from '../phaser/bridge';
import { formatMeters } from '../lib/format';

interface Props {
  rows: RankingRow[];
  accent: string;
  hudBg: string;
}

const TOP = 7;

function Row({ row, rank, accent }: { row: RankingRow; rank: number; accent: string }) {
  return (
    <div className="grid h-12 grid-cols-[40px_18px_1fr_104px] items-center gap-2 px-2" style={{ opacity: row.alive ? 1 : 0.5 }}>
      <span className="font-display text-[26px] leading-none text-white/70">{rank}</span>
      <span className="h-3.5 w-3.5 rounded-full" style={{ background: row.alive ? accent : 'rgba(255,255,255,0.3)' }} />
      <span className="truncate text-[22px] font-semibold text-white/90" style={row.isMe ? { color: accent } : undefined}>
        {row.pseudo}
      </span>
      <span className="text-right font-display text-[26px] leading-none text-white">{formatMeters(row.distanceM, 0)} m</span>
    </div>
  );
}

export default function RankingStrip({ rows, accent, hudBg }: Props) {
  const sorted = [...rows].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (b.distanceM !== a.distanceM) return b.distanceM - a.distanceM;
    return a.pseudo.localeCompare(b.pseudo);
  });
  const ranked = sorted.map((row, i) => ({ row, rank: i + 1 }));
  const top = ranked.slice(0, TOP);
  const mine = ranked.find((entry) => entry.row.isMe);
  const pinned = mine && mine.rank > TOP ? mine : null;

  return (
    <div className="absolute right-6 top-[120px] w-[380px] rounded-2xl py-2" style={{ background: hudBg }}>
      {top.map(({ row, rank }) => (
        <Row key={row.playerId} row={row} rank={rank} accent={accent} />
      ))}
      {pinned && (
        <>
          <div className="mx-4 my-1 h-px bg-white/15" />
          <Row row={pinned.row} rank={pinned.rank} accent={accent} />
        </>
      )}
    </div>
  );
}
