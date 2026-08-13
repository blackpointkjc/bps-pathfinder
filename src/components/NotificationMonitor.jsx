import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { parseISO } from "date-fns";

export default function NotificationMonitor({ user }) {
  const { toast } = useToast();
  const [lastChatId, setLastChatId] = useState(null);
  const [lastAnnouncementId, setLastAnnouncementId] = useState(null);
  const [lastScheduleCheck, setLastScheduleCheck] = useState(null);
  const [lastPTOStatusId, setLastPTOStatusId] = useState(null);
  const [audioEnabled] = useState(true);

  // Monitor chat messages
  const { data: latestChat } = useQuery({
    queryKey: ['latestChatMessage'],
    queryFn: async () => {
      const messages = await base44.entities.ChatMessage.list('-created_date', 1);
      return messages[0] || null;
    },
    refetchInterval: 5000,
    enabled: !!user,
  });

  // Monitor announcements
  const { data: latestAnnouncement } = useQuery({
    queryKey: ['latestAnnouncement'],
    queryFn: async () => {
      const announcements = await base44.entities.Announcement.list('-created_date', 1);
      return announcements[0] || null;
    },
    refetchInterval: 10000,
    enabled: !!user,
  });

  // Monitor schedule week status (for new schedule published)
  const { data: weekStatus } = useQuery({
    queryKey: ['weekStatusNotify'],
    queryFn: async () => {
      const statuses = await base44.entities.ScheduleWeekStatus.list('-updated_date', 1);
      return statuses[0] || null;
    },
    refetchInterval: 60000,
    enabled: !!user,
  });

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

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Show browser notification
  const showBrowserNotification = (title, body, icon) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon, badge: '/badge-icon.png' });
    }
  };

  // Monitor new chat messages
  useEffect(() => {
    if (latestChat && latestChat.id !== lastChatId && lastChatId !== null) {
      if (latestChat.created_by !== user?.email) {
        const senderName = latestChat.sender_name || latestChat.created_by;
        toast({
          title: "New Team Message",
          description: `${senderName}: ${latestChat.message.substring(0, 50)}${latestChat.message.length > 50 ? '...' : ''}`,
          duration: 8000,
          className: "bg-blue-50 border-blue-200",
          action: (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.location.href = createPageUrl("TeamChat")}
              className="hover:bg-blue-100"
            >
              View
            </Button>
          ),
        });
        playNotificationSound();
        showBrowserNotification(
          "New Team Message",
          `${senderName}: ${latestChat.message.substring(0, 100)}`,
          "💬"
        );
      }
    }
    if (latestChat) setLastChatId(latestChat.id);
  }, [latestChat, user?.email, lastChatId, toast, playNotificationSound, showBrowserNotification]);

  // Monitor new announcements
  useEffect(() => {
    if (latestAnnouncement && latestAnnouncement.id !== lastAnnouncementId && lastAnnouncementId !== null) {
      const priority = latestAnnouncement.priority || 'normal';
      toast({
        title: priority === 'urgent' ? '🚨 URGENT Announcement' : '📢 New Announcement',
        description: `${latestAnnouncement.title}`,
        duration: priority === 'urgent' ? 20000 : 10000,
        className: priority === 'urgent' ? 'bg-red-50 border-red-300' : 'bg-indigo-50 border-indigo-200',
        action: (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.href = createPageUrl("Announcements")}
            className={priority === 'urgent' ? 'hover:bg-red-100' : 'hover:bg-indigo-100'}
          >
            View
          </Button>
        ),
      });
      playNotificationSound();
      if (priority === 'urgent') {
        playNotificationSound();
        playNotificationSound();
      }
      showBrowserNotification(
        priority === 'urgent' ? '🚨 URGENT Announcement' : '📢 New Announcement',
        latestAnnouncement.title,
        priority === 'urgent' ? '🚨' : '📢'
      );
    }
    if (latestAnnouncement) setLastAnnouncementId(latestAnnouncement.id);
  }, [latestAnnouncement, lastAnnouncementId, toast]);

  // Monitor schedule publication changes. Track the version/state of the week record,
  // not just its ID, because publishing updates the existing record in place.
  useEffect(() => {
    if (!weekStatus) return;
    const statusKey = `${weekStatus.id}:${weekStatus.updated_date || weekStatus.marked_ready_date || ''}:${weekStatus.is_ready ? 'ready' : 'hidden'}`;
    if (weekStatus.is_ready && lastScheduleCheck !== null && lastScheduleCheck !== statusKey) {
      toast({
        title: '📅 New Schedule Published',
        description: `The schedule for week of ${weekStatus.week_start_date} is now available`,
        duration: 15000,
        className: 'bg-green-50 border-green-300',
        action: (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.href = createPageUrl("Schedule")}
            className="hover:bg-green-100"
          >
            View
          </Button>
        ),
      });
      playNotificationSound();
      showBrowserNotification(
        '📅 New Schedule Published',
        `The schedule for week of ${weekStatus.week_start_date} is now available`,
        '📅'
      );
    }
    setLastScheduleCheck(statusKey);
  }, [weekStatus, lastScheduleCheck, toast]);

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