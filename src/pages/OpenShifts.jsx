import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, AlertCircle, CheckCircle2, Briefcase, Send, Brain, AlertTriangle, Users } from "lucide-react";
import { format, parseISO, isPast, startOfDay, addDays } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { listDirectoryUsers } from '@/lib/appDirectory';

export default function OpenShifts() {
  const queryClient = useQueryClient();
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [bidPriority, setBidPriority] = useState(1);
  const [bidNotes, setBidNotes] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
  });

  const { data: openShifts, isLoading } = useQuery({
    queryKey: ['openShifts'],
    queryFn: async () => {
      const allSchedules = await base44.entities.Schedule.list('shift_date');
      const openSchedules = allSchedules.filter(s => s.is_open === true);
      return openSchedules.filter(s => !isPast(startOfDay(parseISO(s.shift_date))));
    },
    refetchInterval: 10000,
  });

  const { data: myBids } = useQuery({
    queryKey: ['myBids', user?.email],
    queryFn: () => base44.entities.ShiftBid.filter({ officer_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: allBids } = useQuery({
    queryKey: ['allShiftBids'],
    queryFn: () => base44.entities.ShiftBid.list('-created_date'),
  });

  const { data: myAvailability } = useQuery({
    queryKey: ['myAvailability', user?.email],
    queryFn: () => base44.entities.OfficerAvailability.filter({ officer_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: mySchedules } = useQuery({
    queryKey: ['mySchedules', user?.email],
    queryFn: () => base44.entities.Schedule.filter({ officer_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: () => base44.entities.PayrollPeriod.list('-start_date'),
  });

  const calculateShiftHours = (startTime, endTime) => {
    const start = parseInt(startTime.replace(':', ''));
    const end = parseInt(endTime.replace(':', ''));
    let hours = 0;
    if (end < start) {
      hours = ((2400 - start) + end) / 100;
    } else {
      hours = (end - start) / 100;
    }
    return hours;
  };

  const getAIAnalysis = (shift) => {
    const flags = [];
    let score = 100;
    let recommendation = "Good fit";

    const shiftDate = parseISO(shift.shift_date);
    const dayOfWeek = format(shiftDate, 'EEEE').toLowerCase();
    const availForDay = myAvailability?.find(a => a.day_of_week === dayOfWeek);

    if (availForDay && !availForDay.available) {
      flags.push("You marked this day as unavailable");
      score -= 30;
    }

    if (availForDay) {
      const prefStart = availForDay.preferred_start_time;
      const prefEnd = availForDay.preferred_end_time;
      if (shift.start_time < prefStart || shift.end_time > prefEnd) {
        flags.push("Shift hours outside your preferences");
        score -= 15;
      }
    }

    const existingShift = mySchedules?.find(s => s.shift_date === shift.shift_date);
    if (existingShift) {
      flags.push("You already have a shift on this day");
      score -= 40;
    }

    const currentPeriod = payrollPeriods?.find(p => {
      const today = format(new Date(), 'yyyy-MM-dd');
      return today >= p.start_date && today <= p.end_date;
    });

    if (currentPeriod) {
      let weeklyHours = 0;
      const shiftWeekStart = new Date(shiftDate);
      const dayNum = shiftDate.getDay();
      const daysSinceFriday = (dayNum + 2) % 7;
      shiftWeekStart.setDate(shiftWeekStart.getDate() - daysSinceFriday);
      const weekEnd = addDays(shiftWeekStart, 6);

      mySchedules?.forEach(s => {
        const sDate = parseISO(s.shift_date);
        if (sDate >= shiftWeekStart && sDate <= weekEnd) {
          weeklyHours += calculateShiftHours(s.start_time, s.end_time);
        }
      });

      const shiftHours = calculateShiftHours(shift.start_time, shift.end_time);
      if (weeklyHours + shiftHours > 40) {
        flags.push(`Would result in ${(weeklyHours + shiftHours).toFixed(1)}h this week (overtime)`);
        score -= 20;
      }
    }

    if (score >= 80) recommendation = "Excellent fit - highly recommended";
    else if (score >= 60) recommendation = "Good fit with minor concerns";
    else if (score >= 40) recommendation = "Potential issues - review carefully";
    else recommendation = "Not recommended - multiple conflicts";

    return { score: Math.max(0, score), flags, recommendation };
  };

  const submitBidMutation = useMutation({
    mutationFn: async () => {
      const analysis = getAIAnalysis(selectedShift);
      
      await base44.entities.ShiftBid.create({
        shift_id: selectedShift.id,
        officer_email: user.email,
        officer_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        bid_priority: bidPriority,
        bid_notes: bidNotes,
        status: 'pending',
        ai_score: analysis.score,
        ai_flags: analysis.flags,
        ai_recommendation: analysis.recommendation,
      });

      const adminUsers = allUsers?.filter(u => u.role === 'admin') || [];
      for (const admin of adminUsers) {
        try {
          await base44.integrations.Core.SendEmail({
            to: admin.email,
            subject: `New Shift Bid - ${selectedShift.location}`,
            body: `Officer ${user.first_name} ${user.last_name} has submitted a bid:

Shift: ${format(parseISO(selectedShift.shift_date), 'MMMM d, yyyy')}
Time: ${selectedShift.start_time} - ${selectedShift.end_time}
Location: ${selectedShift.location}

AI Recommendation: ${analysis.recommendation}
AI Score: ${analysis.score}/100
${analysis.flags.length > 0 ? '\nFlags:\n- ' + analysis.flags.join('\n- ') : ''}

Review in Admin > Shift Bids.`
          });

          await base44.entities.Notification.create({
            recipient_email: admin.email,
            type: 'shift_posted',
            title: 'New Shift Bid',
            message: `${user.first_name} ${user.last_name} bid on ${format(parseISO(selectedShift.shift_date), 'MMM d')} at ${selectedShift.location.split(':')[0]}`,
            priority: 'high',
            related_id: selectedShift.id,
          });
        } catch (e) {
          console.error('Notification failed:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myBids'] });
      queryClient.invalidateQueries({ queryKey: ['allShiftBids'] });
      setBidDialogOpen(false);
      setSelectedShift(null);
      setBidPriority(1);
      setBidNotes("");
      alert('✅ Bid submitted successfully! Admin will review your request.');
    },
  });

  const openBidDialog = (shift) => {
    setSelectedShift(shift);
    setBidDialogOpen(true);
  };

  const hasBidOnShift = (shiftId) => {
    return myBids?.some(b => b.shift_id === shiftId && b.status !== 'withdrawn');
  };

  const getBidCountForShift = (shiftId) => {
    return allBids?.filter(b => b.shift_id === shiftId && b.status === 'pending').length || 0;
  };

  const openInMaps = (location) => {
    const address = location.includes(':')
      ? location.split(':')[1].trim()
      : location.includes(' - ')
      ? location.split(' - ')[1].trim()
      : location.trim();
    
    const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
    window.open(mapsUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-slate-500">Loading open shifts...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Briefcase className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Open Shifts</h1>
            <p className="text-slate-600">Bid on available shifts based on your preferences</p>
          </div>
        </div>

        {myBids && myBids.filter(b => b.status === 'pending').length > 0 && (
          <Card className="border-none shadow-lg border-l-4 border-l-blue-600">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-900">My Pending Bids</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                {myBids.filter(b => b.status === 'pending').map(bid => {
                  const shift = openShifts?.find(s => s.id === bid.shift_id);
                  return (
                    <div key={bid.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <p className="font-medium">{shift ? format(parseISO(shift.shift_date), 'MMM d, yyyy') : 'Unknown'}</p>
                        <p className="text-sm text-slate-600">{shift?.location?.split(':')[0]}</p>
                      </div>
                      <Badge className="bg-blue-600">Priority {bid.bid_priority}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {openShifts?.length === 0 ? (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No Open Shifts</h3>
              <p className="text-slate-600">All shifts are currently assigned. Check back later!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {openShifts?.map((shift) => {
              const shiftDate = parseISO(shift.shift_date);
              const isToday = format(shiftDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const isTomorrow = format(shiftDate, 'yyyy-MM-dd') === format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
              const analysis = getAIAnalysis(shift);
              const alreadyBid = hasBidOnShift(shift.id);
              const bidCount = getBidCountForShift(shift.id);

              return (
                <Card key={shift.id} className={`border-none shadow-lg ${isToday ? 'ring-2 ring-orange-400' : ''}`}>
                  <CardHeader className={`${isToday ? 'bg-gradient-to-r from-orange-50 to-red-50' : 'bg-gradient-to-r from-green-50 to-blue-50'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-green-600" />
                        <div>
                          <span className="text-slate-900">{format(shiftDate, 'EEEE, MMM d, yyyy')}</span>
                          {isToday && <Badge className="ml-2 bg-orange-600 text-white">TODAY</Badge>}
                          {isTomorrow && <Badge className="ml-2 bg-blue-600 text-white">TOMORROW</Badge>}
                        </div>
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {bidCount > 0 && (
                          <Badge variant="outline" className="border-purple-400 text-purple-700">
                            <Users className="w-3 h-3 mr-1" />
                            {bidCount} bid{bidCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        <Badge className={`${analysis.score >= 80 ? 'bg-green-600' : analysis.score >= 50 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                          <Brain className="w-3 h-3 mr-1" />
                          AI: {analysis.score}%
                        </Badge>
                        <Badge className="bg-green-600 text-white">
                          {calculateShiftHours(shift.start_time, shift.end_time).toFixed(1)}h
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="text-sm text-slate-600 font-medium">Shift Time</p>
                            <p className="text-lg font-bold text-slate-900">{shift.start_time} - {shift.end_time}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="text-sm text-slate-600 font-medium">Location</p>
                            <button
                              onClick={() => openInMaps(shift.location)}
                              className="text-lg font-bold text-blue-900 hover:text-blue-700 underline decoration-dotted text-left"
                            >
                              {shift.location.split(':')[0]}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className={`p-3 rounded-lg border ${analysis.score >= 80 ? 'bg-green-50 border-green-200' : analysis.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-sm font-medium mb-1 flex items-center gap-1">
                          <Brain className="w-4 h-4" />
                          AI Analysis
                        </p>
                        <p className="text-sm">{analysis.recommendation}</p>
                        {analysis.flags.length > 0 && (
                          <ul className="mt-2 text-xs space-y-1">
                            {analysis.flags.map((flag, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {flag}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {shift.site_details && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Site Details
                          </p>
                          <p className="text-sm text-slate-700">{shift.site_details}</p>
                        </div>
                      )}

                      {shift.special_instructions && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs text-amber-700 font-medium mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Special Instructions
                          </p>
                          <p className="text-sm text-slate-700">{shift.special_instructions}</p>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        {alreadyBid ? (
                          <Badge className="bg-blue-600 text-white py-2 px-4">Bid Submitted</Badge>
                        ) : (
                          <Button
                            onClick={() => openBidDialog(shift)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Submit Bid
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Shift Bid</DialogTitle>
            <DialogDescription>
              {selectedShift && `${format(parseISO(selectedShift.shift_date), 'MMMM d, yyyy')} at ${selectedShift.location?.split(':')[0]}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bid Priority (1 = Highest)</Label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map(num => (
                  <button
                    key={num}
                    onClick={() => setBidPriority(num)}
                    className={`w-10 h-10 rounded-lg border flex items-center justify-center font-bold transition-all ${
                      bidPriority === num ? 'bg-green-600 text-white border-green-600' : 'bg-white border-slate-300 hover:border-green-400'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">How important is this shift to you?</p>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={bidNotes}
                onChange={(e) => setBidNotes(e.target.value)}
                placeholder="Any additional information for the scheduler..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setBidDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => submitBidMutation.mutate()}
                disabled={submitBidMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitBidMutation.isPending ? 'Submitting...' : 'Submit Bid'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}