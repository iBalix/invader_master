/**
 * Bandeau d'information éphémère (erreurs réseau, refus serveur).
 * Même gabarit que BjNotice ; l'animation vient de tailwind (soft-pop) pour
 * ne dépendre d'aucune feuille de style du jeu.
 */

interface Props {
  message: string | null;
}

export default function FlapNotice({ message }: Props) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2">
      <div className="animate-soft-pop rounded-2xl border border-white/20 bg-black/85 px-9 py-4 font-display text-2xl font-bold text-white shadow-xl">
        {message}
      </div>
    </div>
  );
}
