import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  Loader2,
  GripVertical,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import ProductModal, { type ProductData } from '../components/Carte/ProductModal';

interface CategoryForm {
  name: string;
  parent_id: string | null;
  is_main_category: boolean;
  weight: number;
  begin_hour: string;
  end_hour: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

const EMPTY: CategoryForm = {
  name: '',
  parent_id: null,
  is_main_category: false,
  weight: 0,
  begin_hour: '',
  end_hour: '',
};

export default function CategoryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<CategoryForm>({ ...EMPTY });
  const [products, setProducts] = useState<ProductData[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [productModal, setProductModal] = useState<{
    open: boolean;
    editing: ProductData | null;
    editIdx: number | null;
  }>({ open: false, editing: null, editIdx: null });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductData[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const set = <K extends keyof CategoryForm>(key: K, val: CategoryForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const loadCategory = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get(`/api/menu-categories/${id}`);
      const c = data.category;
      setForm({
        name: c.name ?? '',
        parent_id: c.parent_id ?? null,
        is_main_category: c.is_main_category ?? false,
        weight: c.weight ?? 0,
        begin_hour: c.begin_hour ?? '',
        end_hour: c.end_hour ?? '',
      });
      setProducts(c.products ?? []);
    } catch {
      toast.error('Catégorie introuvable');
      navigate('/contenus/carte');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);

  useEffect(() => {
    api.get('/api/menu-categories').then(({ data }) => {
      const items = (data.items ?? [])
        .filter((c: CategoryOption) => c.id !== id)
        .map((c: CategoryOption) => ({ id: c.id, name: c.name }));
      setAllCategories(items);
    });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        parent_id: form.parent_id || null,
        begin_hour: form.begin_hour || null,
        end_hour: form.end_hour || null,
        product_ids: products.map((p) => p.id).filter(Boolean),
      };

      if (isEdit) {
        await api.put(`/api/menu-categories/${id}`, payload);
        toast.success('Catégorie mise à jour');
      } else {
        const { data } = await api.post('/api/menu-categories', payload);
        toast.success('Catégorie créée');
        navigate(`/contenus/carte/category/${data.category.id}`, { replace: true });
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSearchExisting = useCallback(
    async (query?: string) => {
      setSearchLoading(true);
      try {
        const params: Record<string, string> = {};
        const q = (query ?? searchQuery).trim();
        if (q) params.search = q;
        const { data } = await api.get('/api/menu-products', { params });
        setSearchResults(data.items ?? []);
      } catch {
        toast.error('Erreur de recherche');
      } finally {
        setSearchLoading(false);
      }
    },
    [searchQuery],
  );

  const addExistingProduct = (p: ProductData) => {
    setProducts((prev) => [...prev, p]);
    toast.success('Produit ajouté');
  };

  const handleMoveProduct = (from: number, to: number) => {
    if (to < 0 || to >= products.length) return;
    setProducts((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleRemoveProduct = (idx: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleProductSave = async (data: ProductData) => {
    try {
      if (data.id) {
        await api.put(`/api/menu-products/${data.id}`, data);
        setProducts((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, ...data } : p)),
        );
        toast.success('Produit mis à jour');
      } else {
        const { data: res } = await api.post('/api/menu-products', data);
        const created = { ...data, ...res.product };
        setProducts((prev) => [...prev, created]);
        toast.success('Produit créé et ajouté');
      }
      setProductModal({ open: false, editing: null, editIdx: null });
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => navigate('/contenus/carte')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Retour à la carte
      </button>

      <h1 className="text-2xl font-bold mb-6">
        {isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      </h1>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Informations</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie parente</label>
              <select
                value={form.parent_id ?? ''}
                onChange={(e) => set('parent_id', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">— Aucun (catégorie racine)</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poids (tri)</label>
              <input
                type="number"
                value={form.weight}
                onChange={(e) => set('weight', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-400">
                Tri croissant : les valeurs les plus basses apparaissent en premier
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure début</label>
              <input
                type="time"
                value={form.begin_hour}
                onChange={(e) => set('begin_hour', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure fin</label>
              <input
                type="time"
                value={form.end_hour}
                onChange={(e) => set('end_hour', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => set('is_main_category', !form.is_main_category)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                form.is_main_category ? 'bg-primary-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  form.is_main_category ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Catégorie principale (1er niveau)</span>
          </label>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Produits associés{' '}
              <span className="text-gray-400 font-normal">({products.length})</span>
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !searchOpen;
                  setSearchOpen(next);
                  setSearchQuery('');
                  setSearchResults([]);
                  if (next) handleSearchExisting('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Search className="w-3.5 h-3.5" /> Ajouter existant
              </button>
              <button
                type="button"
                onClick={() =>
                  setProductModal({ open: true, editing: null, editIdx: null })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Créer un produit
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchExisting();
                    }
                  }}
                  placeholder="Rechercher un produit..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleSearchExisting()}
                  disabled={searchLoading}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm disabled:opacity-50"
                >
                  {searchLoading ? 'Recherche...' : 'Rechercher'}
                </button>
              </div>
              {searchResults.length > 0 &&
                (() => {
                  const existingIds = new Set(products.map((p) => p.id));
                  return (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {searchResults.map((p) => {
                        const alreadyAdded = existingIds.has(p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between p-2 rounded border transition ${
                              alreadyAdded
                                ? 'bg-gray-100 border-gray-200 opacity-60'
                                : 'bg-white hover:border-primary-300'
                            }`}
                          >
                            <span className="text-sm truncate flex-1">
                              {p.name}
                              <span className="ml-2 text-xs text-gray-400">{p.price}€</span>
                            </span>
                            {alreadyAdded ? (
                              <span className="ml-2 px-2 py-1 text-xs text-gray-400">
                                Déjà ajouté
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addExistingProduct(p)}
                                className="ml-2 px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600 transition"
                              >
                                Ajouter
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              {searchResults.length === 0 && !searchLoading && (
                <p className="text-sm text-gray-400">
                  {searchQuery
                    ? 'Aucun produit ne correspond à la recherche'
                    : 'Aucun produit disponible'}
                </p>
              )}
            </div>
          )}

          {products.length === 0 ? (
            <p className="text-center py-8 text-gray-400">
              Aucun produit associé. Ajoutez-en via la recherche ou créez-en un nouveau.
            </p>
          ) : (
            <div className="space-y-1">
              {products.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition"
                >
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-gray-500">{p.price}€</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveProduct(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveProduct(idx, idx + 1)}
                      disabled={idx === products.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setProductModal({ open: true, editing: p, editIdx: idx })
                      }
                      className="p-1 text-gray-400 hover:text-primary-500"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(idx)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/contenus/carte')}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer la catégorie'}
          </button>
        </div>
      </form>

      {productModal.open && (
        <ProductModal
          initial={productModal.editing}
          onSave={handleProductSave}
          onClose={() =>
            setProductModal({ open: false, editing: null, editIdx: null })
          }
        />
      )}
    </div>
  );
}
