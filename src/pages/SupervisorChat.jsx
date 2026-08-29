import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Send, Users, UserCheck, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MentionInput from "@/components/chat/MentionInput";
import { getTeamsChannelMessages, getTeamsSyncConfig, normalizeTeamsChannelMessage, sendTeamChannelMessage } from "@/lib/teamsGraph";
import { beginOutlookConnection } from '@/lib/outlookGraph';
import { toast } from 'sonner';

const SUPERVISOR_CHAT_VISIBLE_SINCE = new Date('2026-08-23T00:00:00-04:00').getTime();

export default function SupervisorChat() {
  const [message, setMessage] = useState("");
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const [teamsConfig, setTeamsConfig] = useState(null);
  const [teamsSyncError, setTeamsSyncError] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const senderName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user?.email || 'Unknown';

  const { data: localMessages = [] } = useQuery({
    queryKey: ['supervisorChatMessages'],
    queryFn: () => base44.entities.SupervisorChatMessage.list('-created_date', 500),
    enabled: !!user?.id,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    initialData: [],
  });

  const { data: liveTeamsMessages = [], error: liveTeamsError, refetch: refetchTeamsHistory } = useQuery({
    queryKey: ['supervisorTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
    queryFn: () => getTeamsChannelMessages(user.id, teamsConfig, 'supervisor_chat'),
    enabled: !!user?.id && !!teamsConfig?.enabled && (user?.role === 'supervisor' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access') || user?.role === 'admin'),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 60000,
  });

  const needsMicrosoftConnection = /connection required|authorization expired|reconnect/i.test(String(teamsSyncError || liveTeamsError?.message || ''));

  useEffect(() => {
    const onMicrosoftConnected = () => {
      setTeamsSyncError('');
      refetchTeamsHistory();
    };
    window.addEventListener('bps:outlook-connection-changed', onMicrosoftConnected);
    return () => window.removeEventListener('bps:outlook-connection-changed', onMicrosoftConnected);
  }, [refetchTeamsHistory]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const config = await getTeamsSyncConfig('supervisor_chat');
        if (cancelled) return;
        setTeamsConfig(config);
        if (config?.enabled) setTeamsSyncError('');
      } catch (error) {
        console.warn('[Teams] Supervisor Chat sync unavailable:', error?.message);
        setTeamsSyncError(error?.message || 'Microsoft Teams Supervisors Chat could not be loaded.');
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
      // Pathfinder is the source of availability for this private chat. Microsoft
      // Teams is an optional mirror and must never prevent supervisors from talking.
      const created = await base44.entities.SupervisorChatMessage.create({
        ...data,
        message_source: 'pathfinder',
      });

      if (created?.id && mentions.length) {
        await Promise.all(mentions.map(mention => base44.entities.ChatMention.create({
          message_id: created.id,
          chat_type: 'supervisor',
          page: 'SupervisorChat',
          recipient_email: mention.email,
          recipient_name: mention.label,
          sender_name: data.sender_name,
          message: data.message,
          read: false,
        }).catch(() => null)));
      }

      let teamsMessage = null;
      let teamsError = '';
      try {
        const target = teamsConfig || await getTeamsSyncConfig('supervisor_chat');
        if (target?.enabled) {
          teamsMessage = await sendTeamChannelMessage(user?.id, data.message, target, 'supervisor_chat');
          if (teamsMessage?.id && created?.id) {
            await base44.entities.SupervisorChatMessage.update(created.id, {
              message_source: 'pathfinder_teams',
              teams_message_id: teamsMessage.id,
              teams_team_id: target.team_id,
              teams_channel_id: target.channel_id,
              teams_sender_id: teamsMessage?.from?.user?.id || '',
              teams_sender_name: teamsMessage?.from?.user?.displayName || data.sender_name,
              teams_created_at: teamsMessage?.createdDateTime || new Date().toISOString(),
              teams_synced_at: new Date().toISOString(),
            }).catch(() => null);
          }
        }
      } catch (error) {
        teamsError = error?.message || 'Microsoft Teams sync unavailable.';
      }
      return { created, teamsMessage, teamsError };
    },
    onSuccess: async ({ teamsMessage, teamsError }) => {
      queryClient.invalidateQueries({ queryKey: ['supervisorChatMessages'] });
      const row = normalizeTeamsChannelMessage(teamsMessage);
      if (row) {
        queryClient.setQueryData(
          ['supervisorTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
          (current = []) => [...current.filter(item => item.id !== row.id), row]
        );
      }
      setMessage("");
      setMentionedUsers([]);
      setTeamsSyncError(teamsError || '');
      if (teamsError) toast.success('Message sent in Pathfinder. Microsoft Teams sync is currently unavailable.');
    },
    onError: (error) => {
      toast.error(`Supervisor message failed: ${error?.message || 'Unable to save message'}`, { duration: 12000 });
    },
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

  useEffect(() => {
    if (!user?.email) return undefined;
    const markRead = async record => {
      if (String(record?.recipient_email || '').toLowerCase() !== String(user.email).toLowerCase() || record.read || record.page !== 'SupervisorChat') return;
      await base44.entities.ChatMention.update(record.id, { read: true, read_at: new Date().toISOString() }).catch(() => null);
    };
    base44.entities.ChatMention.filter({ recipient_email: user.email, page: 'SupervisorChat', read: false }).then(records => Promise.all((records || []).map(markRead))).catch(() => null);
    const unsubscribe = base44.entities.ChatMention.subscribe(event => {
      if (event?.type === 'create') markRead(event.data);
    });
    return unsubscribe;
  }, [user?.email]);

  useEffect(() => {
    const onTeamsData = event => {
      if (event.detail?.configKey !== 'supervisor_chat') return;
      const rows = Array.isArray(event.detail?.rows) ? event.detail.rows : [];
      queryClient.setQueryData(['supervisorTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id], rows);
    };
    window.addEventListener('bps:teams-channel-data', onTeamsData);
    return () => window.removeEventListener('bps:teams-channel-data', onTeamsData);
  }, [queryClient, teamsConfig?.team_id, teamsConfig?.channel_id, user?.id]);

  const displayedMessages = (() => {
    const merged = new Map();
    const add = (msg) => {
      const teamsId = String(msg?.teams_message_id || '').trim();
      const fallback = `${String(msg?.sender_name || msg?.sender_email || '').toLowerCase()}|${String(msg?.message || '').trim()}|${String(msg?.created_date || msg?.teams_created_at || '')}`;
      const key = teamsId ? `teams:${teamsId}` : `local:${msg?.id || fallback}`;
      if (!merged.has(key)) merged.set(key, msg);
    };
    const isHumanChat = (msg) => {
      const sender = String(msg?.sender_name || '').trim().toLowerCase();
      const body = String(msg?.message || '').trim().toLowerCase();
      // Supervisor Chat is for supervisor-to-supervisor conversation only. Legacy
      // CAD logout/status automation and announcement-style system records remain
      // in their proper audit/announcement channels but are hidden from chat.
      if (sender === 'pathfinder cad system' || sender === 'pathfinder system' || sender === 'system') return false;
      if (body.startsWith('auto status alert:') || body.startsWith('announcement:')) return false;
      const timestamp = new Date(msg?.created_date || msg?.teams_created_at || 0).getTime();
      if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < SUPERVISOR_CHAT_VISIBLE_SINCE) return false;
      return Boolean(String(msg?.message || '').trim());
    };
    (localMessages || []).slice().reverse().filter(isHumanChat).forEach(add);
    (liveTeamsMessages || []).filter(isHumanChat).forEach(add);
    return [...merged.values()].sort((a, b) => new Date(a.created_date || a.teams_created_at || 0) - new Date(b.created_date || b.teams_created_at || 0));
  })();

  useEffect(() => {
    window.requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' }));
  }, [displayedMessages.length]);

  if (user?.role !== 'supervisor' && !user?.additional_roles?.includes('supervisor') && !user?.additional_roles?.includes('full_access') && user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07101a] p-3 text-slate-100 md:p-6">
      <div className="mx-auto h-[calc(100dvh-5rem)] max-w-5xl">
        <Card className="flex h-full flex-col overflow-hidden border border-slate-800 bg-[#0d1623] shadow-2xl">
          <CardHeader className="flex-shrink-0 border-b border-slate-800 bg-gradient-to-r from-[#101b29] to-[#0b1722] text-white">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-6 w-6 text-emerald-400" />
                Supervisor Chat
                <Shield className="ml-2 h-4 w-4 text-emerald-400" />
                <span className="text-sm font-normal text-emerald-300">Private · Supervisors Only</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-300">
                  {displayedMessages?.length || 0} current messages
                </span>
              </div>
            </div>
          </CardHeader>

          <div className="flex items-center gap-2 border-b border-slate-800 bg-[#0a1320] px-4 py-2 text-[11px] font-bold text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />Pathfinder private chat is active{teamsConfig?.enabled ? ' · Teams mirror connected' : ' · Teams mirror optional'}</div>
          {(teamsSyncError || liveTeamsError) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-[#101725] px-4 py-2 text-[10px] text-slate-500">
              <span>{needsMicrosoftConnection ? 'Connect Microsoft 365 to load and mirror the Supervisors Chat channel.' : 'Microsoft Teams mirror could not refresh. Pathfinder chat continues normally.'}</span>
              {needsMicrosoftConnection && <button onClick={() => beginOutlookConnection(user.id).catch(error => toast.error(error?.message || 'Unable to start Microsoft sign-in'))} className="rounded-md bg-blue-600 px-2.5 py-1.5 font-black text-white hover:bg-blue-500">CONNECT MICROSOFT 365</button>}
            </div>
          )}

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {displayedMessages?.map((msg) => {
                const senderEmail = getMessageEmail(msg);
                const isOwnMessage = senderEmail.toLowerCase() === String(user?.email || '').toLowerCase() || (!msg.sender_email && msg.sender_name === senderName);
                const showName = true;
                const showTime = true;
                
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {showName && (
                      <Avatar className={`w-10 h-10 flex-shrink-0 ${isOwnMessage ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
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
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          isOwnMessage
                            ? '!bg-gradient-to-r from-green-600 to-green-700 text-white rounded-tr-sm'
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
              <div ref={messagesEndRef} aria-hidden="true" />
              {!displayedMessages?.length && (
                <div className="text-center py-12">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-green-300" />
                  <p className="text-slate-500 text-lg font-medium mb-2">No messages yet</p>
                  <p className="text-slate-400 text-sm">Start the conversation with your supervisor team!</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <CardContent className="border-t p-4 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <MentionInput
                placeholder="Type a message or @mention a supervisor..."
                value={message}
                onChange={setMessage}
                users={(allUsers || []).filter(person => person?.role === 'admin' || (person?.additional_roles || []).map(role => String(role).toLowerCase()).includes('supervisor'))}
                currentEmail={user?.email}
                onMentionsChange={setMentionedUsers}
                disabled={sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending}
                className="bg-green-600 hover:bg-green-700 px-6"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}