import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import LucideIcon from '../../lib/LucideIcon';
import LucideIconPicker from './LucideIconPicker';

export interface Tag {
  id: string;
  name: string;
  name_en?: string | null;
  color?: string | null;
  icon_name?: string | null;
  position?: number;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export default function TagSelector({ value, onChange }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Echec de chargement de la LISTE des tags, a ne pas confondre avec une liste
   * vide. Sans cette distinction, une requete qui echoue affichait "Aucun tag
   * defini" : l'utilisateur en deduit que les mentions de son produit ont
   * disparu, alors que la selection est intacte en base et sera renvoyee telle
   * quelle a l'enregistrement.
   */
  const [echec, setEchec] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>('#16a34a');
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/menu-tags-v2');
      setTags(data.items ?? []);
      setEchec(false);
    } catch {
      setEchec(true);
      toast.error('Erreur de chargement des tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    const has = value.includes(id);
    onChange(has ? value.filter((v) => v !== id) : [...value, id]);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/api/menu-tags-v2', {
        name: newName.trim(),
        color: newColor,
        icon_name: newIcon,
        position: tags.length,
      });
      const created: Tag = data.tag;
      setTags((prev) => [...prev, created]);
      onChange([...value, created.id]);
      setNewName('');
      setNewColor('#16a34a');
      setNewIcon(null);
      setCreating(false);
      toast.success('Tag créé');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erreur création tag';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Tags
        </label>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600 transition"
        >
          <Plus className="w-3 h-3" /> Nouveau tag
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : echec ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <div className="font-medium">Liste des tags indisponible.</div>
          <p className="mt-0.5">
            Les tags déjà posés sur ce produit sont conservés : enregistrer ne les supprimera pas.
            Ils ne sont simplement pas modifiables tant que la liste n'est pas chargée.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1.5 rounded border border-amber-400 px-2 py-1 font-medium hover:bg-amber-100 transition"
          >
            Réessayer
          </button>
        </div>
      ) : tags.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Aucun tag défini. Crée le premier via "Nouveau tag".
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = value.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition ${
                  active
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
                style={
                  active && t.color
                    ? { backgroundColor: t.color, borderColor: t.color }
                    : undefined
                }
              >
                {t.icon_name && <LucideIcon name={t.icon_name} className="w-3.5 h-3.5" />}
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Bio, Vegan, Sans gluten…"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Couleur</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor ?? '#16a34a'}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={newColor ?? ''}
                  onChange={(e) => setNewColor(e.target.value || null)}
                  placeholder="#RRGGBB"
                  className="flex-1 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Icône (optionnel)</label>
            <LucideIconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={saving || !newName.trim()}
              onClick={handleCreate}
              className="px-3 py-1.5 text-xs bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? 'Création...' : 'Créer le tag'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
