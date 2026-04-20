/**
 * Barre d'entete commune (DA V3 launcher glass).
 * Titre simple en display uppercase, slot gauche/droite.
 */

import { type ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}

export default function HeaderBar({ title, left, right }: Props) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4">
      <div className="min-w-[12rem]">{left}</div>
      <div className="flex-1 text-center">
        {title && (
          <h1
            className="font-display text-4xl uppercase tracking-wider text-table-ink sm:text-5xl"
            style={{ textShadow: '0 0 24px rgba(123, 43, 255, 0.45)' }}
          >
            {title}
          </h1>
        )}
      </div>
      <div className="flex min-w-[12rem] justify-end">{right}</div>
    </header>
  );
}
