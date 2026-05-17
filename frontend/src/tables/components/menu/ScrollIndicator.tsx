/**
 * Indicateur visuel de scroll : gradient en bas du conteneur + chevron pulsant.
 * Visible quand le conteneur est scrollable ET qu'on n'est pas en bas.
 */

import { useEffect, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  scrollRef: RefObject<HTMLElement | null>;
}

export default function ScrollIndicator({ scrollRef }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 4;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      setVisible(scrollable && !atBottom);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef]);

  return (
    <>
      <style>{`
        @keyframes scroll-indicator-bounce {
          0%, 100% { transform: translate(-50%, 0); opacity: 0.85; }
          50% { transform: translate(-50%, 6px); opacity: 1; }
        }
      `}</style>
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute bottom-0 left-0 right-0 h-20 transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{
          background:
            'linear-gradient(to top, rgba(15,7,42,0.85) 0%, rgba(15,7,42,0.4) 50%, rgba(15,7,42,0) 100%)',
        }}
      />
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute left-1/2 bottom-3 z-[2] -translate-x-1/2 transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{ animation: visible ? 'scroll-indicator-bounce 1.4s ease-in-out infinite' : 'none' }}
      >
        <ChevronDown className="h-6 w-6 text-table-ink-soft" />
      </div>
    </>
  );
}
