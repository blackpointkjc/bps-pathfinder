import { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

export default function AdminAlertMonitor({ user }) {
  const { toast } = useToast();
  
  const [lastCounts, setLastCounts] = useState({
    pendingReports: 0,
    pendingWriteUps: 0,
    newConfidentialReports: 0,
  });

  const initialLoadRef = useRef(true);

  // Query for pending regular reports (shift, incident, trespass, parking)
  const { data: pendingReports } = useQuery({
    queryKey: ['adminPendingReports'],
    queryFn: async () => {
      try {
        const [shifts, incidents, trespasses, parking] = await Promise.all([
          base44.entities.ShiftReport.filter({ status: 'submitted' }),
          base44.entities.IncidentReport.filter({ status: 'submitted' }),
          base44.entities.TrespassingNotice.filter({ status: 'active' }),
          base44.entities.ParkingViolation.filter({ status: 'issued' })
        ]);
        return [...shifts, ...incidents, ...trespasses, ...parking];
      } catch (e) {
        console.error('Error fetching pending reports:', e);
        return [];
      }
    },
    enabled: user?.role === 'admin',
    refetchInterval: 60000, // Subscription-friendly fallback refresh
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Query for pending supervisor write-ups
  const { data: pendingWriteUps } = useQuery({
    queryKey: ['adminPendingWriteUps'],
    queryFn: async () => {
      try {
        return await base44.entities.WriteUpReport.filter({ status: 'pending_approval' });
      } catch (e) {
        console.error('Error fetching pending write-ups:', e);
        return [];
      }
    },
    enabled: user?.role === 'admin',
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Query for new confidential reports (not viewed yet)
  const { data: newConfidentialReports } = useQuery({
    queryKey: ['adminNewConfidentialReports'],
    queryFn: async () => {
      try {
        const reports = await base44.entities.ConfidentialReport.filter({ viewed: false });
        return reports.filter(r => !r.archived);
      } catch (e) {
        console.error('Error fetching confidential reports:', e);
        return [];
      }
    },
    enabled: user?.role === 'admin',
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Play notification sound
  const playAlertSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGJ0fPTgjMGHm7A7+OZUQ4MW6ro7q1aFAg+ltryxXQnBSuCzvLaizgIG2m98OScTgwNUKXf77RjGgU2j9Tyy30qBSh+x+/glz8JElux6OynUxEKRJzd8r9wIgU1h83z1YU1Bh1tv+zjn1ANCligvOGhWRcJNYzJ88l6KQUme8Tv3Zk+CRJYrejxpVMRCkObzPO9cSIFNYjN89WFNQYdbL/t4Z9PDAxYoLvhoVkXCTWMyfPJeikFJnvF79yZPgkSV63o8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC74aFZFwk1jMnzyXopBSZ7xe/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1rv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4J');
      audio.volume = 0.4;
      audio.play();
    } catch (e) {
      console.error('Could not play alert sound', e);
    }
  };

  // Keep administrative alerts in the Pathfinder toast/banner system.
  const showBrowserNotification = () => {};

  // Monitor pending reports
  useEffect(() => {
    if (!pendingReports || initialLoadRef.current) return;

    const currentCount = pendingReports.length;
    const previousCount = lastCounts.pendingReports;

    if (currentCount > previousCount) {
      const newCount = currentCount - previousCount;
      toast({
        title: "📋 New Reports Pending Approval",
        description: `${newCount} new ${newCount === 1 ? 'report' : 'reports'} submitted by officers awaiting your review`,
        duration: 12000,
        className: "bg-blue-50 border-blue-200",
        action: (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.href = createPageUrl("AdminReports")}
            className="hover:bg-blue-100"
          >
            Review
          </Button>
        ),
      });
      playAlertSound();
      showBrowserNotification(
        "New Reports Pending",
        `${newCount} new ${newCount === 1 ? 'report' : 'reports'} waiting for approval`
      );
    }

    setLastCounts(prev => ({ ...prev, pendingReports: currentCount }));
  }, [pendingReports, lastCounts.pendingReports, toast]);

  // Monitor pending write-ups
  useEffect(() => {
    if (!pendingWriteUps || initialLoadRef.current) return;

    const currentCount = pendingWriteUps.length;
    const previousCount = lastCounts.pendingWriteUps;

    if (currentCount > previousCount) {
      const newCount = currentCount - previousCount;
      toast({
        title: "⚠️ New Supervisor Write-Up for Approval",
        description: `${newCount} new write-up ${newCount === 1 ? 'report' : 'reports'} from supervisors requiring your approval`,
        duration: 15000,
        className: "bg-amber-50 border-amber-300",
        action: (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.href = createPageUrl("AdminSupervisorReports")}
            className="hover:bg-amber-100"
          >
            Review
          </Button>
        ),
      });
      playAlertSound();
      playAlertSound(); // Double beep for write-ups
      showBrowserNotification(
        "Write-Up Pending Approval",
        `${newCount} new write-up ${newCount === 1 ? 'report' : 'reports'} need your review`
      );
    }

    setLastCounts(prev => ({ ...prev, pendingWriteUps: currentCount }));
  }, [pendingWriteUps, lastCounts.pendingWriteUps, toast]);

  // Monitor new confidential reports
  useEffect(() => {
    if (!newConfidentialReports || initialLoadRef.current) return;

    const currentCount = newConfidentialReports.length;
    const previousCount = lastCounts.newConfidentialReports;

    if (currentCount > previousCount) {
      const newCount = currentCount - previousCount;
      toast({
        title: "🔒 New Confidential Report Submitted",
        description: `${newCount} new confidential ${newCount === 1 ? 'report' : 'reports'} from officer(s) - requires immediate attention`,
        duration: 20000,
        className: "bg-red-50 border-red-300",
        action: (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.href = createPageUrl("AdminConfidentialReports")}
            className="hover:bg-red-100"
          >
            Review
          </Button>
        ),
      });
      playAlertSound();
      playAlertSound();
      playAlertSound(); // Triple beep for confidential reports
      showBrowserNotification(
        "Confidential Report Submitted",
        `${newCount} new confidential ${newCount === 1 ? 'report' : 'reports'} need your review`
      );
    }

    setLastCounts(prev => ({ ...prev, newConfidentialReports: currentCount }));
  }, [newConfidentialReports, lastCounts.newConfidentialReports, toast]);

  // Set initial counts after first load
  useEffect(() => {
    if (initialLoadRef.current && pendingReports && pendingWriteUps && newConfidentialReports) {
      setLastCounts({
        pendingReports: pendingReports.length,
        pendingWriteUps: pendingWriteUps.length,
        newConfidentialReports: newConfidentialReports.length,
      });
      initialLoadRef.current = false;
    }
  }, [pendingReports, pendingWriteUps, newConfidentialReports]);

  return null;
}