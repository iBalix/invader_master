import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import FileUpload from '../Quiz/FileUpload';

export interface GameConsoleV2Data {
  id?: string;
  name: string;
  display_name: string | null;
  library: string;
  logo_url: string | null;
}

interface Props {
  initial: GameConsoleV2Data | null;
  onSave: (data: GameConsoleV2Data) => Promise<void>;
  onClose: () => void;
}

export default function GameConsoleV2Modal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [library, setLibrary] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setDisplayName(initial.display_name ?? '');
      setLibrary(initial.library ?? '');
      setLogoUrl(initial.logo_url ?? null);
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !library.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        display_name: displayName.trim() || null,
        library: library.trim(),
        logo_url: logoUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">
            {initial?.id ? 'Modifier la console' : 'Nouvelle console'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Super Nintendo Entertainment System"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-400">Nom officiel / complet (peut être long).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom affiché (bornes)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex : SNES"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">Court, lisible. Affiché sur les cards et modales des tables tactiles. Vide = utilise le nom complet.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom Library *</label>
            <input
              type="text"
              value={library}
              onChange={(e) => setLibrary(e.target.value)}
              placeholder="Ex : snes9x, genesis_plus_gx..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
            <p className="mt-1 text-xs text-gray-400">Nom du core RetroArch utilisé pour lancer les jeux</p>
          </div>

          <div>
            <FileUpload
              label="Logo"
              accept="image/*"
              value={logoUrl}
              onChange={(v) => setLogoUrl(v)}
            />
            <p className="mt-1 text-xs text-gray-400">
              PNG à fond transparent, hauteur 120 px environ. Sert à l'ancien site : il n'est pas
              affiché sur les nouvelles tables aujourd'hui, seul le nom de la console y apparaît.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !library.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial?.id ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
