/**
 * Page Contenus > Evenements.
 *
 * CRUD sur la table `events` (anciennement `projector_events`).
 * Ces events sont utilises :
 *   - Sur l'ecran projecteur (projo.php legacy)
 *   - Sur l'ecran d'accueil des tables tactiles (bloc "next event") quand
 *     aucun event n'est live (sinon c'est `live_event_state` qui prend le relais).
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Calendar, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import EventModal, { type EventData } from '../components/Events/EventModal';

interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  icon: string | null;
  active: boolean;
  cta_redirect_url: string | null;
  created_at?: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: EventData | null }>({
    open: false,
    editing: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/events');
      setEvents(data.events ?? data ?? []);
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(data: EventData) {
    try {
      if (data.id) {
        await api.put(`/api/events/${data.id}`, data);
        toast.success('Evenement modifie');
      } else {
        await api.post('/api/events', data);
        toast.success('Evenement cree');
      }
      setModal({ open: false, editing: null });
      load();
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  async function handleDelete(ev: Event) {
    if (!confirm(`Supprimer "${ev.name}" ?`)) return;
    try {
      await api.delete(`/api/events/${ev.id}`);
      toast.success('Supprime');
      load();
    } catch {
      toast.error('Erreur suppression');
    }
  }

  async function handleToggleActive(ev: Event) {
    try {
      await api.put(`/api/events/${ev.id}`, {
        ...ev,
        active: !ev.active,
      });
      load();
    } catch {
      toast.error('Erreur');
    }
  }

  const sorted = [...events].sort((a, b) => +new Date(a.date) - +new Date(b.date));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Evenements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quizz, soirees thematiques, tournois... Affiches sur le projecteur et sur les
            tables tactiles.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun evenement programme</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Icone</th>
                <th className="px-4 py-3">CTA</th>
                <th className="px-4 py-3 text-center">Actif</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((ev) => {
                const d = new Date(ev.date);
                const past = d.getTime() < Date.now();
                return (
                  <tr
                    key={ev.id}
                    className={`hover:bg-gray-50 ${!ev.active || past ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="font-medium">{d.toLocaleDateString('fr-FR')}</div>
                      <div className="text-xs text-gray-500">
                        {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {past && (
                        <span className="text-xs text-orange-500 font-medium">passe</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{ev.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {ev.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{ev.icon || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {ev.cta_redirect_url ? (
                        <a
                          href={ev.cta_redirect_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary-500 hover:underline font-mono"
                        >
                          {ev.cta_redirect_url.length > 25
                            ? ev.cta_redirect_url.slice(0, 25) + '...'
                            : ev.cta_redirect_url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(ev)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          ev.active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            ev.active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setModal({
                              open: true,
                              editing: {
                                id: ev.id,
                                name: ev.name,
                                description: ev.description ?? '',
                                date: ev.date,
                                icon: ev.icon,
                                active: ev.active,
                                cta_redirect_url: ev.cta_redirect_url,
                              },
                            })
                          }
                          className="p-1.5 text-gray-400 hover:text-primary-500"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(ev)}
                          className="p-1.5 text-gray-400 hover:text-red-500"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <EventModal
          initial={modal.editing}
          onSave={handleSave}
          onClose={() => setModal({ open: false, editing: null })}
        />
      )}
    </div>
  );
}
