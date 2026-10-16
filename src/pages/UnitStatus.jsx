import { useEffect, useState } from 'react';
import { DashboardDataProvider, useDashboardData } from '@/lib/DashboardDataContext';
import { applyOfficerLocationEvent, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import UnitDutyBoard from '@/components/dispatch/UnitDutyBoard';

function UnitStatusPage() {
    const { users, calls, loading, manualRefresh, rateLimited } = useDashboardData();
    const [units, setUnits] = useState(users);
    useEffect(() => { setUnits(users); }, [users]);
    useEffect(() => subscribeOfficerLocationChanges(event => setUnits(rows => applyOfficerLocationEvent(rows, event))), []);
    return <div className="min-h-full bg-[#07111d] p-3 text-white sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-xl font-bold">Unit Status</h1><p className="mt-1 text-sm text-slate-400">Officers in rank order, with current duty status and active calls.</p></div>
            <button type="button" onClick={() => manualRefresh()} className="rounded border border-slate-600 px-3 py-2 text-sm">Refresh units</button>
        </div>
        {loading && <p role="status" className="mb-3 text-sm text-slate-300">Loading officers…</p>}
        {rateLimited && <p role="status" className="mb-3 text-sm text-amber-300">Refresh delayed. Last received statuses remain visible.</p>}
        <UnitDutyBoard units={units} calls={calls} fullPage />
    </div>;
}
export default function UnitStatus() { return <DashboardDataProvider><UnitStatusPage /></DashboardDataProvider>; }