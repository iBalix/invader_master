/**
 * Boîte de dialogue de génération d'image produit par IA.
 *
 * Elle est montée EN DEHORS du <form> de ProductModalV2, volontairement : un
 * <form> imbriqué est du HTML invalide, et surtout la touche Entrée dans la zone
 * de texte du prompt soumettrait le formulaire parent, donc enregistrerait le
 * produit au lieu de générer. Pour la même raison, chaque bouton porte
 * explicitement type="button".
 *
 * z-[60] parce que la modale produit occupe déjà z-50.
 *
 * Rien n'est écrit en base ici : accepter appelle onAccept(url), qui alimente
 * form.image_url. Le produit n'est enregistré que par le bouton Enregistrer du
 * formulaire parent.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, X, RefreshCw, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

type Qualite = 'low' | 'medium' | 'high';

/** repères de coût affichés à l'utilisateur, ordre de grandeur constaté */
const COUT_PAR_QUALITE: Record<Qualite, string> = {
  low: '~0,01 €',
  medium: '~0,05 €',
  high: '~0,20 €',
};

interface ProduitReference {
  id: string;
  name: string;
  image_url: string | null;
}

interface Props {
  open: boolean;
  /** nom du produit en cours d'édition, pour préremplir la description */
  productName: string;
  onAccept: (url: string) => void;
  onClose: () => void;
}

export default function ImageGenModal({ open, productName, onAccept, onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<Qualite>('medium');
  const [candidats, setCandidats] = useState<ProduitReference[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [promptDeBase, setPromptDeBase] = useState('');
  const [generating, setGenerating] = useState(false);
  const [resultat, setResultat] = useState<{ url: string; bytes: number; cropped: boolean } | null>(null);

  const charger = useCallback(async () => {
    try {
      const [produits, reglages] = await Promise.all([
        api.get('/api/menu-products-v2'),
        api.get('/api/carte-settings'),
      ]);
      const items: ProduitReference[] = (produits.data?.items ?? []).filter(
        (p: ProduitReference) => p.image_url,
      );
      setCandidats(items);
      const r = reglages.data?.data ?? {};
      setPromptDeBase(r.image_gen_prompt ?? '');
      const defauts: string[] = r.image_gen_reference_product_ids ?? [];
      // on n'active que les références qui existent encore et ont une image
      setReferences(defauts.filter((id) => items.some((p) => p.id === id)));
    } catch {
      toast.error('Impossible de charger les références');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setResultat(null);
    setPrompt(productName ? `Photo de "${productName}"` : '');
    void charger();
  }, [open, productName, charger]);

  if (!open) return null;

  const basculer = (id: string) =>
    setReferences((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id],
    );

  const generer = async () => {
    if (generating || prompt.trim().length < 3) return;
    setGenerating(true);
    setResultat(null);
    try {
      const { data } = await api.post(
        '/api/menu-products-v2/generate-image',
        {
          prompt: prompt.trim(),
          referenceIds: references,
          quality,
          // Le même identifiant pour un clic : si l'intercepteur 401 rejoue la
          // requête après un refresh de jeton, le serveur renvoie l'image déjà
          // produite au lieu d'en facturer une seconde.
          requestId: crypto.randomUUID(),
        },
        // api.ts n'a pas de timeout global : sans celui-ci, un backend muet
        // laisserait la boîte tourner indéfiniment.
        { timeout: 180000 },
      );
      setResultat({ url: data.url, bytes: data.bytes, cropped: data.cropped });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erreur pendant la génération';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-500" />
            Générer une image
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {resultat ? (
            <>
              <img
                src={resultat.url}
                alt="Image générée"
                className="w-full aspect-video object-cover rounded-lg border"
              />
              <p className="text-xs text-gray-400">
                Aperçu au format exact des tables, en 16:9.
                {resultat.cropped && ' Le modèle a rendu un autre format, l\'image a été recadrée au centre.'}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void generer()}
                  disabled={generating}
                  title="Relance une génération, donc une nouvelle facturation"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" /> Regénérer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAccept(resultat.url);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
                >
                  <Check className="w-4 h-4" /> Utiliser cette image
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Que doit-on voir ?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, 1000))}
                  rows={3}
                  disabled={generating}
                  placeholder="Un cocktail bleu fumant dans un verre à pied, avec une rondelle de citron vert"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">{prompt.length}/1000</p>
              </div>

              {promptDeBase && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-gray-600">
                    Style appliqué à toutes les images
                  </summary>
                  <p className="mt-2 text-xs text-gray-500 whitespace-pre-line">{promptDeBase}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Modifiable dans les réglages de la carte.
                  </p>
                </details>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Visuels donnés en exemple
                  </label>
                  <span className="text-xs text-gray-400 tabular-nums">{references.length}/4</span>
                </div>
                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
                  {candidats.map((p) => {
                    const actif = references.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => basculer(p.id)}
                        disabled={generating}
                        title={p.name}
                        className={`relative aspect-video overflow-hidden rounded border-2 transition ${
                          actif ? 'border-primary-500' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img src={p.image_url ?? ''} alt={p.name} className="w-full h-full object-cover" />
                        {actif && (
                          <span className="absolute top-0.5 right-0.5 bg-primary-500 text-white rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {candidats.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Aucun produit avec image.</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Qualité</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as Qualite)}
                  disabled={generating}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="low">Basse</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                </select>
                <span className="text-xs text-gray-400">
                  {COUT_PAR_QUALITE[quality]} par génération, même si tu refuses le résultat.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={generating}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void generer()}
                  disabled={generating || prompt.trim().length < 3}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Génération, 20 à 60 s...' : 'Générer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
