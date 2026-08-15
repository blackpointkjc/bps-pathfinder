import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { MessageSquare, Send, X, Megaphone, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MentionInput from '@/components/chat/MentionInput';
import { isOperationalOfficer } from '@/lib/directoryUtils';

const roleSet = (user) => new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(r => String(r).toLowerCase()));
const isDispatchUser = (user) => user?.role === 'admin' || user?.role === 'dispatch' || user?.dispatch_role === true || roleSet(user).has('full_access');
const isOperationalRecipient = (user) => {
  const roles = roleSet(user);
  const userType = String(user?.user_type || user?.account_type || user?.portal_type || '').toLowerCase();
  const accountStatus = String(user?.account_status || '').toLowerCase();
  return !roles.has('client') && !roles.has('student') && !roles.has('pending') && !['client', 'student', 'pending'].includes(userType) && accountStatus !== 'pending';
};

export default function MessagingPanel({ currentUser, units = [], isOpen = true, onClose, embedded = false, inboxOnly = false }) {
  const dispatchMode = !inboxOnly && isDispatchUser(currentUser);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(inboxOnly ? '' : dispatchMode ? 'team_chat' : 'dispatch');

  const recipients = useMemo(() => units.filter(unit => (
    !unit.termination_date && unit.id !== currentUser?.id && unit.email !== currentUser?.email && isOperationalRecipient(unit)
  )), [units, currentUser?.id, currentUser?.email]);
  const officers = useMemo(() => recipients.filter(isOperationalOfficer), [recipients]);

  const loadMessages = async () => {
    if (!currentUser?.id) return;
    try {
      const all = await base44.entities.Message.list('-created_date', 300);
      const visible = all.filter(msg => {
        if (dispatchMode) {
          return msg.sender_id === 'dispatch' || msg.recipient_id === 'dispatch' || msg.recipient_id === 'company';
        }
        return msg.sender_id === currentUser.id || msg.recipient_id === currentUser.id || msg.recipient_id === 'company';
      });
      const ordered = visible.reverse();
      setMessages(ordered);
      if (inboxOnly || dispatchMode) {
        const incomingRecipient = inboxOnly ? currentUser.id : 'dispatch';
        const unreadIncoming = ordered.filter(msg => msg.recipient_id === incomingRecipient && !msg.read);
        if (unreadIncoming.length) {
          await Promise.all(unreadIncoming.map(msg => base44.entities.Message.update(msg.id, { read: true }).catch(() => null)));
          window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
        }
      }
    } catch (error) {
      console.error('Error loading dispatch messages:', error);
    }
  };

  useEffect(() => {
    if (!isOpen || !currentUser?.id) return undefined;
    loadMessages();
    const unsubscribe = base44.entities.Message.subscribe(() => loadMessages());
    return unsubscribe;
  }, [isOpen, currentUser?.id, dispatchMode, inboxOnly]);

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text) return;
    try {
      const recipient = inboxOnly ? selectedRecipient : dispatchMode ? selectedRecipient : 'dispatch';
      if (!recipient) return;
      const unit = recipients.find(u => u.id === recipient);
      const personalName = [currentUser.rank, currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.full_name || currentUser.email || 'Black Point User';
      const senderName = dispatchMode ? `Dispatch — ${personalName}` : personalName;

      if (dispatchMode && ['team_chat', 'supervisor_chat', 'company'].includes(recipient)) {
        const chatPayload = { message: text, sender_name: senderName };
        const sends = [];
        if (recipient === 'team_chat' || recipient === 'company') {
          sends.push(base44.entities.ChatMessage.create(chatPayload).then(record => ({ record, page: 'TeamChat', chatType: 'team' })));
        }
        if (recipient === 'supervisor_chat' || recipient === 'company') {
          sends.push(base44.entities.SupervisorChatMessage.create(chatPayload).then(record => ({ record, page: 'SupervisorChat', chatType: 'supervisor' })));
        }
        const createdChats = await Promise.all(sends);
        const mentionChat = createdChats.find(item => item.page === (recipient === 'supervisor_chat' ? 'SupervisorChat' : 'TeamChat')) || createdChats[0];
        if (mentionChat) {
          await Promise.all(mentionedUsers.map(mention => base44.entities.ChatMention.create({
            message_id: mentionChat.record.id,
            chat_type: mentionChat.chatType,
            page: mentionChat.page,
            recipient_email: mention.email,
            recipient_name: mention.label,
            sender_name: senderName,
            message: text,
            read: false,
          })));
        }
      } else {
        await base44.entities.Message.create({
          sender_id: dispatchMode ? 'dispatch' : currentUser.id,
          sender_name: senderName,
          recipient_id: recipient,
          recipient_name: recipient === 'dispatch' ? 'Dispatch' : `${unit?.rank || 'Officer'} ${unit?.last_name || unit?.unit_number || ''}`.trim(),
          message: text,
          read: false,
          message_type: 'dispatch_message'
        });
      }
      setNewMessage('');
      setMentionedUsers([]);
      await loadMessages();
    } catch (error) {
      console.error('Error sending dispatch message:', error);
      toast.error('Failed to send message');
    }
  };

  const content = (
    <div className={`flex h-full flex-col bg-slate-900 ${embedded ? 'rounded-xl border border-slate-700 overflow-hidden' : ''}`}>
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            {inboxOnly ? 'My Inbox' : dispatchMode ? 'Dispatch Messaging' : 'Messages with Dispatch'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">{inboxOnly ? 'Private direct messages between Black Point users' : 'Two-way operational messaging and company broadcasts'}</p>
        </div>
        {!embedded && onClose && <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>}
      </div>

      <ScrollArea className="flex-1 bg-slate-950 p-4">
        <div className="space-y-3">
          {messages.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No dispatch messages yet.</div>}
          {messages.map(msg => {
            const mine = dispatchMode ? msg.sender_id === 'dispatch' : msg.sender_id === currentUser.id;
            const broadcast = msg.recipient_id === 'company';
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] ${mine ? 'text-right' : 'text-left'}`}>
                  <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-slate-400">
                    {broadcast ? <Megaphone className="h-3 w-3 text-amber-400" /> : <Radio className="h-3 w-3 text-blue-400" />}
                    <span>{msg.sender_name || 'Dispatch'}</span>
                    {broadcast && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[9px] text-amber-300">COMPANY WIDE</span>}
                  </div>
                  <div className={`rounded-xl border px-4 py-2 text-left text-sm ${mine ? 'border-blue-500/50 bg-blue-700 text-white' : broadcast ? 'border-amber-600/50 bg-amber-950/50 text-amber-100' : 'border-slate-700 bg-slate-800 text-slate-100'}`}>
                    {msg.message}
                  </div>
                  <div className="mt-1 px-1 text-[10px] text-slate-500">
                    {new Date(msg.created_date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-slate-700 bg-slate-900 p-4">
        {(dispatchMode || inboxOnly) && (
          <select value={selectedRecipient} onChange={e => setSelectedRecipient(e.target.value)} className="mb-2 h-10 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-white">
            {inboxOnly ? (
              <>
                <option value="">Select a person...</option>
                {recipients.map(unit => <option key={unit.id} value={unit.id}>{`${unit.rank || ''} ${unit.first_name || ''} ${unit.last_name || unit.full_name || unit.email || ''}`.trim()}</option>)}
              </>
            ) : (
              <>
                <option value="team_chat">Team Chat — All Personnel</option>
                <option value="supervisor_chat">Supervisor Chat — Supervisors Only</option>
                <option value="company">Company Wide — Team + Supervisor Chats</option>
                {officers.map(unit => <option key={unit.id} value={unit.id}>{`Direct — ${unit.rank || 'Officer'} ${unit.last_name || unit.full_name || unit.unit_number || ''}`.trim()}</option>)}
              </>
            )}
          </select>
        )}
        <div className="flex gap-2">
          {dispatchMode && ['team_chat', 'supervisor_chat', 'company'].includes(selectedRecipient) ? (
            <MentionInput
              value={newMessage}
              onChange={setNewMessage}
              users={(units || []).filter(person => {
                if (selectedRecipient !== 'supervisor_chat') return true;
                const roles = (person?.additional_roles || []).map(role => String(role).toLowerCase());
                return person?.role === 'admin' || roles.includes('supervisor');
              })}
              currentEmail={currentUser?.email}
              onMentionsChange={setMentionedUsers}
              placeholder="Dispatch message — type @ to mention..."
              className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-500"
            />
          ) : (
            <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={inboxOnly ? 'Write a private message...' : dispatchMode ? 'Direct dispatch message...' : 'Reply to dispatch...'} className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-500" />
          )}
          <Button onClick={sendMessage} disabled={!newMessage.trim() || (inboxOnly && !selectedRecipient)} className="bg-blue-700 hover:bg-blue-600"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0, x: 320 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 320 }} className="fixed inset-y-0 right-0 z-[9999] w-full max-w-md border-l border-slate-700">{content}</motion.div>}</AnimatePresence>;
}