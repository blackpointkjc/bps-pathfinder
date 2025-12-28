import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ArrowLeft, Search, Clock, MapPin, Radio, History, Filter, Calendar, SortAsc, SortDesc } from 'lucide-react';

const getAgencyColor = (agency) => {
    if (agency?.includes('RPD')) return 'bg-blue-600 text-white';
    if (agency?.includes('CCPD')) return 'bg-blue-700 text-white';
    if (agency?.includes('HPD') || agency?.includes('HCPD')) return 'bg-purple-600 text-white';
    if (agency?.includes('CCFD') || agency?.includes('RFD')) return 'bg-red-600 text-white';
    if (agency?.includes('EMS')) return 'bg-yellow-500 text-black';
    return 'bg-gray-600 text-white';
};

export default function CallHistory() {
    const [calls, setCalls] = useState([]);
    const [filteredCalls, setFilteredCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('date'); // date, incident, area
    const [sortOrder, setSortOrder] = useState('desc'); // asc, desc
    const [selectedAgency, setSelectedAgency] = useState('all');

    useEffect(() => {
        loadHistory();
    }, []);

    useEffect(() => {
        filterAndSort();
    }, [calls, searchQuery, sortBy, sortOrder, selectedAgency]);

    const loadHistory = async () => {
        try {
            const history = await base44.entities.CallHistory.list('-archived_date', 500);
            console.log(`Loaded ${history?.length || 0} historical calls`);
            setCalls(history || []);
            
            if (!history || history.length === 0) {
                console.log('No call history found. This is normal if no calls have been archived yet.');
            }
        } catch (error) {
            console.error('Error loading call history:', error);
            
            // Don't show error if the entity just doesn't have data yet
            if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
                console.log('CallHistory entity exists but has no records yet');
            } else {
                toast.error('Failed to load call history');
            }
        } finally {
            setLoading(false);
        }
    };

    const filterAndSort = () => {
        let filtered = [...calls];

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(call => 
                call.incident?.toLowerCase().includes(query) ||
                call.location?.toLowerCase().includes(query) ||
                call.agency?.toLowerCase().includes(query)
            );
        }

        // Filter by agency
        if (selectedAgency !== 'all') {
            filtered = filtered.filter(call => 
                call.agency?.includes(selectedAgency)
            );
        }

        // Sort
        filtered.sort((a, b) => {
            let comparison = 0;
            
            if (sortBy === 'date') {
                const dateA = new Date(a.archived_date || a.created_date);
                const dateB = new Date(b.archived_date || b.created_date);
                comparison = dateA - dateB;
            } else if (sortBy === 'incident') {
                comparison = (a.incident || '').localeCompare(b.incident || '');
            } else if (sortBy === 'area') {
                comparison = (a.location || '').localeCompare(b.location || '');
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        setFilteredCalls(filtered);
    };

    const agencies = ['all', 'RPD', 'RFD', 'CCPD', 'CCFD', 'HPD', 'HCPD', 'BPS'];

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={() => window.location.href = '/navigation'}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        <div>
                            <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
                                <History className="w-10 h-10 text-red-600" />
                                Call History
                            </h1>
                            <p className="text-gray-600 mt-1">
                                {filteredCalls.length} {filteredCalls.length === 1 ? 'call' : 'calls'} found
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <Card className="p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Search */}
                        <div className="md:col-span-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by incident, location, or agency..."
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Agency Filter */}
                        <div>
                            <select
                                value={selectedAgency}
                                onChange={(e) => setSelectedAgency(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {agencies.map(agency => (
                                    <option key={agency} value={agency}>
                                        {agency === 'all' ? 'All Agencies' : agency}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="flex gap-2">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="date">Date</option>
                                <option value="incident">Incident</option>
                                <option value="area">Area</option>
                            </select>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            >
                                {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Call List */}
                {filteredCalls.length === 0 ? (
                    <Card className="p-12 text-center">
                        <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Calls Found</h3>
                        <p className="text-gray-600">
                            {searchQuery || selectedAgency !== 'all' 
                                ? 'Try adjusting your filters'
                                : 'Call history will appear here once calls are archived'}
                        </p>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {filteredCalls.map((call, index) => (
                            <motion.div
                                key={call.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Card className="p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-3">
                                                <h3 className="text-xl font-bold text-gray-900">
                                                    {call.incident}
                                                </h3>
                                                <Badge className={getAgencyColor(call.agency)}>
                                                    {call.agency}
                                                </Badge>
                                                <Badge variant="outline" className="bg-gray-100">
                                                    {call.status}
                                                </Badge>
                                            </div>

                                            {call.ai_summary && (
                                                <p className="text-sm text-gray-600 mb-3 bg-blue-50 p-3 rounded-lg">
                                                    {call.ai_summary}
                                                </p>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span>{call.location}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Clock className="w-4 h-4 text-gray-400" />
                                                    <span>{call.time_received}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span>
                                                        {new Date(call.archived_date || call.created_date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}