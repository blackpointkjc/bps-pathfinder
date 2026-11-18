import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

// Locks the managed browsing session after the policy's idle window and requires a
// deliberate resume, mirroring a managed-browser inactivity sign-out.
export default function BrowserIdleGuard({ minutes, children }) {
  const timeoutMs = Math.max(1, Number(minutes) || 15) * 60 * 1000;
  const [locked, setLocked] = useState(false);
  const timer = useRef(null);
  const lastActivity = useRef(Date.now());
  const lockedRef = useRef(false);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    const arm = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLocked(true), Math.max(1000, timeoutMs - (Date.now() - lastActivity.current)));
    };
    const touch = () => {
      lastActivity.current = Date.now();
      if (!lockedRef.current) arm();
    };
    if (locked) {
      window.clearTimeout(timer.current);
      return undefined;
    }
    arm();
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach(name => window.addEventListener(name, touch, { passive: true }));
    return () => {
      window.clearTimeout(timer.current);
      events.forEach(name => window.removeEventListener(name, touch));
    };
  }, [locked, timeoutMs]);

  if (!locked) return children;

  return (
    <section className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-700 bg-amber-500/10">
        <Lock className="h-5 w-5 text-amber-300" />
      </div>
      <h2 className="mt-3 text-base font-bold text-white">Browsing session locked</h2>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-300">
        Your managed browser session was locked after {Math.max(1, Number(minutes) || 15)} minutes of inactivity. Activity is still
        recorded against your account.
      </p>
      <button
        type="button"
        onClick={() => {
          lastActivity.current = Date.now();
          setLocked(false);
        }}
        className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-cyan-700 bg-cyan-600/20 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-600/30"
      >
        Resume session
      </button>
    </section>
  );
}