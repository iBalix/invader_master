import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Download, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import TranslationModal from '../components/Translations/TranslationModal';
import ImportTranslationsModal from '../components/Translations/ImportTranslationsModal';

interface TranslationRow {
  id: string;
  key: string;
  value_fr: string;
  value_en: string;
}

export default function TranslationsPage() {
  const [translations, setTranslations] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [edited, setEdited] = useState<Record<string, { value_fr: string; value_en: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/translations');
      setTranslations(data.items ?? []);
      setEdited({});
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (id: string, field: 'value_fr' | 'value_en', value: string) => {
    const row = translations.find((t) => t.id === id);
    if (!row) return;

    setEdited((prev) => ({
      ...prev,
      [id]: {
        value_fr: prev[id]?.value_fr ?? row.value_fr,
        value_en: prev[id]?.value_en ?? row.value_en,
        [field]: value,
      },
    }));
  };

  const isEdited = (id: string) => {
    const e = edited[id];
    if (!e) return false;
    const row = translations.find((t) => t.id === id);
    if (!row) return false;
    return e.value_fr !== row.value_fr || e.value_en !== row.value_en;
  };

  const handleSaveRow = async (id: string) => {
    const e = edited[id];
    if (!e) return;
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      await api.put(`/api/translations/${id}`, { value_fr: e.value_fr, value_en: e.value_en });
      toast.success('Sauvegardé');
      setTranslations((prev) =>
        prev.map((t) => (t.id === id ? { ...t, value_fr: e.value_fr, value_en: e.value_en } : t)),
      );
      setEdited((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id: string, key: string) => {
    if (!confirm(`Supprimer la clé "${key}" ?`)) return;
    try {
      await api.delete(`/api/translations/${id}`);
      toast.success('Clé supprimée');
      load();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleCreate = async (data: { key: string; value_fr: string; value_en: string }) => {
    try {
      await api.post('/api/translations', data);
      toast.success('Clé créée');
      setCreateOpen(false);
      load();
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Traductions</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <Download className="w-4 h-4" />
            Importer depuis Contentful
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
          >
            <Plus className="w-4 h-4" />
            Ajouter une clé
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : translations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Aucune traduction</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-1/4">Clé</th>
                <th className="px-4 py-3">Valeur FR</th>
                <th className="px-4 py-3">Valeur EN</th>
                <th className="px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {translations.map((t) => {
                const e = edited[t.id];
                const changed = isEdited(t.id);
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-gray-700">{t.key}</span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={e?.value_fr ?? t.value_fr}
                        onChange={(ev) => handleFieldChange(t.id, 'value_fr', ev.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={e?.value_en ?? t.value_en}
                        onChange={(ev) => handleFieldChange(t.id, 'value_en', ev.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {changed && (
                          <button
                            onClick={() => handleSaveRow(t.id)}
                            disabled={saving[t.id]}
                            className="p-1.5 text-green-600 hover:text-green-700 transition disabled:opacity-50"
                            title="Sauvegarder"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t.id, t.key)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition"
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

      {importOpen && (
        <ImportTranslationsModal
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}

      {createOpen && (
        <TranslationModal
          onSave={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
