import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, Download, Eye, AtSign, CheckCircle } from "lucide-react";
import PullToRefresh from "../components/PullToRefresh";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

export default function Announcements() {
  const queryClient = useQueryClient();
  const [pendingToAck, setPendingToAck] = useState(null); // announcement currently shown in modal
  const markedRef = useRef(new Set());

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.list('-created_date'),
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (announcement) => {
      const currentReadBy = announcement.read_by || [];
      if (!currentReadBy.includes(user.email)) {
        await base44.entities.Announcement.update(announcement.id, {
          read_by: [...currentReadBy, user.email]
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  const priorityConfig = {
    urgent: { color: "bg-red-100 text-red-800 border-red-300", icon: "🚨" },
    important: { color: "bg-amber-100 text-amber-800 border-amber-300", icon: "⚠️" },
    normal: { color: "bg-blue-100 text-blue-800 border-blue-300", icon: "ℹ️" },
  };

  const filteredAnnouncements = announcements?.filter(announcement => {
    const createdDate = new Date(announcement.created_date);
    const now = new Date();
    const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    if (announcement.priority === 'normal') return daysDiff <= 7;
    if (announcement.priority === 'important') return daysDiff <= 14;
    if (announcement.priority === 'urgent') return daysDiff <= 30;
    return true;
  }) || [];

  // Find unread announcements and show them one at a time for acknowledgment
  useEffect(() => {
    if (!user?.email || !announcements || pendingToAck) return;

    const unread = filteredAnnouncements.find(a =>
      !a.read_by?.includes(user.email) && !markedRef.current.has(a.id)
    );

    if (unread) {
      setPendingToAck(unread);
    }
  }, [announcements, user?.email, filteredAnnouncements, pendingToAck]);

  const handleAcknowledge = () => {
    if (!pendingToAck) return;
    markedRef.current.add(pendingToAck.id);
    markAsReadMutation.mutate(pendingToAck);
    setPendingToAck(null);
  };

  const isPingedForMe = (announcement) => {
    return announcement.pinged_users && announcement.pinged_users.includes(user?.email);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['announcements'] });
  };

  return (
    <>
      {/* Acknowledgment Modal */}
      <Dialog open={!!pendingToAck} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Megaphone className="w-6 h-6 text-blue-600" />
              New Announcement
            </DialogTitle>
          </DialogHeader>
          {pendingToAck && (
            <div className="space-y-4 py-2">
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${priorityConfig[pendingToAck.priority]?.color || ''}`}>
                {priorityConfig[pendingToAck.priority]?.icon} {pendingToAck.priority?.toUpperCase()}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{pendingToAck.title}</h3>
              <p className="text-slate-700 whitespace-pre-wrap text-sm">{pendingToAck.message}</p>
              {pendingToAck.photo_url && (
                <img src={pendingToAck.photo_url} alt="Announcement" className="w-full rounded-lg border border-slate-200 max-h-48 object-cover" />
              )}
              {pendingToAck.attachment_url && (
                <a
                  href={pendingToAck.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 text-sm"
                >
                  <Eye className="w-4 h-4" />
                  View Attachment
                </a>
              )}
              <p className="text-xs text-slate-500">Posted {format(new Date(pendingToAck.created_date), 'MMM d, yyyy h:mm a')}</p>
              <Button
                onClick={handleAcknowledge}
                disabled={markAsReadMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                I've Read This Announcement
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 md:p-8 min-h-screen">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="Black Point Protection" className="w-16 h-16 object-contain" />
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Company Announcements</h1>
                <p className="text-slate-600">Stay updated with the latest company news</p>
              </div>
            </div>

            <div className="space-y-4">
              {filteredAnnouncements.map((announcement) => {
                const config = priorityConfig[announcement.priority] || priorityConfig.normal;
                const isPinged = isPingedForMe(announcement);
                const isRead = announcement.read_by?.includes(user?.email);

                return (
                  <Card
                    key={announcement.id}
                    className={`border-l-4 ${
                      config.color.includes('red') ? 'border-l-red-500' :
                      config.color.includes('amber') ? 'border-l-amber-500' :
                      'border-l-blue-500'
                    } shadow-lg ${isPinged ? 'ring-2 ring-blue-400 bg-blue-50' : ''} ${!isRead ? 'ring-2 ring-amber-300' : ''}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Megaphone className="w-6 h-6 text-blue-600" />
                          <div>
                            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                              {announcement.title}
                              {announcement.priority !== 'normal' && (
                                <Badge variant="outline" className={config.color}>
                                  {config.icon} {announcement.priority.toUpperCase()}
                                </Badge>
                              )}
                              {isPinged && (
                                <Badge className="bg-blue-600 text-white">
                                  <AtSign className="w-3 h-3 mr-1" />
                                  You're mentioned
                                </Badge>
                              )}
                              {!isRead && (
                                <Badge className="bg-amber-500 text-white text-xs">Unread</Badge>
                              )}
                            </CardTitle>
                            <p className="text-sm text-slate-500 mt-1">
                              Posted {format(new Date(announcement.created_date), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-slate-700 whitespace-pre-wrap mb-4">{announcement.message}</p>
                      {announcement.photo_url && (
                        <img
                          src={announcement.photo_url}
                          alt="Announcement"
                          className="w-full max-w-2xl rounded-lg border border-slate-200 mb-4"
                        />
                      )}
                      {announcement.attachment_url && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          <a
                            href={announcement.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="text-sm font-medium">View Document</span>
                          </a>
                          <a
                            href={announcement.attachment_url}
                            download={announcement.attachment_name || 'document'}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
                          >
                            <Download className="w-4 h-4" />
                            <span className="text-sm font-medium">Download {announcement.attachment_name || 'File'}</span>
                          </a>
                        </div>
                      )}
                      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                        <img src={LOGO_URL} alt="" className="w-6 h-6 object-contain" />
                        <span>Black Point Protection - Richmond, VA</span>
                        {isRead && (
                          <span className="ml-auto text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Read
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {!filteredAnnouncements.length && (
                <Card className="border-none shadow-lg">
                  <CardContent className="p-12 text-center">
                    <Megaphone className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-slate-500">No announcements yet</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </PullToRefresh>
    </>
  );
}