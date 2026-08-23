import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Send, Users, Phone } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MentionInput from "@/components/chat/MentionInput";
import { getTeamsChannelMessages, getTeamsSyncConfig, normalizeTeamsChannelMessage, sendTeamChannelMessage } from "@/lib/teamsGraph";
import { beginOutlookConnection } from '@/lib/outlookGraph';
import { toast } from 'sonner';

export default function OfficerChat() {
  const [message, setMessage] = useState("");
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const [teamsConfig, setTeamsConfig] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const senderName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user?.email || 'Unknown';

  const { data: liveTeamsMessages = [], error: liveTeamsError, refetch: refetchTeamsHistory } = useQuery({
    queryKey: ['officerTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
    queryFn: () => getTeamsChannelMessages(user.id, teamsConfig, 'officer_chat'),
    enabled: !!user?.id && !!teamsConfig?.enabled,
    // TeamsNotificationMonitor owns polling and broadcasts one shared result.
    // The page performs only its initial load to avoid duplicate Graph requests.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const config = await getTeamsSyncConfig('officer_chat');
        if (cancelled) return;
        setTeamsConfig(config);

      } catch (error) {
        console.warn('[Teams] Officer Chat sync unavailable:', error?.message);
      }
    };
    sync();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['chatDirectory'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getChatDirectory', {});
      return result?.data?.users || result?.users || [];
    },
    initialData: [],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ data, mentions }) => {
      const target = teamsConfig || await getTeamsSyncConfig('officer_chat');
      if (!target?.enabled) throw new Error('Microsoft Teams Officer General Chat is not configured.');
      // Teams is the source of truth. Do not create a Pathfinder-only message first.
      const teamsMessage = await sendTeamChannelMessage(user?.id, data.message, target, 'officer_chat');
      if (!teamsMessage?.id) throw new Error('Microsoft Teams did not confirm Officer Chat delivery.');
      const created = await base44.entities.OfficerChatMessage.create({
        ...data,
        message_source: 'teams',
        teams_message_id: teamsMessage.id,
        teams_team_id: target.team_id,
        teams_channel_id: target.channel_id,
        teams_sender_id: teamsMessage?.from?.user?.id || '',
        teams_sender_name: teamsMessage?.from?.user?.displayName || data.sender_name,
        teams_created_at: teamsMessage?.createdDateTime || new Date().toISOString(),
        teams_synced_at: new Date().toISOString(),
      }).catch(() => null);
      if (created?.id) {
        await Promise.all(mentions.map(mention => base44.entities.ChatMention.create({
          message_id: created.id,
          chat_type: 'officer',
          page: 'OfficerChat',
          recipient_email: mention.email,
          recipient_name: mention.label,
          sender_name: data.sender_name,
          message: data.message,
          read: false,
        }).catch(() => null)));
      }
      return teamsMessage;
    },
    onSuccess: async (teamsMessage) => {
      const row = normalizeTeamsChannelMessage(teamsMessage);
      if (row) {
        queryClient.setQueryData(
          ['officerTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
          (current = []) => [...current.filter(item => item.id !== row.id), row]
        );
      }
      setMessage("");
      setMentionedUsers([]);
    },
    onError: error => toast.error(`Officer Teams delivery failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 }),
  });

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    sendMessageMutation.mutate({
      data: {
        message: message.trim(),
        sender_name: senderName,
        sender_email: user?.email || '',
        sender_photo_url: user?.profile_photo_url || '',
        pinged_user: mentionedUsers[0]?.email || null,
      },
      mentions: mentionedUsers,
    });
  };

  const getUserRecord = (email) => allUsers.find(u => String(u.email).toLowerCase() === String(email || '').toLowerCase());

  const getMessageEmail = (msg) => msg.sender_email || msg.created_by || '';
  const getUserPhoto = (msg) => getUserRecord(getMessageEmail(msg))?.profile_photo_url || msg.sender_photo_url || '';

  const getSenderName = (msg) => {
    const senderEmail = getMessageEmail(msg);
    const sender = getUserRecord(senderEmail);
    const directoryName = sender?.first_name && sender?.last_name ? `${sender.first_name} ${sender.last_name}` : sender?.full_name;
    return msg.sender_email ? (directoryName || msg.sender_name || senderEmail || 'Unknown User') : (msg.sender_name || directoryName || senderEmail || 'Unknown User');
  };

  const formatMessageDateTime = (value) => {
    if (!value) return 'Date unavailable';
    const raw = String(value).trim();
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const getUserInitial = (email, name) => {
    if (name) return name.charAt(0).toUpperCase();
    const userData = allUsers?.find(u => u.email === email);
    if (userData?.first_name) return userData.first_name.charAt(0).toUpperCase();
    return email?.charAt(0).toUpperCase() || 'U';
  };

  const getUserPhone = (email) => {
    const userData = allUsers?.find(u => u.email === email);
    return userData?.mobile_phone;
  };

  const handleCallUser = (email) => {
    const phone = getUserPhone(email);
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  useEffect(() => {
    if (!user?.email) return undefined;
    const markRead = async record => {
      if (String(record?.recipient_email || '').toLowerCase() !== String(user.email).toLowerCase() || record.read || record.page !== 'OfficerChat') return;
      await base44.entities.ChatMention.update(record.id, { read: true, read_at: new Date().toISOString() }).catch(() => null);
    };
    base44.entities.ChatMention.filter({ recipient_email: user.email, page: 'OfficerChat', read: false }).then(records => Promise.all((records || []).map(markRead))).catch(() => null);
    const unsubscribe = base44.entities.ChatMention.subscribe(event => {
      if (event?.type === 'create') markRead(event.data);
    });
    return unsubscribe;
  }, [user?.email]);

  useEffect(() => {
    const onTeamsData = event => {
      if (event.detail?.configKey !== 'officer_chat') return;
      const rows = Array.isArray(event.detail?.rows) ? event.detail.rows : [];
      queryClient.setQueryData(['officerTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id], rows);
    };
    window.addEventListener('bps:teams-channel-data', onTeamsData);
    return () => window.removeEventListener('bps:teams-channel-data', onTeamsData);
  }, [queryClient, teamsConfig?.team_id, teamsConfig?.channel_id, user?.id]);

  const displayedMessages = teamsConfig?.enabled ? liveTeamsMessages : [];

  useEffect(() => {
    // ScrollArea's ref points to the Radix root, not the scrolling viewport.
    // An end anchor reliably keeps Teams chat on the newest message after sync.
    window.requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' }));
  }, [displayedMessages]);

  const handleRefresh = async () => {
    if (user?.id && teamsConfig?.enabled) await refetchTeamsHistory();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)]">
        <Card className="border-none shadow-xl h-full flex flex-col">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-purple-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-blue-600" />
                Officer Chat
                <Users className="w-4 h-4 text-slate-500 ml-auto" />
                <span className="text-sm font-normal text-slate-600">
                  {displayedMessages?.length || 0} messages
                </span>
              </CardTitle>
            </div>
          </CardHeader>

          <div className="border-b bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">Microsoft Teams · Officer Chat ↔ General Chat</div>
          {liveTeamsError && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>{/connection required|authorization expired|reconnect/i.test(liveTeamsError.message || '') ? 'Connect Microsoft 365 to load and sync General Chat.' : 'Teams General Chat could not refresh.'}</span>
              {/connection required|authorization expired|reconnect/i.test(liveTeamsError.message || '') && <button onClick={() => beginOutlookConnection(user.id).catch(error => toast.error(error?.message || 'Unable to start Microsoft sign-in'))} className="rounded-md bg-blue-600 px-2.5 py-1.5 font-black text-white hover:bg-blue-500">CONNECT MICROSOFT 365</button>}
            </div>
          )}

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {displayedMessages?.map((msg) => {
                const senderEmail = getMessageEmail(msg);
                const isOwnMessage = senderEmail.toLowerCase() === String(user?.email || '').toLowerCase() || (!msg.sender_email && msg.sender_name === senderName);
                const showName = true;
                const showTime = true;
                const userPhone = getUserPhone(senderEmail);
                
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {showName && (
                      <Avatar className={`w-10 h-10 flex-shrink-0 ${isOwnMessage ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
                        <AvatarImage src={getUserPhoto(msg)} alt={getSenderName(msg)} />
                        <AvatarFallback className="text-white font-semibold">
                          {getUserInitial(senderEmail, getSenderName(msg))}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!showName && <div className="w-10 h-10 flex-shrink-0" />}
                    
                    <div className={`flex flex-col max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                      {showName && (
                        <div className={`flex items-baseline gap-2 mb-1 px-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-xs font-semibold text-slate-700">
                            {isOwnMessage ? 'You' : getSenderName(msg)}
                          </span>
                          {!isOwnMessage && userPhone && (
                            <button
                              onClick={() => handleCallUser(senderEmail)}
                              className="text-green-600 hover:text-green-700 transition-colors"
                              title={`Call ${msg.sender_name}`}
                            >
                              <Phone className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          isOwnMessage
                            ? '!bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-tr-sm'
                            : 'bg-slate-100 text-slate-900 rounded-tl-sm'
                        } ${!showName ? 'mt-1' : ''}`}
                      >
                        <p className="text-sm break-words whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      {showTime && (
                        <span className={`text-xs text-slate-400 mt-1 px-2`}>
                          {formatMessageDateTime(msg.created_date)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!displayedMessages?.length && (
                <div className="text-center py-12">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500 text-lg font-medium mb-2">No messages yet</p>
                  <p className="text-slate-400 text-sm">Start the conversation with your team!</p>
                </div>
              )}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
          </ScrollArea>

          <CardContent className="border-t p-4 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <MentionInput
                placeholder="Type a message or @mention someone..."
                value={message}
                onChange={setMessage}
                users={[
                  {
                    id: 'dispatch-group',
                    label: 'Dispatch',
                    email: 'dispatch',
                    emails: allUsers.filter(person => {
                      const roles = (person?.additional_roles || []).map(role => String(role).toLowerCase());
                      return person?.role === 'admin' || person?.role === 'dispatch' || person?.dispatch_role === true || roles.includes('cad_access') || roles.includes('full_access');
                    }).map(person => person.email).filter(Boolean),
                  },
                  ...allUsers,
                ]}
                currentEmail={user?.email}
                onMentionsChange={setMentionedUsers}
                disabled={sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 px-6"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
    </PullToRefresh>
  );
}