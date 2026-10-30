import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { useEffect, useState } from 'react';
import { getAppDirectory } from '@/lib/appDirectory';
import { DashboardDataProvider, useDashboardData } from '@/lib/DashboardDataContext';
import { applyOfficerLocationEvent, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import UnitDutyBoard from '@/components/dispatch/UnitDutyBoard';

function UnitStatusPage() {
    const { users, calls, loading, manualRefresh, rateLimited } = useDashboardData();
    const [units, setUnits] = useState(users);
    const [directory, setDirectory] = useState([]);
    useEffect(() => {
        let live = true;
        const fetchDirectory = () => getAppDirectory().then(result => {
            if (live) setDirectory(result.users || []);
        }).catch(error => console.warn('Officer platoon directory delayed:', error?.message));
        void fetchDirectory();
        const refresh = event => {
            if (!event?.detail?.name || ['User', 'ActiveOfficer'].includes(event.detail.name)) void fetchDirectory();
        };
        window.addEventListener('bps-data-changed', refresh);
        return () => { live = false; window.removeEventListener('bps-data-changed', refresh); };
    }, []);
    useEffect(() => {
        const byEmail = new Map(directory.filter(row => row.email).map(row => [String(row.email).trim().toLowerCase(), row]));
        const byId = new Map(directory.filter(row => row.id).map(row => [String(row.id), row]));
        setUnits(users.map(person => {
            const profile = byId.get(String(person.user_id || person.id || '')) || byEmail.get(String(person.email || person.officer_email || '').trim().toLowerCase());
            return { ...person,
                rank: profile?.rank || person.rank,
                last_name: profile?.last_name || person.last_name,
                platoon: profile?.platoon || profile?.oversight_platoon || person.platoon || person.oversight_platoon || null };
        }));
    }, [users, directory]);
    useEffect(() => subscribeOfficerLocationChanges(event => setUnits(rows => applyOfficerLocationEvent(rows, event))), []);
    return <div className="min-h-full bg-[#07111d] p-3 text-white sm:p-5">
        <WorkspaceHeader eyebrow="CAD / Personnel" title="Officer Status" description="Live duty state and assignments, organized by the company rank structure." metrics={[
          {label:'Operational officers',value:units.filter(isOperationalOfficer).length},
          {label:'Available',value:units.filter(isOperationalOfficer).filter(u=>u.status==='Available').length},
          {label:'On scene',value:units.filter(isOperationalOfficer).filter(u=>u.status==='On Scene').length}
        ]}><button type="button" onClick={()=>manualRefresh()} className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800">Refresh statuses</button></WorkspaceHeader>
        {loading && <p role="status" className="mb-3 text-sm text-slate-300">Loading officers…</p>}
        {rateLimited && <p role="status" className="mb-3 text-sm text-amber-300">Refresh delayed. Last received statuses remain visible.</p>}
        <UnitDutyBoard units={units} calls={calls} fullPage />
    </div>;
}
export default function UnitStatus() { return <DashboardDataProvider><UnitStatusPage /></DashboardDataProvider>; }