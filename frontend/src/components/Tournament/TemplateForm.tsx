/**
 * Formulaire d'un événement : sert à créer ou modifier un modèle enregistré
 * (« config d'event » relançable), et à lancer directement.
 *
 * Mise en page calée sur SA largeur (pas sur la fenêtre) : une colonne au
 * téléphone de l'animateur comme dans le cadre téléphone du labo.
 */

import { useState } from 'react';
import { DEFAULT_TOURNAMENT_INPUT, type TournamentConfigInput } from '../../game/tournament/tournamentTypes';
import { formatSummary } from '../../game/tournament/tournamentClient';
import { Btn, Card, Field, NarrowContext, NumberInput, Segmented, Toggle, inputClass, useMeasuredNarrow } from './ui';

export function mergeConfig(partial: Partial<TournamentConfigInput> | undefined): TournamentConfigInput {
  const p = partial ?? {};
  return {
    ...DEFAULT_TOURNAMENT_INPUT,
    ...p,
    match: { ...DEFAULT_TOURNAMENT_INPUT.match, ...(p.match ?? {}) },
    points: { ...DEFAULT_TOURNAMENT_INPUT.points, ...(p.points ?? {}) },
    display: { ...DEFAULT_TOURNAMENT_INPUT.display, ...(p.display ?? {}) },
    texts: { ...DEFAULT_TOURNAMENT_INPUT.texts, ...(p.texts ?? {}) },
  };
}

export interface TemplateFormValue {
  name: string;
  config: TournamentConfigInput;
}

