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
import { getTeamsSyncConfig, sendTeamChannelMessage, syncTeamsChannelToPathfinder } from "@/lib/teamsGraph";
import { toast } from 'sonner';

export default function TeamChat() {
  const [message, setMessage] = useState("");
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();
  const [teamsConfig, setTeamsConfig] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const senderName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user?.email || 'Unknown';

  const { data: messages } = useQuery({
    queryKey: ['chatMessages'],
    queryFn: () => base44.entities.ChatMessage.list('-created_date', 100),
  });

  useEffect(() => {
    const unsubscribe = base44.entities.ChatMessage.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const sync = async () => {
      try {
        const config = await getTeamsSyncConfig('officer_chat');
        if (cancelled) return;
        setTeamsConfig(config);
        if (config?.enabled) {
          const result = await syncTeamsChannelToPathfinder(user.id, config);
          if (result?.imported) queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
        }
      } catch (error) {
        console.warn('[Teams] Team Chat sync unavailable:', error?.message);
      }
    };
    sync();
    const interval = window.setInterval(sync, 20000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [user?.id, queryClient]);

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
      const created = await base44.entities.ChatMessage.create({ ...data, message_source: 'pathfinder' });
      try {
        const target = teamsConfig || await getTeamsSyncConfig('officer_chat');
        if (target?.enabled) {
          const teamsMessage = await sendTeamChannelMessage(user?.id, `<strong>${data.sender_name}</strong>: ${data.message}`, target, 'officer_chat');
          if (teamsMessage?.id) {
            await base44.entities.ChatMessage.update(created.id, {
              teams_message_id: teamsMessage.id,
              teams_team_id: target.team_id,
              teams_channel_id: target.channel_id,
              teams_synced_at: new Date().toISOString(),
            }).catch(() => null);
          }
        }
      } catch (error) {
        console.warn('[Teams] Unable to mirror Pathfinder message:', error?.message);
        toast.error(`Teams delivery failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 });
      }
      await Promise.all(mentions.map(mention => base44.entities.ChatMention.create({
        message_id: created.id,
        chat_type: 'team',
        page: 'TeamChat',
        recipient_email: mention.email,
        recipient_name: mention.label,
        sender_name: data.sender_name,
        message: data.message,
        read: false,
      })));
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
      setMessage("");
      setMentionedUsers([]);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const reversedMessages = [...(messages || [])].reverse();

  const handleRefresh = async () => {
    if (user?.id && teamsConfig?.enabled) await syncTeamsChannelToPathfinder(user.id, teamsConfig).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
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
                  {messages?.length || 0} messages
                </span>
              </CardTitle>
            </div>
          </CardHeader>

          {teamsConfig?.enabled && (
            <div className="border-b bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">Microsoft Teams sync active · Pathfinder Team Chat ↔ General Chat</div>
          )}

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-4">
              {reversedMessages?.map((msg) => {
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
              {!messages?.length && (
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