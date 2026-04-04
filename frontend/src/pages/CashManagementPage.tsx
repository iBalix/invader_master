import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Loader2, Trash2, TrendingUp, Wallet, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import type { UserProfile } from '../types';

const CASH_CODE = '1988';
const SESSION_KEY = 'cash_auth_time';
const SESSION_DURATION = 5 * 60 * 1000;

interface CashEntry {
  id: number;
  responsable: string;
  montant: number;
  date: string;
  comment: string;
}

interface CashStats {
  total30days: number;
  balance: number;
}

function isSessionValid(): boolean {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return false;
  return Date.now() - Number(stored) < SESSION_DURATION;
}

export default function CashManagementPage() {
  const [authenticated, setAuthenticated] = useState(isSessionValid);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);

  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [stats, setStats] = useState<CashStats>({ total30days: 0, balance: 0 });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [responsable, setResponsable] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleUnlock = () => {
    if (code === CASH_CODE) {
      sessionStorage.setItem(SESSION_KEY, String(Date.now()));
      setAuthenticated(true);
      setCodeError(false);
    } else {
      setCodeError(true);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, statsRes, usersRes] = await Promise.all([
        api.get<{ items: CashEntry[] }>('/api/cash'),
        api.get<CashStats & { status: string }>('/api/cash/stats'),
        api.get<{ users: UserProfile[] }>('/api/users'),
      ]);
      setEntries(entriesRes.data.items);
      setStats({ total30days: statsRes.data.total30days, balance: statsRes.data.balance });
      const filtered = usersRes.data.users.filter(
        (u) => u.role === 'admin' || u.role === 'salarie'
      );
      setUsers(filtered);
      if (filtered.length > 0 && !responsable) {
        setResponsable(filtered[0].display_name ?? filtered[0].email);
      }
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated, loadData]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!responsable || !amount) return;

    setSubmitting(true);
    try {
      await api.post('/api/cash', {
        responsable,
        amount: Number(amount),
        comment,
      });
      setAmount('');
      setComment('');
      toast.success('Mouvement enregistre');
      loadData();
    } catch {
      toast.error("Erreur lors de l'ajout");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette entree ?')) return;

    setDeleting(id);
    try {
      await api.delete(`/api/cash/${id}`);
      toast.success('Entree supprimee');
      loadData();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (n: number) => {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)} \u20AC`;
  };

  if (!authenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Comptabilite</h2>
          <p className="text-sm text-gray-500 mb-6">Entrez le code d'acces</p>
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            placeholder="Code"
            autoFocus
            className={`w-full px-4 py-3 rounded-lg border text-center text-lg tracking-widest font-mono transition ${
              codeError
                ? 'border-red-400 bg-red-50 focus:ring-red-500'
                : 'border-gray-300 focus:ring-indigo-500'
            } focus:outline-none focus:ring-2`}
          />
          {codeError && (
            <p className="text-red-500 text-sm mt-2">Code incorrect</p>
          )}
          <button
            onClick={handleUnlock}
            className="w-full mt-4 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
          >
            Deverrouiller
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Comptabilite</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Ajouts sur 30 jours</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.total30days.toFixed(2)} &euro;
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
            stats.balance >= 0 ? 'bg-blue-100' : 'bg-red-100'
          }`}>
            <Wallet className={`w-6 h-6 ${stats.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Solde de la caisse</p>
            <p className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {stats.balance.toFixed(2)} &euro;
            </p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ajouter / Retirer</h2>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <select
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white sm:w-48"
          >
            {users.map((u) => (
              <option key={u.id} value={u.display_name ?? u.email}>
                {u.display_name ?? u.email}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant (ex: 50 ou -20)"
            required
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm flex-1 sm:max-w-[200px]"
          />
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Commentaire (optionnel)"
            maxLength={50}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm flex-1"
          />
          <button
            type="submit"
            disabled={submitting || !amount}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </form>
      </div>

      {/* History table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Historique</h2>
        </div>
        {entries.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Aucun mouvement</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Responsable</th>
                  <th className="px-5 py-3 text-right">Montant</th>
                  <th className="px-5 py-3">Commentaire</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-5 py-3 text-gray-900 font-medium">
                      {entry.responsable}
                    </td>
                    <td className={`px-5 py-3 text-right font-semibold whitespace-nowrap ${
                      entry.montant >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatAmount(entry.montant)}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {entry.comment || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                        title="Supprimer"
                      >
                        {deleting === entry.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
