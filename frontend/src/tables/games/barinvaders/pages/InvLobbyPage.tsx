/**
 * Lobby de Bar Invaders. Trois zones : à gauche les parties du bar (en
 * attente, en cours) et la création ; au centre la vitrine (une partie de
 * démonstration en boucle, comme l'attract de la borne, et la table des
 * points) ; à droite, en permanence, les records du bar.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import AnimatedGrid, { AnimatedGridItem } from '../../../components/ui/AnimatedGrid';
import RetroLoader from '../../../components/ui/RetroLoader';
import BackButton from '../../../components/layout/BackButton';
import HeaderBar from '../../../components/layout/HeaderBar';
import BarRecordsPanel from '../../../components/games/BarRecordsPanel';
import { useBarRecords } from '../../../hooks/useBarRecords';
import { usePerfMode } from '../../../hooks/usePerfMode';
import { useT } from '../../../i18n/useT';
import { INV_ACCENT } from '../art/palette';
import AttractScreen from '../components/AttractScreen';
import CreateInvModal from '../components/CreateInvModal';
import InvNotice from '../components/InvNotice';
import JoinPseudoModal from '../components/JoinPseudoModal';
import LobbyInvCard from '../components/LobbyInvCard';
import { useInvLobby } from '../hooks/useInvLobby';
import { invApi, invErrorKey } from '../lib/invApi';
import { formatDuration } from '../lib/format';
import { getInvIdentity, getLastPseudo, saveInvIdentity, saveLastPseudo } from '../lib/identity';
import type { BarRecordItem, CreateInvInput, InvLobbyItem } from '../lib/invTypes';
import '../inv.css';

const NOTICE_MS = 3_000;

interface SectionProps {
  title: string;
  titleClass: string;
  resetKey: string;
  items: InvLobbyItem[];
  onJoin: (item: InvLobbyItem) => void;
  onOpen: (item: InvLobbyItem) => void;
}

/** une liste de parties sous son titre : en attente, ou en cours */
function SessionSection({ title, titleClass, resetKey, items, onJoin, onOpen }: SectionProps) {
  return (
    <section>
      <h2 className={`mb-3 font-display text-[22px] uppercase tracking-[0.3em] ${titleClass}`}>{title}</h2>
      <AnimatedGrid resetKey={resetKey} className="flex flex-col gap-3">
        {items.map((item) => (
          <AnimatedGridItem key={item.sessionId}>
            <LobbyInvCard
              item={item}
              isMine={getInvIdentity(item.sessionId) !== null}
              onJoin={() => onJoin(item)}
              onResume={() => onOpen(item)}
              onWatch={() => onOpen(item)}
            />
          </AnimatedGridItem>
        ))}
      </AnimatedGrid>
    </section>
  );
}

