import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  MessageSquare, Send, ArrowLeft, Plus, Search, CheckCheck, Check, 
  Shield, Eye
} from "lucide-react";
import { format, parseISO, isToday, isYesterday } from "date-fns";

export default function AdminMessages() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [showReadReceipts, setShowReadReceipts] = useState(false);
  const [selectedMsgForReceipts, setSelectedMsgForReceipts] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: allMessages, refetch } = useQuery({
    queryKey: ['allDirectMessages'],
    queryFn: async () => {
      const messages = await base44.entities.DirectMessage.list('-created_date');
      // Only show messages where current user is sender or recipient
      return messages.filter(msg => 
        msg.sender_email === user?.email || 
        msg.recipients?.includes(user?.email)
      );
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const activeUsers = allUsers?.filter(u => !u.termination_date && u.email !== user?.email).sort((a, b) => 
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
  ) || [];

  // Group messages by conversation partner
  const conversations = React.useMemo(() => {
    if (!allMessages || !user?.email) return [];
    
    const convMap = new Map();
    
    allMessages.forEach(msg => {
      const isSender = msg.sender_email === user.email;
      const otherParty = isSender ? msg.recipients?.[0] : msg.sender_email;
      
      if (!otherParty || (msg.recipients?.length > 1 && !isSender)) return;
      
      if (!convMap.has(otherParty)) {
        convMap.set(otherParty, {
          partner: otherParty,
          messages: [],
          lastMessage: msg,
          unreadCount: 0,
        });
      }
      
      const conv = convMap.get(otherParty);
      conv.messages.push(msg);
      
      if (!isSender && !msg.read_by?.includes(user.email)) {
        conv.unreadCount++;
      }
      
      if (new Date(msg.created_date) > new Date(conv.lastMessage.created_date)) {
        conv.lastMessage = msg;
      }
    });
    
    return Array.from(convMap.values()).sort((a, b) => 
      new Date(b.lastMessage.created_date) - new Date(a.lastMessage.created_date)
    );
  }, [allMessages, user?.email]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ recipient, message }) => {
      return await base44.entities.DirectMessage.create({
        subject: "Direct Message",
        message,
        message_type: "general",
        recipient_type: "individual",
        recipients: [recipient],
        sender_email: user.email,
        sender_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        read_by: [],
        priority: "normal",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDirectMessages'] });
      setNewMessage("");
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (msg) => {
      const currentReadBy = msg.read_by || [];
      if (!currentReadBy.includes(user.email)) {
        await base44.entities.DirectMessage.update(msg.id, {
          read_by: [...currentReadBy, user.email]
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allDirectMessages'] });
    },
  });

  useEffect(() => {
    if (selectedConversation) {
      const conv = conversations.find(c => c.partner === selectedConversation);
      conv?.messages.forEach(msg => {
        if (msg.sender_email !== user?.email && !msg.read_by?.includes(user?.email)) {
          markAsReadMutation.mutate(msg);
        }
      });
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation, conversations]);

  const getPartnerInfo = (email) => {
    const u = allUsers?.find(usr => usr.email === email);
    return {
      name: u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || email : email,
      initials: u ? `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase() : email[0].toUpperCase(),
      isAdmin: u?.role === 'admin',
      rank: u?.rank,
      division: u?.division,
    };
  };

  const formatMessageTime = (dateStr) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    const recipient = selectedConversation || selectedRecipient;
    if (!recipient) return;
    
    sendMessageMutation.mutate({ recipient, message: newMessage.trim() });
    if (showNewChat) {
      setSelectedConversation(selectedRecipient);
      setShowNewChat(false);
      setSelectedRecipient(null);
    }
  };

  const handleStartNewChat = (email) => {
    setSelectedRecipient(email);
    setSelectedConversation(null);
  };

  const currentConversation = selectedConversation ? conversations.find(c => c.partner === selectedConversation) : null;
  const sortedMessages = currentConversation?.messages?.sort((a, b) => 
    new Date(a.created_date) - new Date(b.created_date)
  ) || [];

  const filteredUsers = activeUsers.filter(u => 
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white rounded-xl shadow-xl overflow-hidden mx-4 md:mx-8 my-4">
      {/* Conversations List */}
      <div className={`w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50 ${selectedConversation || showNewChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              <h1 className="text-xl font-bold text-slate-900">Officer Messages</h1>
            </div>
            {totalUnread > 0 && (
              <Badge className="bg-amber-500 text-white">{totalUnread}</Badge>
            )}
          </div>
          <Button 
            onClick={() => { setShowNewChat(true); setSelectedConversation(null); }}
            className="w-full bg-amber-500 hover:bg-amber-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Message
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No conversations yet</p>
              <p className="text-sm">Start messaging officers!</p>
            </div>
          ) : (
            conversations.map(conv => {
              const partner = getPartnerInfo(conv.partner);
              const isSelected = selectedConversation === conv.partner;
              const lastMsgPreview = conv.lastMessage.sender_email === user?.email 
                ? `You: ${conv.lastMessage.message}` 
                : conv.lastMessage.message;
              
              return (
                <div
                  key={conv.partner}
                  onClick={() => { setSelectedConversation(conv.partner); setShowNewChat(false); }}
                  className={`p-4 cursor-pointer border-b border-slate-100 transition-colors ${
                    isSelected ? 'bg-amber-50' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 bg-gradient-to-br from-amber-400 to-orange-500">
                      <AvatarFallback className="text-white font-semibold">
                        {partner.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold truncate ${conv.unreadCount > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                          {partner.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatMessageTime(conv.lastMessage.created_date)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                          {lastMsgPreview}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-amber-500 text-white text-xs ml-2">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${!selectedConversation && !showNewChat ? 'hidden md:flex' : 'flex'}`}>
        {showNewChat ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setShowNewChat(false)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-900">New Message</h2>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search officers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            
            {selectedRecipient ? (
              <>
                <div className="p-4 bg-amber-50 border-b flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-gradient-to-br from-amber-400 to-orange-500">
                    <AvatarFallback className="text-white">
                      {getPartnerInfo(selectedRecipient).initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="font-medium">{getPartnerInfo(selectedRecipient).name}</span>
                    <p className="text-xs text-slate-500">{getPartnerInfo(selectedRecipient).rank}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRecipient(null)}>×</Button>
                </div>
                <div className="flex-1" />
                <div className="p-4 border-t border-slate-200 bg-white">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 rounded-full bg-slate-100 border-0"
                    />
                    <Button 
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sendMessageMutation.isPending}
                      className="rounded-full bg-amber-500 hover:bg-amber-600 w-10 h-10 p-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <ScrollArea className="flex-1">
                {filteredUsers.map(u => (
                  <div
                    key={u.email}
                    onClick={() => handleStartNewChat(u.email)}
                    className="p-4 cursor-pointer hover:bg-slate-50 border-b border-slate-100 flex items-center gap-3"
                  >
                    <Avatar className="h-10 w-10 bg-gradient-to-br from-amber-400 to-orange-500">
                      <AvatarFallback className="text-white">
                        {`${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{u.first_name} {u.last_name}</p>
                      <p className="text-sm text-slate-500">{u.rank || 'Officer'} • {u.division || 'No Division'}</p>
                    </div>
                    {u.role === 'admin' && <Badge className="bg-amber-100 text-amber-800 text-xs">Admin</Badge>}
                  </div>
                ))}
              </ScrollArea>
            )}
          </>
        ) : selectedConversation ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSelectedConversation(null)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <Avatar className="h-10 w-10 bg-gradient-to-br from-amber-400 to-orange-500">
                <AvatarFallback className="text-white">
                  {getPartnerInfo(selectedConversation).initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-900">{getPartnerInfo(selectedConversation).name}</h2>
                <p className="text-xs text-slate-500">
                  {getPartnerInfo(selectedConversation).rank} • {getPartnerInfo(selectedConversation).division}
                </p>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4 bg-slate-50">
              <div className="space-y-3">
                {sortedMessages.map((msg, idx) => {
                  const isMine = msg.sender_email === user?.email;
                  const isRead = msg.read_by?.includes(selectedConversation);
                  const showDate = idx === 0 || 
                    format(parseISO(sortedMessages[idx - 1].created_date), 'yyyy-MM-dd') !== 
                    format(parseISO(msg.created_date), 'yyyy-MM-dd');
                  
                  return (
                    <React.Fragment key={msg.id}>
                      {showDate && (
                        <div className="text-center my-4">
                          <span className="text-xs text-slate-400 bg-white px-3 py-1 rounded-full">
                            {isToday(parseISO(msg.created_date)) ? 'Today' : 
                             isYesterday(parseISO(msg.created_date)) ? 'Yesterday' :
                             format(parseISO(msg.created_date), 'MMMM d, yyyy')}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%]`}>
                          <div 
                            className={`px-4 py-2 rounded-2xl cursor-pointer ${
                              isMine 
                                ? 'bg-amber-500 text-white rounded-br-md' 
                                : 'bg-white text-slate-900 rounded-bl-md shadow-sm'
                            }`}
                            onClick={() => { if (isMine) { setSelectedMsgForReceipts(msg); setShowReadReceipts(true); }}}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          </div>
                          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-xs text-slate-400">
                              {format(parseISO(msg.created_date), 'h:mm a')}
                            </span>
                            {isMine && (
                              isRead ? (
                                <CheckCheck className="w-3 h-3 text-amber-500" />
                              ) : (
                                <Check className="w-3 h-3 text-slate-400" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t border-slate-200 bg-white">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 rounded-full bg-slate-100 border-0"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="rounded-full bg-amber-500 hover:bg-amber-600 w-10 h-10 p-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-amber-300" />
              <h3 className="text-xl font-semibold text-slate-700">Officer Communications</h3>
              <p className="text-slate-500">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Read Receipts Dialog */}
      <Dialog open={showReadReceipts} onOpenChange={setShowReadReceipts}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-600" />
              Read Receipt
            </DialogTitle>
          </DialogHeader>
          {selectedMsgForReceipts && (
            <div className="py-4">
              <div className="space-y-2">
                {selectedMsgForReceipts.recipients?.map(email => {
                  const hasRead = selectedMsgForReceipts.read_by?.includes(email);
                  const partner = getPartnerInfo(email);
                  return (
                    <div key={email} className={`p-3 rounded-lg flex items-center justify-between ${hasRead ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                      <span className="text-sm font-medium">{partner.name}</span>
                      {hasRead ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCheck className="w-4 h-4" />
                          <span className="text-xs">Read</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-400">
                          <Check className="w-4 h-4" />
                          <span className="text-xs">Delivered</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}