import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import {
  beginOutlookConnection,
  deleteOutlookMessage,
  disconnectOutlook,
  forwardOutlookMail,
  getOutlookAttachments,
  getOutlookAttachmentBlobUrl,
  getOutlookConnectionStatus,
  getOutlookMessage,
  listOutlookFolders,
  listOutlookMessages,
  listSavedSharedMailboxes,
  removeSharedMailbox,
  renameSharedMailbox,
  replyOutlookMail,
  saveSharedMailbox,
  sendOutlookMail,
  setOutlookMessageRead,
  verifySharedMailboxAccess,
} from '@/lib/outlookGraph';
import { toast } from 'sonner';
import {
  Archive, ArrowLeft, Building2, Forward, Inbox, Loader2, Mail, MailOpen, Paperclip,
  PenLine, Plus, RefreshCw, Reply, Search, Send, Trash2, X,
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

function attachmentDataUrl(file) {
  if (!file?.contentBytes) return '';
  return `data:${file.contentType || 'application/octet-stream'};base64,${file.contentBytes}`;
}

function resolveCidSources(doc, attachmentRows = []) {
  const byCid = new Map((attachmentRows || []).filter(file => file?.contentId && file?.contentBytes).map(file => [String(file.contentId).replace(/[<>]/g, '').toLowerCase(), attachmentDataUrl(file)]));
  doc.querySelectorAll('[src^="cid:"], source[src^="cid:"]').forEach(node => {
    const cid = String(node.getAttribute('src') || '').slice(4).replace(/[<>]/g, '').toLowerCase();
    const dataUrl = byCid.get(cid);
    if (dataUrl) node.setAttribute('src', dataUrl);
  });
}

function safeEmailHtml(value, attachmentRows = []) {
  const html = String(value || '');
  if (!html) return '';
  // Microsoft can return a plain-text body. Rendering that string as HTML would
  // collapse every line break and make the email look jammed together.
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\r?\n/g, '<br>');
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select').forEach(node => node.remove());
    resolveCidSources(doc, attachmentRows);
    doc.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || '').trim();
        if (name.startsWith('on') || (['href','src','xlink:href'].includes(name) && /^javascript:/i.test(val))) node.removeAttribute(attr.name);
      });
    });
    doc.querySelectorAll('a[href]').forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      link.style.textDecoration = 'underline';
    });
    return doc.body.innerHTML;
  } catch {
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
  }
}

function mediaKind(file) {
  const type = String(file?.contentType || '').toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  return '';
}

function attachmentUrl(file) {
  return file?._playUrl || attachmentDataUrl(file);
}

function AttachmentViewer({ files = [] }) {
  if (!files.length) return null;
  return <div className="space-y-3">
    {files.map(file => {
      const kind = mediaKind(file);
      const url = attachmentUrl(file);
      return <div key={file.id || file.name} className="rounded-xl border border-[#29435d] bg-[#0c1b2a] p-3 text-xs text-slate-300">
        <div className="flex items-center gap-2"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate font-bold">{file.name || 'Attachment'}</span>{file.size ? <span className="text-[10px] text-slate-500">{Math.max(1, Math.round(Number(file.size) / 1024))} KB</span> : null}</div>
        {kind === 'audio' && url && <audio className="mt-3 w-full" controls preload="metadata" src={url}>Your browser cannot play this audio attachment.</audio>}
        {kind === 'video' && url && <video className="mt-3 max-h-[55vh] w-full rounded-lg bg-black" controls preload="metadata" src={url}>Your browser cannot play this video attachment.</video>}
        {kind === 'image' && url && !file.isInline && <img className="mt-3 max-h-[55vh] max-w-full rounded-lg object-contain" src={url} alt={file.name || 'Email attachment'} />}
        {url && !file.isInline && <a href={url} download={file.name || 'attachment'} className="mt-2 inline-block text-blue-300 underline">Save attachment</a>}
        {kind && !url && <div className="mt-2 text-amber-300">Media could not be loaded from Microsoft.</div>}
      </div>;
    })}
  </div>;
}

