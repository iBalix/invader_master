/**
 * Console du gestionnaire d'événements — route /evenements/gestionnaire.
 *
 * Premier mode : tournoi en rondes suisses sur les échecs des tables. Sans
 * événement en cours, la console propose les modèles enregistrés (« configs
 * d'event » relançables), la création d'un nouvel événement et les
 * événements passés. Avec un événement en cours, elle le pilote.
 *
 * Plein écran HORS MainLayout, comme les consoles quiz et battle : les
 * animateurs pilotent depuis leur téléphone.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useConfirmation } from '../game/hooks/useConfirmation';
import { subscribeToGame } from '../game/lib/gameClient';
import { TournamentGmBody } from '../components/Tournament/TournamentGmBody';
import TemplateForm, { mergeConfig, type TemplateFormValue } from '../components/Tournament/TemplateForm';
import { Badge, Btn, Card } from '../components/Tournament/ui';
import { formatSummary } from '../game/tournament/tournamentClient';
import type { CompetitionTemplate, TournamentGmState } from '../game/tournament/tournamentTypes';

interface SessionListItem {
  id: string;
  mode: string;
  status: string;
  joinCode: string;
  quizName: string | null;
  createdAt: string;
  endedAt: string | null;
  testMode?: boolean;
}

function apiMessage(err: unknown): string {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Action impossible';
}

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

export default function TournamentLivePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<TournamentGmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const { demander, dialogue } = useConfirmation();

  // événement en cours (filtré par mode : les parties des tables ne le
  // repoussent plus hors de la liste)
  const discover = useCallback(async () => {
    try {
      const { data } = await api.get('/api/game', { params: { mode: 'tournament', active: 1, limit: 5 } });
      const items = (data?.items ?? []) as SessionListItem[];
      const active = items.find((s) => !s.endedAt);
      if (active) {
        setSessionId(active.id);
        setReadOnly(false);
      }
    } catch {
      /* première visite ou réseau : le lanceur s'affiche */
    } finally {
      setDiscovering(false);
    }
  }, []);

  useEffect(() => {
    void discover();
  }, [discover]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get(`/api/game/${sessionId}/state`);
      setState((data?.data ?? null) as TournamentGmState | null);
    } catch {
      /* sondage suivant */
    }
  }, [sessionId]);

  // sondage 3 s + signal temps réel (résultat d'une partie d'échecs visible
  // sans attendre le sondage)
  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    const unsubscribe = subscribeToGame(sessionId, (e) => {
      if (e.event === 'sync') void refresh();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionId, refresh]);

  const action = useCallback(
    async (name: string, params: Record<string, unknown> = {}, confirmMsg?: string) => {
      if (!sessionId || busy || readOnly) return;
      if (confirmMsg && !(await demander(confirmMsg))) return;
      setBusy(true);
      try {
        const { data } = await api.post(`/api/game/${sessionId}/action`, { action: name, params });
        setState((data?.data ?? null) as TournamentGmState | null);
      } catch (err) {
        toast.error(apiMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, readOnly, demander],
  );

  const close = () => {
    setSessionId(null);
    setState(null);
    setReadOnly(false);
  };

  if (discovering) {
    return (
      <Coque>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400" />
        </div>
      </Coque>
    );
  }

  if (!sessionId || !state) {
    return (
      <Coque>
        {dialogue}
        <Launcher
          demander={demander}
          onLaunched={(id) => {
            setReadOnly(false);
            setSessionId(id);
          }}
          onOpenPast={(id) => {
            setReadOnly(true);
            setSessionId(id);
          }}
        />
      </Coque>
    );
  }

  return (
    <Coque>
      {dialogue}
      {readOnly && (
        <div className="mx-auto mt-3 w-full max-w-[1200px] px-3 sm:px-5">
          <Btn variant="secondary" onClick={close}>
            ← Retour aux événements
          </Btn>
        </div>
      )}
      <TournamentGmBody
        state={state}
        busy={busy}
        action={action}
        onRefresh={() => void refresh()}
        onClosed={close}
        readOnly={readOnly || state.ended}
      />
    </Coque>
  );
}

function Coque({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 lg:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200">
          <ArrowLeft size={13} /> Back-office
        </Link>
        <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Gestionnaire d'événements</span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lanceur : modèles, nouvel événement, événements passés
// ---------------------------------------------------------------------------

function Launcher({
  demander,
  onLaunched,
  onOpenPast,
}: {
  demander: (message: string) => Promise<boolean>;
  onLaunched: (id: string) => void;
  onOpenPast: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<CompetitionTemplate[]>([]);
  const [past, setPast] = useState<SessionListItem[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; value: TemplateFormValue } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: t }, { data: s }] = await Promise.all([
        api.get('/api/competition-templates'),
        api.get('/api/game', { params: { mode: 'tournament', limit: 20 } }),
      ]);
      const list = t?.items ?? t?.templates ?? t;
      setTemplates(Array.isArray(list) ? (list as CompetitionTemplate[]) : []);
      const sessions = (s?.items ?? []) as SessionListItem[];
      setPast(sessions.filter((x) => x.endedAt));
    } catch (err) {
      toast.error(apiMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** lance, et gère le blocage « quiz / tournoi en cours » par une confirmation */
  const launchWith = async (send: (force: boolean) => Promise<{ id: string }>) => {
    setBusy(true);
    try {
      const res = await send(false);
      toast.success('Événement lancé !');
      onLaunched(res.id);
    } catch (err) {
      const msg = apiMessage(err);
      if (httpStatus(err) === 409 && (msg === 'error_projector_busy' || msg === 'error_tournament_active')) {
        const texte =
          msg === 'error_projector_busy'
            ? 'Un quiz ou une battle est en cours sur les écrans. Le terminer et lancer le tournoi ?'
            : 'Un autre tournoi est en cours. Le clore et lancer celui-ci ?';
        if (await demander(texte)) {
          try {
            const res = await send(true);
            toast.success('Événement lancé !');
            onLaunched(res.id);
          } catch (err2) {
            toast.error(apiMessage(err2));
          }
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const launchTemplate = (tpl: CompetitionTemplate, testMode?: boolean) =>
    launchWith(async (force) => {
      const { data } = await api.post(`/api/competition-templates/${tpl.id}/launch`, { force, ...(testMode !== undefined ? { testMode } : {}) });
      return data.data as { id: string };
    });

  const saveTemplate = async (id: string | null, value: TemplateFormValue): Promise<CompetitionTemplate | null> => {
    try {
      const { data } = id
        ? await api.put(`/api/competition-templates/${id}`, { name: value.name, config: value.config })
        : await api.post('/api/competition-templates', { name: value.name, config: value.config });
      toast.success('Modèle enregistré');
      await load();
      return data.data as CompetitionTemplate;
    } catch (err) {
      toast.error(apiMessage(err));
      return null;
    }
  };

  if (editing) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
        <TemplateForm
          initial={editing.value}
          isEdit={editing.id !== null}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            setBusy(true);
            const saved = await saveTemplate(editing.id, v);
            setBusy(false);
            if (saved) setEditing(null);
          }}
          onLaunch={async (v, save) => {
            if (save) {
              setBusy(true);
              const saved = await saveTemplate(editing.id, v);
              setBusy(false);
              if (!saved) return;
              setEditing(null);
              await launchTemplate(saved);
              return;
            }
            await launchWith(async (force) => {
              const { data } = await api.post('/api/game', { mode: 'tournament', config: v.config, force });
              return data.data as { id: string };
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5">
      <div>
        <h1 className="text-2xl font-black">Gestionnaire d'événements</h1>
        <p className="text-sm text-slate-400">
          Tournoi en rondes suisses sur les échecs des tables : QR d'inscription sur les TV du bar, tirage et classement au projecteur, résultats remontés tout seuls.
        </p>
      </div>

      <Btn
        variant="primary"
        big
        full
        disabled={busy}
        onClick={() => setEditing({ id: null, value: { name: '', config: mergeConfig(undefined) } })}
      >
        ＋ Nouvel événement
      </Btn>

      <Card title={`Mes événements (${templates.length})`}>
        {templates.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun modèle enregistré. Crée un événement et enregistre-le pour le relancer en un clic.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => {
              const cfg = mergeConfig(tpl.config);
              return (
                <div key={tpl.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-black">{tpl.name}</p>
                      <p className="text-xs text-slate-400">
                        ♞ Rondes suisses · Échecs · {cfg.registrationMin} min d'inscription
                        {tpl.lastUsedAt ? ` · lancé le ${new Date(tpl.lastUsedAt).toLocaleDateString('fr-FR')}` : ''}
                      </p>
                    </div>
                    {cfg.testMode && <Badge tone="amber">🧪 test</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatSummary({ config: cfg })}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Btn variant="primary" disabled={busy} onClick={() => void launchTemplate(tpl)}>
                      🚀 Lancer
                    </Btn>
                    <Btn disabled={busy} onClick={() => setEditing({ id: tpl.id, value: { name: tpl.name, config: cfg } })}>
                      Modifier
                    </Btn>
                    <Btn
                      disabled={busy}
                      onClick={() => setEditing({ id: null, value: { name: `${tpl.name} (copie)`, config: cfg } })}
                    >
                      Dupliquer
                    </Btn>
                    <Btn
                      variant="danger"
                      disabled={busy}
                      onClick={async () => {
                        if (!(await demander(`Supprimer le modèle « ${tpl.name} » ?`))) return;
                        try {
                          await api.delete(`/api/competition-templates/${tpl.id}`);
                          toast.success('Modèle supprimé');
                          await load();
                        } catch (err) {
                          toast.error(apiMessage(err));
                        }
                      }}
                    >
                      Supprimer
                    </Btn>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void launchTemplate(tpl, true)}
                    className="mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200"
                  >
                    🧪 Lancer en mode test (écrans du bar non basculés)
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Événements passés">
        {past.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun événement terminé.</p>
        ) : (
          <div className="space-y-1">
            {past.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenPast(s.id)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <span className="min-w-0 truncate font-semibold">
                  {s.quizName ?? 'Tournoi'}
                  {s.testMode && <span className="ml-2 text-xs text-amber-300">test</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
