/**
 * Bandeau d'information éphémère (erreurs réseau, refus serveur).
 */

interface Props {
  message: string | null;
}

export default function BjNotice({ message }: Props) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2">
      <div className="bj-pop rounded-2xl border border-white/20 bg-black/85 px-6 py-3 font-display text-base font-bold text-white shadow-xl">
        {message}
      </div>
    </div>
  );
}
