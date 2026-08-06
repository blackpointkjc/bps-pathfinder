import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode, MapPin, Clock, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function ClientQRReports() {
  const [filterSite, setFilterSite] = useState("all");
  const [filterOfficer, setFilterOfficer] = useState("all");
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [viewGroup, setViewGroup] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: getClientPortalUser,
  });

  const { data: officers = [] } = useQuery({
    queryKey: ["clientQROfficerDirectory"],
    queryFn: async () => {
      const response = await base44.functions.invoke('getClientOfficerDirectory', { officerEmails: [] });
      return response?.data?.officers || response?.officers || [];
    },
    staleTime: 300000,
  });

  const getOfficerDisplay = (email, fallbackName) => {
    const officer = officers.find((o) => o.email === email);
    if (officer) {
      return `${officer.rank || 'Officer'} ${officer.last_name || ''}`.trim();
    }
    return fallbackName || email;
  };

  const clientLocations =
    user?.assigned_locations ||
    (user?.assigned_location ? [user.assigned_location] : []);

  // Fetch live scan events for the selected date, filtered to client's sites
  const { data: allScans = [], dataUpdatedAt } = useQuery({
    queryKey: ["clientQRScanEvents", filterDate],
    queryFn: async () => {
      if (!clientLocations.length) return [];
      const all = await base44.entities.QRScanEvent.filter(
        { scanned_date: filterDate },
        "-scanned_at",
        500
      );
      return all.filter((s) => clientLocations.includes(s.property_site));
    },
    enabled: clientLocations.length > 0,
    refetchInterval: 30000,
    staleTime: 20000,
    placeholderData: (prev) => prev,
  });

  // Fetch all required checkpoints for client's sites
  const { data: allCheckpoints = [] } = useQuery({
    queryKey: ["clientSiteCheckpoints", clientLocations.join(",")],
    queryFn: () =>
      base44.entities.QRCheckpoint.filter({ is_active: true, is_required: true }),
    enabled: clientLocations.length > 0,
    staleTime: 120000,
  });

  // Real-time push updates
  useEffect(() => {
    if (!clientLocations.length) return;
    const key = ["clientQRScanEvents", filterDate];
    const unsub = base44.entities.QRScanEvent.subscribe((event) => {
      if (
        event.type === "create" &&
        event.data?.scanned_date === filterDate &&
        clientLocations.includes(event.data?.property_site)
      ) {
        queryClient.setQueryData(key, (old = []) => {
          if (old.find((s) => s.id === event.data.id)) return old;
          return [event.data, ...old];
        });
      } else if (event.type === "update") {
        queryClient.setQueryData(key, (old = []) =>
          old.map((s) => (s.id === event.id ? event.data : s))
        );
      }
    });
    return unsub;
  }, [filterDate, clientLocations.join(","), queryClient]);

  // Group scans by officer + site
  const groupMap = {};
  for (const scan of allScans) {
    const key = `${scan.officer_email}||${scan.property_site}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        key,
        officer_email: scan.officer_email,
        officer_name: scan.officer_name || scan.officer_email.split("@")[0],
        property_site: scan.property_site,
        scans: [],
      };
    }
    groupMap[key].scans.push(scan);
  }

  // Enrich each group
  const groups = Object.values(groupMap).map((g) => {
    const siteCheckpoints = allCheckpoints.filter(
      (cp) => cp.property_site === g.property_site
    );
    const successScans = g.scans.filter((s) => s.scan_status === "success");
    const scannedIds = new Set(successScans.map((s) => s.checkpoint_id));
    const missedCheckpoints = siteCheckpoints.filter(
      (cp) => !scannedIds.has(cp.id)
    );
    const duplicates = g.scans.filter((s) => s.scan_status === "duplicate").length;
    return {
      ...g,
      successCount: successScans.length,
      duplicates,
      totalRequired: siteCheckpoints.length,
      missedCheckpoints,
      lastScan: g.scans[0],
    };
  });

  // Apply filters
  const filtered = groups.filter((g) => {
    if (filterSite !== "all" && g.property_site !== filterSite) return false;
    if (filterOfficer !== "all" && g.officer_email !== filterOfficer) return false;
    return true;
  });

  // Build filter options
  const allSites = [...new Set(allScans.map((s) => s.property_site).filter(Boolean))].sort();
  const allOfficers = [
    ...new Map(
      allScans.map((s) => [
        s.officer_email,
        { email: s.officer_email, name: s.officer_name || s.officer_email },
      ])
    ).values(),
  ];

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-purple-600 p-2 rounded-xl">
          <QrCode className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">QR Patrol Reports</h1>
          <p className="text-sm text-slate-500">
            Live scan data · {groups.length} officer session{groups.length !== 1 ? "s" : ""} ·
            last updated {dataUpdatedAt ? format(new Date(dataUpdatedAt), "h:mm:ss a") : "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["clientQRScanEvents"] })
          }
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger>
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {allSites.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOfficer} onValueChange={setFilterOfficer}>
          <SelectTrigger>
            <SelectValue placeholder="All Officers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Officers</SelectItem>
            {allOfficers.map((o) => (
              <SelectItem key={o.email} value={o.email}>
                {getOfficerDisplay(o.email, o.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scan groups */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <QrCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No scan activity found for {filterDate || "this date"}.</p>
            <p className="text-sm mt-1">Scans appear here within 30 seconds of being logged.</p>
          </div>
        )}
        {filtered.map((g) => (
          <Card
            key={g.key}
            className="hover:shadow-md transition-shadow cursor-pointer border-l-4"
            style={{
              borderLeftColor:
                g.missedCheckpoints.length > 0 ? "#ef4444" : "#22c55e",
            }}
            onClick={() => setViewGroup(g)}
          >
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-slate-900">
                      {getOfficerDisplay(g.officer_email, g.officer_name)}
                    </span>
                    <Badge className="bg-purple-100 text-purple-800 text-xs">
                      {g.property_site}
                    </Badge>
                    {g.totalRequired > 0 ? (
                      g.missedCheckpoints.length === 0 ? (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          ✓ All checkpoints scanned
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 text-xs">
                          ⚠ {g.missedCheckpoints.length} missing
                        </Badge>
                      )
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 text-xs">
                        No required checkpoints set
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      {g.successCount} successful scans
                    </span>
                    {g.duplicates > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {g.duplicates} duplicate{g.duplicates !== 1 ? "s" : ""}
                      </span>
                    )}
                    {g.totalRequired > 0 && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        {g.successCount}/{g.totalRequired} checkpoints
                      </span>
                    )}
                    {g.lastScan?.scanned_at && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        Last scan: {format(new Date(g.lastScan.scanned_at), "h:mm a")}
                      </span>
                    )}
                  </div>
                  {g.missedCheckpoints.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {g.missedCheckpoints.slice(0, 4).map((cp) => (
                        <span
                          key={cp.id}
                          className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"
                        >
                          <XCircle className="w-2.5 h-2.5" /> {cp.checkpoint_name}
                        </span>
                      ))}
                      {g.missedCheckpoints.length > 4 && (
                        <span className="text-[10px] text-slate-500">
                          +{g.missedCheckpoints.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="flex-shrink-0">
                  View Scans
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail dialog */}
      {viewGroup && (
        <Dialog open={!!viewGroup} onOpenChange={() => setViewGroup(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-600" />
                {getOfficerDisplay(viewGroup.officer_email, viewGroup.officer_name)} —{" "}
                {viewGroup.property_site}
              </DialogTitle>
            </DialogHeader>
            <ScanDetailView group={viewGroup} allCheckpoints={allCheckpoints} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ScanDetailView({ group, allCheckpoints }) {
  const siteCheckpoints = allCheckpoints.filter(
    (cp) => cp.property_site === group.property_site
  );
  const successScans = group.scans.filter((s) => s.scan_status === "success");
  const allScannedIds = new Set(successScans.map((s) => s.checkpoint_id));
  const totalMissed = siteCheckpoints.filter((cp) => !allScannedIds.has(cp.id)).length;

  // Build hourly rounds
  const hourlyRounds = useMemo(() => {
    if (group.scans.length === 0 || siteCheckpoints.length === 0) return [];

    const sortedScans = [...group.scans].sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
    const earliest = new Date(sortedScans[0].scanned_at);
    const latest = new Date(sortedScans[sortedScans.length - 1].scanned_at);

    const cursor = new Date(earliest);
    cursor.setMinutes(0, 0, 0);

    const rounds = [];
    const now = new Date();

    while (cursor <= latest || rounds.length === 0) {
      const windowStart = new Date(cursor);
      const windowEnd = new Date(cursor.getTime() + 60 * 60 * 1000);

      const windowScans = group.scans.filter((s) => {
        const t = new Date(s.scanned_at);
        return t >= windowStart && t < windowEnd;
      });

      const windowSuccess = windowScans.filter((s) => s.scan_status === "success");
      const scannedInWindow = new Set(windowSuccess.map((s) => s.checkpoint_id));

      const checkpointResults = siteCheckpoints.map((cp) => {
        const scan = windowSuccess.find((s) => s.checkpoint_id === cp.id);
        return {
          checkpoint: cp,
          scanned: scannedInWindow.has(cp.id),
          scan_time: scan ? (scan.scanned_time || format(new Date(scan.scanned_at), "h:mm a")) : null,
        };
      });

      const scannedCount = checkpointResults.filter((r) => r.scanned).length;
      const isPast = windowEnd < now;
      const isComplete = scannedCount === siteCheckpoints.length;

      rounds.push({
        windowStart,
        windowEnd,
        label: `${format(windowStart, "h:mm a")} – ${format(windowEnd, "h:mm a")}`,
        checkpointResults,
        scannedCount,
        total: siteCheckpoints.length,
        isPast,
        isComplete,
      });

      cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
      if (cursor > latest && rounds.length > 0) break;
    }

    return rounds;
  }, [group.scans, siteCheckpoints]);

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
          <p className="text-2xl font-bold text-green-700">{successScans.length}</p>
          <p className="text-xs text-green-600">Successful Scans</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
          <p className="text-2xl font-bold text-amber-700">
            {group.scans.filter((s) => s.scan_status === "duplicate").length}
          </p>
          <p className="text-xs text-amber-600">Duplicates</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
          <p className="text-2xl font-bold text-red-700">{totalMissed}</p>
          <p className="text-xs text-red-600">Never Scanned</p>
        </div>
      </div>

      {/* Hourly breakdown */}
      {hourlyRounds.length > 0 ? (
        <div>
          <p className="font-semibold text-slate-800 mb-3 flex items-center gap-1">
            <Clock className="w-4 h-4" /> Hourly Patrol Rounds
          </p>
          <div className="space-y-3">
            {hourlyRounds.map((round, idx) => (
              <div
                key={idx}
                className={`border rounded-lg overflow-hidden ${
                  round.isComplete ? "border-green-300" :
                  round.isPast ? "border-red-300" :
                  "border-amber-300"
                }`}
              >
                <div className={`flex items-center justify-between px-4 py-2 text-sm font-semibold ${
                  round.isComplete ? "bg-green-100 text-green-800" :
                  round.isPast ? "bg-red-100 text-red-800" :
                  "bg-amber-100 text-amber-800"
                }`}>
                  <span className="flex items-center gap-2">
                    {round.isComplete
                      ? <CheckCircle2 className="w-4 h-4" />
                      : round.isPast
                        ? <XCircle className="w-4 h-4" />
                        : <Clock className="w-4 h-4" />}
                    Round {idx + 1}: {round.label}
                  </span>
                  <span>
                    {round.scannedCount}/{round.total} checkpoints
                    {round.isPast && !round.isComplete && ` · ${round.total - round.scannedCount} MISSED`}
                  </span>
                </div>
                <div className="divide-y">
                  {round.checkpointResults.map(({ checkpoint, scanned, scan_time }) => (
                    <div
                      key={checkpoint.id}
                      className={`flex items-center gap-3 px-4 py-2 ${scanned ? "bg-white" : round.isPast ? "bg-red-50" : "bg-amber-50"}`}
                    >
                      {scanned
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <XCircle className={`w-4 h-4 flex-shrink-0 ${round.isPast ? "text-red-400" : "text-amber-400"}`} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{checkpoint.checkpoint_name}</p>
                        <p className="text-xs text-slate-400">{checkpoint.location_label}</p>
                      </div>
                      {scanned
                        ? <span className="text-xs text-green-700 font-medium flex-shrink-0">{scan_time}</span>
                        : <Badge className={`text-[10px] flex-shrink-0 ${round.isPast ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {round.isPast ? "MISSED" : "PENDING"}
                          </Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-slate-400 py-4">No checkpoint data available.</p>
      )}

      {/* Full scan log */}
      <div>
        <p className="font-semibold text-slate-800 mb-2 flex items-center gap-1">
          <Clock className="w-4 h-4" /> Full Scan Log ({group.scans.length} total)
        </p>
        <div className="divide-y border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          {[...group.scans].sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at)).map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900">{s.checkpoint_name_snapshot}</p>
                <p className="text-xs text-slate-500">{s.location_label_snapshot}</p>
                {s.officer_note && <p className="text-xs text-blue-600 italic">"{s.officer_note}"</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-600">{s.scanned_time || format(new Date(s.scanned_at), "h:mm a")}</p>
                <Badge className={`text-[10px] mt-0.5 ${
                  s.scan_status === "success" ? "bg-green-100 text-green-800" :
                  s.scan_status === "duplicate" ? "bg-amber-100 text-amber-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  {s.scan_status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
