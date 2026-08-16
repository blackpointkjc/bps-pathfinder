import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Shield, Search, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export default function OfficerRoster() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
  });

  const { data: rosterEntries } = useQuery({
    queryKey: ['officerRoster'],
    queryFn: () => base44.entities.OfficerRoster.list('-created_date'),
  });

  const activeEntries = React.useMemo(() => {
    if (!rosterEntries || !allUsers) return [];
    
    const filtered = rosterEntries.filter(e => {
      if (e.status !== 'active') return false;
      
      const userRecord = allUsers.find(u => String(u.email || '').toLowerCase() === String(e.email || '').toLowerCase());
      return isOperationalOfficer(userRecord);
    });
    
    return filtered;
  }, [rosterEntries, allUsers]);

  const filteredEntries = activeEntries.filter(entry => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.first_name?.toLowerCase().includes(query) ||
      entry.last_name?.toLowerCase().includes(query) ||
      entry.rank?.toLowerCase().includes(query) ||
      entry.unit_number?.toLowerCase().includes(query) ||
      entry.division?.toLowerCase().includes(query)
    );
  });

  const groupByDivision = () => {
    const grouped = {};
    filteredEntries.forEach(entry => {
      // Skip entries without division
      if (!entry.division) return;
      
      const div = entry.division;
      if (!grouped[div]) grouped[div] = [];
      grouped[div].push(entry);
    });
    
    // Sort each division's entries by unit number
    Object.keys(grouped).forEach(div => {
      grouped[div].sort((a, b) => {
        const unitA = parseInt(a.unit_number) || 999999;
        const unitB = parseInt(b.unit_number) || 999999;
        return unitA - unitB;
      });
    });
    
    return grouped;
  };

  const groupedEntries = groupByDivision();
  
  // Sort divisions to put Headquarters first
  const sortedGroupedEntries = Object.entries(groupedEntries).sort(([divA], [divB]) => {
    if (divA.toLowerCase().includes('headquarters')) return -1;
    if (divB.toLowerCase().includes('headquarters')) return 1;
    return divA.localeCompare(divB);
  });

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Officer Roster</h1>
          <p className="text-slate-600">Company directory of security officers</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by name, rank, unit, or division..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-lg py-6"
          />
        </div>

        {sortedGroupedEntries.map(([division, entries]) => (
          <div key={division}>
            <h2 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {division}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entries.map((entry) => (
                <Card key={entry.id} className="border-none shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <CardTitle className="text-lg">
                      {entry.first_name} {entry.last_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {entry.rank && (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-600">{entry.rank}</Badge>
                        {entry.unit_number && <Badge variant="outline">Unit #{entry.unit_number}</Badge>}
                      </div>
                    )}
                    {entry.badge_number && <p className="text-sm text-slate-600"><strong>Badge:</strong> {entry.badge_number}</p>}
                    {entry.mobile_phone && (
                      <a href={`tel:${entry.mobile_phone}`} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {entry.mobile_phone}
                      </a>
                    )}
                    {entry.email && (
                      <a href={`mailto:${entry.email}`} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {entry.email}
                      </a>
                    )}
                    {entry.notes && (
                      <div className="pt-2 mt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500 whitespace-pre-wrap">{entry.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {sortedGroupedEntries.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">
                {searchQuery ? 'No officers found matching your search' : 'No active officers in roster'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}