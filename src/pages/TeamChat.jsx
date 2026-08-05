import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Users, Phone } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TeamChat() {
  const [message, setMessage] = useState("");
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
    queryKey: ['chatMessages'],
    queryFn: () => base44.entities.ChatMessage.list('-created_date', 100),
    refetchInterval: 3000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['chatDirectory'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getChatDirectory', {});
      return result?.users || [];
    },
    initialData: [],
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatMessage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
      setMessage("");
    },
  });

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    sendMessageMutation.mutate({
      message: message.trim(),
      sender_name: senderName,
      sender_email: user?.email || '',
      sender_photo_url: user?.profile_photo_url || '',
      pinged_user: null,
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const reversedMessages = [...(messages || [])].reverse();

  const handleRefresh = async () => {
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

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-4">
              {reversedMessages?.map((msg, index) => {
                const senderEmail = getMessageEmail(msg);
                const senderKey = getMessageSenderKey(msg);
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
              <Input
                placeholder="Type your message... (emojis supported 😊)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1"
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