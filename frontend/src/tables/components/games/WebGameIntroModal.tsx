/**
 * Pop-up de présentation d'un jeu maison (échecs, blackjack, Flappy Bar...).
 *
 * Avant, un tap sur la vignette d'un jeu web envoyait directement au lobby du
 * jeu. Désormais on passe par cette fenêtre, sur le modèle de celle des
 * émulateurs :
 *   - à gauche, la vignette, la description du catalogue et la fiche du jeu
 *     (joueurs, durée, spectateurs) ;
 *   - à droite, à la place des manettes dont ces jeux n'ont pas besoin :
 *     comment on crée ou rejoint une partie entre tables, les règles en bref,
 *     ce qui se joue en ce moment dans le bar, et le bouton JOUER.
 *
 * Dalles vues de biais, à distance de bar : texte courant de 18 px minimum, bouton de
 * 84 px, et rien ne défile (tout tient dans 1080 px de haut).
 */

import { Hand, Play, Trophy } from 'lucide-react';
import ArcadeModal from '../ui/ArcadeModal';
import ArcadeButton from '../ui/ArcadeButton';
import type { GameV2 } from '../../hooks/useGamesV2';
import { useWebGameLive, type WebGameLiveInfo } from '../../hooks/useWebGameLive';
import { webGameGuide } from '../../lib/webGameGuides';
import { useLocaleStore } from '../../i18n/localeStore';
import { useT, type TFunction } from '../../i18n/useT';
import { formatMeters } from '../../games/flappybar/lib/format';

interface Props {
  open: boolean;
  game: GameV2 | null;
  onClose: () => void;
  onPlay: (game: GameV2) => void;
}

/** ligne « en ce moment dans le bar » */
function libelleLive(info: WebGameLiveInfo, t: TFunction): string {
  if (info.waiting > 0) {
    return info.waiting === 1
      ? t('table.webgame.live.waitingOne', '1 partie attend un joueur en ce moment')
      : t('table.webgame.live.waitingMany', '{n} parties attendent un joueur en ce moment').replace(
          '{n}',
          String(info.waiting),
        );
  }
  if (info.playing > 0) {
    return info.playing === 1
      ? t('table.webgame.live.playingOne', '1 partie en cours dans le bar, viens la regarder')
      : t('table.webgame.live.playingMany', '{n} parties en cours dans le bar, viens les regarder').replace(
          '{n}',
          String(info.playing),
        );
  }
  return t('table.webgame.live.none', 'Aucune partie en cours : ouvre la première !');
}

