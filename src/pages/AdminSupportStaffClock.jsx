import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, UserCheck, Calendar, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function AdminSupportStaffClock() {
  const [selectedStaff, setSelectedStaff] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isSupportRank = ['support staff', 'human resources'].includes(String(user?.rank || '').toLowerCase());
  const canManageAll = user?.role === 'admin' || roles.has('hr') || roles.has('trainer') || roles.has('full_access');
  const hasAccess = canManageAll || isSupportRank || roles.has('support_staff');

  const { data: supportStaff = [] } = useQuery({
    queryKey: ['supportStaffDirectory'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getHRUsers', {});
      const users = result?.users || [];
      const eligible = users.filter(u => {
        const staffRoles = new Set((u.additional_roles || []).map(role => String(role).toLowerCase()));
        const staffRank = String(u.rank || '').toLowerCase();
        return ['support staff', 'human resources'].includes(staffRank) || staffRoles.has('support_staff');
      });
      return canManageAll ? eligible : eligible.filter(u => u.email === user?.email);
    },
    enabled: hasAccess,
    initialData: [],
  });

  const { data: activeEntries } = useQuery({
    queryKey: ['supportStaffActiveEntries'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-clock_in', 50);
      return entries.filter(e => !e.clock_out && supportStaff?.some(s => s.email === e.officer_email));
    },
    enabled: !!supportStaff,
    refetchInterval: 5000,
  });

  const clockInMutation = useMutation({
    mutationFn: async (staffEmail) => {
      const staff = supportStaff.find(s => s.email === staffEmail);
      return await base44.entities.TimeEntry.create({
        officer_email: staffEmail,
        clock_in: new Date().toISOString(),
        location: 'Office - Administrative',
        clock_in_latitude: 0,
        clock_in_longitude: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportStaffActiveEntries'] });
      alert('Support staff clocked in successfully!');
      setSelectedStaff("");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (entryId) => {
      return await base44.entities.TimeEntry.update(entryId, {
        clock_out: new Date().toISOString(),
        clock_out_latitude: 0,
        clock_out_longitude: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportStaffActiveEntries'] });
      alert('Support staff clocked out successfully!');
    },
  });

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold">Support Clock Access Required</h2>
        <p className="text-slate-600">This page is available to Support Staff, Human Resources, Trainer, and Administrator personnel.</p>
      </div>
    );
  }

  const availableStaff = supportStaff?.filter(s => 
    !activeEntries?.some(e => e.officer_email === s.email)
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Support Staff Time Clock</h1>
              <p className="text-slate-600 mt-1">Clock in or out for Support Staff, Human Resources, Trainers, and Administrators</p>
            </div>
          </div>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>Clock In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((staff) => (
                    <SelectItem key={staff.email} value={staff.email}>
                      {staff.first_name} {staff.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => clockInMutation.mutate(selectedStaff)}
                disabled={!selectedStaff || clockInMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                Clock In
              </Button>
            </div>
            {availableStaff.length === 0 && (
              <p className="text-sm text-slate-500">All support staff are currently clocked in</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>Currently Clocked In</CardTitle>
          </CardHeader>
          <CardContent>
            {activeEntries?.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No support staff currently clocked in</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeEntries?.map((entry) => {
                  const staff = supportStaff?.find(s => s.email === entry.officer_email);
                  const clockInTime = new Date(entry.clock_in);
                  const now = new Date();
                  const hoursWorked = ((now - clockInTime) / (1000 * 60 * 60)).toFixed(2);
                  
                  return (
                    <div key={entry.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">
                              {staff?.first_name} {staff?.last_name}
                            </h3>
                            <p className="text-sm text-slate-600">{staff?.email}</p>
                            <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {format(clockInTime, 'MMM d, yyyy h:mm a')}
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {hoursWorked} hours
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => clockOutMutation.mutate(entry.id)}
                          disabled={clockOutMutation.isPending}
                          variant="outline"
                          className="border-red-600 text-red-700 hover:bg-red-50"
                        >
                          Clock Out
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> Support staff time entries are automatically included in the Employee Payroll Report for accurate pay calculations and reimbursement tracking.
          </p>
        </div>
      </div>
    </div>
  );
}