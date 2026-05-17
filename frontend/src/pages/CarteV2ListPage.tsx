import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import ProductModalV2, { type ProductV2Data } from '../components/CarteV2/ProductModalV2';
import CarteSettingsModal from '../components/CarteV2/CarteSettingsModal';
import LucideIcon from '../lib/LucideIcon';

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  is_main_category: boolean;
  weight: number;
  icon_name: string | null;
  color: string | null;
  productCount: number;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  price_hh: number | null;
  price_second: number | null;
  display_order: number;
  icon_url: string | null;
  categories: string[];
  conditionings: { label: string; price: number }[];
  variants: { label: string; color: string | null }[];
  tags: { id: string; name: string; color: string | null; icon_name: string | null }[];
}

type Tab = 'categories' | 'products';

export default function CarteV2ListPage() {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [productModal, setProductModal] = useState<{ open: boolean; editing: ProductV2Data | null }>({
    open: false,
    editing: null,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/menu-categories-v2');
      setCategories(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement des catégories');
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/api/menu-products-v2');
      setProducts(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement des produits');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadCategories(), loadProducts()]).finally(() => setLoading(false));
  }, [loadCategories, loadProducts]);

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Supprimer la catégorie "${name}" ?`)) return;
    try {
      await api.delete(`/api/menu-categories-v2/${id}`);
      toast.success('Catégorie supprimée');
      loadCategories();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Supprimer le produit "${name}" ?`)) return;
    try {
      await api.delete(`/api/menu-products-v2/${id}`);
      toast.success('Produit supprimé');
      loadProducts();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleProductSave = async (data: ProductV2Data) => {
    try {
      if (data.id) {
        await api.put(`/api/menu-products-v2/${data.id}`, data);
        toast.success('Produit mis à jour');
      } else {
        await api.post('/api/menu-products-v2', data);
        toast.success('Produit créé');
      }
      setProductModal({ open: false, editing: null });
      loadProducts();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.parent_id && !b.parent_id) return 1;
    if (!a.parent_id && b.parent_id) return -1;
    return a.weight - b.weight;
  });

  const buildCategoryTree = () => {
    const roots = sortedCategories.filter((c) => !c.parent_id);
    const children = sortedCategories.filter((c) => c.parent_id);
    const result: (CategoryRow & { indent: boolean })[] = [];
    for (const root of roots) {
      result.push({ ...root, indent: false });
      const subs = children.filter((c) => c.parent_id === root.id);
      for (const sub of subs) {
        result.push({ ...sub, indent: true });
      }
    }
    const orphans = children.filter(
      (c) => !roots.some((r) => r.id === c.parent_id),
    );
    for (const o of orphans) {
      result.push({ ...o, indent: true });
    }
    return result;
  };

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredProducts = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !p.categories.some((c) => selectedCategories.has(c)))
      return false;
    return true;
  });

  const treeCategories = buildCategoryTree();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Carte v2</h1>
          <p className="text-sm text-gray-500">Nouvelle carte (conditionnements, variantes, icônes)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            title="Paramètres de la carte"
          >
            <Settings className="w-4 h-4" />
            Paramètres
          </button>
          {tab === 'categories' ? (
            <Link
              to="/contenus/carte-v2/category/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
            >
              <Plus className="w-4 h-4" />
              Créer une catégorie
            </Link>
          ) : (
            <button
              onClick={() => setProductModal({ open: true, editing: null })}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
            >
              <Plus className="w-4 h-4" />
              Créer un produit
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('categories')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'categories' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Catégories ({categories.length})
        </button>
        <button
          onClick={() => setTab('products')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Produits ({products.length})
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : tab === 'categories' ? (
        treeCategories.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">Aucune catégorie</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 w-10">Icon</th>
                  <th className="px-6 py-3">Nom</th>
                  <th className="px-6 py-3">Parent</th>
                  <th className="px-6 py-3 text-center">Poids</th>
                  <th className="px-6 py-3 text-center">Produits</th>
                  <th className="px-6 py-3 text-center">Couleur</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {treeCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <LucideIcon name={c.icon_name} className="w-5 h-5 text-gray-500" />
                    </td>
                    <td className="px-6 py-4 font-medium">
                      <Link
                        to={`/contenus/carte-v2/category/${c.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {c.indent ? '└─ ' : ''}{c.name}
                      </Link>
                      {c.is_main_category && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          principal
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{c.parent_name ?? '—'}</td>
                    <td className="px-6 py-4 text-center text-gray-500 text-sm">{c.weight}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {c.productCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {c.color ? (
                        <span
                          className="inline-block w-6 h-6 rounded-full border border-gray-200 align-middle"
                          style={{ backgroundColor: c.color }}
                          title={c.color}
                        />
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/contenus/carte-v2/category/${c.id}`}
                          className="p-1.5 text-gray-400 hover:text-primary-500 transition"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDeleteCategory(c.id, c.name)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Filtrer :</span>
              {categories.map((c) => {
                const active = selectedCategories.has(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.name)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      active ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {c.name}
                    {active && <X className="w-3 h-3" />}
                  </button>
                );
              })}
              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
                >
                  Tout afficher
                </button>
              )}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Aucun produit trouvé</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Nom</th>
                    <th className="px-6 py-3 text-center">Prix</th>
                    <th className="px-6 py-3 text-center">Prix HH</th>
                    <th className="px-6 py-3 text-center">Cond.</th>
                    <th className="px-6 py-3 text-center">Var.</th>
                    <th className="px-6 py-3">Tags</th>
                    <th className="px-6 py-3">Catégories</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-medium">
                        <button
                          onClick={() => setProductModal({ open: true, editing: p as unknown as ProductV2Data })}
                          className="flex items-center gap-3 text-primary-600 hover:underline text-left"
                        >
                          {p.icon_url ? (
                            <img src={p.icon_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                          )}
                          {p.name}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-700">{p.price}€</td>
                      <td className="px-6 py-4 text-center text-gray-500">
                        {p.price_hh != null ? `${p.price_hh}€` : '—'}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-500 text-sm">
                        {p.conditionings && p.conditionings.length > 0 ? p.conditionings.length : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {p.variants && p.variants.length > 0 ? (
                          <div className="flex items-center justify-center gap-0.5">
                            {p.variants.slice(0, 5).map((v, i) => (
                              <span
                                key={i}
                                className="inline-block w-3 h-3 rounded-full border border-white shadow-sm"
                                style={{ backgroundColor: v.color ?? '#cccccc' }}
                                title={v.label}
                              />
                            ))}
                            {p.variants.length > 5 && (
                              <span className="text-xs text-gray-400 ml-1">+{p.variants.length - 5}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {p.tags && p.tags.length > 0 ? (
                            p.tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: t.color ? `${t.color}22` : '#f3f4f6',
                                  color: t.color ?? '#4b5563',
                                  borderColor: t.color ?? '#e5e7eb',
                                }}
                              >
                                {t.icon_name && <LucideIcon name={t.icon_name} className="w-3 h-3" />}
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {p.categories.length > 0
                            ? p.categories.map((cat, i) => (
                                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                  {cat}
                                </span>
                              ))
                            : <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setProductModal({ open: true, editing: p as unknown as ProductV2Data })}
                            className="p-1.5 text-gray-400 hover:text-primary-500 transition"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {productModal.open && (
        <ProductModalV2
          initial={productModal.editing}
          onSave={handleProductSave}
          onClose={() => setProductModal({ open: false, editing: null })}
        />
      )}

      <CarteSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
