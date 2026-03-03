import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import FileUpload from '../Quiz/FileUpload';

export interface TvConfigData {
  id?: string;
  name: string;
  youtube_videos: string[];
  media_video_urls: string[];
  media_image_urls: string[];
  target: string[];
}

interface Props {
  initial: TvConfigData | null;
  onSave: (data: TvConfigData) => Promise<void>;
  onClose: () => void;
}

const TARGET_OPTIONS = ['TV01', 'TV02', 'TV03', 'BAR01', 'BAR02', 'PROJO'];

export default function TvConfigModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [youtubeVideos, setYoutubeVideos] = useState<string[]>([]);
  const [mediaVideoUrls, setMediaVideoUrls] = useState<string[]>([]);
  const [mediaImageUrls, setMediaImageUrls] = useState<string[]>([]);
  const [target, setTarget] = useState<string[]>([]);
  const [newYoutube, setNewYoutube] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setYoutubeVideos(initial.youtube_videos ?? []);
      setMediaVideoUrls(initial.media_video_urls ?? []);
      setMediaImageUrls(initial.media_image_urls ?? []);
      setTarget(initial.target ?? []);
    }
  }, [initial]);

  const toggleTarget = (t: string) => {
    setTarget((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const addYoutube = () => {
    if (newYoutube.trim()) {
      setYoutubeVideos((prev) => [...prev, newYoutube.trim()]);
      setNewYoutube('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        youtube_videos: youtubeVideos,
        media_video_urls: mediaVideoUrls,
        media_image_urls: mediaImageUrls,
        target,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">
            {initial?.id ? 'Modifier la config TV' : 'Nouvelle config TV'}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cibles</label>
            <div className="flex flex-wrap gap-2">
              {TARGET_OPTIONS.map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={target.includes(t)}
                    onChange={() => toggleTarget(t)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vidéos YouTube ({youtubeVideos.length})
            </label>
            <div className="space-y-1 mb-2">
              {youtubeVideos.map((url, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                  <span className="text-xs text-gray-600 truncate flex-1 font-mono">{url}</span>
                  <button type="button" onClick={() => setYoutubeVideos((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newYoutube}
                onChange={(e) => setNewYoutube(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addYoutube(); } }}
                placeholder="ID YouTube (ex: dQw4w9WgXcQ)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button type="button" onClick={addYoutube} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vidéos média ({mediaVideoUrls.length})
            </label>
            <div className="space-y-1 mb-2">
              {mediaVideoUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                  <span className="text-xs text-gray-600 truncate flex-1">{url.split('/').pop()}</span>
                  <button type="button" onClick={() => setMediaVideoUrls((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <FileUpload label="" accept="video/*" value={null} onChange={(v) => { if (v) setMediaVideoUrls((prev) => [...prev, v]); }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Images média ({mediaImageUrls.length})
            </label>
            <div className="space-y-1 mb-2">
              {mediaImageUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                  <img src={url} alt="" className="w-12 h-8 rounded object-cover flex-shrink-0" />
                  <span className="text-xs text-gray-600 truncate flex-1">{url.split('/').pop()}</span>
                  <button type="button" onClick={() => setMediaImageUrls((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <FileUpload label="" accept="image/*" value={null} onChange={(v) => { if (v) setMediaImageUrls((prev) => [...prev, v]); }} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
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
