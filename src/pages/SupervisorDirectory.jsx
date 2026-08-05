import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Shield, Phone, Mail, MapPin, Search, Calendar, Award } from "lucide-react";
import { format } from "date-fns";

export default function SupervisorDirectory() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const isSupervisorOrAdmin = user?.role === 'admin' || user?.additional_roles?.includes('supervisor');

  if (!isSupervisorOrAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
      </div>
    );
  }

  // Filter officers by supervisor's division
  const myDivisionOfficers = allUsers?.filter(officer => {
    // Don't show admins or support staff
    if (officer.role === 'admin') return false;
    
    // If admin, show all
    if (user.role === 'admin') return true;
    
    // For supervisors, only show officers in their division
    return officer.division === user.division;
  }) || [];

  // Apply search filter
  const filteredOfficers = myDivisionOfficers.filter(officer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${officer.first_name || ''} ${officer.last_name || ''}`.toLowerCase();
    const email = (officer.email || '').toLowerCase();
    const rank = (officer.rank || '').toLowerCase();
    const phone = (officer.mobile_phone || '').toLowerCase();
    
    return fullName.includes(searchLower) || 
           email.includes(searchLower) || 
           rank.includes(searchLower) ||
           phone.includes(searchLower);
  });

  // Sort by rank hierarchy and then by name
  const sortedOfficers = filteredOfficers.sort((a, b) => {
    // Rank order (higher ranks first)
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
    
    const aRankOrder = rankOrder[a.rank] || 99;
    const bRankOrder = rankOrder[b.rank] || 99;
    
    if (aRankOrder !== bRankOrder) {
      return aRankOrder - bRankOrder;
    }
    
    // Then sort by name
    const aName = `${a.first_name} ${a.last_name}`;
    const bName = `${b.first_name} ${b.last_name}`;
    return aName.localeCompare(bName);
  });

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-600" />
            Officer Directory
          </h1>
          <p className="text-slate-600">
            {user.role === 'admin' ? 'All officers' : `Officers in ${user.division || 'your division'}`}
          </p>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-blue-600" />
              <Input
                placeholder="Search by name, email, rank, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4">
          {sortedOfficers.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No officers found</p>
              </CardContent>
            </Card>
          ) : (
            sortedOfficers.map((officer) => (
              <Card key={officer.email} className="border-none shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      {officer.profile_photo_url ? (
                        <img
                          src={officer.profile_photo_url}
                          alt={`${officer.first_name} ${officer.last_name}`}
                          className="w-16 h-16 rounded-full object-cover border-2 border-blue-200"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                          {officer.first_name?.charAt(0) || 'O'}
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-bold text-slate-900">
                            {officer.first_name} {officer.last_name}
                          </h3>
                          {officer.additional_roles?.includes('supervisor') && (
                            <Badge className="bg-green-600">Supervisor</Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {officer.rank && (
                            <div className="flex items-center gap-2 text-sm">
                              <Award className="w-4 h-4 text-blue-600" />
                              <span className="font-semibold text-blue-600">{officer.rank}</span>
                            </div>
                          )}
                          
                          {officer.badge_number && (
                            <Badge variant="outline" className="text-xs">
                              Badge #{officer.badge_number}
                            </Badge>
                          )}
                          
                          {officer.unit_number && (
                            <Badge variant="outline" className="text-xs">
                              Unit #{officer.unit_number}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-right">
                      {officer.mobile_phone && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="w-full justify-start"
                        >
                          <a href={`tel:${officer.mobile_phone}`}>
                            <Phone className="w-4 h-4 mr-2" />
                            {officer.mobile_phone}
                          </a>
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="w-full justify-start"
                      >
                        <a href={`mailto:${officer.email}`}>
                          <Mail className="w-4 h-4 mr-2" />
                          {officer.email}
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200 grid md:grid-cols-3 gap-4 text-sm">
                    {officer.division && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Division</p>
                          <p className="font-semibold">{officer.division}</p>
                          {officer.subdivision && (
                            <p className="text-xs text-slate-500">{officer.subdivision}</p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {officer.hire_date && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Hire Date</p>
                          <p className="font-semibold">{format(new Date(officer.hire_date), 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-slate-600">
                      <Shield className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">PTO Balance</p>
                        <p className="font-semibold">{officer.pto_balance_hours?.toFixed(1) || '0.0'} hrs</p>
                      </div>
                    </div>
                  </div>

                  {(officer.dcjs_expiration || officer.firearm_expiration) && (
                    <div className="mt-3 pt-3 border-t border-slate-200 flex gap-4 text-xs">
                      {officer.dcjs_expiration && (
                        <div>
                          <span className="text-slate-500">DCJS Expires: </span>
                          <span className="font-semibold">{format(new Date(officer.dcjs_expiration), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {officer.firearm_expiration && (
                        <div>
                          <span className="text-slate-500">Firearm Expires: </span>
                          <span className="font-semibold">{format(new Date(officer.firearm_expiration), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card className="border-none shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{sortedOfficers.length}</p>
                  <p className="text-sm text-slate-600">Total Officers</p>
                </div>
              </div>
              {user.division && user.role !== 'admin' && (
                <Badge className="bg-blue-600 text-white">
                  {user.division}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}