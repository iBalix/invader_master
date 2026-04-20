/**
 * Ecran de setup (DA V3 launcher glass).
 *
 * Saisie hostname en cas de fallback (kiosque pas encore configure).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setHostname } from '../lib/hostname';

export default function SetupPage() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setHostname(value);
    window.dispatchEvent(new Event('invader:hostname-changed'));
    navigate('/table/screensaver', { replace: true });
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-table-bg-elev p-8 shadow-glass"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-3xl"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(123,43,255,0.25), transparent 70%)',
          }}
        />
        <h1
          className="relative mb-2 text-center font-display text-3xl uppercase tracking-wider text-table-ink"
          style={{ textShadow: '0 0 20px rgba(123,43,255,0.45)' }}
        >
          Invader Table
        </h1>
        <p className="relative mb-6 text-center text-sm text-table-ink-muted">
          Aucun hostname detecte. Saisis-le pour configurer cette borne.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="ex: TABLE01-1"
          className="relative w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-display tracking-widest text-table-ink outline-none placeholder:text-table-ink-muted/50 focus:border-table-violet"
        />
        <button
          type="submit"
          className="relative mt-6 w-full rounded-xl border border-white/20 bg-gradient-to-br from-table-violet to-table-violet-deep py-3 font-display text-xl uppercase tracking-wider text-white shadow-neon-violet transition hover:brightness-110 active:scale-95"
        >
          Valider
        </button>
      </form>
    </div>
  );
}
