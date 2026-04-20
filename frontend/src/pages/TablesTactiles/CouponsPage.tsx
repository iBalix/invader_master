/**
 * Page Tables tactiles > Codes promo (coupons).
 *
 * CRUD sur la table `coupons`.
 * Types de remise :
 *   - percentage : pourcentage du sous-total
 *   - amount : montant fixe en euros
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Tag, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'amount';
  discount_value: number;
  min_order_amount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number;
  active: boolean;
}

interface FormData {
  id?: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'amount';
  discount_value: number;
  min_order_amount: string;
  valid_from: string;
  valid_until: string;
  max_uses: string;
  active: boolean;
}

const EMPTY: FormData = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: 10,
  min_order_amount: '',
  valid_from: '',
  valid_until: '',
  max_uses: '',
  active: true,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<FormData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/coupons');
      setCoupons(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!modal) return;
    try {
      const payload = {
        code: modal.code.trim().toUpperCase(),
        description: modal.description.trim() || null,
        discount_type: modal.discount_type,
        discount_value: modal.discount_value,
        min_order_amount: modal.min_order_amount ? Number(modal.min_order_amount) : null,
        valid_from: fromLocalInput(modal.valid_from),
        valid_until: fromLocalInput(modal.valid_until),
        max_uses: modal.max_uses ? Number(modal.max_uses) : null,
        active: modal.active,
      };
      if (modal.id) {
        await api.put(`/api/coupons/${modal.id}`, payload);
        toast.success('Coupon modifie');
      } else {
        await api.post('/api/coupons', payload);
        toast.success('Coupon cree');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur');
    }
  }

  async function handleDelete(c: Coupon) {
    if (!confirm(`Supprimer le coupon ${c.code} ?`)) return;
    try {
      await api.delete(`/api/coupons/${c.id}`);
      toast.success('Supprime');
      load();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleToggleActive(c: Coupon) {
    try {
      await api.put(`/api/coupons/${c.id}`, { active: !c.active });
      load();
    } catch {
      toast.error('Erreur');
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success('Code copie');
  }

  function openEdit(c: Coupon) {
    setModal({
      id: c.id,
      code: c.code,
      description: c.description ?? '',
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      min_order_amount: c.min_order_amount?.toString() ?? '',
      valid_from: toLocalInput(c.valid_from),
      valid_until: toLocalInput(c.valid_until),
      max_uses: c.max_uses?.toString() ?? '',
      active: c.active,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Codes promo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reductions appliquees au passage de commande depuis les tables tactiles.
          </p>
        </div>
        <button
          onClick={() => setModal({ ...EMPTY })}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau code
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun coupon</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Reduction</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3">Validite</th>
                <th className="px-4 py-3">Usages</th>
                <th className="px-4 py-3 text-center">Actif</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map((c) => {
                const expired =
                  c.valid_until && new Date(c.valid_until).getTime() < Date.now();
                const exhausted = c.max_uses != null && c.current_uses >= c.max_uses;
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-50 ${
                      !c.active || expired || exhausted ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyCode(c.code)}
                        className="font-mono text-sm font-semibold inline-flex items-center gap-1 hover:text-primary-500"
                        title="Copier"
                      >
                        {c.code}
                        <Copy className="w-3 h-3 opacity-50" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {c.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {c.discount_type === 'percentage'
                        ? `${c.discount_value}%`
                        : `${Number(c.discount_value).toFixed(2)}€`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {c.min_order_amount ? `${c.min_order_amount}€` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.valid_until ? (
                        <>
                          jusqu'au {new Date(c.valid_until).toLocaleDateString('fr-FR')}
                          {expired && (
                            <span className="block text-red-500 font-medium">expire</span>
                          )}
                        </>
                      ) : (
                        'illimitee'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.current_uses}
                      {c.max_uses != null && ` / ${c.max_uses}`}
                      {exhausted && (
                        <span className="block text-red-500 font-medium">epuise</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          c.active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            c.active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-gray-400 hover:text-primary-500"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
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

      {modal && (
        <CouponEditModal
          data={modal}
          onChange={(d) => setModal(d)}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function CouponEditModal({
  data,
  onChange,
  onSave,
  onClose,
}: {
  data: FormData;
  onChange: (d: FormData) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    onChange({ ...data, [k]: v });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">{data.id ? 'Modifier' : 'Nouveau'} coupon</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <input
              type="text"
              value={data.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              required
              placeholder="HAPPY10"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={data.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={data.discount_type}
                onChange={(e) => set('discount_type', e.target.value as FormData['discount_type'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="percentage">Pourcentage (%)</option>
                <option value="amount">Montant (€)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valeur *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={data.discount_value}
                onChange={(e) => set('discount_value', Number(e.target.value))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant minimum de commande (€)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={data.min_order_amount}
              onChange={(e) => set('min_order_amount', e.target.value)}
              placeholder="optionnel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide a partir de</label>
              <input
                type="datetime-local"
                value={data.valid_from}
                onChange={(e) => set('valid_from', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide jusqu'au</label>
              <input
                type="datetime-local"
                value={data.valid_until}
                onChange={(e) => set('valid_until', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre max d'usages</label>
            <input
              type="number"
              min="1"
              value={data.max_uses}
              onChange={(e) => set('max_uses', e.target.value)}
              placeholder="illimite"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <span className="text-sm">Actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || !data.code.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
