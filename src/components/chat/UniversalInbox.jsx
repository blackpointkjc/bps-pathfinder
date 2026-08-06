import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Search, Send, Trash2, Users, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const nameOf = user => [user?.rank, user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email || 'User';
const lower = value => String(value || '').toLowerCase();

export default function UniversalInbox({ currentUser, users = [] }) {
  const [messages, setMessages] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [newThread, setNewThread] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [hiddenPreferences, setHiddenPreferences] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);

  const userMap = useMemo(() => new Map(users.map(user => [String(user.id), user])), [users]);
  const activeUsers = useMemo(() => users.filter(user => !user.termination_date && user.id !== currentUser.id && user.email !== currentUser.email), [users, currentUser.id, currentUser.email]);

  const threadKeyFor = message => {
    if (message.thread_id) return message.thread_id;
    const partner = message.sender_id === currentUser.id ? message.recipient_id : message.sender_id;
    return `direct:${partner}`;
  };

  const load = async () => {
    const [records, preferences] = await Promise.all([
      base44.entities.Message.list('-created_date', 500),
      base44.entities.InboxThreadPreference.filter({ user_email: currentUser.email, hidden: true }, '-created_date', 200).catch(() => []),
    ]);
    setMessages(records || []);
    setHiddenPreferences(preferences || []);
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = event => setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Message.subscribe(async event => {
      if (event?.type === 'create') {
        const key = threadKeyFor(event.data);
        const hidden = hiddenPreferences.find(item => item.thread_key === key);
        if (hidden) await base44.entities.InboxThreadPreference.delete(hidden.id).catch(() => null);
      }
      load();
    });
    return unsubscribe;
  }, [currentUser.id, currentUser.email, hiddenPreferences.map(item => item.id).join(',')]);

  const threads = useMemo(() => {
    const map = new Map();
    const seenDeliveries = new Set();
    [...messages].reverse().forEach(message => {
      const deliveryKey = message.client_message_id || message.id;
      if (seenDeliveries.has(deliveryKey) && message.sender_id === currentUser.id) return;
      seenDeliveries.add(deliveryKey);
      const participants = message.participant_ids?.length
        ? message.participant_ids
        : [...new Set([message.sender_id, message.recipient_id].filter(Boolean))];
      const otherIds = participants.filter(id => id !== currentUser.id);
      const fallbackPartner = message.sender_id === currentUser.id ? message.recipient_id : message.sender_id;
      const key = message.thread_id || `direct:${fallbackPartner}`;
      if (!map.has(key)) map.set(key, { key, participants, messages: [], unread: 0, last: message });
      const thread = map.get(key);
      thread.messages.push(message);
      thread.last = message;
      if (message.recipient_id === currentUser.id && !message.read) thread.unread += 1;
      if (!thread.participants.length) thread.participants = [currentUser.id, ...otherIds];
    });
    return [...map.values()].sort((a, b) => new Date(b.last.created_date || 0) - new Date(a.last.created_date || 0));
  }, [messages, currentUser.id]);

  useEffect(() => {
    // Keep the complete list visible on phones. On desktop, never auto-select
    // a thread the user removed from their Inbox.
    if (!isMobile && !selectedKey && threads.length) {
      const hidden = new Set(hiddenPreferences.map(item => item.thread_key));
      const firstVisible = threads.find(thread => !hidden.has(thread.key));
      if (firstVisible) setSelectedKey(firstVisible.key);
    }
  }, [threads, selectedKey, isMobile, hiddenPreferences]);

  const selected = threads.find(thread => thread.key === selectedKey);
  useEffect(() => {
    if (!selected) return;
    const unread = selected.messages.filter(message => message.recipient_id === currentUser.id && !message.read);
    if (unread.length) Promise.all(unread.map(message => base44.entities.Message.update(message.id, { read: true }).catch(() => null)));
  }, [selectedKey, selected?.messages.length, currentUser.id]);

  const threadNames = thread => {
    const ids = (thread.participants || []).filter(id => id !== currentUser.id);
    const names = ids.map(id => id === 'dispatch' ? 'Dispatch' : nameOf(userMap.get(String(id)))).filter(Boolean);
    return names.length ? names.join(', ') : 'Direct Message';
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !selected) return;
    const participantIds = [...new Set(selected.participants || [])];
    const recipients = participantIds.filter(id => id !== currentUser.id);
    const messageId = crypto.randomUUID();
    const senderName = nameOf(currentUser);
    await Promise.all(recipients.map(recipientId => base44.entities.Message.create({
      sender_id: currentUser.id,
      sender_name: senderName,
      recipient_id: recipientId,
      recipient_name: recipientId === 'dispatch' ? 'Dispatch' : nameOf(userMap.get(String(recipientId))),
      message: body,
      read: false,
      message_type: 'dispatch_message',
      thread_id: selected.key.startsWith('direct:') ? selected.key : selected.key,
      client_message_id: messageId,
      participant_ids: participantIds,
      participant_names: participantIds.map(id => id === 'dispatch' ? 'Dispatch' : nameOf(userMap.get(String(id)))),
    })));
    setText('');
    await load();
  };

  const createThread = async () => {
    if (!selectedPeople.length) return;
    const participants = [currentUser.id, ...selectedPeople];
    const key = `thread:${crypto.randomUUID()}`;
    setNewThread(false);
    setSelectedPeople([]);
    setMessages(current => [{
      id: `draft:${key}`, thread_id: key, participant_ids: participants, sender_id: currentUser.id,
      recipient_id: selectedPeople[0], sender_name: nameOf(currentUser), message: '', created_date: new Date().toISOString(), read: true, draft: true,
    }, ...current]);
    setSelectedKey(key);
  };

  const removeThread = async thread => {
    const existing = hiddenPreferences.find(item => item.thread_key === thread.key);
    setSelectedKey(null);
    if (existing) return;

    const optimistic = {
      id: `pending:${thread.key}`,
      user_email: currentUser.email,
      thread_key: thread.key,
      hidden: true,
    };
    setHiddenPreferences(current => [...current, optimistic]);
    try {
      const created = await base44.entities.InboxThreadPreference.create({
        user_email: currentUser.email,
        thread_key: thread.key,
        hidden: true,
      });
      setHiddenPreferences(current => current.map(item => item.id === optimistic.id ? created : item));
    } catch (error) {
      console.error('[Inbox] Unable to persist removed thread:', error?.message);
    }
  };

  const hiddenKeys = new Set(hiddenPreferences.map(item => item.thread_key));
  const visibleThreads = threads.filter(thread => !hiddenKeys.has(thread.key) && threadNames(thread).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden border border-slate-700 bg-slate-950 text-white shadow-2xl md:rounded-xl">
      <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-700 md:w-[340px]`}>
        <div className="shrink-0 border-b border-slate-700 p-3 sm:p-4">
          <div className="flex items-center justify-between"><h1 className="text-xl font-black">Messages</h1><button onClick={() => setNewThread(true)} className="rounded-full bg-blue-600 p-2 hover:bg-blue-500"><Plus className="h-4 w-4" /></button></div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations" className="w-full bg-transparent text-sm outline-none" /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleThreads.map(thread => <button key={thread.key} onClick={() => setSelectedKey(thread.key)} className={`flex w-full min-w-0 items-center gap-3 border-b border-slate-800 p-3 sm:p-4 text-left hover:bg-slate-800 ${selectedKey === thread.key ? 'bg-slate-800' : ''}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600/30"><MessageCircle className="h-5 w-5 text-blue-300" /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{threadNames(thread)}</div><div className="truncate text-xs text-slate-400">{thread.last.message || 'New conversation'}</div></div>
            {!!thread.unread && <span className="rounded-full bg-blue-500 px-2 py-1 text-[10px] font-black">{thread.unread}</span>}
          </button>)}
          {!visibleThreads.length && <div className="p-8 text-center text-sm text-slate-500">No conversations yet.</div>}
        </div>
      </aside>

      <section className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {selected ? <>
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-700 p-3 sm:p-4"><button onClick={() => setSelectedKey(null)} className="md:hidden"><X className="h-5 w-5" /></button><Users className="h-5 w-5 text-blue-300" /><div className="min-w-0 flex-1"><div className="truncate font-black">{threadNames(selected)}</div><div className="text-xs text-slate-400">{Math.max(1, selected.participants.length - 1)} participant{selected.participants.length - 1 === 1 ? '' : 's'}</div></div><button onClick={() => removeThread(selected)} title="Remove conversation from my Inbox" className="rounded-full p-2 text-slate-400 hover:bg-red-950 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
            {selected.messages.filter(message => !message.draft && message.message).map(message => {
              const mine = message.sender_id === currentUser.id;
              return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%]`}><div className="mb-1 px-2 text-[10px] text-slate-500">{message.sender_name}</div><div className={`break-words rounded-2xl px-4 py-2 text-sm ${mine ? 'rounded-br-sm bg-blue-600' : 'rounded-bl-sm bg-slate-800'}`}>{message.message}</div></div></div>;
            })}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-slate-700 p-2.5 sm:p-4"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} placeholder="iMessage" className="min-w-0 flex-1 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm outline-none focus:border-blue-400" /><button onClick={send} disabled={!text.trim()} className="rounded-full bg-blue-600 p-3 disabled:opacity-40"><Send className="h-4 w-4" /></button></div>
        </> : <div className="m-auto text-center text-slate-500"><MessageCircle className="mx-auto mb-3 h-12 w-12" /><p>Select a conversation</p></div>}
      </section>

      {newThread && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-black">New Message</h2><button onClick={() => setNewThread(false)}><X className="h-5 w-5" /></button></div><p className="mt-1 text-xs text-slate-400">Select one or more people for this thread.</p><div className="mt-4 max-h-80 space-y-1 overflow-y-auto">{activeUsers.map(user => <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-slate-800"><input type="checkbox" checked={selectedPeople.includes(user.id)} onChange={() => setSelectedPeople(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id])} /><span className="text-sm font-bold">{nameOf(user)}</span><span className="ml-auto truncate text-xs text-slate-500">{user.email}</span></label>)}</div><button onClick={createThread} disabled={!selectedPeople.length} className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-black disabled:opacity-40">Create Conversation</button></div></div>}
    </div>
  );
}