export default function WebGameIntroModal({ open, game, onClose, onPlay }: Props) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const guide = webGameGuide(game?.gameUrl);
  const live = useWebGameLive(guide.live, open && !!game);

  if (!game) return null;

  const accent = guide.accent;
  const cover = game.images?.[0] ?? game.coverUrl ?? null;
  // une partie attend quelqu'un : le cadre passe au vert, c'est l'info qui
  // doit sauter aux yeux
  const liveTone = live && live.waiting > 0 ? '#5ED9A1' : accent;

  return (
    <ArcadeModal open={open} onClose={onClose} size="3xl" title={game.name.toUpperCase()}>
      <div className="grid grid-cols-[1.1fr,1fr] gap-10">
        {/* ----- gauche : le jeu ----- */}
        <div className="flex min-w-0 flex-col">
          {cover ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/15 shadow-glass">
              <img
                src={cover}
                alt={game.name}
                className="aspect-video w-full object-cover"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          ) : (
            <div
              className="flex aspect-video w-full items-center justify-center rounded-2xl border border-white/15 font-display text-4xl uppercase tracking-wider text-table-ink"
              style={{ background: `linear-gradient(135deg, ${accent}40, rgba(123,43,255,0.25))` }}
            >
              {game.name}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {game.categories.map((c) => (
              <span
                key={c}
                className="rounded-full border border-table-magenta/40 bg-table-magenta/15 px-4 py-1.5 font-display text-lg uppercase tracking-widest text-table-ink"
              >
                {c}
              </span>
            ))}
            <span className="inline-flex items-center gap-2 rounded-full border border-table-mint/40 bg-table-mint/15 px-4 py-1.5 font-display text-lg uppercase tracking-widest text-table-mint">
              <Hand className="h-5 w-5" />
              {t('table.webgame.noController', 'Sans manette')}
            </span>
          </div>

          {game.subtitle && (
            <div className="mt-4 font-display text-2xl uppercase tracking-wider" style={{ color: accent }}>
              {game.subtitle}
            </div>
          )}
          {game.description && (
            <p className="mt-2 text-lg leading-relaxed text-table-ink-soft">{game.description}</p>
          )}

          <ul className="mt-5 space-y-3">
            {guide.facts.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-xl text-table-ink">
                <Icon className="h-7 w-7 shrink-0" style={{ color: accent }} />
                {t(key)}
              </li>
            ))}
          </ul>

          {/* en ce moment dans le bar : la place est réservée dès l'ouverture
              (la colonne ne saute pas quand le lobby répond) et disparaît si
              le lobby ne répond pas */}
          {guide.live && live !== null && (
            <div
              className="mt-auto min-h-[64px] space-y-1.5 rounded-2xl border px-5 py-3"
              style={{ borderColor: `${liveTone}40`, backgroundColor: `${liveTone}0F` }}
            >
              {live === undefined ? (
                <div className="text-lg text-table-ink-muted">
                  {t('table.webgame.live.loading', 'Coup d\'œil sur les parties du bar...')}
                </div>
              ) : (
                <>
                  <div
                    className={['flex items-center gap-3 text-lg', live.waiting > 0 ? 'font-semibold' : 'text-table-ink'].join(' ')}
                    style={live.waiting > 0 ? { color: liveTone } : undefined}
                  >
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ backgroundColor: liveTone }}
                      />
                      <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: liveTone }} />
                    </span>
                    {libelleLive(live, t)}
                  </div>
                  {live.record && (
                    <div className="flex items-center gap-3 text-lg text-table-ink-soft">
                      <Trophy className="h-5 w-5 shrink-0 text-table-yellow" />
                      {t('table.webgame.live.record', 'Record du bar : {score} par {pseudo}')
                        .replace('{score}', `${formatMeters(live.record.score, 1, locale)} m`)
                        .replace('{pseudo}', live.record.pseudo)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ----- droite : comment on joue ----- */}
        <div className="flex min-w-0 flex-col">
          <div className="font-display text-xl uppercase tracking-[0.3em]" style={{ color: accent }}>
            {t('table.webgame.how', 'Comment ça marche')}
          </div>

          <ol className="mt-3 space-y-2.5">
            {guide.steps.map(({ icon: Icon, key }) => (
              <li
                key={key}
                className="flex items-center gap-4 rounded-2xl border px-4 py-3"
                style={{ borderColor: `${accent}33`, backgroundColor: `${accent}0D` }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
                  style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1F`, color: accent }}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xl uppercase tracking-wider text-table-ink">
                    {t(`${key}.title`)}
                  </div>
                  <div className="text-lg leading-snug text-table-ink-soft">{t(`${key}.body`)}</div>
                </div>
              </li>
            ))}
          </ol>

          {guide.rules.length > 0 && (
            <>
              <div className="mt-5 font-display text-xl uppercase tracking-[0.3em]" style={{ color: accent }}>
                {t('table.webgame.rules', 'Les règles en bref')}
              </div>
              <ul className="mt-2 space-y-1.5">
                {guide.rules.map((key) => (
                  <li key={key} className="flex gap-3 text-lg leading-snug text-table-ink">
                    <span
                      aria-hidden
                      className="mt-[0.55em] h-2 w-2 shrink-0 rotate-45"
                      style={{ backgroundColor: accent }}
                    />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-auto pt-6">
            <ArcadeButton
              variant="primary"
              size="xl"
              fullWidth
              className="min-h-[84px] !text-3xl"
              icon={<Play className="h-7 w-7" />}
              onClick={() => onPlay(game)}
            >
              {t('table.webgame.play', 'Jouer')}
            </ArcadeButton>
            <div className="mt-2 text-center text-lg text-table-ink-muted">
              {t('table.webgame.play.hint', 'Ensuite : crée ta partie ou rejoins une table')}
            </div>
          </div>
        </div>
      </div>
    </ArcadeModal>
  );
}
