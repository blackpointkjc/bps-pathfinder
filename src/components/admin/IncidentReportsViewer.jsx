import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FileText, Printer, Search, X } from 'lucide-react';

export default function IncidentReportsViewer() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);
    const [showDetail, setShowDetail] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        try {
            setLoading(true);
            // Fetch all reports from linked app via the bridge
            const res = await base44.functions.invoke('getIncidentReports');
            if (res.data?.reports) {
                setReports(res.data.reports);
            }
        } catch (error) {
            console.error('Error loading reports:', error);
            toast.error('Failed to load reports');
        } finally {
            setLoading(false);
        }
    };

    const filteredReports = reports.filter(r => 
        r.report_number?.includes(searchQuery.toUpperCase()) ||
        r.incident_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporting_officer?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handlePrint = (report) => {
        window.print();
    };

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <Input
                        placeholder="Search by report #, incident type, location, or officer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white text-sm pl-10 placeholder-slate-500"
                    />
                </div>
                <Button onClick={loadReports} variant="outline" className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
                    REFRESH
                </Button>
            </div>

            {/* Reports List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
                </div>
            ) : filteredReports.length === 0 ? (
                <Card className="bg-slate-900 border-slate-800 p-8 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 font-mono">NO INCIDENT REPORTS FOUND</p>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {filteredReports.map((report) => (
                        <Card key={report.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 cursor-pointer" onClick={() => {
                                        setSelectedReport(report);
                                        setShowDetail(true);
                                    }}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                            <span className="font-mono font-bold text-white">{report.report_number}</span>
                                            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs font-mono">
                                                {report.status || 'SUBMITTED'}
                                            </Badge>
                                        </div>
                                        <p className="text-white font-mono font-semibold text-sm mb-1">{report.incident_type}</p>
                                        <p className="text-slate-400 text-xs font-mono mb-2">{report.location}</p>
                                        <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                                            <span>Officer: {report.reporting_officer}</span>
                                            <span>{new Date(report.created_date || report.incident_date).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            setSelectedReport(report);
                                            setShowDetail(true);
                                        }}
                                        variant="outline"
                                        className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 font-mono text-xs"
                                    >
                                        VIEW
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Detail View Dialog */}
            <Dialog open={showDetail} onOpenChange={setShowDetail}>
                <DialogContent className="max-w-4xl max-h-[90vh] bg-white border-gray-200 p-0 overflow-hidden">
                    {selectedReport && (
                        <div className="flex flex-col h-full">
                            {/* Print Toolbar */}
                            <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-6 py-3 no-print">
                                <DialogTitle className="text-gray-800 font-serif text-lg">
                                    INCIDENT REPORT #{selectedReport.report_number}
                                </DialogTitle>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => window.print()}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs"
                                    >
                                        <Printer className="w-4 h-4 mr-2" />
                                        PRINT
                                    </Button>
                                    <button
                                        onClick={() => setShowDetail(false)}
                                        className="text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Report Content */}
                            <ScrollArea className="flex-1 overflow-y-auto">
                                <div className="p-8 bg-white font-serif text-gray-900">
                                    {/* Incident Report Header */}
                                    <div className="text-center border-b-2 border-black pb-4 mb-6">
                                        <h1 className="text-2xl font-bold">INCIDENT REPORT</h1>
                                        <p className="text-sm mt-2">Black Point</p>
                                    </div>

                                    {/* Report Info Section */}
                                    <div className="grid grid-cols-3 gap-6 mb-6 text-sm">
                                        <div>
                                            <label className="block font-bold text-xs uppercase tracking-wide mb-1">Report Number</label>
                                            <div className="border-b border-black pb-1">{selectedReport.report_number}</div>
                                        </div>
                                        <div>
                                            <label className="block font-bold text-xs uppercase tracking-wide mb-1">Call Number</label>
                                            <div className="border-b border-black pb-1">{selectedReport.call_number}</div>
                                        </div>
                                        <div>
                                            <label className="block font-bold text-xs uppercase tracking-wide mb-1">Date</label>
                                            <div className="border-b border-black pb-1">{selectedReport.incident_date}</div>
                                        </div>
                                    </div>

                                    {/* Incident Information */}
                                    <div className="mb-6">
                                        <h2 className="text-lg font-bold border-b-2 border-black pb-2 mb-4">INCIDENT INFORMATION</h2>
                                        <div className="grid grid-cols-2 gap-6 text-sm mb-4">
                                            <div>
                                                <label className="block font-bold text-xs uppercase tracking-wide mb-1">Type of Incident</label>
                                                <div className="border-b border-black pb-1 min-h-6">{selectedReport.incident_type}</div>
                                            </div>
                                            <div>
                                                <label className="block font-bold text-xs uppercase tracking-wide mb-1">Location</label>
                                                <div className="border-b border-black pb-1 min-h-6">{selectedReport.location}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block font-bold text-xs uppercase tracking-wide mb-1">Narrative</label>
                                            <div className="border border-black p-2 min-h-16 whitespace-pre-wrap text-sm">
                                                {selectedReport.description || selectedReport.action_taken || ''}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Victims */}
                                    {selectedReport.victims && (
                                        <div className="mb-6">
                                            <h2 className="text-lg font-bold border-b-2 border-black pb-2 mb-3">VICTIMS</h2>
                                            <div className="border border-black p-3 text-sm whitespace-pre-wrap min-h-12">
                                                {selectedReport.victims}
                                            </div>
                                        </div>
                                    )}

                                    {/* Witnesses */}
                                    {selectedReport.witnesses && (
                                        <div className="mb-6">
                                            <h2 className="text-lg font-bold border-b-2 border-black pb-2 mb-3">WITNESSES</h2>
                                            <div className="border border-black p-3 text-sm whitespace-pre-wrap min-h-12">
                                                {selectedReport.witnesses}
                                            </div>
                                        </div>
                                    )}

                                    {/* Suspects */}
                                    {selectedReport.suspects && selectedReport.suspects.trim() !== '' && (
                                        <div className="mb-6">
                                            <h2 className="text-lg font-bold border-b-2 border-black pb-2 mb-3">SUSPECTS</h2>
                                            <div className="border border-black p-3 text-sm whitespace-pre-wrap min-h-12">
                                                {selectedReport.suspects}
                                            </div>
                                        </div>
                                    )}

                                    {/* Suspect Vehicles */}
                                    {selectedReport.suspect_vehicles && selectedReport.suspect_vehicles.trim() !== '' && (
                                        <div className="mb-6">
                                            <h2 className="text-lg font-bold border-b-2 border-black pb-2 mb-3">SUSPECT VEHICLES</h2>
                                            <div className="border border-black p-3 text-sm whitespace-pre-wrap min-h-12">
                                                {selectedReport.suspect_vehicles}
                                            </div>
                                        </div>
                                    )}

                                    {/* Officer Info */}
                                    <div className="mb-6 pt-4 border-t-2 border-black">
                                        <div className="grid grid-cols-2 gap-6 text-sm">
                                            <div>
                                                <label className="block font-bold text-xs uppercase tracking-wide mb-1">Reporting Officer</label>
                                                <div className="border-b border-black pb-1 min-h-6">{selectedReport.reporting_officer}</div>
                                            </div>
                                            <div>
                                                <label className="block font-bold text-xs uppercase tracking-wide mb-1">Badge Number</label>
                                                <div className="border-b border-black pb-1 min-h-6">{selectedReport.badge_number || ''}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="text-xs text-gray-600 border-t pt-4 mt-6">
                                        <p>Submitted: {new Date(selectedReport.created_date || selectedReport.incident_date).toLocaleString()}</p>
                                        <p>Status: {selectedReport.status || 'SUBMITTED'}</p>
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Print Styles */}
            <style>{`
                @media print {
                    body {
                        background: white;
                        color: black;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .dialog-content {
                        max-width: 100%;
                        border: none;
                    }
                    .radix-scroll-area-viewport {
                        overflow: visible !important;
                    }
                }
            `}</style>
        </div>
    );
}