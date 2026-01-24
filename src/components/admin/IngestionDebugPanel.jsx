import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function IngestionDebugPanel() {
    const [loading, setLoading] = useState(false);
    const [diagnostics, setDiagnostics] = useState(null);

    const runDiagnostic = async () => {
        setLoading(true);
        try {
            toast.loading('Running ingestion diagnostic...', { id: 'diag' });
            
            const result = await base44.functions.invoke('scrapeActiveCalls', {});
            
            setDiagnostics({
                timestamp: new Date().toLocaleString(),
                scraped: result.data?.scraped || 0,
                saved: result.data?.saved || 0,
                geocoded: result.data?.geocoded || 0,
                failed: result.data?.failed || 0,
                geocodeRate: result.data?.geocodeRate || '0%',
                totalRows: result.data?.diagnostics?.totalRows || 0,
                parseErrors: result.data?.diagnostics?.parseErrors || 0,
                agencies: result.data?.diagnostics?.agenciesDetected || []
            });
            
            toast.success('Diagnostic complete', { id: 'diag' });
        } catch (error) {
            toast.error(`Diagnostic failed: ${error.message}`, { id: 'diag' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                        🔍 Ingestion Diagnostics
                        <Badge variant="outline" className="text-xs">Admin Only</Badge>
                    </CardTitle>
                    <Button 
                        onClick={runDiagnostic} 
                        disabled={loading}
                        size="sm"
                        variant="outline"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Run Test
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {!diagnostics ? (
                    <div className="text-slate-400 text-center py-8">
                        Click "Run Test" to fetch diagnostic data from gractivecalls.com
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-slate-800 p-3 rounded-lg">
                                <div className="text-slate-400 text-xs mb-1">Last Fetch</div>
                                <div className="text-white text-sm">{diagnostics.timestamp}</div>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-lg">
                                <div className="text-slate-400 text-xs mb-1">Total Rows</div>
                                <div className="text-white text-lg font-bold">{diagnostics.totalRows}</div>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-lg">
                                <div className="text-slate-400 text-xs mb-1">Calls Saved</div>
                                <div className="text-green-400 text-lg font-bold">{diagnostics.saved}</div>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-lg">
                                <div className="text-slate-400 text-xs mb-1">Parse Errors</div>
                                <div className={`text-lg font-bold ${diagnostics.parseErrors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {diagnostics.parseErrors}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-800 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                <div className="text-white font-semibold">Agencies Detected ({diagnostics.agencies.length})</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {diagnostics.agencies.map(agency => (
                                    <Badge 
                                        key={agency}
                                        className={`${
                                            agency.includes('CCPD') || agency.includes('CCFD') 
                                                ? 'bg-blue-600' 
                                                : 'bg-slate-700'
                                        } text-white`}
                                    >
                                        {agency}
                                    </Badge>
                                ))}
                            </div>
                            {diagnostics.agencies.some(a => a.includes('CCPD') || a.includes('CCFD')) && (
                                <div className="mt-3 text-green-400 text-sm flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    ✓ Chesterfield agencies detected successfully
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-800 p-4 rounded-lg">
                            <div className="text-slate-400 text-xs mb-2">Geocoding Performance</div>
                            <div className="flex items-center justify-between">
                                <div className="text-white">
                                    <span className="text-2xl font-bold">{diagnostics.geocodeRate}</span>
                                    <span className="text-slate-400 text-sm ml-2">success rate</span>
                                </div>
                                <div className="text-slate-400 text-sm">
                                    {diagnostics.geocoded} / {diagnostics.saved} calls geocoded
                                </div>
                            </div>
                        </div>

                        {diagnostics.parseErrors > 0 && (
                            <div className="bg-red-900/20 border border-red-700 p-4 rounded-lg">
                                <div className="flex items-center gap-2 text-red-400">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="font-semibold">Parse Errors Detected</span>
                                </div>
                                <div className="text-red-300 text-sm mt-2">
                                    {diagnostics.parseErrors} calls could not be parsed. Check console logs for details.
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}