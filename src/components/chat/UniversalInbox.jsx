import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Plus, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamsDirectChatMessages, listTeamsDirectChats, sendTeamsDirectMessage } from '@/lib/teamsGraph';

const nameOf = user => [user?.rank, user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email || 'User';

const messageBody = message => {
  const body = String(message?.message || '').trim();
  const sender = String(message?.sender_name || '').trim();
  if (!sender || !body) return body;
  const escaped = sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.replace(new RegExp(`^${escaped}\\s*:\\s*`, 'i'), '').trim();
};

export default function UniversalInbox({ currentUser, users = [] }) {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [newThread, setNewThread] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [microsoftMe, setMicrosoftMe] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  const messagesEndRef = useRef(null);

  const activeUsers = useMemo(() => users.filter(user => !user.termination_date && user.id !== currentUser.id && user.email !== currentUser.email), [users, currentUser.id, currentUser.email]);
  const selected = chats.find(chat => chat.id === selectedChatId) || null;
  const seenStorageKey = `pathfinder-teams-chat-seen:${String(currentUser?.id || '')}`;

  const readSeenMap = () => {
    try { return JSON.parse(localStorage.getItem(seenStorageKey) || '{}') || {}; } catch { return {}; }
  };

  const writeSeenMap = value => {
    try { localStorage.setItem(seenStorageKey, JSON.stringify(value || {})); } catch {}
  };

  const publishUnreadCount = nextChats => {
    if (!Array.isArray(nextChats)) return;
    const seen = readSeenMap();
    // First Teams Inbox load establishes a baseline instead of labeling the user's
    // entire historical Teams mailbox as unread in Pathfinder.
    if (!Object.keys(seen).length && nextChats.length) {
      const baseline = Object.fromEntries(nextChats.map(chat => [chat.id, chat.lastUpdatedDateTime || chat.createdDateTime || new Date().toISOString()]));
      writeSeenMap(baseline);
      window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OfficerInbox', count: 0, absolute: true } }));
      return;
    }
    const count = nextChats.filter(chat => {
      const changed = new Date(chat.lastUpdatedDateTime || chat.createdDateTime || 0).getTime();
      const lastSeen = new Date(seen[chat.id] || 0).getTime();
      return Number.isFinite(changed) && changed > (Number.isFinite(lastSeen) ? lastSeen : 0);
    }).length;
    window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OfficerInbox', count, absolute: true } }));
  };

  const markChatSeen = chat => {
    if (!chat?.id) return;
    const seen = readSeenMap();
    seen[chat.id] = chat.lastUpdatedDateTime || new Date().toISOString();
    writeSeenMap(seen);
    publishUnreadCount(chats);
  };

  const chatName = chat => {
    if (!chat) return 'Direct Message';
    if (chat.topic) return chat.topic;
    const names = (chat.members || []).map(member => member.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Microsoft Teams Chat';
  };

  const loadChats = async ({ keepSelection = true } = {}) => {
    if (!currentUser?.id) return;
    setLoadingChats(true);
    try {
      const result = await listTeamsDirectChats(currentUser.id, { limit: 25 });
      const nextChats = [...(result?.chats || [])].sort((a, b) => new Date(b.lastUpdatedDateTime || 0) - new Date(a.lastUpdatedDateTime || 0));
      setMicrosoftMe(result?.me || null);
      setChats(nextChats);
      publishUnreadCount(nextChats);
      setSyncError('');
      setSelectedChatId(current => {
        if (keepSelection && current && nextChats.some(chat => chat.id === current)) return current;
        return !isMobile && nextChats[0]?.id ? nextChats[0].id : '';
      });
    } catch (error) {
      setSyncError(error?.message || 'Microsoft Teams conversations could not be loaded.');
    } finally {
      setLoadingChats(false);
    }
  };

  const scrollMessagesToBottom = (behavior = 'auto') => {
    window.requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end', behavior }));
  };

  const loadChatMessages = async (chatId, { showLoading = false } = {}) => {
    if (!chatId || !currentUser?.id) {
      setChatMessages([]);
      return;
    }
    if (showLoading) setLoadingMessages(true);
    try {
      const rows = await getTeamsDirectChatMessages(currentUser.id, chatId, { limit: 100 });
      setChatMessages(rows || []);
      setSyncError('');
      scrollMessagesToBottom();
    } catch (error) {
      setSyncError(error?.message || 'Microsoft Teams message history could not be loaded.');
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = event => setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    let stopped = false;
    const refresh = async () => {
      if (stopped) return;
      await loadChats();
    };
    // Load once on mount. TeamsNotificationMonitor owns subsequent list polling
    // and broadcasts the shared result to this page.
    refresh();
    return () => { stopped = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    const onDirectChats = event => {
      const nextChats = Array.isArray(event.detail?.chats) ? event.detail.chats : [];
      if (!nextChats.length) return;
      setMicrosoftMe(event.detail?.me || null);
      setChats([...nextChats].sort((a, b) => new Date(b.lastUpdatedDateTime || 0) - new Date(a.lastUpdatedDateTime || 0)));
      publishUnreadCount(nextChats);
    };
    window.addEventListener('bps:teams-direct-chats-data', onDirectChats);
    return () => window.removeEventListener('bps:teams-direct-chats-data', onDirectChats);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!selectedChatId) {
      setChatMessages([]);
      return undefined;
    }
    let stopped = false;
    const refreshMessages = async (showLoading = false) => {
      if (!stopped) await loadChatMessages(selectedChatId, { showLoading });
    };
    refreshMessages(true);
    const interval = window.setInterval(() => refreshMessages(false), 30000);
    const onFocus = () => refreshMessages();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [selectedChatId, currentUser?.id]);

  const isChatUnread = chat => {
    const seen = readSeenMap();
    const changed = new Date(chat?.lastUpdatedDateTime || chat?.createdDateTime || 0).getTime();
    const lastSeen = new Date(seen[chat?.id] || 0).getTime();
    return Number.isFinite(changed) && changed > (Number.isFinite(lastSeen) ? lastSeen : 0);
  };

  const visibleChats = chats.filter(chat => chatName(chat).toLowerCase().includes(search.toLowerCase()));

  const send = async () => {
    const body = text.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      const result = await sendTeamsDirectMessage(currentUser.id, {
        participantIds: selected.participantIds || [currentUser.id, ...(selected.members || []).map(member => member.pathfinderId)],
        participantDirectory: users,
        text: body,
        existingChatId: selected.id,
      });
      if (!result?.messageId) throw new Error('Microsoft Teams did not confirm message delivery.');
      const optimistic = {
        id: result.messageId,
        teams_message_id: result.messageId,
        teams_chat_id: selected.id,
        sender_microsoft_id: microsoftMe?.id || '',
        sender_name: microsoftMe?.displayName || nameOf(currentUser),
        message: body,
        created_date: new Date().toISOString(),
      };
      setChatMessages(current => [...current.filter(item => item.id !== optimistic.id), optimistic]);
      scrollMessagesToBottom('smooth');
      const seen = readSeenMap();
      seen[selected.id] = optimistic.created_date;
      writeSeenMap(seen);
      window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OfficerInbox', count: 0, absolute: true } }));
      setText('');
      window.setTimeout(() => loadChatMessages(selected.id), 700);
      window.setTimeout(() => loadChats(), 1200);
    } catch (error) {
      setSyncError(error?.message || 'Microsoft Teams message could not be sent.');
      toast.error(`Teams direct message failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 });
    } finally {
      setSending(false);
    }
  };

  const createThread = async () => {
    if (!selectedPeople.length || sending) return;
    setSending(true);
    try {
      const result = await sendTeamsDirectMessage(currentUser.id, {
        participantIds: [currentUser.id, ...selectedPeople],
        participantDirectory: users,
        text: 'Conversation started from Pathfinder.',
      });
      if (!result?.chatId) throw new Error('Microsoft Teams did not create the conversation.');
      setNewThread(false);
      setSelectedPeople([]);
      await loadChats({ keepSelection: false });
      setSelectedChatId(result.chatId);
    } catch (error) {
      setSyncError(error?.message || 'Microsoft Teams conversation could not be created.');
      toast.error(`Teams conversation failed: ${error?.message || 'Unknown Microsoft error'}`, { duration: 12000 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden border border-slate-700 bg-slate-950 text-white shadow-2xl md:rounded-xl">
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} w-full flex-col border-r border-slate-700 lg:w-[340px]`}>
        <div className="shrink-0 border-b border-slate-700 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div><h1 className="text-xl font-black">Teams Messages</h1><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Microsoft Teams only</p></div>
            <button onClick={() => setNewThread(true)} className="rounded-full bg-blue-600 p-2 hover:bg-blue-500"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Teams conversations" className="w-full bg-transparent text-sm outline-none" /></div>
        </div>
        {syncError && <div className="border-b border-red-800 bg-red-950/50 p-3 text-xs font-bold text-red-200">Microsoft Teams sync error: {syncError}</div>}
        <div className="flex-1 overflow-y-auto">
          {loadingChats && <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading Teams conversations…</div>}
          {!loadingChats && visibleChats.map(chat => {
            const unread = isChatUnread(chat);
            return <button key={chat.id} onClick={() => { setSelectedChatId(chat.id); markChatSeen(chat); }} className={`flex w-full min-w-0 items-center gap-3 border-b border-slate-800 p-3 sm:p-4 text-left hover:bg-slate-800 ${selectedChatId === chat.id ? 'bg-slate-800' : ''}`}>
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-blue-600/30"><MessageCircle className="h-5 w-5 text-blue-300" />{unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-red-500" />}</div>
              <div className="min-w-0 flex-1"><div className={`truncate text-sm ${unread ? 'font-black text-white' : 'font-bold text-slate-300'}`}>{chatName(chat)}</div><div className="truncate text-xs text-slate-500">{chat.chatType === 'group' ? 'Teams group chat' : 'Teams direct message'}</div></div>
              {unread && <span className="rounded-full bg-red-500 px-2 py-1 text-[9px] font-black text-white">NEW</span>}
            </button>;
          })}
          {!loadingChats && !visibleChats.length && <div className="p-8 text-center text-sm text-slate-500">No Microsoft Teams conversations were returned for this account.</div>}
        </div>
      </aside>

      <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
        {selected ? <>
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-700 p-3 sm:p-4"><button onClick={() => setSelectedChatId('')} className="lg:hidden"><X className="h-5 w-5" /></button><Users className="h-5 w-5 text-blue-300" /><div className="min-w-0 flex-1"><div className="truncate font-black">{chatName(selected)}</div><div className="text-xs text-slate-400">Live Microsoft Teams conversation</div></div></header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
            {loadingMessages && <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading Teams history…</div>}
            {!loadingMessages && chatMessages.map(message => {
              const mine = String(message.sender_microsoft_id || '') === String(microsoftMe?.id || '');
              return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className="max-w-[78%]"><div className={`mb-1 px-2 text-[10px] text-slate-500 ${mine ? 'text-right' : ''}`}>{mine ? 'You' : message.sender_name}</div><div className={`break-words rounded-2xl px-4 py-2 text-sm ${mine ? 'rounded-br-sm bg-blue-600' : 'rounded-bl-sm bg-slate-800'}`}>{messageBody(message)}</div><div className={`mt-1 px-2 text-[9px] text-slate-600 ${mine ? 'text-right' : ''}`}>{message.created_date ? new Date(message.created_date).toLocaleString() : ''}</div></div></div>;
            })}
            {!loadingMessages && !chatMessages.length && <div className="py-12 text-center text-sm text-slate-500">No messages were returned from this Teams conversation.</div>}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
          <div className="flex shrink-0 gap-2 border-t border-slate-700 p-2.5 sm:p-4"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message in Microsoft Teams" className="min-w-0 flex-1 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm outline-none focus:border-blue-400" /><button onClick={send} disabled={!text.trim() || sending} className="rounded-full bg-blue-600 p-3 disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
        </> : <div className="m-auto text-center text-slate-500"><MessageCircle className="mx-auto mb-3 h-12 w-12" /><p>Select a Microsoft Teams conversation</p></div>}
      </section>

      {newThread && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-black">New Teams Message</h2><button onClick={() => setNewThread(false)}><X className="h-5 w-5" /></button></div><p className="mt-1 text-xs text-slate-400">Choose Pathfinder users who have connected their Black Point Microsoft account.</p><div className="mt-4 max-h-80 space-y-1 overflow-y-auto">{activeUsers.map(user => <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-slate-800"><input type="checkbox" checked={selectedPeople.includes(user.id)} onChange={() => setSelectedPeople(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id])} /><span className="text-sm font-bold">{nameOf(user)}</span><span className="ml-auto truncate text-xs text-slate-500">{user.email}</span></label>)}</div><button onClick={createThread} disabled={!selectedPeople.length || sending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-black disabled:opacity-40">{sending && <Loader2 className="h-4 w-4 animate-spin" />}Create Teams Conversation</button></div></div>}
    </div>
  );
}
