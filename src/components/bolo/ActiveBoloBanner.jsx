import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileWarning, ChevronRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function ActiveBoloBanner() {
  const [bolos, setBolos] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const rows = await base44.entities.BOLOAlert.list('-created_date', 100);
        if (mounted) setBolos((rows || []).filter(b => b.status === 'active'));
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const sorted = useMemo(() => [...bolos].sort((a,b) => {
    const weight = { critical: 4, high: 3, medium: 2, low: 1 };
    return (weight[b.priority] || 0) - (weight[a.priority] || 0);
  }), [bolos]);

  if (!sorted.length) return null;
  const featured = sorted.slice(0, 3);

  return (
    <button onClick={() => { window.location.href = createPageUrl('BOLOAlerts'); }}
      className="flex w-full flex-none items-center gap-3 border-b-2 border-red-500 bg-red-950/85 px-4 py-2 text-left hover:bg-red-900/90">
      <FileWarning className="h-4 w-4 flex-none animate-pulse text-red-300" />
      <span className="whitespace-nowrap text-[10px] font-black tracking-widest text-red-200">ACTIVE BOLO{sorted.length > 1 ? 'S' : ''}: {sorted.length}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-red-300/90">
        {featured.map(b => `${(b.priority || 'medium').toUpperCase()} · ${b.title || b.subject_name || b.vehicle_plate || b.bolo_number}`).join('   |   ')}
      </span>
      <span className="flex items-center gap-1 text-[9px] font-bold text-red-200">VIEW <ChevronRight className="h-3 w-3" /></span>
    </button>
  );
}
