import { createClientFromRequest } from 'npm:@base44/sdk';
import { ImapFlow } from 'npm:imapflow@1.0.181';
import nodemailer from 'npm:nodemailer@6.9.16';
import { simpleParser } from 'npm:mailparser@3.7.2';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json' },
});

Deno.serve(async (req) => {
  let imap: ImapFlow | null = null;
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller?.id) return json({ error: 'Authentication required.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'status');
    const mailboxId = String(body?.mailbox_id || '');

    const records = mailboxId
      ? [await base44.asServiceRole.entities.CompanyImapMailbox.get(mailboxId).catch(() => null)].filter(Boolean)
      : await base44.asServiceRole.entities.CompanyImapMailbox.filter({ user_id: caller.id, active: true }, '-updated_date', 20).catch(() => []);

    if (action === 'status') {
      return json({ mailboxes: (records || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        mailbox_email: row.mailbox_email,
        display_name: row.display_name || row.mailbox_email,
        active: row.active !== false,
        approved_by_company: row.approved_by_company !== false,
        imap_host: row.imap_host,
        imap_port: row.imap_port,
        smtp_host: row.smtp_host,
        smtp_port: row.smtp_port,
        username: row.username,
        last_verified_at: row.last_verified_at || null,
        last_error: row.last_error || '',
      })) });
    }

    const mailbox: any = records?.[0];
    if (!mailbox) return json({ error: 'No company IMAP mailbox is assigned.' }, 404);
    const isAdmin = caller.role === 'admin';
    if (!isAdmin && String(mailbox.user_id) !== String(caller.id)) return json({ error: 'Mailbox access denied.' }, 403);
    if (!mailbox.active || !mailbox.approved_by_company) return json({ error: 'This company mailbox is not active.' }, 403);
    if (!mailbox.password) return json({ error: 'The company mailbox password has not been configured by an administrator.' }, 400);

    const connectImap = async () => {
      imap = new ImapFlow({
        host: mailbox.imap_host,
        port: Number(mailbox.imap_port || 993),
        secure: mailbox.imap_secure !== false,
        auth: { user: mailbox.username, pass: mailbox.password },
        logger: false,
      });
      await imap.connect();
      return imap;
    };

    if (action === 'send') {
      const transport = nodemailer.createTransport({
        host: mailbox.smtp_host,
        port: Number(mailbox.smtp_port || 465),
        secure: mailbox.smtp_secure !== false,
        auth: { user: mailbox.username, pass: mailbox.password },
      });
      const info = await transport.sendMail({
        from: { name: mailbox.display_name || mailbox.mailbox_email, address: mailbox.mailbox_email },
        replyTo: mailbox.reply_to || mailbox.mailbox_email,
        to: body.to || [],
        cc: body.cc || [],
        bcc: body.bcc || [],
        subject: String(body.subject || ''),
        text: String(body.text || body.body || ''),
        html: body.html || undefined,
      });
      await base44.asServiceRole.entities.CompanyImapMailbox.update(mailbox.id, { last_verified_at: new Date().toISOString(), last_error: '' }).catch(() => null);
      return json({ ok: true, message_id: info.messageId || '' });
    }

    const client = await connectImap();

    if (action === 'verify') {
      await base44.asServiceRole.entities.CompanyImapMailbox.update(mailbox.id, { last_verified_at: new Date().toISOString(), last_error: '' }).catch(() => null);
      return json({ ok: true });
    }

    if (action === 'folders') {
      const folders = await client.list();
      return json({ folders: folders.map((folder: any) => ({
        id: folder.path,
        displayName: folder.name || folder.path,
        path: folder.path,
        specialUse: folder.specialUse || '',
      })) });
    }

    const folder = String(body.folder || 'INBOX');
    const lock = await client.getMailboxLock(folder);
    try {
      if (action === 'messages') {
        const count = Number(client.mailbox?.exists || 0);
        if (!count) return json({ messages: [] });
        const limit = Math.min(50, Math.max(10, Number(body.limit || 30)));
        const start = Math.max(1, count - limit + 1);
        const rows: any[] = [];
        for await (const msg of client.fetch(`${start}:*`, { uid: true, envelope: true, flags: true, internalDate: true, source: true })) {
          const parsed = await simpleParser(msg.source);
          rows.push({
            id: String(msg.uid),
            uid: msg.uid,
            subject: parsed.subject || msg.envelope?.subject || '(No subject)',
            from: { emailAddress: { name: parsed.from?.value?.[0]?.name || '', address: parsed.from?.value?.[0]?.address || '' } },
            toRecipients: (parsed.to?.value || []).map((x: any) => ({ emailAddress: { name: x.name || '', address: x.address || '' } })),
            receivedDateTime: (parsed.date || msg.internalDate || new Date()).toISOString(),
            bodyPreview: String(parsed.text || '').slice(0, 300),
            body: { contentType: parsed.html ? 'html' : 'text', content: parsed.html || parsed.text || '' },
            isRead: msg.flags?.has('\\Seen') || false,
            hasAttachments: (parsed.attachments || []).length > 0,
            _imap: true,
          });
        }
        rows.sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());
        const unseen = await client.search({ seen: false }).catch(() => []);
        return json({ messages: rows, unreadCount: Array.isArray(unseen) ? unseen.length : 0 });
      }

      const uid = Number(body.uid || body.message_id || 0);
      if (!uid) return json({ error: 'Message UID is required.' }, 400);

      if (action === 'message') {
        const msg: any = await client.fetchOne(uid, { uid: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true });
        if (!msg) return json({ error: 'Message not found.' }, 404);
        const parsed = await simpleParser(msg.source);
        return json({ message: {
          id: String(msg.uid), uid: msg.uid, subject: parsed.subject || '(No subject)',
          from: { emailAddress: { name: parsed.from?.value?.[0]?.name || '', address: parsed.from?.value?.[0]?.address || '' } },
          receivedDateTime: (parsed.date || msg.internalDate || new Date()).toISOString(),
          bodyPreview: String(parsed.text || '').slice(0, 300),
          body: { contentType: parsed.html ? 'html' : 'text', content: parsed.html || parsed.text || '' },
          isRead: msg.flags?.has('\\Seen') || false,
          hasAttachments: (parsed.attachments || []).length > 0,
          _imap: true,
        } });
      }

      if (action === 'mark_read') {
        if (body.read === false) await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        else await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        return json({ ok: true });
      }

      if (action === 'delete') {
        await client.messageDelete(uid, { uid: true });
        return json({ ok: true });
      }

      return json({ error: 'Unsupported IMAP action.' }, 400);
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error('companyImapMail error', error);
    return json({ error: error?.message || 'Company mail operation failed.' }, 500);
  } finally {
    try { if (imap) await imap.logout(); } catch {}
  }
});
