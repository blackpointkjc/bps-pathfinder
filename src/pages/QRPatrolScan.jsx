import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { QrCode, CheckCircle2, AlertTriangle, MapPin, Clock, List, X, ScanLine, Camera, CameraOff, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { format, addMinutes } from "date-fns";
import { Html5Qrcode } from "html5-qrcode";

// Build hourly round slots from shift start — one slot per hour, 30-min window to complete all checkpoints
function getHourlySlots(shiftStart) {
  const slots = [];
  const now = new Date();
  // First round starts at clock-in time, subsequent rounds every hour after that
  let cursor = new Date(shiftStart);
  let safetyCount = 0;
  while (cursor <= now && safetyCount < 24) {
    safetyCount++;
    const windowEnd = addMinutes(cursor, 30); // 30 min to complete all checkpoints
    slots.push({
      roundStart: new Date(cursor),
      windowEnd,
      label: format(cursor, 'h:mm a'),
      isOpen: now >= cursor && now <= windowEnd,
      isPast: now > windowEnd,
      isFuture: now < cursor,
    });
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }
  return slots;
}

function HourlyRoundsTracker({ siteCheckpoints, todayScans, shiftStart, activeSiteName }) {
  const [expanded, setExpanded] = useState(true);

  if (!shiftStart) return null;

  const now = new Date();
  const slots = getHourlySlots(shiftStart);
  const requiredCps = (siteCheckpoints || []).filter(c => c.is_required);
  const totalRequired = requiredCps.length;

  // For each slot: which required checkpoints were scanned within the 30-min window?
  const slotsWithStatus = slots.map((slot, idx) => {
    const windowScans = (todayScans || []).filter(s => {
      if (s.scan_status !== 'success') return false;
      const t = new Date(s.scanned_at);
      return t >= slot.roundStart && t <= slot.windowEnd;
    });
    const scannedIds = new Set(windowScans.map(s => s.checkpoint_id));
    const cpStatus = requiredCps.map(cp => ({ cp, done: scannedIds.has(cp.id) }));
    const doneCount = cpStatus.filter(x => x.done).length;
    const complete = totalRequired > 0 && doneCount >= totalRequired;
    const partial = doneCount > 0 && !complete;
    const missed = slot.isPast && !complete;
    return { ...slot, cpStatus, doneCount, complete, partial, missed, roundNumber: idx + 1 };
  });

  const completedRounds = slotsWithStatus.filter(s => s.complete).length;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="text-blue-900 font-bold">Patrol Rounds — {activeSiteName}</span>
          <span className="ml-auto text-xs font-semibold text-blue-700">
            {completedRounds}/{slotsWithStatus.length} complete
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5 pl-6">Scan all {totalRequired} checkpoint{totalRequired !== 1 ? 's' : ''} within 30 min of each hour</p>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0">
          <div className="divide-y">
            {slotsWithStatus.map((slot) => (
              <div key={slot.roundNumber} className={`px-4 py-3 ${slot.isOpen ? 'bg-blue-50' : ''}`}>
                {/* Round header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    slot.complete ? 'bg-green-500 text-white' :
                    slot.isOpen && slot.partial ? 'bg-amber-400 text-white' :
                    slot.isOpen ? 'bg-blue-500 text-white' :
                    slot.missed ? 'bg-red-400 text-white' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {slot.complete ? '✓' : slot.roundNumber}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      Round {slot.roundNumber} — {slot.label}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        (until {format(slot.windowEnd, 'h:mm a')})
                      </span>
                    </p>
                    <p className={`text-xs font-medium ${
                      slot.complete ? 'text-green-600' :
                      slot.missed ? 'text-red-500' :
                      slot.isOpen ? 'text-blue-600' :
                      'text-slate-400'
                    }`}>
                      {slot.complete ? `✅ All ${totalRequired} checkpoints scanned` :
                       slot.missed ? `❌ Missed — ${slot.doneCount}/${totalRequired} done` :
                       slot.isOpen ? `🔵 Active now — ${slot.doneCount}/${totalRequired} done` :
                       `Upcoming`}
                    </p>
                  </div>
                </div>
                {/* Per-checkpoint rows for this round */}
                {totalRequired > 0 && (
                  <div className="ml-9 mt-1 divide-y border rounded-lg overflow-hidden">
                    {slot.cpStatus.map(({ cp, done }) => {
                      const scan = (todayScans || []).find(s =>
                        s.checkpoint_id === cp.id &&
                        s.scan_status === 'success' &&
                        new Date(s.scanned_at) >= slot.roundStart &&
                        new Date(s.scanned_at) <= slot.windowEnd
                      );
                      return (
                        <div key={cp.id} className={`flex items-center gap-2 px-3 py-1.5 ${done ? 'bg-white' : slot.missed ? 'bg-red-50' : 'bg-slate-50'}`}>
                          {done
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            : <XCircle className={`w-3.5 h-3.5 flex-shrink-0 ${slot.missed ? 'text-red-400' : 'text-slate-300'}`} />}
                          <span className={`text-xs flex-1 font-medium ${done ? 'text-green-800' : slot.missed ? 'text-red-700' : 'text-slate-500'}`}>
                            {cp.checkpoint_name}
                          </span>
                          {done && scan
                            ? <span className="text-[10px] text-green-700 font-semibold flex-shrink-0">{scan.scanned_time || format(new Date(scan.scanned_at), 'h:mm a')}</span>
                            : slot.missed
                              ? <span className="text-[10px] font-bold text-red-600 flex-shrink-0">MISSED</span>
                              : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {slotsWithStatus.length === 0 && (
              <div className="px-4 py-4 text-sm text-slate-500 text-center">No rounds yet — clock in to start</div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function QRPatrolScan() {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [officerNote, setOfficerNote] = useState("");
  const [gps, setGps] = useState(null);

  const scannerRef = useRef(null);
  const html5Ref = useRef(null);
  const cooldownRef = useRef({});
  const processingRef = useRef(false);
  const handlerRef = useRef(null);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Get active time entry to determine site (optional — used for site context only)
  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter({ officer_email: user.email }, '-created_date', 10);
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
    refetchInterval: 60000,
    placeholderData: (prev) => prev,
  });

  // Extract site name from active entry if available
  const activeSiteName = activeEntry?.location
    ? (activeEntry.location.includes(': ')
        ? activeEntry.location.split(': ')[0].trim()
        : activeEntry.location.split(' - ')[0].trim())
    : null;

  const { data: siteCheckpoints = [] } = useQuery({
    queryKey: ['siteCheckpoints', activeSiteName],
    queryFn: async () => {
      if (!activeSiteName) return [];
      return await base44.entities.QRCheckpoint.filter({ property_site: activeSiteName, is_active: true });
    },
    enabled: !!activeSiteName,
    staleTime: 120000,
    placeholderData: (prev) => prev ?? [],
  });

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: todayScans = [] } = useQuery({
    queryKey: ['todayQRScans', user?.email, today],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.QRScanEvent.filter(
        { officer_email: user.email, scanned_date: today },
        '-scanned_at',
        200
      );
    },
    enabled: !!user?.email,
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev) => prev ?? [],
  });

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  // Use subscription to append new scans directly to cache — avoids a full refetch (which causes flicker on 429)
  useEffect(() => {
    if (!user?.email) return;
    const unsub = base44.entities.QRScanEvent.subscribe((event) => {
      if (event.data?.officer_email !== user.email) return;
      const key = ['todayQRScans', user.email, today];
      if (event.type === 'create') {
        queryClient.setQueryData(key, (old) => {
          if (!old) return [event.data];
          if (old.find(s => s.id === event.data.id)) return old;
          return [event.data, ...old];
        });
      } else if (event.type === 'update') {
        queryClient.setQueryData(key, (old) => {
          if (!old) return old;
          return old.map(s => s.id === event.id ? event.data : s);
        });
      }
    });
    return unsub;
  }, [user?.email, today, queryClient]);

  const logScanMutation = useMutation({
    mutationFn: async ({ checkpoint, status, note }) => {
      const now = new Date();
      return await base44.entities.QRScanEvent.create({
        shift_id: activeEntry?.id || '',
        officer_email: user.email,
        officer_name: [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email,
        property_site: activeSiteName || checkpoint.property_site,
        checkpoint_id: checkpoint.id,
        qr_unique_id: checkpoint.qr_unique_id,
        checkpoint_name_snapshot: checkpoint.checkpoint_name,
        location_label_snapshot: checkpoint.location_label,
        scanned_at: now.toISOString(),
        scanned_date: format(now, 'yyyy-MM-dd'),
        scanned_time: format(now, 'HH:mm'),
        device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        gps_latitude: gps?.lat || null,
        gps_longitude: gps?.lng || null,
        scan_status: status,
        duplicate_flag: status === 'duplicate',
        officer_note: note || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayQRScans'] });
    },
  });

  const stopCamera = useCallback(async () => {
    setScanning(false);
    if (html5Ref.current) {
      try {
        await html5Ref.current.stop();
        html5Ref.current.clear();
      } catch (_) {}
      html5Ref.current = null;
    }
  }, []);

  const handleScanResult = useCallback(async (decodedText) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    await stopCamera();

    let checkpoints = [];
    try {
      checkpoints = await base44.entities.QRCheckpoint.filter({ qr_unique_id: decodedText });
    } catch (_) {
      toast.error("Error looking up checkpoint.");
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    const checkpoint = checkpoints[0];
    if (!checkpoint) {
      toast.error("Invalid QR code — checkpoint not found.");
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    if (!checkpoint.is_active) {
      toast.warning(`⚠️ "${checkpoint.checkpoint_name}" is inactive.`);
      await logScanMutation.mutateAsync({ checkpoint, status: 'inactive_checkpoint', note: officerNote });
      setLastScan({ checkpoint, status: 'inactive_checkpoint', time: new Date() });
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    // Only enforce site matching if officer is clocked in at a specific site
    if (activeEntry) {
      const officerSite = activeEntry.location.includes(': ')
        ? activeEntry.location.split(': ')[0].trim()
        : activeEntry.location.split(' - ')[0].trim();
      const checkpointSite = checkpoint.property_site?.trim();
      if (checkpointSite && officerSite && checkpointSite !== officerSite) {
        toast.error(`❌ This checkpoint belongs to "${checkpointSite}" — you are at "${officerSite}".`);
        await logScanMutation.mutateAsync({ checkpoint, status: 'outside_property', note: officerNote });
        setLastScan({ checkpoint, status: 'outside_property', time: new Date() });
        processingRef.current = false;
        setProcessing(false);
        return;
      }
    }

    // 10-min in-session cooldown (prevents double-scan within same session)
    const lastScanTime = cooldownRef.current[checkpoint.id];
    if (lastScanTime && (Date.now() - lastScanTime) < 10 * 60 * 1000) {
      toast.warning(`Already scanned "${checkpoint.checkpoint_name}" recently.`);
      await logScanMutation.mutateAsync({ checkpoint, status: 'duplicate', note: officerNote });
      setLastScan({ checkpoint, status: 'duplicate', time: new Date() });
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    cooldownRef.current[checkpoint.id] = Date.now();
    await logScanMutation.mutateAsync({ checkpoint, status: 'success', note: officerNote });
    setLastScan({ checkpoint, status: 'success', time: new Date() });
    setOfficerNote("");
    toast.success(`✅ Scanned: ${checkpoint.checkpoint_name}`);
    processingRef.current = false;
    setProcessing(false);
  }, [activeEntry, officerNote, logScanMutation, stopCamera]);

  handlerRef.current = handleScanResult;

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setLastScan(null);
    processingRef.current = false;

    try {
      await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError("Camera permission denied. Please allow camera access in your browser settings.");
      } else {
        setCameraError("Unable to access camera. Make sure no other app is using it and try again.");
      }
      return;
    }

    setScanning(true);
  }, []);

  useEffect(() => {
    if (!scanning || !scannerRef.current) return;

    const qr = new Html5Qrcode("qr-scanner-container");
    html5Ref.current = qr;

    qr.start(
      { facingMode: "environment" },
      { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      (decodedText) => { handlerRef.current(decodedText); },
      () => {}
    ).catch(() => {
      setCameraError("Camera failed to start. Please check permissions and try again.");
      setScanning(false);
      html5Ref.current = null;
    });

    return () => {
      if (html5Ref.current) {
        html5Ref.current.stop().catch(() => {}).finally(() => {
          try { html5Ref.current?.clear(); } catch (_) {}
          html5Ref.current = null;
        });
      }
    };
  }, [scanning]);

  useEffect(() => {
    return () => {
      if (html5Ref.current) {
        html5Ref.current.stop().catch(() => {});
        html5Ref.current = null;
      }
    };
  }, []);

  const successScans = todayScans?.filter(s => s.scan_status === 'success') || [];
  const totalScans = todayScans?.length || 0;

  const statusColor = (status) => {
    if (status === 'success') return 'border-green-400 bg-green-50';
    if (status === 'outside_property') return 'border-red-400 bg-red-50';
    return 'border-amber-400 bg-amber-50';
  };

  const statusIcon = (status) => {
    if (status === 'success') return <CheckCircle2 className="w-7 h-7 text-green-600 mt-0.5 flex-shrink-0" />;
    if (status === 'outside_property') return <AlertTriangle className="w-7 h-7 text-red-600 mt-0.5 flex-shrink-0" />;
    return <AlertTriangle className="w-7 h-7 text-amber-600 mt-0.5 flex-shrink-0" />;
  };

  return (
    <div className="bg-white p-4 max-w-2xl mx-auto space-y-4 pb-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-600 p-2 rounded-xl">
          <QrCode className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QR Patrol Scan</h1>
          <p className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {cameraError && (
        <Alert className="border-red-200 bg-red-50">
          <CameraOff className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-800 font-medium">{cameraError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-blue-100">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{successScans.length}</p>
            <p className="text-xs text-slate-500 mt-1">Successful Scans Today</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-slate-700">{totalScans}</p>
            <p className="text-xs text-slate-500 mt-1">Total Attempts Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly rounds tracker — shows per-hour round with all checkpoints, 30-min window */}
      {activeEntry && activeSiteName && siteCheckpoints.length > 0 && (
        <HourlyRoundsTracker
          siteCheckpoints={siteCheckpoints}
          todayScans={todayScans}
          shiftStart={activeEntry.clock_in}
          activeSiteName={activeSiteName}
        />
      )}

      {!scanning && !processing && (
        <Button
          onClick={startCamera}
          className="w-full h-20 text-xl bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-lg"
        >
          <Camera className="w-8 h-8 mr-3" />
          Scan QR Code
        </Button>
      )}

      {processing && (
        <Card className="border-2 border-blue-300 bg-blue-50">
          <CardContent className="p-6 text-center">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-blue-700 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-blue-800 font-semibold">Processing scan...</p>
          </CardContent>
        </Card>
      )}

      {scanning && (
        <Card className="border-2 border-blue-400 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-blue-600">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <ScanLine className="w-5 h-5" /> Point camera at QR code
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700" onClick={stopCamera}>
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div
              id="qr-scanner-container"
              ref={scannerRef}
              className="w-full bg-black"
              style={{ minHeight: 300 }}
            />
            <div className="p-3 space-y-2 bg-slate-50">
              <Label className="text-xs text-slate-600">Optional note for this scan</Label>
              <Input
                value={officerNote}
                onChange={e => setOfficerNote(e.target.value)}
                placeholder="e.g. Door secured, light out..."
              />
            </div>
          </CardContent>
        </Card>
      )}

      {lastScan && !scanning && !processing && (
        <Card className={`border-2 ${statusColor(lastScan.status)}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {statusIcon(lastScan.status)}
              <div className="flex-1">
                <p className="font-bold text-slate-900 text-lg">{lastScan.checkpoint.checkpoint_name}</p>
                <p className="text-sm text-slate-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {lastScan.checkpoint.location_label}
                </p>
                <p className="text-sm text-slate-600">{lastScan.checkpoint.property_site}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" /> {format(lastScan.time, 'h:mm:ss a')}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <Badge className={`${lastScan.status === 'success' ? 'bg-green-100 text-green-800 border-green-300' : lastScan.status === 'outside_property' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                    {lastScan.status === 'success' ? '✅ Logged Successfully' : lastScan.status.replace(/_/g, ' ')}
                  </Badge>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={startCamera}>
                    <Camera className="w-4 h-4 mr-1" /> Scan Next
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {todayScans && todayScans.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="w-4 h-4" /> Today's Scan Log ({todayScans.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {todayScans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{scan.checkpoint_name_snapshot}</p>
                    <p className="text-xs text-slate-500">{scan.location_label_snapshot}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">{scan.scanned_time}</p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        scan.scan_status === 'success'
                          ? 'text-green-700 border-green-300'
                          : scan.scan_status === 'outside_property'
                          ? 'text-red-700 border-red-300'
                          : 'text-amber-700 border-amber-300'
                      }`}
                    >
                      {scan.scan_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}