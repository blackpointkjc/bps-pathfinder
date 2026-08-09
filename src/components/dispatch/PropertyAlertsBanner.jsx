import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MapPin, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { stopAllAlerts } from '@/utils/alertUtils';

export default function PropertyAlertsBanner() {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAlerts();
        
        // Refresh alerts every 60 seconds
        const interval = setInterval(loadAlerts, 60000);
        return () => clearInterval(interval);
    }, []);

    const loadAlerts = async () => {
        try {
            const data = await base44.entities.PropertyAlert.filter(
                { acknowledged: false },
                '-created_date',
                10
            );
            setAlerts(data || []);
        } catch (error) {
            console.error('Error loading property alerts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAcknowledge = async (alert) => {
        // Silence immediately before waiting on the server write.
        stopAllAlerts();
        setAlerts(current => current.filter(item => item.id !== alert.id));
        try {
            const result = await base44.functions.invoke('acknowledgePropertyAlert', { alert_id: alert.id });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            toast.success('Alert acknowledged');
        } catch (error) {
            console.error('Error acknowledging alert:', error);
            toast.error('Failed to acknowledge alert');
            await loadAlerts();
        }
    };

    if (loading || alerts.length === 0) {
        return null;
    }

    return (
        <div className="mb-4">
            <Card className="bg-gradient-to-r from-orange-900/50 to-red-900/50 border-2 border-orange-500">
                <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-400 animate-pulse" />
                        <h3 className="text-sm font-bold text-white font-mono">
                            PROPERTY ALERTS
                        </h3>
                        <Badge className="bg-orange-500 text-white font-mono">
                            {alerts.length}
                        </Badge>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {alerts.map((alert) => (
                            <div
                                key={alert.id}
                                className="bg-slate-900/80 border border-orange-500/30 rounded-lg p-3 flex items-start justify-between"
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <MapPin className="w-3 h-3 text-orange-400" />
                                        <span className="text-white font-mono font-bold text-xs">
                                            {alert.propertyName}
                                        </span>
                                    </div>
                                    <p className="text-slate-300 text-xs font-mono">
                                        {alert.callIncident} at {alert.callLocation}
                                    </p>
                                    <p className="text-slate-500 text-xs font-mono mt-1">
                                        {alert.distanceMeters}m from property
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAcknowledge(alert)}
                                    className="text-slate-400 hover:text-white"
                                >
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