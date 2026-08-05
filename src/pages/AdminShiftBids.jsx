import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, Calendar, Check, X, Brain, 
  AlertTriangle, User, Star, ChevronDown, ChevronUp, Sparkles, Clock, MapPin
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminShiftBids() {
  const queryClient = useQueryClient();
  const [expandedShifts, setExpandedShifts] = useState({});
  const [showAIRecommendations, setShowAIRecommendations] = useState({});

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allBids } = useQuery({
    queryKey: ['allShiftBids'],
    queryFn: () => base44.entities.ShiftBid.list('-created_date'),
  });

  const { data: openShifts } = useQuery({
    queryKey: ['openShiftsAdmin'],
    queryFn: () => base44.entities.Schedule.filter({ is_open: true }, 'shift_date'),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: allSchedules } = useQuery({
    queryKey: ['allSchedules'],
    queryFn: () => base44.entities.Schedule.list('-shift_date'),
  });

  const { data: allAvailability } = useQuery({
    queryKey: ['allAvailability'],
    queryFn: () => base44.entities.OfficerAvailability.list(),
  });

  const { data: siteAssignments } = useQuery({
    queryKey: ['siteAssignments'],
    queryFn: () => base44.entities.SiteAssignment.list(),
  });

  const acceptBidMutation = useMutation({
    mutationFn: async ({ bid, shift }) => {
      // Update the schedule and assign to officer
      await base44.entities.Schedule.update(shift.id, {
        officer_email: bid.officer_email,
        is_open: false,
      });

      // Update the accepted bid
      await base44.entities.ShiftBid.update(bid.id, {
        status: 'accepted',
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
      });

      // Reject all other pending bids for this shift
      const otherBids = allBids?.filter(b => b.shift_id === shift.id && b.id !== bid.id && b.status === 'pending');
      for (const otherBid of otherBids || []) {
        await base44.entities.ShiftBid.update(otherBid.id, {
          status: 'rejected',
          reviewed_by: user.email,
          reviewed_date: new Date().toISOString(),
        });
      }

      // Send email notification
      await base44.integrations.Core.SendEmail({
        to: bid.officer_email,
        subject: `✅ Shift Bid Accepted - ${shift.location}`,
        body: `Your bid for the following shift has been accepted:

  Date: ${format(parseISO(shift.shift_date), 'MMMM d, yyyy')}
  Time: ${shift.start_time} - ${shift.end_time}
  Location: ${shift.location}

  This shift has been added to your schedule.`
      });

      // Create notification
      await base44.entities.Notification.create({
        recipient_email: bid.officer_email,
        type: 'bid_accepted',
        title: '✅ Shift Bid Accepted',
        message: `Your bid for ${format(parseISO(shift.shift_date), 'MMM d')} at ${shift.location.split(':')[0]} was accepted!`,
        priority: 'high',
        related_id: shift.id,
      });

      // Invalidate schedules for the assigned officer
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
    },
    onMutate: async ({ bid, shift }) => {
      // Cancel pending queries
      await queryClient.cancelQueries({ queryKey: ['allShiftBids'] });

      // Snapshot the previous state
      const previousBids = queryClient.getQueryData(['allShiftBids']);

      // Update UI optimistically
      queryClient.setQueryData(['allShiftBids'], (old) => {
        if (!old) return old;
        return old.map((b) => {
          if (b.id === bid.id) return { ...b, status: 'accepted' };
          if (b.shift_id === shift.id && b.status === 'pending') return { ...b, status: 'rejected' };
          return b;
        });
      });

      return { previousBids };
    },
    onError: (err, variables, context) => {
      if (context?.previousBids) {
        queryClient.setQueryData(['allShiftBids'], context.previousBids);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allShiftBids'] });
      queryClient.invalidateQueries({ queryKey: ['openShiftsAdmin'] });
      queryClient.invalidateQueries({ queryKey: ['openShifts'] });
      alert('Bid accepted and shift assigned!');
    },
  });

  const rejectBidMutation = useMutation({
    mutationFn: async (bid) => {
      await base44.entities.ShiftBid.update(bid.id, {
        status: 'rejected',
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
      });

      const shift = openShifts?.find(s => s.id === bid.shift_id);
      await base44.integrations.Core.SendEmail({
        to: bid.officer_email,
        subject: `Shift Bid Update - ${shift?.location || 'Shift'}`,
        body: `Your bid for the shift on ${shift ? format(parseISO(shift.shift_date), 'MMMM d, yyyy') : 'the requested date'} was not selected.

Please continue to check for other open shifts.`
      });

      await base44.entities.Notification.create({
        recipient_email: bid.officer_email,
        type: 'bid_rejected',
        title: 'Shift Bid Not Selected',
        message: `Your bid for ${shift ? format(parseISO(shift.shift_date), 'MMM d') : 'shift'} was not selected.`,
        priority: 'normal',
        related_id: shift?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allShiftBids'] });
      alert('Bid rejected');
    },
  });

  const getOfficerInfo = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    return officer ? {
      name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || email,
      rank: officer.rank,
      division: officer.division,
    } : { name: email, rank: '', division: '' };
  };

  const calculateShiftHours = (startTime, endTime) => {
    const start = parseInt(startTime.replace(':', ''));
    const end = parseInt(endTime.replace(':', ''));
    return end < start ? ((2400 - start) + end) / 100 : (end - start) / 100;
  };

  const getAIRecommendations = (shift) => {
    if (!allUsers || !allSchedules || !allAvailability) return [];

    const shiftDate = parseISO(shift.shift_date);
    const dayName = format(shiftDate, 'EEEE').toLowerCase();
    const shiftLocation = shift.location.split(':')[0].trim();
    const shiftHours = calculateShiftHours(shift.start_time, shift.end_time);

    const recommendations = [];
    const activeOfficers = allUsers.filter(u => !u.termination_date && u.role !== 'admin');

    for (const officer of activeOfficers) {
      let score = 50;
      const flags = [];

      // Check availability
      const officerAvail = allAvailability.filter(a => a.officer_email === officer.email);
      const dayAvail = officerAvail.find(a => a.day_of_week === dayName);
      
      if (dayAvail && !dayAvail.available) {
        flags.push("Not available this day");
        score -= 30;
      }

      // Check preferred locations
      const preferredLocs = officerAvail[0]?.preferred_locations || [];
      if (preferredLocs.length > 0 && preferredLocs.includes(shiftLocation)) {
        score += 20;
      }

      // Check site assignment
      const hasAssignment = siteAssignments?.some(a => a.officer_email === officer.email && a.site_name === shiftLocation && a.active);
      if (hasAssignment) {
        score += 25;
        flags.push("Has site assignment here");
      }

      // Check existing shift on day
      const hasShiftOnDay = allSchedules?.some(s => s.officer_email === officer.email && s.shift_date === shift.shift_date);
      if (hasShiftOnDay) {
        flags.push("Already has shift this day");
        score -= 40;
      }

      // Calculate weekly hours
      const weekStart = new Date(shiftDate);
      const dayOfWeek = shiftDate.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      const weekEnd = addDays(weekStart, 6);

      let weeklyHours = 0;
      allSchedules?.forEach(s => {
        if (s.officer_email === officer.email) {
          const sDate = parseISO(s.shift_date);
          if (sDate >= weekStart && sDate <= weekEnd) {
            weeklyHours += calculateShiftHours(s.start_time, s.end_time);
          }
        }
      });

      const projectedHours = weeklyHours + shiftHours;
      if (projectedHours > 40) {
        flags.push(`Would be ${projectedHours.toFixed(1)}h (overtime)`);
        score -= 25;
      } else if (projectedHours <= 40 && weeklyHours < 32) {
        score += 15;
        flags.push(`Only ${weeklyHours.toFixed(1)}h scheduled`);
      }

      score = Math.max(0, Math.min(100, score));

      recommendations.push({
        officer,
        score,
        flags,
        weeklyHours,
        projectedHours,
        recommendation: score >= 70 ? "Highly recommended" : score >= 50 ? "Good fit" : "Not recommended"
      });
    }

    return recommendations.sort((a, b) => b.score - a.score).slice(0, 10);
  };

  const bidsByShift = {};
  allBids?.filter(b => b.status === 'pending').forEach(bid => {
    if (!bidsByShift[bid.shift_id]) {
      bidsByShift[bid.shift_id] = [];
    }
    bidsByShift[bid.shift_id].push(bid);
  });

  Object.keys(bidsByShift).forEach(shiftId => {
    bidsByShift[shiftId].sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
  });

  const toggleShift = (shiftId) => {
    setExpandedShifts(prev => ({
      ...prev,
      [shiftId]: !prev[shiftId]
    }));
  };

  const toggleAIRecommendations = (shiftId) => {
    setShowAIRecommendations(prev => ({
      ...prev,
      [shiftId]: !prev[shiftId]
    }));
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900">Admin Access Required</h2>
      </div>
    );
  }

  const shiftsWithBids = openShifts?.filter(s => bidsByShift[s.id]?.length > 0) || [];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Star className="w-8 h-8 text-amber-600" />
            Shift Bid Management
          </h1>
          <p className="text-slate-600">Review and approve officer bids for open shifts</p>
        </div>

        {shiftsWithBids.length === 0 ? (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Check className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No Pending Bids</h3>
              <p className="text-slate-600">All shift bids have been processed.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {shiftsWithBids.map(shift => {
              const bids = bidsByShift[shift.id] || [];
              const isExpanded = expandedShifts[shift.id];
              const topBid = bids[0];

              return (
                <Card key={shift.id} className="border-none shadow-lg">
                  <Collapsible open={isExpanded} onOpenChange={() => toggleShift(shift.id)}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 cursor-pointer hover:from-amber-100 hover:to-orange-100 transition-colors">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-amber-600" />
                            <div>
                              <span className="text-slate-900">{format(parseISO(shift.shift_date), 'EEEE, MMM d, yyyy')}</span>
                              <p className="text-sm text-slate-600 font-normal">{shift.location}</p>
                            </div>
                          </CardTitle>
                          <div className="flex items-center gap-3">
                            <Badge className="bg-amber-600 text-white">{bids.length} Bid{bids.length !== 1 ? 's' : ''}</Badge>
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-6">
                        <div className="mb-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAIRecommendations(shift.id)}
                            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200"
                          >
                            <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                            {showAIRecommendations[shift.id] ? 'Hide' : 'Show'} AI Officer Recommendations
                          </Button>
                        </div>

                        {showAIRecommendations[shift.id] && (
                          <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                            <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                              <Brain className="w-4 h-4" />
                              AI Recommended Officers for This Shift
                            </h4>
                            <ScrollArea className="h-48">
                              <div className="space-y-2">
                                {getAIRecommendations(shift).map((rec, idx) => (
                                  <div key={rec.officer.email} className={`p-3 rounded-lg ${idx === 0 ? 'bg-green-100 border border-green-300' : 'bg-white border border-slate-200'}`}>
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium">{rec.officer.first_name} {rec.officer.last_name}</p>
                                        <p className="text-xs text-slate-500">{rec.officer.rank} • {rec.officer.division}</p>
                                      </div>
                                      <Badge className={rec.score >= 70 ? 'bg-green-600' : rec.score >= 50 ? 'bg-amber-600' : 'bg-red-600'}>
                                        {rec.score}%
                                      </Badge>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {rec.flags.map((f, i) => (
                                        <span key={i} className="text-xs bg-slate-100 px-2 py-0.5 rounded">{f}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        <div className="space-y-3">
                          {bids.map((bid, idx) => {
                            const officer = getOfficerInfo(bid.officer_email);
                            const isTopBid = idx === 0;

                            return (
                              <div 
                                key={bid.id} 
                                className={`p-4 rounded-lg border ${isTopBid ? 'bg-green-50 border-green-300 ring-2 ring-green-200' : 'bg-slate-50 border-slate-200'}`}
                              >
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                  <div className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${isTopBid ? 'bg-green-600' : 'bg-slate-400'}`}>
                                      {idx + 1}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-slate-900 flex items-center gap-2">
                                        <User className="w-4 h-4" />
                                        {officer.name}
                                        {isTopBid && <Badge className="bg-green-600 text-white text-xs">AI Recommended</Badge>}
                                      </p>
                                      <p className="text-sm text-slate-600">{officer.rank} • {officer.division}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-xs">Priority: {bid.bid_priority}</Badge>
                                        <Badge className={`text-xs ${bid.ai_score >= 80 ? 'bg-green-600' : bid.ai_score >= 50 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                                          <Brain className="w-3 h-3 mr-1" />
                                          AI: {bid.ai_score || 0}%
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => acceptBidMutation.mutate({ bid, shift })}
                                      disabled={acceptBidMutation.isPending}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      <Check className="w-4 h-4 mr-1" />
                                      Accept
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => rejectBidMutation.mutate(bid)}
                                      disabled={rejectBidMutation.isPending}
                                      className="text-red-600 border-red-300 hover:bg-red-50"
                                    >
                                      <X className="w-4 h-4 mr-1" />
                                      Reject
                                    </Button>
                                  </div>
                                </div>

                                {bid.ai_flags && bid.ai_flags.length > 0 && (
                                  <div className="mt-3 p-2 bg-amber-50 rounded border border-amber-200">
                                    <p className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      AI Flags
                                    </p>
                                    <ul className="text-xs text-amber-700 space-y-1">
                                      {bid.ai_flags.map((flag, i) => (
                                        <li key={i}>• {flag}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {bid.bid_notes && (
                                  <div className="mt-2 text-sm text-slate-600 italic">
                                    "{bid.bid_notes}"
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        {allBids?.filter(b => b.status !== 'pending').length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Recently Processed Bids</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allBids.filter(b => b.status !== 'pending').slice(0, 20).map(bid => {
                  const officer = getOfficerInfo(bid.officer_email);
                  return (
                    <div key={bid.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-sm">{officer.name}</span>
                      <Badge className={bid.status === 'accepted' ? 'bg-green-600' : 'bg-red-600'}>
                        {bid.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}