export default function TemplateForm({
  initial,
  busy,
  isEdit,
  onSave,
  onLaunch,
  onCancel,
}: {
  initial: TemplateFormValue;
  busy: boolean;
  isEdit: boolean;
  onSave: (v: TemplateFormValue) => void;
  onLaunch: (v: TemplateFormValue, save: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [cfg, setCfg] = useState<TournamentConfigInput>(initial.config);
  const set = <K extends keyof TournamentConfigInput>(k: K, v: TournamentConfigInput[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const value = (): TemplateFormValue => ({ name: name.trim(), config: { ...cfg, title: cfg.title.trim() || name.trim() } });
  const multi = cfg.match.games > 1;
  const canSave = name.trim().length > 0;
  const [ref, narrow] = useMeasuredNarrow(560);
  const pair = narrow ? 'grid gap-4' : 'grid grid-cols-2 gap-4';

  return (
    <NarrowContext.Provider value={narrow}>
      <div ref={ref} className="space-y-4">
        <Card title={isEdit ? 'Modifier l’événement' : 'Nouvel événement'}>
          <div className={pair}>
            <Field label="Nom du modèle" hint="Pour le retrouver et le relancer en un clic">
              <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Tournoi d'échecs du jeudi" />
            </Field>
            <Field label="Titre affiché sur les écrans" hint="Vide = le nom du modèle">
              <input className={inputClass} value={cfg.title} maxLength={60} onChange={(e) => set('title', e.target.value)} placeholder={name || 'Tournoi'} />
            </Field>
            <Field label="Mode de compétition">
              <Segmented value={cfg.format} options={[{ value: 'swiss', label: 'Rondes suisses' }]} onChange={(v) => set('format', v)} />
            </Field>
            <Field label="Jeu" hint="Résultats remontés automatiquement depuis les tables d'échecs">
              <Segmented value={cfg.game} options={[{ value: 'chess', label: '♞ Échecs' }]} onChange={(v) => set('game', v)} />
            </Field>
          </div>
        </Card>

        <Card title="Inscriptions">
          <div className={pair}>
            <Field label="Compte à rebours (minutes)" hint="Du lancement au tirage de la ronde 1">
              <NumberInput value={cfg.registrationMin} min={1} max={120} onChange={(v) => set('registrationMin', Math.max(1, Math.min(120, Math.round(v))))} />
            </Field>
            <Field label="Rondes prévues" hint="Affichage « Ronde 2/5 » seulement, 0 = libre">
              <NumberInput value={cfg.plannedRounds ?? 0} min={0} max={20} onChange={(v) => set('plannedRounds', v > 0 ? Math.min(20, Math.round(v)) : null)} />
            </Field>
          </div>
          <div className="mt-3">
            <Toggle
              checked={cfg.lateJoin}
              onChange={(v) => set('lateJoin', v)}
              label="Inscription en cours de tournoi"
              hint="Le QR reste sur les TV, le retardataire joue dès la ronde suivante (0 point)"
            />
          </div>
        </Card>

        <Card title="Matchs">
          <div className="space-y-4">
            <Field label="Nombre de parties par match">
              <Segmented
                value={cfg.match.games}
                options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => set('match', { ...cfg.match, games: v })}
              />
            </Field>
            <Field label="Décision du match">
              <Segmented
                value={cfg.match.decide}
                disabled={!multi}
                options={[
                  { value: 'best_of', label: 'Au meilleur de' },
                  { value: 'all', label: 'Toutes les parties' },
                ]}
                onChange={(v) => set('match', { ...cfg.match, decide: v })}
              />
            </Field>
            <Field label="Barème appliqué" hint="Par partie : chaque partie rapporte ses points (aller-retour à 2 x 2 points)">
              <Segmented
                value={cfg.match.scoring}
                disabled={!multi}
                options={[
                  { value: 'match', label: 'Au résultat du match' },
                  { value: 'game', label: 'À chaque partie' },
                ]}
                onChange={(v) => set('match', { ...cfg.match, scoring: v })}
              />
            </Field>
          </div>
        </Card>

        <Card title="Points">
          <div className={`grid gap-3 ${narrow ? 'grid-cols-2' : 'grid-cols-4'}`}>
            <Field label="Victoire">
              <NumberInput value={cfg.points.win} step={0.5} min={0} max={100} onChange={(v) => set('points', { ...cfg.points, win: v })} />
            </Field>
            <Field label="Nul">
              <NumberInput value={cfg.points.draw} step={0.5} min={0} max={100} onChange={(v) => set('points', { ...cfg.points, draw: v })} />
            </Field>
            <Field label="Défaite">
              <NumberInput value={cfg.points.loss} step={0.5} min={0} max={100} onChange={(v) => set('points', { ...cfg.points, loss: v })} />
            </Field>
            <Field label="Forfait (gagnant)">
              <NumberInput value={cfg.points.forfeit} step={0.5} min={0} max={100} onChange={(v) => set('points', { ...cfg.points, forfeit: v })} />
            </Field>
          </div>
        </Card>

        <Card title="Nombre impair de joueurs">
          <Segmented
            value={cfg.byePolicy}
            options={[
              { value: 'floater', label: 'L’exempt attend un joueur libéré' },
              { value: 'points', label: 'Points d’exempt d’office' },
            ]}
            onChange={(v) => set('byePolicy', v)}
          />
          <p className="mt-2 text-xs text-slate-500">
            {cfg.byePolicy === 'floater'
              ? "Au premier match terminé de la ronde, un de ses deux joueurs (tiré au hasard) affronte l'exempt. Seul l'exempt marque des points."
              : "L'exempt marque les points ci-dessous sans jouer."}
          </p>
          {cfg.byePolicy === 'points' && (
            <div className="mt-3 max-w-[12rem]">
              <Field label="Points d'exempt">
                <NumberInput value={cfg.points.bye} step={0.5} min={0} max={100} onChange={(v) => set('points', { ...cfg.points, bye: v })} />
              </Field>
            </div>
          )}
        </Card>

        <Card title="Projecteur">
          <p className="mb-3 text-xs text-slate-500">Rotation pendant une ronde, durées en secondes : classement, puis matchs de la ronde, puis un match en direct.</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Classement">
              <NumberInput value={cfg.display.standingsMs / 1000} min={10} max={300} onChange={(v) => set('display', { ...cfg.display, standingsMs: Math.round(Math.min(300, Math.max(10, v))) * 1000 })} />
            </Field>
            <Field label="Matchs">
              <NumberInput value={cfg.display.roundMs / 1000} min={10} max={300} onChange={(v) => set('display', { ...cfg.display, roundMs: Math.round(Math.min(300, Math.max(10, v))) * 1000 })} />
            </Field>
            <Field label="En direct" hint="0 = jamais">
              <NumberInput value={cfg.display.liveMs / 1000} min={0} max={900} onChange={(v) => set('display', { ...cfg.display, liveMs: Math.round(Math.min(900, Math.max(0, v))) * 1000 })} />
            </Field>
          </div>
        </Card>

        <Card title="Écrans du bar">
          <div className={pair}>
            <Field label="WiFi (nom)">
              <input className={inputClass} value={cfg.wifiSsid} maxLength={40} onChange={(e) => set('wifiSsid', e.target.value)} />
            </Field>
            <Field label="WiFi (mot de passe)">
              <input className={inputClass} value={cfg.wifiPassword} maxLength={40} onChange={(e) => set('wifiPassword', e.target.value)} />
            </Field>
            <div className={narrow ? '' : 'col-span-2'}>
              <Field label="Phrase du podium" hint="#winner# = pseudo du vainqueur">
                <input className={inputClass} value={cfg.texts.winner} maxLength={140} onChange={(e) => set('texts', { winner: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-3">
            <Toggle
              checked={cfg.testMode}
              onChange={(v) => set('testMode', v)}
              label="Tournoi de test"
              hint="Ni bascule des écrans du bar, ni blocage du quiz, invisible pour les tables"
            />
          </div>
        </Card>

        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">{formatSummary({ config: cfg })}</p>

        <div className={narrow ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
          <Btn variant="primary" big disabled={busy || !canSave} onClick={() => onLaunch(value(), true)}>
            🚀 Enregistrer et lancer
          </Btn>
          <Btn variant="secondary" big disabled={busy || !canSave} onClick={() => onSave(value())}>
            💾 Enregistrer le modèle
          </Btn>
          <Btn variant="secondary" big disabled={busy} onClick={() => onLaunch(value(), false)}>
            Lancer sans enregistrer
          </Btn>
          <Btn variant="secondary" big disabled={busy} onClick={onCancel}>
            Annuler
          </Btn>
        </div>
      </div>
    </NarrowContext.Provider>
  );
}
