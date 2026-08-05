
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Clock, MapPin, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminTimeEntries() {
  const [selectedOfficer, setSelectedOfficer] = useState("all");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('hr'),
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['allTimeEntries', selectedOfficer],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      if (selectedOfficer === 'all') return entries;
      return entries.filter(e => e.officer_email === selectedOfficer);
    },
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('hr'),
    refetchInterval: 5000,
  });

  const calculateHours = (clockIn, clockOut) => {
    if (!clockOut) return "Active";
    const diff = parseISO(clockOut).getTime() - parseISO(clockIn).getTime();
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    return `${hours}h ${minutes}m`;
  };

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

  const groupByOfficer = (entries) => {
    const grouped = {};
    entries?.forEach(entry => {
      if (!grouped[entry.officer_email]) {
        grouped[entry.officer_email] = [];
      }
      grouped[entry.officer_email].push(entry);
    });
    return grouped;
  };

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('hr')) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const groupedEntries = groupByOfficer(timeEntries);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">Time Entries</h1>
            <p className="text-slate-600">View all officer time clock records</p>
          </div>
          <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filter by officer..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Officers</SelectItem>
              {allUsers?.map((u) => (
                <SelectItem key={u.email} value={u.email}>
                  {u.first_name && u.last_name
                    ? `${u.first_name} ${u.last_name}`
                    : u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([officer, entries]) => (
            <Card key={officer} className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
                <CardTitle className="flex items-center justify-between">
                  <span>{getOfficerName(officer)}</span>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    {entries.length} entries
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <p className="font-medium text-slate-900">
                            {format(parseISO(entry.clock_in), 'MMM d, yyyy')}
                          </p>
                          {!entry.clock_out && (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              On Duty
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(parseISO(entry.clock_in), 'h:mm a')}
                            {entry.clock_out && ` - ${format(parseISO(entry.clock_out), 'h:mm a')}`}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {entry.location}
                          </div>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-2">{entry.notes}</p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-2xl font-bold text-slate-900">
                          {calculateHours(entry.clock_in, entry.clock_out)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!timeEntries?.length && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Clock className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No time entries yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
