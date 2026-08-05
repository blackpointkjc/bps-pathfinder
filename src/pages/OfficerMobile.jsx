import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Calendar, MessageCircle, MapPin, FileText, Home, Bell, WifiOff } from "lucide-react";
import { format, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function OfficerMobile() {
  const [activeTab, setActiveTab] = useState("home");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-created_date',
        10
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: todaySchedule } = useQuery({
    queryKey: ['todaySchedule', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const today = format(new Date(), 'yyyy-MM-dd');
      return await base44.entities.Schedule.filter({
        officer_email: user.email,
        shift_date: today
      });
    },
    enabled: !!user,
  });

  const { data: weekSchedule } = useQuery({
    queryKey: ['weekSchedule', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const today = new Date();
      const weekEnd = addDays(today, 7);
      const allSchedules = await base44.entities.Schedule.filter({ officer_email: user.email });
      return allSchedules.filter(s => {
        const shiftDate = new Date(s.shift_date);
        return shiftDate >= today && shiftDate <= weekEnd;
      }).sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    },
    enabled: !!user,
  });

  const { data: unreadNotifications } = useQuery({
    queryKey: ['unreadNotifications', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const allNotifs = await base44.entities.Notification.filter({
        recipient_email: user.email,
        is_read: false
      }, '-created_date');
      return allNotifs.slice(0, 5);
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {!isOnline && (
        <Alert className="m-4 bg-amber-50 border-amber-300">
          <WifiOff className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            You are offline. Some features may be limited. Location tracking will resume when back online.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Fixed Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 shadow-lg">
        <div className="grid grid-cols-5 h-16">
          <Link
            to={createPageUrl("OfficerMobile")}
            className={`flex flex-col items-center justify-center gap-1 ${
              activeTab === "home" ? "text-blue-600 bg-blue-50" : "text-slate-600"
            }`}
            onClick={() => setActiveTab("home")}
          >
            <Home className="w-5 h-5" />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link
            to={createPageUrl("TimeClock")}
            className="flex flex-col items-center justify-center gap-1 text-slate-600 hover:bg-slate-50"
          >
            <Clock className="w-5 h-5" />
            <span className="text-xs font-medium">Clock</span>
          </Link>
          <Link
            to={createPageUrl("Schedule")}
            className="flex flex-col items-center justify-center gap-1 text-slate-600 hover:bg-slate-50"
          >
            <Calendar className="w-5 h-5" />
            <span className="text-xs font-medium">Schedule</span>
          </Link>
          <Link
            to={createPageUrl("DailyActivityReports")}
            className="flex flex-col items-center justify-center gap-1 text-slate-600 hover:bg-slate-50"
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs font-medium">Reports</span>
          </Link>
          <Link
            to={createPageUrl("TeamChat")}
            className="flex flex-col items-center justify-center gap-1 text-slate-600 hover:bg-slate-50"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs font-medium">Chat</span>
            {unreadNotifications && unreadNotifications.length > 0 && (
              <span className="absolute top-1 right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadNotifications.length}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome, {user.first_name || user.full_name || 'Officer'}
          </h1>
          <p className="text-slate-600 text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {/* Status Card */}
        <Card className={`border-none shadow-lg ${
          activeEntry ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-slate-500 to-slate-600'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium mb-1">Current Status</p>
                <p className="text-3xl font-bold text-white">
                  {activeEntry ? 'On Duty' : 'Off Duty'}
                </p>
                {activeEntry && (
                  <p className="text-white text-sm mt-2">
                    Since {format(new Date(activeEntry.clock_in), 'h:mm a')}
                  </p>
                )}
              </div>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                activeEntry ? 'bg-white/20' : 'bg-white/10'
              }`}>
                <Clock className={`w-8 h-8 ${activeEntry ? 'text-white animate-pulse' : 'text-white/50'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        {todaySchedule && todaySchedule.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Today's Shifts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {todaySchedule.map((shift) => (
                  <div key={shift.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-blue-900">
                        {shift.start_time} - {shift.end_time}
                      </p>
                      <Badge className="bg-blue-600 text-white">
                        {(() => {
                          const start = parseInt(shift.start_time.replace(':', ''));
                          const end = parseInt(shift.end_time.replace(':', ''));
                          let hours = 0;
                          if (end < start) hours = ((2400 - start) + end) / 100;
                          else hours = (end - start) / 100;
                          return `${hours}h`;
                        })()}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                      {shift.location}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to={createPageUrl("TimeClock")}>
            <Card className="border-none shadow-md hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                <p className="font-semibold text-slate-900 text-sm">Time Clock</p>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl("Schedule")}>
            <Card className="border-none shadow-md hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                <p className="font-semibold text-slate-900 text-sm">My Schedule</p>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl("DailyActivityReports")}>
            <Card className="border-none shadow-md hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <p className="font-semibold text-slate-900 text-sm">Reports</p>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl("TeamChat")}>
            <Card className="border-none shadow-md hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-amber-600" />
                <p className="font-semibold text-slate-900 text-sm">Team Chat</p>
                {unreadNotifications && unreadNotifications.length > 0 && (
                  <Badge className="bg-red-500 text-white mt-1">
                    {unreadNotifications.length} new
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* This Week */}
        {weekSchedule && weekSchedule.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weekSchedule.slice(0, 5).map((shift) => (
                  <div key={shift.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {format(new Date(shift.shift_date), 'EEE, MMM d')}
                      </p>
                      <p className="text-sm text-slate-600">
                        {shift.start_time} - {shift.end_time}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600 flex items-start gap-1">
                      <MapPin className="w-3 h-3 mt-0.5" />
                      {shift.location.split(':')[0]}
                    </p>
                    {shift.special_instructions && (
                      <p className="text-xs text-amber-700 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                        📋 {shift.special_instructions}
                      </p>
                    )}
                  </div>
                ))}
                {weekSchedule.length > 5 && (
                  <Link to={createPageUrl("Schedule")}>
                    <Button variant="outline" className="w-full mt-2" size="sm">
                      View All ({weekSchedule.length} shifts)
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications */}
        {unreadNotifications && unreadNotifications.length > 0 && (
          <Card className="border-none shadow-lg border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {unreadNotifications.map((notif) => (
                  <div key={notif.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="font-semibold text-blue-900 text-sm">{notif.title}</p>
                    <p className="text-xs text-slate-700 mt-1">{notif.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}