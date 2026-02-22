import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Search, FileText, Car, User, Loader2 } from 'lucide-react';

export default function LinkedAppSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const res = await base44.functions.invoke('searchLinkedApp', { query });
            setResults(res.data);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    return (
        <div className="min-h-screen bg-slate-950 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                        <Search className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-mono">LINKED APP SEARCH</h1>
                        <p className="text-slate-400 text-xs font-mono">Search Incident Reports, Vehicles, and Persons</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="flex gap-3">
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search by name, plate, report number, location..."
                        className="bg-slate-800 border-slate-700 text-white placeholder-slate-500 font-mono flex-1"
                    />
                    <Button
                        onClick={handleSearch}
                        disabled={loading || !query.trim()}
                        className="bg-purple-600 hover:bg-purple-700 font-mono"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading ? 'SEARCHING...' : 'SEARCH'}
                    </Button>
                </div>

                {/* Results */}
                {results && (
                    <div className="space-y-6">
                        {/* Incident Reports */}
                        <Section
                            title="INCIDENT REPORTS"
                            icon={<FileText className="w-4 h-4 text-blue-400" />}
                            count={results.incidentReports?.length || 0}
                            color="blue"
                        >
                            {results.incidentReports?.length === 0 ? (
                                <EmptyRow />
                            ) : results.incidentReports?.map(r => (
                                <IncidentRow key={r.id} report={r} />
                            ))}
                        </Section>

                        {/* Vehicles */}
                        <Section
                            title="VEHICLES"
                            icon={<Car className="w-4 h-4 text-yellow-400" />}
                            count={results.vehicles?.length || 0}
                            color="yellow"
                        >
                            {results.vehicles?.length === 0 ? (
                                <EmptyRow />
                            ) : results.vehicles?.map(v => (
                                <VehicleRow key={v.id} vehicle={v} />
                            ))}
                        </Section>

                        {/* Persons */}
                        <Section
                            title="PERSONS"
                            icon={<User className="w-4 h-4 text-green-400" />}
                            count={results.persons?.length || 0}
                            color="green"
                        >
                            {results.persons?.length === 0 ? (
                                <EmptyRow />
                            ) : results.persons?.map(p => (
                                <PersonRow key={p.id} person={p} />
                            ))}
                        </Section>
                    </div>
                )}
            </div>
        </div>
    );
}

function Section({ title, icon, count, color, children }) {
    const borderColors = { blue: 'border-blue-500/30', yellow: 'border-yellow-500/30', green: 'border-green-500/30' };
    const headerColors = { blue: 'border-blue-500/20', yellow: 'border-yellow-500/20', green: 'border-green-500/20' };
    const badgeColors = { blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30', yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', green: 'bg-green-500/20 text-green-400 border-green-500/30' };

    return (
        <Card className={`bg-slate-900 border ${borderColors[color]}`}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${headerColors[color]}`}>
                {icon}
                <span className="text-white font-mono font-bold text-sm">{title}</span>
                <Badge className={`${badgeColors[color]} border font-mono text-xs ml-1`}>{count}</Badge>
            </div>
            <div className="divide-y divide-slate-800">{children}</div>
        </Card>
    );
}

function EmptyRow() {
    return <div className="px-4 py-3 text-slate-500 font-mono text-sm">No results found</div>;
}

function IncidentRow({ report }) {
    return (
        <div className="px-4 py-3 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {report.report_number && (
                            <span className="text-blue-400 font-mono font-bold text-sm">#{report.report_number}</span>
                        )}
                        {report.incident_type && (
                            <Badge className="bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono text-xs">
                                {report.incident_type}
                            </Badge>
                        )}
                        {report.severity && (
                            <Badge className="bg-orange-500/10 text-orange-300 border border-orange-500/20 font-mono text-xs">
                                {report.severity}
                            </Badge>
                        )}
                        {report.status && (
                            <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">{report.status}</Badge>
                        )}
                    </div>
                    {report.location && (
                        <p className="text-slate-300 text-xs font-mono">{report.location}</p>
                    )}
                    {report.description && (
                        <p className="text-slate-500 text-xs line-clamp-2">{report.description}</p>
                    )}
                </div>
                <div className="text-right shrink-0">
                    {report.incident_date && (
                        <p className="text-slate-400 font-mono text-xs">{report.incident_date}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function VehicleRow({ vehicle }) {
    return (
        <div className="px-4 py-3 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {vehicle.license_plate && (
                            <span className="text-yellow-400 font-mono font-bold text-sm">{vehicle.license_plate}</span>
                        )}
                        {vehicle.make && vehicle.model && (
                            <span className="text-white font-mono text-sm">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                        )}
                        {vehicle.color && (
                            <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">{vehicle.color}</Badge>
                        )}
                    </div>
                    {vehicle.vin && <p className="text-slate-400 font-mono text-xs">VIN: {vehicle.vin}</p>}
                    {vehicle.owner_name && <p className="text-slate-400 font-mono text-xs">Owner: {vehicle.owner_name}</p>}
                </div>
                <div className="text-right shrink-0">
                    {vehicle.state && (
                        <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">{vehicle.state}</Badge>
                    )}
                </div>
            </div>
        </div>
    );
}

function PersonRow({ person }) {
    return (
        <div className="px-4 py-3 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {(person.first_name || person.last_name) && (
                            <span className="text-green-400 font-mono font-bold text-sm">
                                {[person.first_name, person.last_name].filter(Boolean).join(' ')}
                            </span>
                        )}
                        {person.full_name && !person.first_name && (
                            <span className="text-green-400 font-mono font-bold text-sm">{person.full_name}</span>
                        )}
                        {person.role && (
                            <Badge className="bg-green-500/10 text-green-300 border border-green-500/20 font-mono text-xs">
                                {person.role}
                            </Badge>
                        )}
                    </div>
                    {person.dob && <p className="text-slate-400 font-mono text-xs">DOB: {person.dob}</p>}
                    {person.address && <p className="text-slate-400 font-mono text-xs">{person.address}</p>}
                    {person.phone && <p className="text-slate-400 font-mono text-xs">📞 {person.phone}</p>}
                    {person.description && (
                        <p className="text-slate-500 text-xs line-clamp-2">{person.description}</p>
                    )}
                </div>
                <div className="text-right shrink-0">
                    {person.id_number && (
                        <p className="text-slate-400 font-mono text-xs">ID: {person.id_number}</p>
                    )}
                </div>
            </div>
        </div>
    );
}