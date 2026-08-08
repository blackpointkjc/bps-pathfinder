import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Search, Phone, Mail, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function DivisionDirectory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("all");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ['allUsersDirectory'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: divisions } = useQuery({
    queryKey: ['activeDivisions'],
    queryFn: async () => {
      const allDivisions = await base44.entities.Division.list('division_name');
      return allDivisions.filter(div => div.active);
    },
  });

  // Rank hierarchy (lower number = higher rank)
  const rankOrder = {
    'Colonel (Operations Manager)': 1,
    'Lieutenant Colonel (Deputy Operations Manager)': 2,
    'Major (Division Commander)': 3,
    'Captain': 4,
    'Lieutenant': 5,
    'Sergeant': 6,
    'Corporal': 7,
    'Officer': 8,
  };

  const userRankOrder = rankOrder[user?.rank] || 99;

  const displayUsers = useMemo(() => {
    if (!allUsers) return [];

    return allUsers
      .filter(u => {
        // Operational directory never exposes client, student, or pending accounts.
        const roles = new Set([u.role, ...(u.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));
        const userType = String(u.user_type || u.account_type || u.portal_type || '').toLowerCase();
        const accountStatus = String(u.account_status || '').toLowerCase();
        if (roles.has('client') || roles.has('student') || roles.has('pending')) return false;
        if (['client', 'student', 'pending'].includes(userType) || accountStatus === 'pending') return false;
        
        // Filter out users who don't want to be shown
        if (u.show_in_directory === false) return false;
        
        // Filter out terminated users
        if (u.termination_date) return false;

        // Admin sees everyone
        if (user?.role === 'admin') {
          // Continue with other filters
        } else {
          // For supervisors, show officers up to one rank higher
          const officerRankOrder = rankOrder[u.rank] || 99;
          if (officerRankOrder < userRankOrder - 1) return false;
        }

        // Apply search query
        const matchesSearch = !searchQuery ||
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.rank?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.unit_number?.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        // If division filter is active, filter by division for command ranks or match exact division
        if (selectedDivision !== "all") {
          // Division Command: Senior Corporal to Captain ranks from their assigned division
          const commandRanks = ['Senior Corporal', 'Sergeant', 'Lieutenant', 'Captain'];
          if (commandRanks.includes(u.rank) && u.division === selectedDivision) {
            return true;
          }
          // Regular filter for others
          return u.division === selectedDivision;
        }

        return true;
      })
      .map(u => {
        // Determine display role based on user's roles
        let displayRole = u.role;

        if (u.additional_roles?.length > 0) {
          const roleMap = {
            'supervisor': 'Supervisor',
            'support': 'Support',
            'hr': 'HR',
            'admin': 'Admin'
          };
          const rolesToCombine = new Set();

          // Add primary role if it's 'admin'
          if (u.role === 'admin') {
            rolesToCombine.add('Admin');
          }

          u.additional_roles.forEach(ar => {
            if (roleMap[ar]) {
              rolesToCombine.add(roleMap[ar]);
            } else {
              rolesToCombine.add(ar.charAt(0).toUpperCase() + ar.slice(1));
            }
          });

          // Sort roles to ensure 'Admin' is first if multiple roles are present
          let finalRoles = Array.from(rolesToCombine).sort((a, b) => {
            if (a === 'Admin') return -1;
            if (b === 'Admin') return 1;
            return 0;
          });

          displayRole = finalRoles.join(', ');
        } else {
          displayRole = u.role;
        }

        // Ensure the displayRole is capitalized if it's a single word string
        if (displayRole && typeof displayRole === 'string' && !displayRole.includes(',')) {
          displayRole = displayRole.charAt(0).toUpperCase() + displayRole.slice(1);
        } else if (!displayRole) {
          displayRole = 'Officer';
        }

        return {
          ...u,
          displayRole
        };
      })
      .sort((a, b) => {
        // Primary sort by unit number (numerical)
        const unitA = a.unit_number ? parseInt(a.unit_number) : 999999;
        const unitB = b.unit_number ? parseInt(b.unit_number) : 999999;
        
        if (unitA !== unitB) {
          return unitA - unitB;
        }
        
        // Secondary sort by name if unit numbers are the same or missing
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim();
        return nameA.localeCompare(nameB);
      });
  }, [allUsers, selectedDivision, searchQuery, user, userRankOrder]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading directory...</div>;
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Division Directory</h1>
            <p className="text-slate-600">Contact information for all officers</p>
          </div>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, rank, or unit number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                <SelectTrigger className="w-full md:w-64">
                  <SelectValue placeholder="Filter by division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {divisions?.map((div) => (
                    <SelectItem key={div.id} value={div.division_name}>
                      {div.division_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayUsers.map((officer) => (
                <Card key={officer.id} className="border-none shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 flex flex-col items-center text-center">
                    {officer.profile_photo_url ? (
                      <img
                        src={officer.profile_photo_url}
                        alt={`${officer.first_name} ${officer.last_name}`}
                        className="w-20 h-20 rounded-full object-cover mb-3 border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center mb-3 border-2 border-white shadow-sm">
                        <span className="text-3xl font-semibold text-slate-700">
                          {officer.first_name?.charAt(0) || 'U'}
                        </span>
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">
                      {officer.first_name} {officer.last_name}
                    </h3>

                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Badge variant="outline" className="bg-white">
                        {officer.rank || officer.displayRole || 'Officer'}
                      </Badge>
                      {officer.unit_number && (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700">
                          Unit {officer.unit_number}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-3">
                    {officer.email && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <a 
                          href={`mailto:${officer.email}`}
                          className="hover:text-blue-600 hover:underline truncate"
                        >
                          {officer.email}
                        </a>
                      </div>
                    )}
                    {officer.mobile_phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <a 
                          href={`tel:${officer.mobile_phone}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {officer.mobile_phone}
                        </a>
                      </div>
                    )}
                    {officer.badge_number && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Shield className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span>Badge #{officer.badge_number}</span>
                      </div>
                    )}
                    {officer.division && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Users className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span>Division: {officer.division}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {!displayUsers?.length && (
              <p className="text-center text-slate-500 py-8">No officers found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}