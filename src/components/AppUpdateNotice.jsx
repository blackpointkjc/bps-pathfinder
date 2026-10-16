import { useEffect, useState } from 'react';
import { requestFreshApplication } from '@/utils/pageAssetHealth';
export default function AppUpdateNotice() {
    const [available,setAvailable] = useState(false);
    useEffect(() => {
        const notify=()=>setAvailable(true);
        window.addEventListener('vite:preloadError',notify);
        window.addEventListener('bps-app-assets-unavailable',notify);
        return()=>{window.removeEventListener('vite:preloadError',notify);window.removeEventListener('bps-app-assets-unavailable',notify);};
    },[]);
    if (!available) return null;
    return <aside role="status" className="fixed bottom-4 left-3 right-3 z-[3000] mx-auto flex max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-700 bg-slate-950 p-4 text-sm text-white shadow-2xl">
        <div><strong>Refresh available</strong><p className="mt-1 text-xs text-slate-300">Some page files changed or could not be downloaded. Save any draft before refreshing.</p></div>
        <button type="button" onClick={requestFreshApplication} className="rounded-lg bg-cyan-700 px-4 py-2 font-bold">Refresh Pathfinder</button>
    </aside>;
}
