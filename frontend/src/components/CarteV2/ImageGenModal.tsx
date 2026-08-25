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
import FileUpload from '../Quiz/FileUpload';

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

/**
 * Types compris par la règle conditionnelle du gabarit de prompt : l'un pose une
 * enseigne néon au nom du produit, l'autre une planche de service sans aucun
 * texte. Se tromper de branche donne une image inutilisable, d'où un choix
 * explicite plutôt qu'une devinette.
 */
const TYPES: { value: string; label: string }[] = [
  { value: 'cocktail', label: 'Cocktail (enseigne néon au nom)' },
  { value: 'shooter', label: 'Shooter (enseigne néon au nom)' },
  // "food dish" et non "food" : la valeur est aussi injectee dans l'accroche du
  // gabarit ("a {PRODUCT_TYPE}"), et "a food" se lit mal. Le mot food reste
  // present, donc la regle conditionnelle continue de se resoudre.
  { value: 'food dish', label: 'Plat ou dessert (planche, sans texte)' },
];

/** type deviné depuis les catégories du produit, ajustable ensuite */
function typeDepuisCategories(categories: string[]): string {
  const jointes = categories.join(' ').toLowerCase();
  if (jointes.includes('shooter')) return 'shooter';
  if (/sal[ée]|dessert|food/.test(jointes)) return 'food dish';
  return 'cocktail';
}

interface Props {
  open: boolean;
  /** nom du produit en cours d'édition, injecté dans le gabarit */
  productName: string;
  /** description de la fiche, transmise telle quelle à l'IA */
  productDescription: string;
  /** catégories du produit, pour deviner la branche du gabarit */
  productCategories: string[];
  onAccept: (url: string) => void;
  onClose: () => void;
}

export default function ImageGenModal({
  open,
  productName,
  productDescription,
  productCategories,
  onAccept,
  onClose,
}: Props) {
  const [specifics, setSpecifics] = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState('cocktail');
  /**
   * Photo reelle du produit, telle qu'il est servi au bar. Elle passe par
   * /api/upload comme n'importe quel fichier, donc elle arrive dans notre bucket
   * et franchit le filtre anti-SSRF du serveur. Elle prime sur les references de
   * style : celles-ci disent comment rendre, elle dit ce que c'est.
   */
  const [realPhotoUrl, setRealPhotoUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<Qualite>('medium');
  const [candidats, setCandidats] = useState<ProduitReference[]>([]);
  const [references, setReferences] = useState<string[]>([]);
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
    setSpecifics('');
    setRealPhotoUrl(null);
    setDescription(productDescription);
    setProductType(typeDepuisCategories(productCategories));
    void charger();
  }, [open, productDescription, productCategories, charger]);

  if (!open) return null;

  const basculer = (id: string) =>
    setReferences((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id],
    );

  const generer = async () => {
    if (generating) return;
    if (!realPhotoUrl && description.trim().length + specifics.trim().length < 3) return;
    setGenerating(true);
    setResultat(null);
    try {
      const { data } = await api.post(
        '/api/menu-products-v2/generate-image',
        {
          productName,
          productType,
          description: description.trim(),
          specifics: specifics.trim(),
          referenceIds: references,
          realPhotoUrl,
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
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">
                  Produit&nbsp;: <strong className="text-gray-700">{productName || '(sans nom)'}</strong>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Le style, le cadrage et l'ambiance viennent des réglages de la carte. Tu n'écris
                  ici que ce qui change d'une image à l'autre.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  disabled={generating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Deviné depuis la catégorie du produit. Il décide de la mise en scène&nbsp;: une
                  enseigne néon au nom du produit pour un verre, une planche sans aucun texte pour
                  un plat.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description du produit
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 1200))}
                  rows={2}
                  disabled={generating}
                  placeholder="Curaçao, vodka, jus de fraise, sirop de grenadine et citron"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Reprise de la fiche produit. La modifier ici ne modifie pas la fiche.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Précisions pour cette image <span className="text-gray-400">(optionnel)</span>
                </label>
                <textarea
                  value={specifics}
                  onChange={(e) => setSpecifics(e.target.value.slice(0, 800))}
                  rows={2}
                  disabled={generating}
                  placeholder="Verre à pied givré, fumée légère, rondelle de citron vert sur le bord"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400 tabular-nums">{specifics.length}/800</p>
              </div>

              <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-3">
                <FileUpload
                  label="Photo réelle du produit (optionnel)"
                  accept="image/*"
                  value={realPhotoUrl}
                  onChange={setRealPhotoUrl}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Une photo du produit tel qu'il est vraiment servi. Elle passe avant tout le reste :
                  l'IA reprendra sa couleur, son verre ou son assiette, sa garniture et ses
                  proportions, et ne changera que le rendu, la lumière et le décor.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Visuels donnés en exemple de style
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
                  disabled={
                    generating ||
                    (!realPhotoUrl && description.trim().length + specifics.trim().length < 3)
                  }
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
