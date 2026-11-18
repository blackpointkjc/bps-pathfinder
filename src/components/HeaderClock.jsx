import { useEffect, useState } from 'react';

export default function HeaderClock() {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setClock(new Date()); };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return <div className="pathfinder-header-clock hidden shrink-0 text-right font-mono leading-tight text-[#9fb6cc] lg:block">
    <div className="text-[11px] font-black tracking-wider text-white">{clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
    <div className="text-[8px] font-bold tracking-[0.12em] text-[#7894af]">{clock.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()} ET</div>
  </div>;
}
