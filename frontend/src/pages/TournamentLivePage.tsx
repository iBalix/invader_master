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
import { Chrome, GameGlyph, Invader } from '../game/tournament/arcade/kit';
import { CUP, PixelSprite } from '../game/tournament/arcade/pixel';
import { formatSummary } from '../game/tournament/tournamentClient';
import { LAUNCH_PRESETS, type CompetitionTemplate, type TournamentGmState } from '../game/tournament/tournamentTypes';

export interface SessionListItem {
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Invader seed={0} scale={5} animate className="text-ia-cyan" />
          <p className="ia-pixel ia-blink text-xs text-ia-soft">Chargement</p>
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
    <div className="ia-stage flex min-h-dvh flex-col text-ia-ink">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ia-line px-3 py-2 lg:px-6">
        <Link to="/" className="ia-btn ia-btn--ghost min-h-[40px] px-3 text-xs">
          <ArrowLeft size={14} /> Back-office
        </Link>
        <span className="flex items-center gap-3">
          <span className="text-lg">
            <Chrome>Invader</Chrome>
          </span>
          <span className="ia-pixel hidden text-[11px] text-ia-pink sm:inline">Game master</span>
        </span>
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
    <LauncherView
      templates={templates}
      past={past}
      busy={busy}
      onPreset={(preset) =>
        void launchWith(async (force) => {
          const { data } = await api.post('/api/game', { mode: 'tournament', config: preset.config, force });
          return data.data as { id: string };
        })
      }
      onNew={() => setEditing({ id: null, value: { name: '', config: mergeConfig(undefined) } })}
      onLaunchTemplate={(tpl, testMode) => void launchTemplate(tpl, testMode)}
      onEdit={(tpl) => setEditing({ id: tpl.id, value: { name: tpl.name, config: mergeConfig(tpl.config) } })}
      onDuplicate={(tpl) => setEditing({ id: null, value: { name: `${tpl.name} (copie)`, config: mergeConfig(tpl.config) } })}
      onDelete={async (tpl) => {
        if (!(await demander(`Supprimer le modèle « ${tpl.name} » ?`))) return;
        try {
          await api.delete(`/api/competition-templates/${tpl.id}`);
          toast.success('Modèle supprimé');
          await load();
        } catch (err) {
          toast.error(apiMessage(err));
        }
      }}
      onOpenPast={onOpenPast}
    />
  );
}

/**
 * Vue du lanceur, sans réseau (le laboratoire la monte) : trois lancements
 * d'un geste en « cartouches », les modèles enregistrés, les événements passés.
 */
export function LauncherView({
  templates,
  past,
  busy,
  onPreset,
  onNew,
  onLaunchTemplate,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenPast,
}: {
  templates: CompetitionTemplate[];
  past: SessionListItem[];
  busy: boolean;
  onPreset: (preset: (typeof LAUNCH_PRESETS)[number]) => void;
  onNew: () => void;
  onLaunchTemplate: (tpl: CompetitionTemplate, testMode?: boolean) => void;
  onEdit: (tpl: CompetitionTemplate) => void;
  onDuplicate: (tpl: CompetitionTemplate) => void;
  onDelete: (tpl: CompetitionTemplate) => void;
  onOpenPast: (id: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-3 py-5 sm:px-5">
      <div>
        <p className="ia-pixel text-[11px] text-ia-cyan">Gestionnaire d'événements</p>
        <h1 className="mt-1 text-4xl leading-tight">
          <Chrome>Tournois</Chrome>
        </h1>
        <p className="mt-2 text-sm text-ia-soft">Échecs, Mario Kart ou Smash Bros. Un bouton bascule le projecteur et les deux TV du comptoir ensemble.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {LAUNCH_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={busy}
            onClick={() => onPreset(preset)}
            className={`ia-px group flex min-h-[176px] flex-col items-start gap-2 px-4 pb-4 pt-4 text-left transition hover:brightness-125 disabled:opacity-40 ${
              preset.config.game === 'mariokart' ? 'ia-px--gold' : preset.config.game === 'smash' ? 'ia-px--pink' : 'ia-px--cyan'
            }`}
          >
            <GameGlyph game={preset.config.game} scale={4} />
            <span className="ia-display mt-1 text-3xl text-white">{preset.name}</span>
            <span className="text-xs leading-snug text-ia-soft">{preset.detail}</span>
            <span className="ia-btn ia-btn--pink ia-pixel mt-auto min-h-[48px] w-full text-sm">▶ Lancer</span>
          </button>
        ))}
      </div>

      <Btn variant="secondary" big full disabled={busy} onClick={onNew}>
        ＋ Nouvel événement sur mesure
      </Btn>

      <Card title={`Mes événements (${templates.length})`}>
        {templates.length === 0 ? (
          <p className="text-sm text-ia-soft">Aucun modèle enregistré. Crée un événement et enregistre-le pour le relancer en un clic.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => {
              const cfg = mergeConfig(tpl.config);
              return (
                <div key={tpl.id} className="ia-px ia-px--deep p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <GameGlyph game={cfg.game} scale={3} className="mt-1" />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-white">{tpl.name}</p>
                        <p className="text-xs text-ia-soft">
                          {cfg.game === 'mariokart' ? 'Mario Kart' : cfg.game === 'smash' ? 'Smash Bros' : 'Échecs'}
                          {' · '}
                          {cfg.format === 'waves' ? 'Salves' : 'Rondes suisses'}
                          {' · '}
                          {cfg.registrationMin} min d'inscription
                          {tpl.lastUsedAt ? ` · lancé le ${new Date(tpl.lastUsedAt).toLocaleDateString('fr-FR')}` : ''}
                        </p>
                      </div>
                    </div>
                    {cfg.testMode && <Badge tone="amber">Test</Badge>}
                  </div>
                  <p className="mt-1.5 text-xs text-ia-muted">{formatSummary({ config: cfg })}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Btn variant="primary" disabled={busy} onClick={() => onLaunchTemplate(tpl)}>
                      ▶ Lancer
                    </Btn>
                    <Btn disabled={busy} onClick={() => onEdit(tpl)}>
                      Modifier
                    </Btn>
                    <Btn disabled={busy} onClick={() => onDuplicate(tpl)}>
                      Dupliquer
                    </Btn>
                    <Btn variant="danger" disabled={busy} onClick={() => onDelete(tpl)}>
                      Supprimer
                    </Btn>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onLaunchTemplate(tpl, true)}
                    className="ia-pixel mt-2.5 min-h-[40px] text-[11px] text-ia-gold hover:brightness-125"
                  >
                    Lancer en mode test (écrans du bar non basculés)
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Événements passés">
        {past.length === 0 ? (
          <p className="text-sm text-ia-soft">Aucun événement terminé.</p>
        ) : (
          <div className="space-y-1">
            {past.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenPast(s.id)}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-2.5 font-bold text-ia-ink">
                  <PixelSprite sprite={CUP} scale={2} className="shrink-0 text-ia-muted" />
                  <span className="truncate">{s.quizName ?? 'Tournoi'}</span>
                  {s.testMode && <Badge tone="amber">test</Badge>}
                </span>
                <span className="shrink-0 text-xs text-ia-muted">{new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
