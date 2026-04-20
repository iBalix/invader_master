/**
 * Sidebar - Menu lateral filtre par permissions dynamiques
 */

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Gamepad2,
  Swords,
  Beer,
  UtensilsCrossed,
  Monitor,
  Languages,
  Users,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Upload,
  Wallet,
  Calendar,
  Tablet,
  Tag,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import type { Role } from '../../types';

interface SidebarLinkItem {
  kind: 'link';
  title: string;
  icon: LucideIcon;
  path: string;
  pageKey: string;
  disabled?: boolean;
  badgeText?: string;
  separator?: boolean;
}

interface SidebarSubItem {
  title: string;
  icon: LucideIcon;
  disabled: boolean;
  badgeText?: string;
  path?: string;
  pageKey?: string;
}

interface SidebarAccordionItem {
  kind: 'accordion';
  title: string;
  defaultOpen?: boolean;
  items: SidebarSubItem[];
}

type SidebarItem = SidebarLinkItem | SidebarAccordionItem;

const SIDEBAR_MENU: SidebarItem[] = [
  {
    kind: 'link',
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    pageKey: 'dashboard',
  },
  {
    kind: 'link',
    title: 'Gestion bar',
    icon: Beer,
    path: '/gestion-bar',
    pageKey: 'gestion-bar',
  },
  {
    kind: 'accordion',
    title: 'Contenus',
    defaultOpen: true,
    items: [
      { title: 'Carte', icon: UtensilsCrossed, disabled: false, path: '/contenus/carte', pageKey: 'contenus/carte' },
      { title: 'Jeux', icon: Gamepad2, disabled: false, path: '/contenus/jeux', pageKey: 'contenus/jeux' },
      { title: 'Évènements', icon: Calendar, disabled: false, path: '/contenus/evenements', pageKey: 'contenus/evenements' },
      { title: 'Config écrans', icon: Monitor, disabled: false, path: '/contenus/config-ecrans', pageKey: 'contenus/medias' },
      { title: 'Traductions', icon: Languages, disabled: false, path: '/contenus/traductions', pageKey: 'contenus/traductions' },
    ],
  },
  {
    kind: 'accordion',
    title: 'Evenement',
    defaultOpen: false,
    items: [
      { title: 'Quiz', icon: BookOpen, disabled: false, path: '/contenus/quiz', pageKey: 'contenus/quiz' },
      { title: 'Battle Royal', icon: Swords, disabled: false, path: '/evenements/battle-questions', pageKey: 'evenements/battle-questions' },
    ],
  },
  {
    kind: 'accordion',
    title: 'Tables tactiles',
    defaultOpen: false,
    items: [
      { title: 'Bornes', icon: Tablet, disabled: false, path: '/tables-tactiles/devices', pageKey: 'tables-tactiles/devices' },
      { title: 'Codes promo', icon: Tag, disabled: false, path: '/tables-tactiles/coupons', pageKey: 'tables-tactiles/coupons' },
      { title: 'Commandes', icon: ShoppingBag, disabled: false, path: '/tables-tactiles/orders', pageKey: 'tables-tactiles/orders' },
    ],
  },
  {
    kind: 'accordion',
    title: 'Utilitaires',
    defaultOpen: false,
    items: [
      { title: 'Import finances', icon: Upload, disabled: false, path: '/utilitaires/import-finances', pageKey: 'utilitaires/import-finances' },
      { title: 'Comptabilite', icon: Wallet, disabled: false, path: '/utilitaires/comptabilite', pageKey: 'utilitaires/comptabilite' },
    ],
  },
  {
    kind: 'link',
    title: 'Gestion des users',
    icon: Users,
    path: '/users',
    pageKey: 'users',
    separator: true,
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const { hasPageAccess } = usePermissions();
  const role = user?.role ?? 'externe';

  const filteredMenu = SIDEBAR_MENU.filter((item) => {
    if (item.kind === 'link') {
      return hasPageAccess(role, item.pageKey);
    }
    return item.items.some(
      (sub) => sub.pageKey && hasPageAccess(role, sub.pageKey),
    );
  });

  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    filteredMenu.forEach((item, index) => {
      if (item.kind === 'accordion') {
        initial[index] = item.defaultOpen ?? false;
      }
    });
    return initial;
  });

  const toggleAccordion = (index: number) => {
    setOpenAccordions((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 overflow-y-auto flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          Invader Master
        </h1>
        <p className="text-sm text-gray-400 mt-1">Back-office</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredMenu.map((item, index) => (
          <div key={index}>
            {item.kind === 'link' && item.separator && (
              <div className="border-t border-gray-800 my-3" />
            )}

            {item.kind === 'accordion' ? (
              <AccordionSection
                item={item}
                open={!!openAccordions[index]}
                onToggle={() => toggleAccordion(index)}
                role={role}
                hasPageAccess={hasPageAccess}
              />
            ) : (
              <LinkItem item={item} />
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function AccordionSection({
  item,
  open,
  onToggle,
  role,
  hasPageAccess,
}: {
  item: SidebarAccordionItem;
  open: boolean;
  onToggle: () => void;
  role: Role;
  hasPageAccess: (role: Role, pageKey: string) => boolean;
}) {
  const visibleItems = item.items.filter(
    (sub) => sub.disabled || (sub.pageKey && hasPageAccess(role, sub.pageKey)),
  );

  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-gray-400 hover:text-white transition"
      >
        <span className="text-xs font-semibold uppercase tracking-wider">{item.title}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-2">
          {visibleItems.map((sub, subIndex) => {
            const SubIcon = sub.icon;
            if (!sub.disabled && sub.path) {
              return (
                <NavLink
                  key={subIndex}
                  to={sub.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-lg transition text-sm ${
                      isActive ? 'bg-primary-500 text-white' : 'hover:bg-gray-800 text-gray-300'
                    }`
                  }
                >
                  <SubIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{sub.title}</span>
                </NavLink>
              );
            }
            return (
              <div
                key={subIndex}
                className="flex items-center gap-3 px-4 py-2 rounded-lg cursor-not-allowed opacity-50 text-gray-400"
              >
                <SubIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{sub.title}</span>
                {sub.badgeText && (
                  <span className="ml-auto text-xs bg-gray-800 px-2 py-1 rounded">
                    {sub.badgeText}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinkItem({ item }: { item: SidebarLinkItem }) {
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg opacity-50 cursor-not-allowed text-gray-400">
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium">{item.title}</span>
        {item.badgeText && (
          <span className="ml-auto text-xs bg-gray-800 px-2 py-1 rounded">{item.badgeText}</span>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
          isActive ? 'bg-primary-500 text-white' : 'hover:bg-gray-800 text-gray-300'
        }`
      }
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="font-medium">{item.title}</span>
    </NavLink>
  );
}
