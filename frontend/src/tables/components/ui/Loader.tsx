/**
 * Loader "neon" : 3 carres rebondissants violets - VERSION OPTI mini-PC.
 *
 *   - Shadow simplifiee (pas de blur double layer).
 *   - Anim CSS native `bounce` (utilise translate3d, GPU friendly).
 */

export default function Loader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-table-ink-muted">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-sm bg-table-violet"
            style={{
              animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      {label && (
        <span className="font-display text-xs uppercase tracking-widest text-table-cyan">
          {label}
        </span>
      )}
    </div>
  );
}