function emailReaderDocument(value, attachmentRows = []) {
  const html = String(value || '');
  const plain = !/<[a-z][\s\S]*>/i.test(html);
  const source = plain ? safeEmailHtml(html, attachmentRows) : html;
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select').forEach(node => node.remove());
    resolveCidSources(doc, attachmentRows);
    doc.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || '').trim();
        if (name.startsWith('on') || (['href','src','xlink:href'].includes(name) && /^javascript:/i.test(val))) node.removeAttribute(attr.name);
      });
    });
    doc.querySelectorAll('a[href]').forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });

    const headContent = Array.from(doc.head.children)
      .filter(node => !['SCRIPT','IFRAME','OBJECT','EMBED'].includes(node.tagName))
      .map(node => node.outerHTML)
      .join('');
    const bodyAttrs = Array.from(doc.body.attributes)
      .filter(attr => !attr.name.toLowerCase().startsWith('on'))
      .map(attr => `${attr.name}="${String(attr.value).replace(/"/g, '&quot;')}"`)
      .join(' ');
    const bodyHasBg = doc.body.hasAttribute('bgcolor') || /background(?:-color)?\s*:/i.test(doc.body.getAttribute('style') || '');
    const bodyHasColor = doc.body.hasAttribute('text') || /(^|;)\s*color\s*:/i.test(doc.body.getAttribute('style') || '');
    const fallbackCss = `
      html{margin:0;padding:0;background:#fff;color-scheme:light only;}
      body{margin:0;padding:24px;overflow-wrap:anywhere;${bodyHasBg ? '' : 'background:#fff;'}${bodyHasColor ? '' : 'color:#111827;'}}
      img,video{max-width:100%;height:auto;}
      audio{width:min(100%,720px);}
      table{max-width:100%;}
      a{text-decoration:underline;}
      @media(max-width:720px){body{padding:14px;}table{width:100%!important;}td{max-width:100%!important;}img{height:auto!important;}}
    `;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${headContent}<style>${fallbackCss}</style></head><body ${bodyAttrs}>${doc.body.innerHTML}</body></html>`;
  } catch {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;color:#111827}body{padding:24px;font-family:Arial,sans-serif}</style></head><body>${safeEmailHtml(source, attachmentRows)}</body></html>`;
  }
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
  const [readerOpen, setReaderOpen] = useState(false);
  const [compose, setCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] });
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardComment, setForwardComment] = useState('');
  const [sharedMailboxes, setSharedMailboxes] = useState([]);
  const [companyMailboxes, setCompanyMailboxes] = useState([]);
  const [activeMailbox, setActiveMailbox] = useState(null);
  const [sharedAddress, setSharedAddress] = useState('');
  const [addingShared, setAddingShared] = useState(false);

  const isCompanyImap = activeMailbox?._source === 'imap';
  const activeMailboxEmail = isCompanyImap ? '' : (activeMailbox?.mailbox_email || '');

  const invokeCompanyMail = async (action, extra = {}, mailbox = activeMailbox) => {
    const mailboxId = mailbox?.id;
    if (!mailboxId) throw new Error('Company mailbox is not selected.');
    const result = await base44.functions.invoke('companyImapMail', { action, mailbox_id: mailboxId, ...extra });
    const payload = result?.data || result || {};
    if (payload.error) throw new Error(payload.error);
    return payload;
  };

  const loadCompanyMailbox = async (mailbox, targetFolder = 'INBOX') => {
    if (!mailbox?.id) return;
    try {
      setLoading(true);
      const [folderResult, messageResult] = await Promise.all([
        invokeCompanyMail('folders', {}, mailbox),
        invokeCompanyMail('messages', { folder: targetFolder, limit: 35 }, mailbox),
      ]);
      const folderRows = (folderResult.folders || []).map(folder => ({ ...folder, id: folder.id || folder.path }));
      setFolders(folderRows);
      setFolderId(targetFolder);
      setFolderName(folderRows.find(folder => folder.id === targetFolder)?.displayName || targetFolder);
      setMessages(messageResult.messages || []);
      setNextLink(null);
    } catch (error) {
      toast.error(error?.message || 'Unable to load company mailbox.');
    } finally {
      setLoading(false);
    }
  };

  const reloadSharedMailboxes = async () => {
    if (!user?.id) return [];
    const rows = await listSavedSharedMailboxes(user.id).catch(() => []);
    setSharedMailboxes(rows || []);
    setActiveMailbox(current => {
      if (!current?.id) return current;
      return (rows || []).find(item => item.id === current.id) || current;
    });
    return rows || [];
  };

  const loadMailbox = async (targetFolder = folderId, append = false, link = null, mailboxEmail = activeMailboxEmail) => {
    if (!user?.id) return;
    try {
      append ? setLoadingMore(true) : setLoading(true);
      const [status, folderRows, result] = await Promise.all([
        getOutlookConnectionStatus(user.id, user?.email || ''),
        listOutlookFolders(user.id, mailboxEmail),
        listOutlookMessages(user.id, targetFolder, link, mailboxEmail),
      ]);
      setConnection(status);
      setFolders(folderRows);
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
    if (!user?.id) return undefined;
    reloadSharedMailboxes();
    const initializeMail = async () => {
      const companyResult = await base44.functions.invoke('companyImapMail', { action: 'status' }).catch(() => null);
      const companyPayload = companyResult?.data || companyResult || {};
      const assigned = (companyPayload.mailboxes || []).map(item => ({ ...item, _source: 'imap' }));
      setCompanyMailboxes(assigned);
      const status = await getOutlookConnectionStatus(user.id, user?.email || '').catch(() => ({ connected: false }));
      setConnection(status);
      if (status?.connected) await loadMailbox('inbox', false, null, '');
      else if (assigned[0]) {
        setActiveMailbox(assigned[0]);
        await loadCompanyMailbox(assigned[0], 'INBOX');
      } else {
        setLoading(false);
        setFolders([]);
        setMessages([]);
      }
    };
    initializeMail();
    const refreshShared = () => reloadSharedMailboxes();
    window.addEventListener('bps:outlook-connection-changed', refreshShared);
    window.addEventListener('bps:outlook-shared-mailboxes-changed', refreshShared);
    return () => {
      window.removeEventListener('bps:outlook-connection-changed', refreshShared);
      window.removeEventListener('bps:outlook-shared-mailboxes-changed', refreshShared);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const receiveNewMail = event => {
      if (document.visibilityState !== 'visible') return;
      const isInbox = String(folderId || '').toLowerCase() === 'inbox';
      if (!isInbox) return;
      const activeKey = isCompanyImap && activeMailbox?.id
        ? `imap:${activeMailbox.id}`
        : `ms:${activeMailbox?.mailbox_email || 'me'}`;
      const incoming = (event.detail?.items || []).filter(item => item?._mailboxKey === activeKey);
      if (!incoming.length) return;
      setMessages(current => {
        const existing = new Set((current || []).map(item => String(item.id)));
        const additions = incoming.filter(item => !existing.has(String(item.id)));
        return additions.length ? [...additions, ...(current || [])] : current;
      });
    };
    window.addEventListener('bps:mail-new-items', receiveNewMail);
    return () => window.removeEventListener('bps:mail-new-items', receiveNewMail);
  }, [user?.id, activeMailbox?.id, activeMailbox?.mailbox_email, isCompanyImap, folderId]);

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
    if (isCompanyImap) await loadCompanyMailbox(activeMailbox, folder.id || folder.path || 'INBOX');
    else await loadMailbox(folder.id, false, null);
  };

  const openMessage = async message => {
    try {
      if (isCompanyImap) {
        const result = await invokeCompanyMail('message', { folder: folderId || 'INBOX', uid: Number(message.uid || message.id) });
        const full = result.message || message;
        setSelected(full);
        setReaderOpen(true);
        setAttachments([]);
        if (!message.isRead) {
          await invokeCompanyMail('mark_read', { folder: folderId || 'INBOX', uid: Number(message.uid || message.id), read: true });
          setSelected(current => current ? { ...current, isRead: true } : current);
          setMessages(current => current.map(item => item.id === message.id ? { ...item, isRead: true } : item));
        }
        return;
      }
      const full = await getOutlookMessage(user.id, message.id, activeMailboxEmail);
      setSelected(full || message);
      setReaderOpen(true);
      setAttachments([]);
      if (!message.isRead) {
        await setOutlookMessageRead(user.id, message.id, true, activeMailboxEmail);
        setMessages(current => current.map(item => item.id === message.id ? { ...item, isRead: true } : item));
        window.dispatchEvent(new CustomEvent('bps-outlook-refresh')); 
      }
      if (message.hasAttachments || full?.hasAttachments) {
        const rows = await getOutlookAttachments(user.id, message.id, activeMailboxEmail);
        const hydrated = await Promise.all((rows || []).map(async file => {
          if (file?.contentBytes || !mediaKind(file) || file?.isInline) return file;
          try {
            const _playUrl = await getOutlookAttachmentBlobUrl(user.id, message.id, file.id, activeMailboxEmail);
            return { ...file, _playUrl };
          } catch {
            return file;
          }
        }));
        setAttachments(hydrated);
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
      if (isCompanyImap) {
        await invokeCompanyMail('send', {
          to: recipients,
          cc: splitAddresses(compose.cc),
          bcc: splitAddresses(compose.bcc),
          subject: compose.subject.trim(),
          body: compose.body,
          text: compose.body,
        });
      } else {
        await sendOutlookMail(user.id, {
          to: recipients,
          cc: splitAddresses(compose.cc),
          bcc: splitAddresses(compose.bcc),
          subject: compose.subject.trim(),
          body: compose.body,
          attachments: compose.attachments,
          mailboxEmail: activeMailboxEmail,
        });
      }
      toast.success(isCompanyImap ? 'Email sent through company mail.' : 'Email sent through Outlook.');
      setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] });
      setComposeOpen(false);
      if (String(folderName).toLowerCase().includes('sent')) loadMailbox(folderId);
    } catch (error) {
      const raw = error?.message || 'Unable to send email.';
      const guidance = activeMailboxEmail && (error?.status === 403 || /SendAs|send on behalf|denied/i.test(raw))
        ? ' Confirm this user has Send As or Send on Behalf permission for the selected shared mailbox in Microsoft 365.'
        : '';
      toast.error(`${raw}${guidance}`, { duration: 12000 });
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!selected || !replyText.trim()) return;
    try {
      setReplying(true);
      if (isCompanyImap) {
        const replyAddress = selected?.from?.emailAddress?.address;
        if (!replyAddress) throw new Error('Sender email address is unavailable.');
        await invokeCompanyMail('send', { to: [replyAddress], subject: /^re:/i.test(selected.subject || '') ? selected.subject : `Re: ${selected.subject || ''}`, body: replyText.trim(), text: replyText.trim() });
      } else {
        await replyOutlookMail(user.id, selected.id, replyText.trim(), activeMailboxEmail);
      }
      setReplyText('');
      toast.success(isCompanyImap ? 'Reply sent through company mail.' : 'Reply sent through Outlook.');
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
      if (isCompanyImap) {
        const original = String(selected?.body?.content || selected?.bodyPreview || '');
        await invokeCompanyMail('send', { to: recipients, subject: /^fwd:/i.test(selected.subject || '') ? selected.subject : `Fwd: ${selected.subject || ''}`, body: `${forwardComment.trim()}\n\n---------- Forwarded message ----------\n${original}`, text: `${forwardComment.trim()}\n\n---------- Forwarded message ----------\n${original}` });
      } else {
        await forwardOutlookMail(user.id, selected.id, recipients, forwardComment.trim(), activeMailboxEmail);
      }
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
      if (isCompanyImap) await invokeCompanyMail('delete', { folder: folderId || 'INBOX', uid: Number(selected.uid || selected.id) });
      else await deleteOutlookMessage(user.id, selected.id, activeMailboxEmail);
      setMessages(current => current.filter(item => item.id !== selected.id));
      if (!isCompanyImap) window.dispatchEvent(new CustomEvent('bps-outlook-refresh'));
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
      if (isCompanyImap) await invokeCompanyMail('mark_read', { folder: folderId || 'INBOX', uid: Number(selected.uid || selected.id), read: next });
      else await setOutlookMessageRead(user.id, selected.id, next, activeMailboxEmail);
      setSelected(current => ({ ...current, isRead: next }));
      setMessages(current => current.map(item => item.id === selected.id ? { ...item, isRead: next } : item));
      window.dispatchEvent(new CustomEvent('bps-outlook-refresh'));
    } catch (error) {
      toast.error(error?.message || 'Unable to update email.');
    }
  };

  const switchMailbox = async mailbox => {
    const mailboxEmail = mailbox?.mailbox_email || '';
    setActiveMailbox(mailbox || null);
    setFolders([]);
    setFolderId(mailbox?._source === 'imap' ? 'INBOX' : 'inbox');
    setFolderName('Inbox');
    setSelected(null);
    setAttachments([]);
    setMessages([]);
    if (mailbox?._source === 'imap') await loadCompanyMailbox(mailbox, 'INBOX');
    else await loadMailbox('inbox', false, null, mailboxEmail);
  };

  const addSharedMailbox = async () => {
    const address = sharedAddress.trim().toLowerCase();
    if (!address) return toast.error('Enter the shared mailbox email address.');
    let pending = null;
    try {
      setAddingShared(true);
      pending = await saveSharedMailbox(user.id, user?.email || '', { email: address, displayName: address, connectionStatus: 'pending' });
      setSharedMailboxes(current => {
        const without = current.filter(item => item.id !== pending.id && item.mailbox_email !== pending.mailbox_email);
        return [pending, ...without];
      });
      setSharedAddress('');

      const verified = await verifySharedMailboxAccess(user.id, address);
      const saved = await saveSharedMailbox(user.id, user?.email || '', { ...verified, displayName: pending.display_name || verified.displayName, connectionStatus: 'verified' });
      setSharedMailboxes(current => current.map(item => item.id === saved.id || item.mailbox_email === saved.mailbox_email ? saved : item));
      window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed'));
      toast.success(`Shared mailbox connected: ${verified.email}`);
      await switchMailbox(saved);
    } catch (error) {
      const raw = error?.message || 'Microsoft could not verify this shared mailbox.';
      if (pending?.id) {
        const needsAttention = await saveSharedMailbox(user.id, user?.email || '', {
          email: address,
          displayName: pending.display_name || address,
          connectionStatus: 'needs_attention',
          lastError: raw,
        }).catch(() => pending);
        setSharedMailboxes(current => current.map(item => item.id === pending.id || item.mailbox_email === address ? { ...item, ...needsAttention, connection_status: 'needs_attention', last_error: raw } : item));
        window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed')); 
      }
      const guidance = error?.status === 403
        ? ' It has been saved in Pathfinder, but Microsoft denied mailbox access. Confirm Full Access plus Send As/Send on Behalf in Exchange, then reconnect Microsoft 365 and retry.'
        : ' The address has been saved in Pathfinder so you can rename it or retry later.';
      toast.error(`${raw}${guidance}`, { duration: 12000 });
    } finally {
      setAddingShared(false);
    }
  };

  const retrySharedMailbox = async (event, mailbox) => {
    event.stopPropagation();
    try {
      setAddingShared(true);
      const verified = await verifySharedMailboxAccess(user.id, mailbox.mailbox_email);
      const saved = await saveSharedMailbox(user.id, user?.email || '', {
        ...verified,
        displayName: mailbox.display_name || verified.displayName,
        connectionStatus: 'verified',
      });
      setSharedMailboxes(current => current.map(item => item.id === mailbox.id || item.mailbox_email === mailbox.mailbox_email ? saved : item));
      window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed'));
      toast.success(`${mailbox.display_name || mailbox.mailbox_email} verified with Microsoft.`);
      await switchMailbox(saved);
    } catch (error) {
      const raw = error?.message || 'Microsoft could not verify this shared mailbox.';
      const saved = await saveSharedMailbox(user.id, user?.email || '', {
        email: mailbox.mailbox_email,
        displayName: mailbox.display_name || mailbox.mailbox_email,
        connectionStatus: 'needs_attention',
        lastError: raw,
      }).catch(() => mailbox);
      setSharedMailboxes(current => current.map(item => item.id === mailbox.id ? { ...item, ...saved, connection_status: 'needs_attention', last_error: raw } : item));
      window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed'));
      toast.error(raw, { duration: 12000 });
    } finally {
      setAddingShared(false);
    }
  };

  const renameMailbox = async (event, mailbox) => {
    event.stopPropagation();
    const nextName = window.prompt('Shared mailbox display name', mailbox.display_name || mailbox.mailbox_email || '');
    if (nextName == null) return;
    try {
      const updated = await renameSharedMailbox(mailbox.id, nextName);
      setSharedMailboxes(current => current.map(item => item.id === mailbox.id ? { ...item, display_name: updated.display_name } : item));
      setActiveMailbox(current => current?.id === mailbox.id ? { ...current, display_name: updated.display_name } : current);
      window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed'));
      toast.success('Shared mailbox name saved.');
    } catch (error) {
      toast.error(error?.message || 'Unable to rename shared mailbox.');
    }
  };

  const unlinkSharedMailbox = async (event, mailbox) => {
    event.stopPropagation();
    try {
      await removeSharedMailbox(mailbox.id);
      setSharedMailboxes(current => current.filter(item => item.id !== mailbox.id));
      window.dispatchEvent(new CustomEvent('bps:outlook-shared-mailboxes-changed'));
      if (activeMailbox?.id === mailbox.id) await switchMailbox(null);
      toast.success('Shared mailbox removed from Pathfinder.');
    } catch (error) {
      toast.error(error?.message || 'Unable to remove shared mailbox.');
    }
  };

  const disconnect = async () => {
    await disconnectOutlook(user.id);
    window.dispatchEvent(new CustomEvent('bps:outlook-connection-changed'));
  };

  return (
    <div className="min-h-full bg-[#07101b] text-slate-100">
      <div className="border-b border-[#1f3851] bg-[#091522] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/40 bg-blue-950/40"><Mail className="h-5 w-5 text-blue-300" /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-black">MAIL CENTER</h1>
              <p className="truncate text-xs text-slate-400">{activeMailbox ? `${activeMailbox.display_name || (isCompanyImap ? 'Company Mailbox' : 'Shared Mailbox')} · ${activeMailbox.mailbox_email}` : (connection?.email || connection?.profile?.displayName || 'Company mail')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => isCompanyImap ? loadCompanyMailbox(activeMailbox, folderId || 'INBOX') : loadMailbox(folderId)} className="flex h-10 items-center gap-2 rounded-lg border border-[#2a4662] bg-[#0d1d2d] px-3 text-xs font-bold hover:bg-[#122a42]"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <button type="button" onClick={() => setComposeOpen(true)} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-500"><PenLine className="h-4 w-4" /> New Email</button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-7.5rem)] md:grid-cols-[220px_360px_minmax(0,1fr)]">
        <aside className="border-b border-[#1d344b] bg-[#08131f] p-3 md:border-b-0 md:border-r">
          <button type="button" onClick={() => setComposeOpen(true)} className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-black text-white hover:bg-blue-500"><PenLine className="h-4 w-4" /> COMPOSE</button>

          <div className="mb-4 rounded-xl border border-[#213b53] bg-[#07111d] p-2">
            <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Mailboxes</div>
            {connection?.connected && <button type="button" onClick={() => switchMailbox(null)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${!activeMailbox ? 'bg-[#163a5a] text-white' : 'text-slate-300 hover:bg-[#0d2236]'}`}>
              <Mail className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">My Microsoft Mailbox</span>
            </button>}
            {companyMailboxes.map(mailbox => (
              <button key={`imap-${mailbox.id}`} type="button" onClick={() => switchMailbox(mailbox)} className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${activeMailbox?.id === mailbox.id && isCompanyImap ? 'bg-emerald-950/70 text-white' : 'text-slate-300 hover:bg-[#0d2236]'}`}>
                <Building2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{mailbox.display_name || 'Company Mailbox'}</span><span className="block truncate text-[10px] text-slate-500">{mailbox.mailbox_email}</span><span className="mt-0.5 block text-[9px] font-bold text-emerald-400">Company IMAP</span></span>
              </button>
            ))}
            {sharedMailboxes.map(mailbox => (
              <button key={mailbox.id} type="button" onClick={() => switchMailbox(mailbox)} className={`group mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${activeMailbox?.id === mailbox.id ? 'bg-[#163a5a] text-white' : 'text-slate-300 hover:bg-[#0d2236]'}`}>
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{mailbox.display_name || 'Shared Mailbox'}</span><span className="block truncate text-[10px] text-slate-500">{mailbox.mailbox_email}</span>{mailbox.connection_status === 'needs_attention' && <span className="mt-0.5 block text-[9px] font-bold text-amber-400">Needs Microsoft access verification</span>}</span>
                {mailbox.connection_status === 'needs_attention' && <span role="button" tabIndex={0} onClick={event => retrySharedMailbox(event, mailbox)} className="rounded p-1 text-amber-400 hover:bg-amber-950/40 hover:text-amber-200" aria-label={`Retry ${mailbox.mailbox_email}`} title="Retry Microsoft verification"><RefreshCw className="h-3.5 w-3.5" /></span>}
                <span role="button" tabIndex={0} onClick={event => renameMailbox(event, mailbox)} className="rounded p-1 text-blue-400 hover:bg-blue-950/50 hover:text-blue-200" aria-label={`Rename ${mailbox.mailbox_email}`} title="Rename mailbox"><PenLine className="h-3.5 w-3.5" /></span>
                <span role="button" tabIndex={0} onClick={event => unlinkSharedMailbox(event, mailbox)} className="rounded p-1 text-red-400 hover:bg-red-950/50 hover:text-red-200" aria-label={`Remove ${mailbox.mailbox_email}`} title="Remove mailbox"><X className="h-3.5 w-3.5" /></span>
              </button>
            ))}
            <div className="mt-2 border-t border-[#1d344b] pt-2">
              <div className="flex gap-1.5">
                <input value={sharedAddress} onChange={event => setSharedAddress(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addSharedMailbox(); }} placeholder="shared@company.com" className="min-w-0 flex-1 rounded-lg border border-[#29435d] bg-[#091522] px-2.5 py-2 text-[11px] text-white outline-none placeholder:text-slate-600 focus:border-blue-500" />
                <button type="button" disabled={addingShared || !sharedAddress.trim()} onClick={addSharedMailbox} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#36536f] bg-[#102338] text-blue-300 hover:bg-[#173451] disabled:opacity-40" title="Add shared mailbox">{addingShared ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
              </div>
              <p className="mt-1.5 px-1 text-[9px] leading-4 text-slate-600">You must already have Microsoft 365 permission to the shared mailbox.</p>
            </div>
          </div>

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
          {connection?.connected ? (
            <button type="button" onClick={disconnect} className="mt-6 w-full rounded-lg border border-red-900/60 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/30">Disconnect Microsoft 365</button>
          ) : (
            <button type="button" onClick={() => beginOutlookConnection(user.id)} className="mt-6 w-full rounded-lg border border-blue-700/60 px-3 py-2 text-xs font-bold text-blue-300 hover:bg-blue-950/30">Connect Microsoft 365 (Optional)</button>
          )}
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
                {attachments.length > 0 && <div className="mt-4"><AttachmentViewer files={attachments} /></div>}
                <div className="mt-5 h-[62vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
                  <iframe
                    title={`Email preview: ${selected.subject || 'Message'}`}
                    className="h-full w-full border-0 bg-white"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={emailReaderDocument(selected?.body?.content || selected.bodyPreview, attachments)}
                  />
                </div>
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

      {readerOpen && selected && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-3 sm:p-6">
        <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#294867] bg-[#07101b] shadow-2xl">
          <div className="flex shrink-0 items-center gap-3 border-b border-[#1d344b] bg-[#0b1928] px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-black text-white">{selected.subject || '(No subject)'}</div>
              <div className="mt-1 truncate text-xs text-slate-400">{senderOf(selected)} · {selected?.from?.emailAddress?.address}</div>
            </div>
            <button type="button" onClick={toggleRead} className="hidden h-9 items-center gap-2 rounded-lg border border-[#29435d] px-3 text-xs font-bold text-slate-200 hover:bg-[#102338] sm:flex">{selected.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}{selected.isRead ? 'Mark Unread' : 'Mark Read'}</button>
            <button type="button" onClick={() => setForwardOpen(true)} className="hidden h-9 items-center gap-2 rounded-lg border border-[#29435d] px-3 text-xs font-bold text-slate-200 hover:bg-[#102338] sm:flex"><Forward className="h-4 w-4" />Forward</button>
            <button type="button" onClick={() => setReaderOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#36516b] text-white hover:bg-[#13283e]" title="Close email"><X className="h-5 w-5" /></button>
          </div>
          <div className="shrink-0 border-b border-[#1d344b] bg-[#091522] px-4 py-3 text-xs text-slate-400 sm:px-6">{formatDate(selected.receivedDateTime || selected.sentDateTime)} ET</div>
          {attachments.length > 0 && <div className="max-h-[38vh] shrink-0 overflow-auto border-b border-[#1d344b] bg-[#0a1623] px-4 py-3 sm:px-6"><AttachmentViewer files={attachments.filter(file => !file.isInline)} /></div>}
          <div className="min-h-0 flex-1 bg-white">
            <iframe
              title={`Email: ${selected.subject || 'Message'}`}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={emailReaderDocument(selected?.body?.content || selected.bodyPreview, attachments)}
            />
          </div>
        </div>
      </div>}

      {composeOpen && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-2xl rounded-t-2xl border border-[#294867] bg-[#0b1725] shadow-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#29435d] px-4 py-3"><div><div className="text-sm font-black">NEW OUTLOOK EMAIL</div><div className="mt-0.5 text-[10px] text-slate-500">From: {activeMailbox?.mailbox_email || connection?.email || 'Your Microsoft mailbox'}</div></div><button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg p-2 hover:bg-[#13283e]"><X className="h-4 w-4" /></button></div>
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
