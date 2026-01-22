import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart, FileText, Download, TrendingUp, Radio, Clock, Users, Calendar } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Reports() {
    const [currentUser, setCurrentUser] = useState(null);
    const [reportType, setReportType] = useState('call_volume');
    const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            if (user.role !== 'admin' && !user.dispatch_role) {
                toast.error('Admin or Dispatch access required');
                window.location.href = createPageUrl('CADHome');
                return;
            }
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateReport = async () => {
        setGenerating(true);
        try {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            
            if (reportType === 'call_volume') {
                const calls = await base44.entities.DispatchCall.list('-created_date', 5000);
                const filtered = calls.filter(call => {
                    const callDate = new Date(call.created_date);
                    return callDate >= fromDate && callDate <= toDate;
                });
                
                const byAgency = {};
                filtered.forEach(call => {
                    const agency = call.agency || 'Unknown';
                    if (!byAgency[agency]) {
                        byAgency[agency] = { total: 0, byType: {}, byPriority: {} };
                    }
                    byAgency[agency].total++;
                    byAgency[agency].byType[call.incident] = (byAgency[agency].byType[call.incident] || 0) + 1;
                    byAgency[agency].byPriority[call.priority || 'medium'] = (byAgency[agency].byPriority[call.priority || 'medium'] || 0) + 1;
                });
                
                setReportData({ type: 'call_volume', data: byAgency, total: filtered.length, dateRange: { from: dateFrom, to: dateTo } });
            } else if (reportType === 'response_time') {
                const logs = await base44.entities.CallStatusLog.list('-created_date', 5000);
                const filtered = logs.filter(log => {
                    const logDate = new Date(log.created_date);
                    return logDate >= fromDate && logDate <= toDate;
                });
                
                const calls = await base44.entities.DispatchCall.list('-created_date', 5000);
                const responseTimes = calls.filter(call => call.time_received && call.time_on_scene).map(call => {
                    const received = new Date(call.time_received);
                    const onScene = new Date(call.time_on_scene);
                    return (onScene - received) / 60000; // minutes
                });
                
                const avg = responseTimes.length > 0 ? responseTimes.reduce((a,b) => a+b, 0) / responseTimes.length : 0;
                
                setReportData({ 
                    type: 'response_time', 
                    average: avg.toFixed(2), 
                    total: responseTimes.length,
                    times: responseTimes,
                    dateRange: { from: dateFrom, to: dateTo }
                });
            } else if (reportType === 'unit_activity') {
                const logs = await base44.entities.UnitStatusLog.list('-created_date', 5000);
                const filtered = logs.filter(log => {
                    const logDate = new Date(log.created_date);
                    return logDate >= fromDate && logDate <= toDate;
                });
                
                const byUnit = {};
                filtered.forEach(log => {
                    const unit = log.unit_name || 'Unknown';
                    if (!byUnit[unit]) {
                        byUnit[unit] = { statusChanges: 0, statuses: {} };
                    }
                    byUnit[unit].statusChanges++;
                    byUnit[unit].statuses[log.new_status] = (byUnit[unit].statuses[log.new_status] || 0) + 1;
                });
                
                setReportData({ type: 'unit_activity', data: byUnit, total: filtered.length, dateRange: { from: dateFrom, to: dateTo } });
            }
            
            toast.success('Report generated');
        } catch (error) {
            console.error('Error generating report:', error);
            toast.error('Failed to generate report');
        } finally {
            setGenerating(false);
        }
    };

    const exportCSV = () => {
        if (!reportData) return;
        
        let csv = '';
        
        if (reportData.type === 'call_volume') {
            csv = 'Agency,Total Calls,Call Types,Priorities\n';
            Object.entries(reportData.data).forEach(([agency, stats]) => {
                const types = Object.entries(stats.byType).map(([t,c]) => `${t}:${c}`).join(';');
                const priorities = Object.entries(stats.byPriority).map(([p,c]) => `${p}:${c}`).join(';');
                csv += `${agency},${stats.total},"${types}","${priorities}"\n`;
            });
        } else if (reportData.type === 'response_time') {
            csv = 'Average Response Time (min),Total Calls,Date Range\n';
            csv += `${reportData.average},${reportData.total},${reportData.dateRange.from} to ${reportData.dateRange.to}\n`;
        } else if (reportData.type === 'unit_activity') {
            csv = 'Unit,Status Changes,Status Breakdown\n';
            Object.entries(reportData.data).forEach(([unit, stats]) => {
                const statuses = Object.entries(stats.statuses).map(([s,c]) => `${s}:${c}`).join(';');
                csv += `${unit},${stats.statusChanges},"${statuses}"\n`;
            });
        }
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportData.type}_report_${Date.now()}.csv`;
        a.click();
        toast.success('CSV exported');
    };

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
                                className="text-slate-400 hover:text-white font-mono text-xs"
                            >
                                ← CAD HOME
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <BarChart className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">COMMAND REPORTS</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('ActiveCalls')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                CALLS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Units')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                UNITS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Personnel')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                PERSONNEL
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-12 gap-6">
                    {/* Left: Report Configuration */}
                    <div className="col-span-4">
                        <Card className="bg-slate-900 border-slate-800">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <h2 className="text-lg font-bold text-white font-mono">REPORT CONFIGURATION</h2>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-xs text-slate-400 font-mono mb-2 block">REPORT TYPE</label>
                                    <Select value={reportType} onValueChange={setReportType}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="call_volume">Call Volume by Agency</SelectItem>
                                            <SelectItem value="response_time">Response Time Analysis</SelectItem>
                                            <SelectItem value="unit_activity">Unit Activity Report</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div>
                                    <label className="text-xs text-slate-400 font-mono mb-2 block">DATE FROM</label>
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white font-mono"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-xs text-slate-400 font-mono mb-2 block">DATE TO</label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white font-mono"
                                    />
                                </div>
                                
                                <Button
                                    onClick={generateReport}
                                    disabled={generating}
                                    className="w-full bg-blue-600 hover:bg-blue-700 font-mono"
                                >
                                    {generating ? 'GENERATING...' : 'GENERATE REPORT'}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* Right: Report Results */}
                    <div className="col-span-8">
                        {!reportData ? (
                            <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)] flex items-center justify-center">
                                <div className="text-center text-slate-500 font-mono">
                                    <BarChart className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>CONFIGURE AND GENERATE REPORT</p>
                                </div>
                            </Card>
                        ) : (
                            <Card className="bg-slate-900 border-slate-800">
                                <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-bold text-white font-mono">REPORT RESULTS</h2>
                                        <Button
                                            size="sm"
                                            onClick={exportCSV}
                                            className="bg-green-600 hover:bg-green-700 font-mono text-xs"
                                        >
                                            <Download className="w-3 h-3 mr-2" />
                                            EXPORT CSV
                                        </Button>
                                    </div>
                                </div>
                                <ScrollArea className="h-[calc(100vh-280px)]">
                                    <div className="p-4">
                                        {reportData.type === 'call_volume' && (
                                            <div className="space-y-4">
                                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                                    <p className="text-xs text-slate-400 font-mono mb-1">TOTAL CALLS</p>
                                                    <p className="text-4xl font-bold text-blue-400 font-mono">{reportData.total}</p>
                                                    <p className="text-xs text-slate-400 font-mono mt-2">
                                                        {reportData.dateRange.from} to {reportData.dateRange.to}
                                                    </p>
                                                </div>
                                                
                                                {Object.entries(reportData.data).map(([agency, stats]) => (
                                                    <div key={agency} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h3 className="text-white font-mono font-bold">{agency}</h3>
                                                            <span className="text-blue-400 font-mono text-2xl font-bold">{stats.total}</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div>
                                                                <p className="text-xs text-slate-400 font-mono mb-1">BY TYPE</p>
                                                                {Object.entries(stats.byType).slice(0, 5).map(([type, count]) => (
                                                                    <div key={type} className="flex justify-between text-sm">
                                                                        <span className="text-slate-300">{type}</span>
                                                                        <span className="text-white font-mono">{count}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-slate-400 font-mono mb-1">BY PRIORITY</p>
                                                                {Object.entries(stats.byPriority).map(([priority, count]) => (
                                                                    <div key={priority} className="flex justify-between text-sm">
                                                                        <span className="text-slate-300">{priority.toUpperCase()}</span>
                                                                        <span className="text-white font-mono">{count}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {reportData.type === 'response_time' && (
                                            <div className="space-y-4">
                                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                                                    <p className="text-xs text-slate-400 font-mono mb-1">AVERAGE RESPONSE TIME</p>
                                                    <p className="text-4xl font-bold text-green-400 font-mono">{reportData.average} min</p>
                                                    <p className="text-xs text-slate-400 font-mono mt-2">
                                                        Based on {reportData.total} calls
                                                    </p>
                                                </div>
                                                
                                                {reportData.times.length > 0 && (
                                                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                                                        <p className="text-xs text-slate-400 font-mono mb-2">DISTRIBUTION</p>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-slate-300">Fastest</span>
                                                                <span className="text-white font-mono">{Math.min(...reportData.times).toFixed(2)} min</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-slate-300">Slowest</span>
                                                                <span className="text-white font-mono">{Math.max(...reportData.times).toFixed(2)} min</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {reportData.type === 'unit_activity' && (
                                            <div className="space-y-4">
                                                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                                                    <p className="text-xs text-slate-400 font-mono mb-1">TOTAL STATUS CHANGES</p>
                                                    <p className="text-4xl font-bold text-purple-400 font-mono">{reportData.total}</p>
                                                </div>
                                                
                                                {Object.entries(reportData.data).map(([unit, stats]) => (
                                                    <div key={unit} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h3 className="text-white font-mono font-bold">{unit}</h3>
                                                            <span className="text-purple-400 font-mono text-2xl font-bold">{stats.statusChanges}</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-slate-400 font-mono mb-1">STATUS BREAKDOWN</p>
                                                            {Object.entries(stats.statuses).map(([status, count]) => (
                                                                <div key={status} className="flex justify-between text-sm">
                                                                    <span className="text-slate-300">{status}</span>
                                                                    <span className="text-white font-mono">{count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}