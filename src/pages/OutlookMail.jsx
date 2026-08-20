import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
  deleteOutlookMessage,
  disconnectOutlook,
  forwardOutlookMail,
  getOutlookAttachments,
  getOutlookConnectionStatus,
  getOutlookMessage,
  listOutlookFolders,
  listOutlookMessages,
  replyOutlookMail,
  sendOutlookMail,
  setOutlookMessageRead,
  stripHtml,
} from '@/lib/outlookGraph';
import { toast } from 'sonner';
import {
  Archive, ArrowLeft, Forward, Inbox, Loader2, Mail, MailOpen, Paperclip,
  PenLine, RefreshCw, Reply, Search, Send, Trash2, X,
} from 'lucide-react';

const splitAddresses = value => String(value || '').split(/[;,]/).map(item => item.trim()).filter(Boolean);

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function senderOf(message) {
  return message?.from?.emailAddress?.name || message?.from?.emailAddress?.address || 'Unknown sender';
}

export default function OutlookMail() {
  const { user } = useAuth();
  const [connection, setConnection] = useState(null);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState('inbox');
  const [folderName, setFolderName] = useState('Inbox');
  const [messages, setMessages] = useState([]);
  const [nextLink, setNextLink] = useState(null);
  const [selected, setSelected] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] });
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardComment, setForwardComment] = useState('');

  const loadMailbox = async (targetFolder = folderId, append = false, link = null) => {
    if (!user?.id) return;
    try {
      append ? setLoadingMore(true) : setLoading(true);
      const [status, folderRows, result] = await Promise.all([
        getOutlookConnectionStatus(user.id),
        folders.length ? Promise.resolve(folders) : listOutlookFolders(user.id),
        listOutlookMessages(user.id, targetFolder, link),
      ]);
      setConnection(status);
      if (!folders.length) setFolders(folderRows);
      setMessages(current => append ? [...current, ...(result.messages || [])] : (result.messages || []));
      setNextLink(result.nextLink || null);
    } catch (error) {
      toast.error(error?.message || 'Unable to load Outlook mail.');
      if (error?.code === 'OUTLOOK_CONNECTION_REQUIRED') {
        window.dispatchEvent(new CustomEvent('bps:outlook-connection-changed'));
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadMailbox('inbox');
  }, [user?.id]);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(message => [message.subject, senderOf(message), message.bodyPreview]
      .some(value => String(value || '').toLowerCase().includes(q)));
  }, [messages, search]);

  const chooseFolder = async folder => {
    setFolderId(folder.id);
    setFolderName(folder.displayName || 'Mail');
    setSelected(null);
    setAttachments([]);
    await loadMailbox(folder.id, false, null);
  };

  const openMessage = async message => {
    try {
      const full = await getOutlookMessage(user.id, message.id);
      setSelected(full || message);
      setAttachments([]);
      if (!message.isRead) {
        await setOutlookMessageRead(user.id, message.id, true);
        setMessages(current => current.map(item => item.id === message.id ? { ...item, isRead: true } : item));
      }
      if (message.hasAttachments) {
        const rows = await getOutlookAttachments(user.id, message.id);
        setAttachments(rows);
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to open this email.');
    }
  };

  const sendMessage = async () => {
    const recipients = splitAddresses(compose.to);
    if (!recipients.length) return toast.error('Enter at least one recipient.');
    if (!compose.subject.trim()) return toast.error('Enter a subject.');
    try {
      setSending(true);
      await sendOutlookMail(user.id, {
        to: recipients,
        cc: splitAddresses(compose.cc),
        bcc: splitAddresses(compose.bcc),
        subject: compose.subject.trim(),
        body: compose.body,
        attachments: compose.attachments,
      });
      toast.success('Email sent through Outlook.');
      setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] });
      setComposeOpen(false);
      if (String(folderName).toLowerCase().includes('sent')) loadMailbox(folderId);
    } catch (error) {
      toast.error(error?.message || 'Unable to send email.');
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!selected || !replyText.trim()) return;
    try {
      setReplying(true);
      await replyOutlookMail(user.id, selected.id, replyText.trim());
      setReplyText('');
      toast.success('Reply sent through Outlook.');
    } catch (error) {
      toast.error(error?.message || 'Unable to send reply.');
    } finally {
      setReplying(false);
    }
  };

  const submitForward = async () => {
    const recipients = splitAddresses(forwardTo);
    if (!selected || !recipients.length) return toast.error('Enter a forwarding recipient.');
    try {
      setReplying(true);
      await forwardOutlookMail(user.id, selected.id, recipients, forwardComment.trim());
      setForwardOpen(false);
      setForwardTo('');
      setForwardComment('');
      toast.success('Email forwarded through Outlook.');
    } catch (error) {
      toast.error(error?.message || 'Unable to forward email.');
    } finally {
      setReplying(false);
    }
  };

  const removeMessage = async () => {
    if (!selected) return;
    try {
      await deleteOutlookMessage(user.id, selected.id);
      setMessages(current => current.filter(item => item.id !== selected.id));
      setSelected(null);
      setAttachments([]);
      toast.success('Email moved to Deleted Items.');
    } catch (error) {
      toast.error(error?.message || 'Unable to delete email.');
    }
  };

  const toggleRead = async () => {
    if (!selected) return;
    try {
      const next = !selected.isRead;
      await setOutlookMessageRead(user.id, selected.id, next);
      setSelected(current => ({ ...current, isRead: next }));
      setMessages(current => current.map(item => item.id === selected.id ? { ...item, isRead: next } : item));
    } catch (error) {
      toast.error(error?.message || 'Unable to update email.');
    }
  };

  const disconnect = () => {
    disconnectOutlook(user.id);
    window.dispatchEvent(new CustomEvent('bps:outlook-connection-changed'));
  };

  return (
    <div className="min-h-full bg-[#07101b] text-slate-100">
      <div className="border-b border-[#1f3851] bg-[#091522] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/40 bg-blue-950/40"><Mail className="h-5 w-5 text-blue-300" /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-black">OUTLOOK MAIL</h1>
              <p className="truncate text-xs text-slate-400">{connection?.email || connection?.profile?.displayName || 'Microsoft 365 mailbox'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => loadMailbox(folderId)} className="flex h-10 items-center gap-2 rounded-lg border border-[#2a4662] bg-[#0d1d2d] px-3 text-xs font-bold hover:bg-[#122a42]"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <button type="button" onClick={() => setComposeOpen(true)} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-500"><PenLine className="h-4 w-4" /> New Email</button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-7.5rem)] md:grid-cols-[220px_360px_minmax(0,1fr)]">
        <aside className="border-b border-[#1d344b] bg-[#08131f] p-3 md:border-b-0 md:border-r">
          <button type="button" onClick={() => setComposeOpen(true)} className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-black text-white hover:bg-blue-500"><PenLine className="h-4 w-4" /> COMPOSE</button>
          <div className="space-y-1">
            {folders.map(folder => {
              const active = folder.id === folderId || (folderId === 'inbox' && String(folder.displayName).toLowerCase() === 'inbox');
              return (
                <button key={folder.id} type="button" onClick={() => chooseFolder(folder)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-[#163a5a] text-white' : 'text-slate-300 hover:bg-[#0d2236]'}`}>
                  {String(folder.displayName).toLowerCase().includes('inbox') ? <Inbox className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  <span className="min-w-0 flex-1 truncate">{folder.displayName}</span>
                  {!!folder.unreadItemCount && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">{folder.unreadItemCount}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={disconnect} className="mt-6 w-full rounded-lg border border-red-900/60 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/30">Disconnect Microsoft 365</button>
        </aside>

        <section className={`${selected ? 'hidden md:block' : 'block'} border-b border-[#1d344b] bg-[#0a1623] md:border-b-0 md:border-r`}>
          <div className="border-b border-[#1d344b] p-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#29435d] bg-[#07111d] px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${folderName}`} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
            </label>
          </div>
          <div className="max-h-[calc(100vh-11rem)] overflow-auto">
            {loading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-300" /></div> : filteredMessages.length ? filteredMessages.map(message => (
              <button key={message.id} type="button" onClick={() => openMessage(message)} className={`block w-full border-b border-[#182c40] px-4 py-3 text-left hover:bg-[#102338] ${selected?.id === message.id ? 'bg-[#12304a]' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${message.isRead ? 'bg-transparent' : 'bg-blue-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${message.isRead ? 'font-medium text-slate-300' : 'font-black text-white'}`}>{senderOf(message)}</span><span className="shrink-0 text-[10px] text-slate-500">{formatDate(message.receivedDateTime)}</span></div>
                    <div className={`mt-0.5 truncate text-sm ${message.isRead ? 'text-slate-400' : 'font-bold text-slate-100'}`}>{message.subject || '(No subject)'}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{message.bodyPreview}</div>
                    {message.hasAttachments && <Paperclip className="mt-1 h-3.5 w-3.5 text-slate-500" />}
                  </div>
                </div>
              </button>
            )) : <div className="px-4 py-14 text-center text-sm text-slate-500">No messages found.</div>}
            {nextLink && !search && <div className="p-3"><button type="button" disabled={loadingMore} onClick={() => loadMailbox(folderId, true, nextLink)} className="w-full rounded-lg border border-[#2a4662] py-2 text-xs font-bold hover:bg-[#102338]">{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
          </div>
        </section>

        <section className={`${selected ? 'block' : 'hidden md:flex'} min-w-0 flex-col bg-[#07101b]`}>
          {selected ? (
            <>
              <div className="flex items-center gap-2 border-b border-[#1d344b] px-3 py-2 md:px-5">
                <button type="button" onClick={() => setSelected(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29435d] md:hidden"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" onClick={toggleRead} className="flex h-9 items-center gap-2 rounded-lg border border-[#29435d] px-3 text-xs font-bold hover:bg-[#102338]">{selected.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}{selected.isRead ? 'Unread' : 'Read'}</button>
                <button type="button" onClick={() => setForwardOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-[#29435d] px-3 text-xs font-bold hover:bg-[#102338]"><Forward className="h-4 w-4" /> Forward</button>
                <button type="button" onClick={removeMessage} className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-red-900/60 px-3 text-xs font-bold text-red-300 hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-7">
                <h2 className="text-xl font-black text-white">{selected.subject || '(No subject)'}</h2>
                <div className="mt-4 rounded-xl border border-[#203a52] bg-[#0b1928] p-4">
                  <div className="text-sm font-black text-white">{senderOf(selected)}</div>
                  <div className="mt-1 text-xs text-slate-500">{selected?.from?.emailAddress?.address}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(selected.receivedDateTime || selected.sentDateTime)} ET</div>
                </div>
                {attachments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{attachments.map(file => <span key={file.id || file.name} className="flex items-center gap-1 rounded-lg border border-[#29435d] bg-[#0c1b2a] px-3 py-2 text-xs text-slate-300"><Paperclip className="h-3.5 w-3.5" />{file.name}</span>)}</div>}
                <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-200">{stripHtml(selected?.body?.content || selected.bodyPreview)}</div>
                <div className="mt-7 border-t border-[#1d344b] pt-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><Reply className="h-4 w-4" /> Reply</div>
                  <textarea value={replyText} onChange={event => setReplyText(event.target.value)} rows={5} placeholder="Write a reply…" className="w-full rounded-xl border border-[#29435d] bg-[#081522] p-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500" />
                  <button type="button" disabled={replying || !replyText.trim()} onClick={submitReply} className="mt-3 flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"><Send className="h-4 w-4" />{replying ? 'Sending…' : 'Send Reply'}</button>
                </div>
              </div>
            </>
          ) : <div className="m-auto text-center text-slate-600"><MailOpen className="mx-auto h-12 w-12" /><div className="mt-3 text-sm font-bold">Select an email to read it</div></div>}
        </section>
      </div>

      {composeOpen && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-2xl rounded-t-2xl border border-[#294867] bg-[#0b1725] shadow-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#29435d] px-4 py-3"><div className="text-sm font-black">NEW OUTLOOK EMAIL</div><button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg p-2 hover:bg-[#13283e]"><X className="h-4 w-4" /></button></div>
          <div className="space-y-3 p-4">
            {['to','cc','bcc','subject'].map(field => <label key={field} className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{field}</span><input value={compose[field]} onChange={event => setCompose(current => ({ ...current, [field]: event.target.value }))} className="w-full rounded-lg border border-[#29435d] bg-[#07111d] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /></label>)}
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Message</span><textarea value={compose.body} onChange={event => setCompose(current => ({ ...current, body: event.target.value }))} rows={9} className="w-full rounded-lg border border-[#29435d] bg-[#07111d] p-3 text-sm text-white outline-none focus:border-blue-500" /></label>
            <label className="block rounded-lg border border-dashed border-[#36536f] bg-[#081522] p-3 text-xs text-slate-400"><span className="flex items-center gap-2 font-bold text-slate-300"><Paperclip className="h-4 w-4" /> Attach files (up to 3 MB each)</span><input type="file" multiple className="mt-2 block w-full text-xs" onChange={event => setCompose(current => ({ ...current, attachments: Array.from(event.target.files || []) }))} />{compose.attachments.length > 0 && <div className="mt-2">{compose.attachments.map(file => file.name).join(', ')}</div>}</label>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#29435d] p-4"><button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg border border-[#36516b] px-4 py-2 text-xs font-bold">Cancel</button><button type="button" disabled={sending} onClick={sendMessage} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending…' : 'Send'}</button></div>
        </div>
      </div>}

      {forwardOpen && selected && <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-lg rounded-2xl border border-[#294867] bg-[#0b1725] p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-black">FORWARD EMAIL</h3><button onClick={() => setForwardOpen(false)}><X className="h-4 w-4" /></button></div><label className="mt-4 block"><span className="mb-1 block text-xs font-bold text-slate-400">To</span><input value={forwardTo} onChange={event => setForwardTo(event.target.value)} className="w-full rounded-lg border border-[#29435d] bg-[#07111d] px-3 py-2 text-sm text-white" /></label><label className="mt-3 block"><span className="mb-1 block text-xs font-bold text-slate-400">Comment</span><textarea rows={4} value={forwardComment} onChange={event => setForwardComment(event.target.value)} className="w-full rounded-lg border border-[#29435d] bg-[#07111d] p-3 text-sm text-white" /></label><button type="button" disabled={replying} onClick={submitForward} className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white"><Forward className="h-4 w-4" />Forward</button></div></div>}
    </div>
  );
}
