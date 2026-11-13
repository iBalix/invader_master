/**
 * Cadre commun des pages Stats : titre, onglets, fraicheur des donnees, et les
 * deux petits hooks de chargement partages par les trois pages.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AlertCircle, BarChart3, Landmark, Loader2, Target, Upload, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { statsApi, type StatsMeta } from '../../lib/statsApi';
import { daysBetween, fmtDayYear, todayISO } from './format';

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  const apiMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (apiMessage) return apiMessage;
  return err instanceof Error ? err.message : 'Erreur de chargement';
}

/**
 * Charge une ressource identifiee par `key`. Pendant un rechargement, la
 * donnee precedente reste disponible (`loading` passe a true) : l'ecran garde
 * son rendu au lieu de clignoter.
 */
export function useStatsQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: key !== null,
  });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

let metaPromise: Promise<StatsMeta> | null = null;

/** /api/stats/meta, charge une fois et partage entre les pages. */
export function useStatsMeta(): StatsMeta | null {
  const [meta, setMeta] = useState<StatsMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!metaPromise) {
      metaPromise = statsApi.meta().catch((err) => {
        metaPromise = null;
        throw err;
      });
    }
    metaPromise.then((data) => !cancelled && setMeta(data)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return meta;
}

/** A appeler apres une ecriture qui change les valeurs de filtres. */
export function resetStatsMeta(): void {
  metaPromise = null;
}

// ---------------------------------------------------------------------------
// Cadre
// ---------------------------------------------------------------------------

const TABS: Array<{ path: string; pageKey: string; label: string; icon: LucideIcon }> = [
  { path: '/stats/ventes', pageKey: 'stats/ventes', label: 'Ventes', icon: BarChart3 },
  { path: '/stats/tresorerie', pageKey: 'stats/tresorerie', label: 'Trésorerie', icon: Landmark },
  { path: '/stats/rentabilite', pageKey: 'stats/rentabilite', label: 'Rentabilité', icon: Target },
];

function Freshness({ meta }: { meta: StatsMeta | null }) {
  const { user } = useAuth();
  const { hasPageAccess } = usePermissions();
  if (!meta) return null;

  const today = todayISO();
  const sources = [
    { label: 'Popina', last: meta.sales.last },
    { label: 'Tiime', last: meta.flux.last },
  ];
  // au-dela d'une semaine sans import, les "7 derniers jours" seraient vides
  const stale = sources.some((s) => !s.last || daysBetween(s.last, today) > 8);
  const canImport = hasPageAccess(user?.role ?? 'externe', 'utilitaires/import-finances');

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className={`inline-flex items-center gap-1.5 ${stale ? 'text-amber-700' : 'text-gray-500'}`}>
        {stale && <AlertCircle className="w-4 h-4" aria-hidden="true" />}
        Données : {sources.map((s) => `${s.label} jusqu'au ${s.last ? fmtDayYear(s.last) : '?'}`).join(' · ')}
      </span>
      {canImport && (
        <Link to="/utilitaires/import-finances" className="inline-flex items-center gap-1.5 text-primary-600 hover:underline">
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          Importer
        </Link>
      )}
    </div>
  );
}

export default function StatsLayout({
  subtitle,
  meta,
  filters,
  loading,
  error,
  onRetry,
  children,
}: {
  subtitle: string;
  meta: StatsMeta | null;
  /** Rangee de filtres, au-dessus de tout ce qu'elle gouverne. */
  filters?: ReactNode;
  /** Premier chargement uniquement : ensuite la page garde son rendu. */
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { hasPageAccess } = usePermissions();
  const role = user?.role ?? 'externe';
  const tabs = TABS.filter((tab) => hasPageAccess(role, tab.pageKey));

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stats</h1>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>
        <Freshness meta={meta} />
      </div>

      <nav className="flex gap-1 border-b border-gray-200" aria-label="Sections des stats">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
          <span className="text-sm text-red-700">Chargement impossible : {error}</span>
          <button type="button" onClick={onRetry} className="ml-auto text-sm text-red-600 underline">
            Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Chargement" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
