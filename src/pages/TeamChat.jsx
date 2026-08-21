import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Send, Users, Phone } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MentionInput from "@/components/chat/MentionInput";
import { getTeamsChannelMessages, getTeamsSyncConfig, saveTeamsSyncConfig, sendTeamChannelMessage } from "@/lib/teamsGraph";
import { toast } from 'sonner';

export default function TeamChat() {
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
    queryKey: ['teamTeamsChannelHistory', teamsConfig?.team_id, teamsConfig?.channel_id, user?.id],
    queryFn: () => getTeamsChannelMessages(user.id, teamsConfig, 'team_chat'),
    enabled: !!user?.id && !!teamsConfig?.enabled,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const config = await getTeamsSyncConfig('team_chat');
        if (cancelled) return;
        setTeamsConfig(config);
        if (config?.channel_url) setTeamsLink(current => current || config.channel_url);
        if (config?.enabled) setTeamsSyncError('');
      } catch (error) {
        console.warn('[Teams] Team Chat sync unavailable:', error?.message);
        setTeamsSyncError(error?.message || 'Microsoft Teams General Chat could not be loaded.');
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
      const target = teamsConfig || await getTeamsSyncConfig('team_chat');
      if (!target?.enabled) throw new Error('Microsoft Teams Team Chat channel is not configured.');
      const teamsMessage = await sendTeamChannelMessage(user?.id, `<strong>${data.sender_name}</strong>: ${data.message}`, target, 'team_chat');
      if (!teamsMessage?.id) throw new Error('Microsoft Teams did not confirm delivery.');
      const created = await base44.entities.ChatMessage.create({
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
          chat_type: 'team',
          page: 'TeamChat',
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
      toast.error(`Teams delivery failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 });
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
        pinged_user: mentionedUsers[0]?.email || null,
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
      if (String(record?.recipient_email || '').toLowerCase() !== String(user.email).toLowerCase() || record.read || record.page !== 'TeamChat') return;
      await base44.entities.ChatMention.update(record.id, { read: true, read_at: new Date().toISOString() }).catch(() => null);
    };
    base44.entities.ChatMention.filter({ recipient_email: user.email, page: 'TeamChat', read: false }).then(records => Promise.all((records || []).map(markRead))).catch(() => null);
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

  const handleRefresh = async () => {
    if (user?.id && teamsConfig?.enabled) await refetchTeamsHistory();
  };

  const saveTeamsChannel = async () => {
    if (!teamsLink.trim() || !user?.id) return;
    try {
      setTeamsSaving(true);
      const saved = await saveTeamsSyncConfig({ channelUrl: teamsLink.trim(), channelName: 'Pathfinder Team Chat', updatedBy: user?.email || user?.id || '', configKey: 'team_chat' });
      setTeamsConfig(saved);
      setTeamsSyncError('');
      await refetchTeamsHistory();
    } catch (error) {
      setTeamsSyncError(error?.message || 'Unable to connect Team Chat to Microsoft Teams.');
    } finally {
      setTeamsSaving(false);
    }
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
                Team Chat
                <Users className="w-4 h-4 text-slate-500 ml-auto" />
                <span className="text-sm font-normal text-slate-600">
                  {displayedMessages?.length || 0} messages
                </span>
              </CardTitle>
            </div>
          </CardHeader>

          {user?.role === 'admin' && !teamsConfig?.enabled && (
            <div className="border-b bg-blue-50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-blue-800">Connect Team Chat to its own Microsoft Teams channel</div>
              <p className="mt-1 text-xs text-slate-600">Team Chat is separate from Officer General Chat and Supervisor Chat. Paste the dedicated Team Chat channel link once.</p>
              <div className="mt-3 flex gap-2"><input value={teamsLink} onChange={e => setTeamsLink(e.target.value)} placeholder="Paste Team Chat channel link" className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"/><Button type="button" onClick={saveTeamsChannel} disabled={teamsSaving || !teamsLink.trim()}>{teamsSaving ? 'Connecting…' : 'Connect'}</Button></div>
            </div>
          )}
          {teamsConfig?.enabled && (
            <div className="border-b bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">Microsoft Teams live history · Pathfinder Team Chat ↔ dedicated Team Chat channel</div>
          )}
          {!teamsConfig?.enabled && <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">Team Chat does not yet have its own Microsoft Teams channel. No internal Pathfinder-only messages are used here. An admin must connect a dedicated Teams channel before Team Chat can send or receive.</div>}
          {(teamsSyncError || liveTeamsError) && <div className="border-b border-red-300 bg-red-50 px-4 py-3 text-xs font-bold text-red-800">Microsoft Teams sync error: {teamsSyncError || liveTeamsError?.message}</div>}

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
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
                            {isOwnMessage ? `You — ${getSenderName(msg)}` : getSenderName(msg)}
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
                disabled={sendMessageMutation.isPending || !teamsConfig?.enabled}
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending || !teamsConfig?.enabled}
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