export default function InvLobbyPage() {
  const t = useT();
  const navigate = useNavigate();
  const perf = usePerfMode();
  const { items, loading } = useInvLobby();
  const { items: records } = useBarRecords('barinvaders', 1);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<InvLobbyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function showError(err: unknown) {
    const key = invErrorKey(err).replace(/^error_/, '');
    setNotice(t(`table.inv.error.${key}`, t('table.inv.error.generic', 'Une erreur est survenue')));
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }

  function openSession(sessionId: string) {
    navigate(`/table/games/barinvaders/${sessionId}`);
  }

  async function handleCreate(input: CreateInvInput) {
    setBusy(true);
    try {
      const res = await invApi.create(input);
      saveLastPseudo(input.pseudo);
      saveInvIdentity(res.sessionId, { playerToken: res.playerToken, pseudo: input.pseudo });
      openSession(res.sessionId);
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  async function handleJoin(item: InvLobbyItem, pseudo: string) {
    setBusy(true);
    try {
      const res = await invApi.join(item.sessionId, { pseudo });
      saveLastPseudo(pseudo);
      saveInvIdentity(res.sessionId, { playerToken: res.playerToken, pseudo });
      openSession(res.sessionId);
    } catch (err) {
      // la modale reste ouverte et affiche l'erreur : le joueur corrige ou ferme
      showError(err);
      setBusy(false);
    }
  }

  /** sous le pseudo d'un record : vague atteinte et durée, si connues */
  function formatRecordDetails(item: BarRecordItem): string | null {
    const parts: string[] = [];
    const wave = item.details?.wave;
    if (typeof wave === 'number') parts.push(t('table.inv.records.wave', 'vague {wave}').replace('{wave}', String(wave)));
    const timeMs = item.details?.timeMs;
    if (typeof timeMs === 'number') parts.push(formatDuration(timeMs));
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  const waiting = items.filter((i) => i.status === 'lobby');
  const running = items.filter((i) => i.status === 'playing');

  return (
    <div className={`relative flex h-full w-full flex-col px-8 py-6 ${perf.reduced ? 'inv-reduced' : ''}`}>
      <InvNotice message={notice} />
      <HeaderBar
        title={t('table.inv.title', 'Bar Invaders').toUpperCase()}
        left={<BackButton to="/table/games" label={t('table.games.title')} />}
        right={
          // l'état vide porte déjà son propre gros CTA : pas deux boutons identiques à l'écran
          items.length > 0 ? (
            <ArcadeButton variant="accent" size="lg" icon={<Plus className="h-6 w-6" />} onClick={() => setCreateOpen(true)}>
              {t('table.inv.lobby.create', 'Créer une partie')}
            </ArcadeButton>
          ) : null
        }
      />

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_472px_500px] gap-6">
        {/* zone gauche : les parties */}
        <div className="tables-scroll min-h-0 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <RetroLoader label={t('table.common.loading', 'LOADING')} />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="font-display text-4xl uppercase tracking-wide text-table-ink-soft">{t('table.inv.lobby.empty', 'Aucune partie en cours')}</div>
              <div className="max-w-xl text-2xl text-table-ink-muted">
                {t('table.inv.lobby.emptySub', "Crée une partie : les autres tables te rejoignent, chacun défend sa planète sur sa dalle.")}
              </div>
              <ArcadeButton variant="accent" size="xl" className="min-h-[72px]" icon={<Plus className="h-7 w-7" />} onClick={() => setCreateOpen(true)}>
                {t('table.inv.lobby.create', 'Créer une partie')}
              </ArcadeButton>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {waiting.length > 0 && (
                <SessionSection
                  title={t('table.inv.lobby.waiting', 'En attente de joueurs')}
                  titleClass="text-table-cyan/85"
                  resetKey={`w${waiting.length}`}
                  items={waiting}
                  onJoin={setJoinTarget}
                  onOpen={(item) => openSession(item.sessionId)}
                />
              )}
              {running.length > 0 && (
                <SessionSection
                  title={t('table.inv.lobby.playing', 'Parties en cours')}
                  titleClass="text-table-magenta/85"
                  resetKey={`p${running.length}`}
                  items={running}
                  onJoin={setJoinTarget}
                  onOpen={(item) => openSession(item.sessionId)}
                />
              )}
            </div>
          )}
        </div>

        {/* zone centrale : la vitrine */}
        <div className="flex min-h-0 flex-col items-center gap-5">
          <AttractScreen hiScore={records[0]?.score ?? 0} reduced={perf.reduced} />
          <div className="text-center text-[20px] leading-snug text-white/65">
            {t('table.inv.lobby.pitch', 'Le Space Invaders de 1978, en réseau : chacun sa partie, le meilleur score de la manche gagne.')}
          </div>
        </div>

        {/* zone droite : les records, toujours visibles */}
        <BarRecordsPanel
          mode="barinvaders"
          title={t('table.inv.records.title', 'Records du bar')}
          limit={10}
          highlightPseudo={getLastPseudo()}
          accent={INV_ACCENT}
          formatDetails={formatRecordDetails}
          emptyTitle={t('table.inv.records.empty', 'Aucun record pour le moment')}
          emptySub={t('table.inv.records.emptySub', 'Le premier score entre au tableau')}
          className="min-h-0"
        />
      </div>

      <CreateInvModal
        open={createOpen}
        busy={busy}
        error={createOpen ? notice : null}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => void handleCreate(input)}
      />
      <JoinPseudoModal
        open={joinTarget !== null}
        busy={busy}
        error={joinTarget ? notice : null}
        onClose={() => setJoinTarget(null)}
        onSubmit={(pseudo) => joinTarget && void handleJoin(joinTarget, pseudo)}
      />
    </div>
  );
}
