import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Send, Users, UserCheck, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MentionInput from "@/components/chat/MentionInput";
import { getTeamsChannelMessages, getTeamsSyncConfig, saveTeamsSyncConfig, sendTeamChannelMessage } from "@/lib/teamsGraph";
import { toast } from 'sonner';

export default function SupervisorChat() {
  const [message, setMessage] = useState("");
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const scrollRef = useRef(null);
  const [teamsConfig, setTeamsConfig] = useState(null);
  const [teamsSyncError, setTeamsSyncError] = useState('');
  const [teamsLink, setTeamsLink] = useState('');
  const [teamsSaving, setTeamsSaving] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const senderName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user?.email || 'Unknown';

  const { data: liveTeamsMessages = [], error: liveTeamsError, refetch: refetchTeamsHistory } = useQuery({
    queryKey: ['supervisorTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
    queryFn: () => getTeamsChannelMessages(user.id, teamsConfig, 'supervisor_chat'),
    enabled: !!user?.id && !!teamsConfig?.enabled && (user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access') || user?.role === 'admin'),
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const config = await getTeamsSyncConfig('supervisor_chat');
        if (cancelled) return;
        setTeamsConfig(config);
        if (config?.channel_url) setTeamsLink(current => current || config.channel_url);
        if (config?.enabled) setTeamsSyncError('');
      } catch (error) {
        console.warn('[Teams] Supervisor Chat sync unavailable:', error?.message);
        setTeamsSyncError(error?.message || 'Microsoft Teams Supervisors Chat could not be loaded.');
      }
    };
    sync();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { data: supervisorUpdates = [] } = useQuery({
    queryKey: ['supervisorUpdates'],
    queryFn: async () => {
      const rows = await base44.entities.Announcement.filter({ audience: 'supervisors' }, '-created_date', 20);
      return rows || [];
    },
    enabled: user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access') || user?.role === 'admin',
    refetchInterval: 30000,
  });

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
      const target = teamsConfig || await getTeamsSyncConfig('supervisor_chat');
      if (!target?.enabled) throw new Error('Microsoft Teams Supervisors Chat is not configured.');
      const teamsMessage = await sendTeamChannelMessage(user?.id, `<strong>${data.sender_name}</strong>: ${data.message}`, target, 'supervisor_chat');
      if (!teamsMessage?.id) throw new Error('Microsoft Teams did not confirm delivery.');
      const created = await base44.entities.SupervisorChatMessage.create({
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
          chat_type: 'supervisor',
          page: 'SupervisorChat',
          recipient_email: mention.email,
          recipient_name: mention.label,
          sender_name: data.sender_name,
          message: data.message,
          read: false,
        }).catch(() => null)));
      }
      return teamsMessage;
    },
    onSuccess: async () => {
      await refetchTeamsHistory();
      setMessage("");
      setMentionedUsers([]);
      setTeamsSyncError('');
    },
    onError: (error) => {
      setTeamsSyncError(error?.message || 'Microsoft Teams delivery failed.');
      toast.error(`Supervisor Teams delivery failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 });
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
  const getUserPhoto = (msg) => msg.sender_photo_url || getUserRecord(getMessageEmail(msg))?.profile_photo_url;

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

  const displayedMessages = teamsConfig?.enabled ? liveTeamsMessages : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedMessages]);

  if (!user?.additional_roles?.includes('supervisor') && !user?.additional_roles?.includes('full_access') && user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const saveTeamsChannel = async () => {
    if (!teamsLink.trim()) return;
    try {
      setTeamsSaving(true);
      const saved = await saveTeamsSyncConfig({ channelUrl: teamsLink.trim(), channelName: 'Pathfinder Supervisor Chat', updatedBy: user?.email || user?.id || '', configKey: 'supervisor_chat' });
      setTeamsConfig(saved);
      await refetchTeamsHistory();
    } finally { setTeamsSaving(false); }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)]">
        <Card className="border-none shadow-xl h-full flex flex-col">
          <CardHeader className="border-b bg-gradient-to-r from-green-50 to-emerald-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-6 h-6 text-green-600" />
                Supervisor Chat
                <Shield className="w-4 h-4 text-green-500 ml-2" />
                <span className="text-sm font-normal text-green-600">
                  Private - Supervisors Only
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-normal text-slate-600">
                  {displayedMessages?.length || 0} messages
                </span>
              </div>
            </div>
          </CardHeader>

          {user?.role === 'admin' && !teamsConfig?.enabled && (
            <div className="border-b bg-green-50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-green-800">Connect Supervisor Chat to Microsoft Teams</div>
              <p className="mt-1 text-xs text-slate-600">Paste the link for the private Teams channel reserved for supervisors. This channel is separate from Team/Officer Chat.</p>
              <div className="mt-3 flex gap-2"><input value={teamsLink} onChange={e => setTeamsLink(e.target.value)} placeholder="Paste supervisor Teams channel link" className="min-w-0 flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-xs outline-none focus:border-green-500"/><Button type="button" onClick={saveTeamsChannel} disabled={teamsSaving || !teamsLink.trim()}>{teamsSaving ? 'Connecting…' : 'Connect'}</Button></div>
            </div>
          )}
          {teamsConfig?.enabled && <div className="border-b bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">Microsoft Teams live history · Supervisor Chat ↔ (Supervisors Chat)</div>}
          {(teamsSyncError || liveTeamsError) && <div className="border-b border-red-300 bg-red-50 px-4 py-3 text-xs font-bold text-red-800">Microsoft Teams sync error: {teamsSyncError || liveTeamsError?.message}</div>}

          {!!supervisorUpdates.length && (
            <div className="border-b border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[.14em] text-amber-800">Supervisor Updates</div>
              <div className="space-y-2">
                {supervisorUpdates.slice(0, 3).map(update => (
                  <div key={update.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                    <div className="text-xs font-black text-slate-900">{update.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-600">{update.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
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
                            {isOwnMessage ? `You — ${getSenderName(msg)}` : getSenderName(msg)}
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