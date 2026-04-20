/**
 * Page Tables tactiles > Commandes (orders).
 *
 * Vue type "KDS" basique pour suivre les commandes passees depuis les
 * tables tactiles. Permet le passage de statut :
 *   received -> preparing -> ready -> delivered
 *   (ou cancelled a tout moment)
 */

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  ShoppingBag,
  ChevronRight,
  Check,
  X,
  Clock,
  ChefHat,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

type OrderStatus = 'received' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  order_number: number;
  hostname: string;
  table_number: string;
  status: OrderStatus;
  payment_method: 'card' | 'cash' | null;
  subtotal: number;
  happy_hour_discount: number;
  coupon_code: string | null;
  coupon_discount: number;
  total: number;
  customer_note: string | null;
  created_at: string;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  applied_price: number;
  happy_hour_applied: boolean;
  subtotal: number;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; icon: typeof Clock; next?: OrderStatus }
> = {
  received: {
    label: 'Recue',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    icon: Clock,
    next: 'preparing',
  },
  preparing: {
    label: 'En preparation',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    icon: ChefHat,
    next: 'ready',
  },
  ready: {
    label: 'Prete',
    color: 'text-green-700',
    bg: 'bg-green-100',
    icon: Package,
    next: 'delivered',
  },
  delivered: {
    label: 'Livree',
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    icon: Check,
  },
  cancelled: {
    label: 'Annulee',
    color: 'text-red-700',
    bg: 'bg-red-100',
    icon: X,
  },
};

const STATUS_FILTERS: { value: OrderStatus | 'active' | 'all'; label: string }[] = [
  { value: 'active', label: 'Actives' },
  { value: 'received', label: 'Recues' },
  { value: 'preparing', label: 'En prep.' },
  { value: 'ready', label: 'Pretes' },
  { value: 'delivered', label: 'Livrees' },
  { value: 'cancelled', label: 'Annulees' },
  { value: 'all', label: 'Toutes' },
];

const ACTIVE_STATUSES: OrderStatus[] = ['received', 'preparing', 'ready'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function ageMin(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'active' | 'all'>('active');
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const [openItems, setOpenItems] = useState<OrderItem[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filter !== 'all' && filter !== 'active') params.status = filter;
      const { data } = await api.get('/api/table-orders', { params });
      let items: Order[] = data.items ?? [];
      if (filter === 'active') items = items.filter((o) => ACTIVE_STATUSES.includes(o.status));
      setOrders(items);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  async function setStatus(o: Order, newStatus: OrderStatus) {
    setUpdating(o.id);
    try {
      await api.put(`/api/table-orders/${o.id}/status`, { status: newStatus });
      toast.success(`Statut: ${STATUS_CONFIG[newStatus].label}`);
      load();
    } catch {
      toast.error('Erreur changement de statut');
    } finally {
      setUpdating(null);
    }
  }

  async function openDetail(o: Order) {
    setOpenOrder(o);
    setOpenItems([]);
    try {
      const { data } = await api.get(`/api/table-orders/${o.id}`);
      setOpenItems(data.items ?? []);
    } catch {
      toast.error('Erreur chargement detail');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Commandes tables</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue KDS des commandes passees depuis les tables tactiles. Auto-refresh
            toutes les 15s.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
              filter === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-gray-500">Chargement...</p>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune commande</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map((o) => {
            const cfg = STATUS_CONFIG[o.status];
            const Icon = cfg.icon;
            return (
              <div
                key={o.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition"
              >
                <button
                  onClick={() => openDetail(o)}
                  className="block w-full text-left p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs font-mono text-gray-400">
                        #{o.order_number}
                      </div>
                      <div className="font-semibold">Table {o.table_number}</div>
                      <div className="text-xs text-gray-500 font-mono">{o.hostname}</div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${cfg.bg}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-lg font-bold">{Number(o.total).toFixed(2)}€</span>
                    <span className="text-xs text-gray-500">
                      {o.payment_method === 'card' ? 'CB' : o.payment_method === 'cash' ? 'Espèces' : '—'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                    <span>{formatTime(o.created_at)}</span>
                    <span>il y a {ageMin(o.created_at)}min</span>
                  </div>
                </button>

                {cfg.next && (
                  <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-2">
                    <button
                      onClick={() => setStatus(o, cfg.next!)}
                      disabled={updating === o.id}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50"
                    >
                      {updating === o.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          {STATUS_CONFIG[cfg.next].label} <ChevronRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                    {o.status !== 'cancelled' && o.status !== 'delivered' && (
                      <button
                        onClick={() => setStatus(o, 'cancelled')}
                        disabled={updating === o.id}
                        className="px-2 py-1.5 text-xs font-medium border border-gray-200 text-gray-500 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {openOrder && (
        <OrderDetailModal
          order={openOrder}
          items={openItems}
          onClose={() => {
            setOpenOrder(null);
            setOpenItems([]);
          }}
          onStatus={async (s) => {
            await setStatus(openOrder, s);
            setOpenOrder(null);
          }}
        />
      )}
    </div>
  );
}

function OrderDetailModal({
  order,
  items,
  onClose,
  onStatus,
}: {
  order: Order;
  items: OrderItem[];
  onClose: () => void;
  onStatus: (s: OrderStatus) => Promise<void>;
}) {
  const cfg = STATUS_CONFIG[order.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">
                Commande #{order.order_number}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Table {order.table_number} ({order.hostname}) -{' '}
                {new Date(order.created_at).toLocaleString('fr-FR')}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Articles</h3>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-200">
                  {items.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-center text-gray-400">Chargement...</td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.product_name}</div>
                          {it.happy_hour_applied && (
                            <div className="text-xs text-amber-600">Happy Hour</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center w-12">x{it.quantity}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {Number(it.subtotal).toFixed(2)}€
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Sous-total</span>
              <span>{Number(order.subtotal).toFixed(2)}€</span>
            </div>
            {Number(order.happy_hour_discount) > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Happy Hour</span>
                <span>-{Number(order.happy_hour_discount).toFixed(2)}€</span>
              </div>
            )}
            {Number(order.coupon_discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Coupon {order.coupon_code}</span>
                <span>-{Number(order.coupon_discount).toFixed(2)}€</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>{Number(order.total).toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500 pt-2">
              <span>Paiement</span>
              <span>
                {order.payment_method === 'card' ? 'Carte bancaire' : order.payment_method === 'cash' ? 'Especes' : '—'}
              </span>
            </div>
          </div>

          {order.customer_note && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-yellow-800 mb-1">Note client</div>
              <p className="text-yellow-700">{order.customer_note}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 p-5 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white">
            Fermer
          </button>
          <div className="flex gap-2">
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <button
                onClick={() => onStatus('cancelled')}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                Annuler
              </button>
            )}
            {cfg.next && (
              <button
                onClick={() => onStatus(cfg.next!)}
                className="flex items-center gap-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                {STATUS_CONFIG[cfg.next].label}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
