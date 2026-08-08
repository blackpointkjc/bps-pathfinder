import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Send, Users, UserCheck, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MentionInput from "@/components/chat/MentionInput";

export default function SupervisorChat() {
  const [message, setMessage] = useState("");
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const senderName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user?.email || 'Unknown';

  const { data: messages } = useQuery({
    queryKey: ['supervisorChatMessages'],
    queryFn: () => base44.entities.SupervisorChatMessage.list('-created_date', 100),
    enabled: user?.additional_roles?.includes('supervisor') || user?.role === 'admin',
  });

  useEffect(() => {
    if (!user?.additional_roles?.includes('supervisor') && user?.role !== 'admin') return undefined;
    const unsubscribe = base44.entities.SupervisorChatMessage.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['supervisorChatMessages'] });
    });
    return unsubscribe;
  }, [queryClient, user?.role, JSON.stringify(user?.additional_roles || [])]);

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
      const created = await base44.entities.SupervisorChatMessage.create(data);
      await Promise.all(mentions.map(mention => base44.entities.ChatMention.create({
        message_id: created.id,
        chat_type: 'supervisor',
        page: 'SupervisorChat',
        recipient_email: mention.email,
        recipient_name: mention.label,
        sender_name: data.sender_name,
        message: data.message,
        read: false,
      })));
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisorChatMessages'] });
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
      },
      mentions: mentionedUsers,
    });
  };

  const getUserRecord = (email) => allUsers.find(u => String(u.email).toLowerCase() === String(email || '').toLowerCase());

  const getMessageEmail = (msg) => msg.sender_email || msg.created_by || '';
  const getMessageSenderKey = (msg) => msg.sender_email || msg.sender_name || msg.created_by || msg.id;

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!user?.additional_roles?.includes('supervisor') && user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const reversedMessages = [...(messages || [])].reverse();

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
                  {messages?.length || 0} messages
                </span>
              </div>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-4">
              {reversedMessages?.map((msg, index) => {
                const senderEmail = getMessageEmail(msg);
                const senderKey = getMessageSenderKey(msg);
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
              {!messages?.length && (
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