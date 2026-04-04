import { Link } from 'react-router-dom';
import {
  Beer,
  UtensilsCrossed,
  Gamepad2,
  Monitor,
  Languages,
  BookOpen,
  Swords,
  Upload,
  Wallet,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';

interface DashCard {
  title: string;
  icon: LucideIcon;
  path?: string;
  disabled?: boolean;
  badge?: string;
  description: string;
  pageKey: string;
}

const CONTENUS: DashCard[] = [
  { title: 'Carte', icon: UtensilsCrossed, path: '/contenus/carte', description: 'Menu, catégories et produits', pageKey: 'contenus/carte' },
  { title: 'Jeux', icon: Gamepad2, path: '/contenus/jeux', description: 'Bornes, consoles et catalogue', pageKey: 'contenus/jeux' },
  { title: 'Support médias', icon: Monitor, path: '/contenus/medias', description: 'TV, projecteur et diffusion', pageKey: 'contenus/medias' },
  { title: 'Traductions', icon: Languages, path: '/contenus/traductions', description: 'Textes multilingues', pageKey: 'contenus/traductions' },
];

const EVENEMENTS: DashCard[] = [
  { title: 'Quiz', icon: BookOpen, path: '/contenus/quiz', description: 'Questions, thèmes et médias', pageKey: 'contenus/quiz' },
  { title: 'Battle Royal', icon: Swords, path: '/evenements/battle-questions', description: 'Questions pour les battles', pageKey: 'evenements/battle-questions' },
];

const UTILITAIRES: DashCard[] = [
  { title: 'Import finances', icon: Upload, path: '/utilitaires/import-finances', description: 'Import des données comptables', pageKey: 'utilitaires/import-finances' },
  { title: 'Comptabilité', icon: Wallet, path: '/utilitaires/comptabilite', description: 'Gestion des flux d\'espèces', pageKey: 'utilitaires/comptabilite' },
];

const SECTIONS = [
  { title: 'Contenus', items: CONTENUS, color: 'blue' },
  { title: 'Événements', items: EVENEMENTS, color: 'purple' },
  { title: 'Utilitaires', items: UTILITAIRES, color: 'amber' },
] as const;

const SECTION_STYLES: Record<string, { heading: string; accent: string; iconBg: string; iconText: string }> = {
  blue:   { heading: 'text-blue-700',   accent: 'border-blue-200', iconBg: 'bg-blue-100',   iconText: 'text-blue-600' },
  purple: { heading: 'text-purple-700', accent: 'border-purple-200', iconBg: 'bg-purple-100', iconText: 'text-purple-600' },
  amber:  { heading: 'text-amber-700',  accent: 'border-amber-200', iconBg: 'bg-amber-100',  iconText: 'text-amber-600' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { hasPageAccess } = usePermissions();
  const role = user?.role ?? 'externe';

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Bienvenue sur le back-office Invader Master.</p>
        </div>
        {hasPageAccess(role, 'gestion-bar') && (
          <Link
            to="/gestion-bar"
            className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-200/50 hover:shadow-amber-300/60 hover:scale-[1.02] transition-all font-medium"
          >
            <Beer className="w-5 h-5" />
            Gestion du bar
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {SECTIONS.map(({ title, items, color }) => {
          const visible = items.filter((c) => hasPageAccess(role, c.pageKey));
          if (visible.length === 0) return null;
          const s = SECTION_STYLES[color];
          return (
            <div key={title} className="space-y-3">
              <h2 className={`text-sm font-semibold uppercase tracking-wider ${s.heading}`}>{title}</h2>
              <div className="space-y-2">
                {visible.map((card) => {
                  const Icon = card.icon;
                  const inner = (
                    <div className={`flex items-center gap-3 p-4 rounded-xl border bg-white transition group ${
                      card.disabled
                        ? 'opacity-50 cursor-not-allowed border-gray-200'
                        : `border-gray-200 hover:border-transparent hover:shadow-md hover:scale-[1.01] ${s.accent}`
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.iconBg}`}>
                        <Icon className={`w-5 h-5 ${s.iconText}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">{card.title}</span>
                          {card.badge && (
                            <span className="text-[10px] uppercase font-semibold tracking-wider bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                              {card.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{card.description}</p>
                      </div>
                      {!card.disabled && (
                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition shrink-0" />
                      )}
                    </div>
                  );

                  if (card.disabled || !card.path) {
                    return <div key={card.title}>{inner}</div>;
                  }
                  return (
                    <Link key={card.title} to={card.path} className="block">
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
