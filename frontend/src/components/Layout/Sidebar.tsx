/**
 * Sidebar - Menu lateral filtre par role
 */

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Gamepad2,
  HelpCircle,
  Swords,
  Music,
  Skull,
  Beer,
  UtensilsCrossed,
  Monitor,
  Users,
  ChevronDown,
  ChevronRight,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Role } from '../../types';

interface SidebarLinkItem {
  kind: 'link';
  title: string;
  icon: LucideIcon;
  path: string;
  roles: Role[];
  disabled?: boolean;
  badgeText?: string;
  separator?: boolean;
}

interface SidebarAccordionItem {
  kind: 'accordion';
  title: string;
  roles: Role[];
  defaultOpen?: boolean;
  items: Array<{
    title: string;
    icon: LucideIcon;
    disabled: boolean;
    badgeText?: string;
    path?: string;
  }>;
}

type SidebarItem = SidebarLinkItem | SidebarAccordionItem;

const SIDEBAR_MENU: SidebarItem[] = [
  {
    kind: 'link',
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    roles: ['admin', 'salarie'],
  },
  {
    kind: 'link',
    title: 'Gestion bar',
    icon: Beer,
    path: '#',
    roles: ['admin', 'salarie'],
    disabled: true,
    badgeText: 'Bientot',
  },
  {
    kind: 'accordion',
    title: 'Contenus',
    defaultOpen: true,
    roles: ['admin', 'salarie', 'externe'],
    items: [
      { title: 'Quiz', icon: BookOpen, disabled: false, path: '/contenus/quiz' },
      { title: 'Carte', icon: UtensilsCrossed, disabled: false, path: '/contenus/carte' },
      { title: 'Jeux', icon: Gamepad2, disabled: false, path: '/contenus/jeux' },
      { title: 'Support médias', icon: Monitor, disabled: false, path: '/contenus/medias' },
    ],
  },
  {
    kind: 'accordion',
    title: 'Evenement',
    defaultOpen: false,
    roles: ['admin', 'salarie'],
    items: [
      { title: 'Mario Kart', icon: Gamepad2, disabled: true, badgeText: 'Bientot' },
      { title: 'Quiz', icon: HelpCircle, disabled: true, badgeText: 'Bientot' },
      { title: 'Battle Royal', icon: Swords, disabled: true, badgeText: 'Bientot' },
      { title: 'Blindtest', icon: Music, disabled: true, badgeText: 'Bientot' },
      { title: 'Manoir du crime', icon: Skull, disabled: true, badgeText: 'Bientot' },
    ],
  },
  {
    kind: 'link',
    title: 'Gestion des users',
    icon: Users,
    path: '/users',
    roles: ['admin'],
    separator: true,
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role ?? 'externe';

  const filteredMenu = SIDEBAR_MENU.filter((item) => item.roles.includes(role));

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
}: {
  item: SidebarAccordionItem;
  open: boolean;
  onToggle: () => void;
}) {
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
          {item.items.map((sub, subIndex) => {
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
