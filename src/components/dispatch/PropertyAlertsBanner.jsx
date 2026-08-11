import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MapPin, CheckCircle, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { stopAllAlerts } from '@/utils/alertUtils';
import { formatEasternTime } from '@/lib/easternTime';

export default function PropertyAlertsBanner() {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAlerts();
        const interval = setInterval(loadAlerts, 60000);
        return () => clearInterval(interval);
    }, []);

    const loadAlerts = async () => {
        try {
            const me = await base44.auth.me();
            const email = String(me?.email || '').trim().toLowerCase();
            const [data, receipts, calls] = await Promise.all([
                base44.entities.PropertyAlert.list('-created_date', 100),
                email ? base44.entities.PropertyAlertReceipt.filter({ user_email: email }, '-dismissed_at', 300).catch(() => []) : Promise.resolve([]),
                base44.entities.DispatchCall.list('-created_date', 300).catch(() => []),
            ]);

            const dismissedPairs = new Set((receipts || []).map(item => `${item.call_id}:${item.property_id}`));
            const activeCallById = new Map((calls || [])
                .filter(call => !['Cleared', 'Cancelled'].includes(call.status))
                .map(call => [String(call.id), call]));
            const seenPairs = new Set();
            const visible = [];

            for (const alert of data || []) {
                const pair = `${alert.callId}:${alert.propertyId}`;
                if (seenPairs.has(pair)) continue;
                seenPairs.add(pair);
                if (dismissedPairs.has(pair)) continue;
                const linkedCall = activeCallById.get(String(alert.callId));
                if (!linkedCall) continue;
                visible.push({ ...alert, _callTime: linkedCall.time_received || linkedCall.created_date });
                if (visible.length >= 10) break;
            }
            setAlerts(visible);
        } catch (error) {
            console.error('Error loading property alerts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAcknowledge = async (alert) => {
        stopAllAlerts();
        const pair = `${alert.callId}:${alert.propertyId}`;
        setAlerts(current => current.filter(item => `${item.callId}:${item.propertyId}` !== pair));
        try {
            const result = await base44.functions.invoke('acknowledgePropertyAlert', { alert_id: alert.id, action: 'acknowledged' });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            toast.success('Property call acknowledged for your account');
        } catch (error) {
            console.error('Error acknowledging alert:', error);
            toast.error('Failed to acknowledge property call');
            await loadAlerts();
        }
    };

    if (loading || alerts.length === 0) return null;

    return (
        <div className="mb-4">
            <Card className="bg-gradient-to-r from-orange-900/50 to-red-900/50 border-2 border-orange-500">
                <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-400 animate-pulse" />
                        <h3 className="text-sm font-bold text-white font-mono">PROPERTY ALERTS</h3>
                        <Badge className="bg-orange-500 text-white font-mono">{alerts.length}</Badge>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {alerts.map((alert) => (
                            <div key={alert.id} className="bg-slate-900/80 border border-orange-500/30 rounded-lg p-3 flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <MapPin className="w-3 h-3 text-orange-400" />
                                        <span className="text-white font-mono font-bold text-xs">{alert.propertyName}</span>
                                    </div>
                                    <p className="text-slate-300 text-xs font-mono">{alert.callIncident} at {alert.callLocation}</p>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
                                        <span>{alert.distanceMeters}m from property</span>
                                        <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatEasternTime(alert._callTime || alert.callTime || alert.time_received || alert.created_date)} ET</span>
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => handleAcknowledge(alert)} className="text-slate-400 hover:text-white" title="Acknowledge for my account">
                                    <CheckCircle className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        </div>
    );
}
