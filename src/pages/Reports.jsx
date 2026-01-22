import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, FileText, Download, TrendingUp, Users, Radio, Clock } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Reports() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Check admin access
            if (user.role !== 'admin') {
                toast.error('Admin access required');
                window.location.href = createPageUrl('CADHome');
                return;
            }
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const reportTypes = [
        {
            title: 'CALL VOLUME BY AGENCY',
            description: 'Breakdown of calls by source and type',
            icon: Radio,
            color: 'blue'
        },
        {
            title: 'RESPONSE TIME ANALYSIS',
            description: 'Average response times and trends',
            icon: Clock,
            color: 'green'
        },
        {
            title: 'UNIT ACTIVITY REPORT',
            description: 'Calls handled per unit over time',
            icon: Users,
            color: 'purple'
        },
        {
            title: 'USER ACTIVITY LOGS',
            description: 'Dispatcher actions and system usage',
            icon: FileText,
            color: 'orange'
        }
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => window.location.href = createPageUrl('CADHome')}
                                className="text-slate-400 hover:text-white"
                            >
                                ← BACK
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <BarChart className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">COMMAND REPORTS</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {reportTypes.map((report, idx) => (
                        <Card key={idx} className="bg-slate-900 border-slate-800 hover:border-blue-500 transition-all cursor-pointer">
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`w-12 h-12 rounded-lg bg-${report.color}-500/20 border border-${report.color}-500/30 flex items-center justify-center`}>
                                        <report.icon className={`w-6 h-6 text-${report.color}-400`} />
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => toast.info('Report generation coming soon')}
                                        className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                    >
                                        <Download className="w-3 h-3 mr-2" />
                                        GENERATE
                                    </Button>
                                </div>
                                <h3 className="text-white font-bold font-mono mb-2">{report.title}</h3>
                                <p className="text-slate-400 text-sm">{report.description}</p>
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Coming Soon Notice */}
                <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30">
                    <div className="p-6 text-center">
                        <TrendingUp className="w-12 h-12 mx-auto text-blue-400 mb-4" />
                        <h2 className="text-xl font-bold text-white font-mono mb-2">ADVANCED REPORTING COMING SOON</h2>
                        <p className="text-slate-300 mb-4">
                            Full analytics dashboard with exportable PDF/CSV reports, custom date ranges, and real-time data visualization.
                        </p>
                        <Button
                            onClick={() => toast.info('Feature in development')}
                            className="bg-blue-600 hover:bg-blue-700 font-mono"
                        >
                            REQUEST EARLY ACCESS
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}