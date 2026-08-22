import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { parseISO } from "date-fns";

export default function NotificationMonitor({ user }) {
  const { toast } = useToast();
  const [lastPTOStatusId, setLastPTOStatusId] = useState(null);
  const [audioEnabled] = useState(true);

  // Monitor PTO request status changes
  const { data: myPTORequests } = useQuery({
    queryKey: ['myPTONotify', user?.id],
    queryFn: async () => {
      const requests = await base44.entities.TimeOffRequest.filter({ created_by_id: user?.id }, '-updated_date', 5);
      return requests;
    },
    refetchInterval: 30000,
    enabled: !!user?.id,
  });

  // Monitor overtime alerts (check if weekly hours approaching 40)
  const { data: timeEntries } = useQuery({
    queryKey: ['myTimeEntriesNotify', user?.email],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.filter({ officer_email: user?.email }, '-clock_in', 20);
      return entries;
    },
    refetchInterval: 60000,
    enabled: !!user?.email,
  });

  // Play notification sound
  const playNotificationSound = () => {
    if (!audioEnabled) return;
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGJ0fPTgjMGHm7A7+OZUQ4MW6ro7q1aFAg+ltryxXQnBSuCzvLaizgIG2m98OScTgwNUKXf77RjGgU2j9Tyy30qBSh+x+/glz8JElux6OynUxEKRJzd8r9wIgU1h83z1YU1Bh1tv+zjn1ANCligvOGhWRcJNYzJ88l6KQUme8Tv3Zk+CRJYrejxpVMRCkObzPO9cSIFNYjN89WFNQYdbL/t4Z9PDAxYoLvhoVkXCTWMyfPJeikFJnvF79yZPgkSV63o8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC74aFZFwk1jMnzyXopBSZ7xe/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1rv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4JEletz/GlUxEKQ5vM871vIgU1iM3z1YU1Bh1sv+3hn08MDFiguuGhWhgJNYvJ88l6KQUme8Tv3Jk+CRJXre/xpVMRCkObzPO9byIFNYjN89WFNQYdbL/t4Z9PDAxYoLrhoVoYCTWLyfPJeikFJnvE79yZPgkSV63v8aVTEQpDm8zzvm8iBTWIzfPVhTUGHWy/7eGfTwwMWKC64aFaGAk1i8nzyXopBSZ7xO/cmT4J');
      audio.volume = 0.3;
      audio.play();
    } catch (e) {
      console.error('Could not play notification sound', e);
    }
  };

  // Notifications stay inside Pathfinder. Browser/OS notification
  // permission prompts and external notification banners are intentionally disabled.
  const showBrowserNotification = () => {};

  // Schedule publication is delivered through the durable Notification record
  // and the Black Point announcement banner. A second pale green toast here
  // duplicated the same event and has intentionally been removed.

  // Monitor PTO status changes
  useEffect(() => {
    if (myPTORequests && myPTORequests.length > 0) {
      const latestRequest = myPTORequests[0];
      if (latestRequest.id !== lastPTOStatusId && lastPTOStatusId !== null) {
        if (latestRequest.status === 'approved') {
          toast({
            title: '✅ Time Off Approved',
            description: `Your request for ${latestRequest.start_date} to ${latestRequest.end_date} was approved`,
            duration: 10000,
            className: 'bg-green-50 border-green-300',
          });
          playNotificationSound();
          showBrowserNotification('✅ Time Off Approved', 'Your time off request was approved', '✅');
        } else if (latestRequest.status === 'denied') {
          toast({
            title: '❌ Time Off Denied',
            description: `Your request was denied. ${latestRequest.admin_notes || ''}`,
            duration: 10000,
            className: 'bg-red-50 border-red-300',
          });
          playNotificationSound();
          showBrowserNotification('❌ Time Off Denied', 'Your time off request was denied', '❌');
        }
      }
      setLastPTOStatusId(latestRequest.id);
    }
  }, [myPTORequests, lastPTOStatusId, toast]);

  // Monitor overtime alerts
  useEffect(() => {
    if (!timeEntries || timeEntries.length === 0) return;

    // Calculate current week hours (Friday-Thursday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysSinceFriday = (dayOfWeek + 2) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysSinceFriday);
    weekStart.setHours(0, 0, 0, 0);

    let weeklyHours = 0;
    timeEntries.forEach(entry => {
      if (!entry.clock_in || !entry.clock_out) return;
      const clockIn = parseISO(entry.clock_in);
      if (clockIn >= weekStart) {
        const clockOut = parseISO(entry.clock_out);
        weeklyHours += (clockOut - clockIn) / (1000 * 60 * 60);
      }
    });

    // Alert if approaching 40 hours (at 35+)
    if (weeklyHours >= 35 && weeklyHours < 40) {
      const hoursRemaining = (40 - weeklyHours).toFixed(1);
      toast({
        title: '⚠️ Overtime Alert',
        description: `You have ${hoursRemaining} hours remaining before overtime this week`,
        duration: 8000,
        className: 'bg-amber-50 border-amber-300',
      });
    } else if (weeklyHours >= 40) {
      toast({
        title: '🚨 Overtime Active',
        description: `You have ${(weeklyHours - 40).toFixed(1)} overtime hours this week`,
        duration: 8000,
        className: 'bg-red-50 border-red-300',
      });
    }
  }, [timeEntries, toast]);

  return null;
}