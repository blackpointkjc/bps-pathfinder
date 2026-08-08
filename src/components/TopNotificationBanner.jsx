import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, X, Calendar, Star, AlertTriangle, GraduationCap } from "lucide-react";
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";

export default function TopNotificationBanner({ user }) {
  const queryClient = useQueryClient();
  const [visibleNotification, setVisibleNotification] = useState(null);
  const [dismissedIds, setDismissedIds] = useState([]);

  const { data: notifications } = useQuery({
    queryKey: ['myNotifications', user?.email],
    queryFn: async () => {
      try {
        return await base44.entities.Notification.filter({ recipient_email: user?.email }, '-created_date');
      } catch (e) {
        console.error('Error fetching notifications:', e);
        return [];
      }
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myNotifications'] }),
  });

  // Find the most recent unread notification that hasn't been dismissed
  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const unreadNotifications = notifications.filter(n => !n.is_read && !dismissedIds.includes(n.id));
      if (unreadNotifications.length > 0) {
        setVisibleNotification(unreadNotifications[0]);
      } else {
        setVisibleNotification(null);
      }
    }
  }, [notifications, dismissedIds]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (visibleNotification) {
      const timer = setTimeout(() => {
        handleDismiss(visibleNotification.id);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [visibleNotification]);

  const handleDismiss = (id) => {
    setDismissedIds(prev => [...prev, id]);
    markReadMutation.mutate(id);
    setVisibleNotification(null);
  };

  const getIcon = (type) => {
    switch (type) {
      case 'shift_posted': return <Calendar className="w-5 h-5 text-white" />;
      case 'bid_accepted': return <Star className="w-5 h-5 text-white" />;
      case 'bid_rejected': return <X className="w-5 h-5 text-white" />;
      case 'schedule_conflict': return <AlertTriangle className="w-5 h-5 text-white" />;
      case 'upcoming_shift': return <Calendar className="w-5 h-5 text-white" />;
      case 'training_reminder': return <GraduationCap className="w-5 h-5 text-white" />;
      default: return <Bell className="w-5 h-5 text-white" />;
    }
  };

  const getBgColor = (type) => {
    switch (type) {
      case 'shift_posted': return 'bg-gradient-to-r from-blue-500 to-indigo-600';
      case 'bid_accepted': return 'bg-gradient-to-r from-green-500 to-emerald-600';
      case 'bid_rejected': return 'bg-gradient-to-r from-red-500 to-pink-600';
      case 'schedule_conflict': return 'bg-gradient-to-r from-amber-500 to-orange-600';
      case 'upcoming_shift': return 'bg-gradient-to-r from-purple-500 to-violet-600';
      case 'training_reminder': return 'bg-gradient-to-r from-indigo-500 to-blue-600';
      default: return 'bg-gradient-to-r from-slate-500 to-slate-600';
    }
  };

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  if (!visibleNotification && unreadCount === 0) return null;

  return (
    <AnimatePresence>
      {visibleNotification && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className={`${getBgColor(visibleNotification.type)} text-white shadow-lg`}
        >
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 bg-white/20 rounded-full flex-shrink-0">
                  {getIcon(visibleNotification.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{visibleNotification.title}</p>
                  <p className="text-sm text-white/80 truncate">{visibleNotification.message}</p>
                </div>
                <span className="text-xs text-white/60 hidden md:block flex-shrink-0">
                  {format(parseISO(visibleNotification.created_date), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {unreadCount > 1 && (
                  <Badge className="bg-white/20 text-white border-none">
                    +{unreadCount - 1} more
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDismiss(visibleNotification.id)}
                  className="text-white hover:bg-white/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 30, ease: 'linear' }}
                className="h-full bg-white/60"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}