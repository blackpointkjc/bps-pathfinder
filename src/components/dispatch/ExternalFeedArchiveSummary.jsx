import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, Clock, TrendingDown } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function ExternalFeedArchiveSummary({ onViewArchived }) {
    const [summary, setSummary] = useState({
        archivedLast24h: 0,
        archivedLast7d: 0,
        lastArchiveTime: null
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSummary();
        const interval = setInterval(loadSummary, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    const loadSummary = async () => {
        try {
            const response = await base44.functions.invoke('getArchiveSummary', {});
            if (response.data?.success) {
                setSummary({
                    archivedLast24h: response.data.archivedLast24h || 0,
                    archivedLast7d: response.data.archivedLast7d || 0,
                    lastArchiveTime: response.data.lastArchiveTime
                });
            }
        } catch (error) {
            console.error('Error loading archive summary:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    return (
        <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                        <Archive className="w-4 h-4 text-slate-400" />
                        <h3 className="text-xs font-bold text-slate-300 font-mono">EXTERNAL FEED ARCHIVE</h3>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <p className="text-xs text-slate-500 font-mono mb-1">24 HOURS</p>
                            <p className="text-lg font-bold text-slate-200 font-mono">{summary.archivedLast24h}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-mono mb-1">7 DAYS</p>
                            <p className="text-lg font-bold text-slate-200 font-mono">{summary.archivedLast7d}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-mono mb-1">LAST RUN</p>
                            <p className="text-xs text-slate-400 font-mono">{formatTime(summary.lastArchiveTime)}</p>
                        </div>
                    </div>
                </div>

                <Button
                    size="sm"
                    onClick={onViewArchived}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs h-fit"
                >
                    <TrendingDown className="w-3 h-3 mr-1" />
                    VIEW ARCHIVED
                </Button>
            </div>
        </Card>
    );
}