import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';

const SOURCES = [
  { entity: 'ChatMessage', label: 'Team Chat', page: 'TeamChat' },
  { entity: 'SupervisorChatMessage', label: 'Supervisor Chat', page: 'SupervisorChat', supervisorOnly: true },
  { entity: 'Message', label: 'New Message', page: 'OfficerInbox', direct: true },
];

const lowerRoles = user => new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));

export default function GlobalMessageBanner({ user }) {
  const [banners, setBanners] = useState([]);
  const knownIds = useRef(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!user?.id && !user?.email) return undefined;
    let cancelled = false;
    const roles = lowerRoles(user);

    const visibleDirectMessage = message => {
      const recipient = String(message.recipient_id || '').toLowerCase();
      const sender = String(message.sender_id || '').toLowerCase();
      const myIds = [user.id, user.email].filter(Boolean).map(value => String(value).toLowerCase());
      if (myIds.includes(sender)) return false;
      return recipient === 'company' || recipient === 'all' || recipient === '*' || myIds.includes(recipient) || (recipient === 'dispatch' && (user.role === 'admin' || user.role === 'dispatch' || roles.has('cad_access')));
    };

    const poll = async () => {
      const collected = [];
      for (const source of SOURCES) {
        if (source.supervisorOnly && user.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) continue;
        try {
          const records = await base44.entities[source.entity].list('-created_date', 20);
          for (const record of records || []) {
            const senderEmail = String(record.sender_email || record.created_by || '').toLowerCase();
            if (senderEmail && senderEmail === String(user.email || '').toLowerCase()) continue;
            if (source.direct && !visibleDirectMessage(record)) continue;
            collected.push({ source, record });
          }
        } catch (error) {
          console.warn(`Unable to monitor ${source.entity}:`, error?.message);
        }
      }
      if (cancelled) return;
      collected.sort((a, b) => new Date(a.record.created_date || 0) - new Date(b.record.created_date || 0));
      if (!initialized.current) {
        collected.forEach(item => knownIds.current.add(`${item.source.entity}:${item.record.id}`));
        initialized.current = true;
        return;
      }
      for (const item of collected) {
        const key = `${item.source.entity}:${item.record.id}`;
        if (knownIds.current.has(key)) continue;
        knownIds.current.add(key);
        const record = item.record;
        const banner = {
          id: key,
          title: item.source.label,
          page: item.source.page,
          sender: record.sender_name || record.created_by || 'Black Point User',
          photo: record.sender_photo_url || '',
          message: record.message || record.body || record.content || record.description || 'You received a new message.',
        };
        setBanners(current => [...current.slice(-2), banner]);
        window.setTimeout(() => setBanners(current => current.filter(entry => entry.id !== key)), 20000);
      }
    };

    poll();
    const interval = window.setInterval(poll, 30000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [user?.id, user?.email, user?.role, JSON.stringify(user?.additional_roles || [])]);

  const dismiss = id => setBanners(current => current.filter(entry => entry.id !== id));

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[140] flex w-[min(420px,calc(100vw-24px))] flex-col gap-2">
      <AnimatePresence>
        {banners.map(banner => (
          <motion.button
            key={banner.id}
            type="button"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            onClick={() => { dismiss(banner.id); window.location.href = createPageUrl(banner.page); }}
            className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/15 bg-[#111827]/95 text-left text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-600/30 ring-1 ring-blue-300/30">
                {banner.photo ? <img src={banner.photo} alt="" className="h-full w-full object-cover" /> : <MessageCircle className="h-5 w-5 text-blue-200" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-blue-200">{banner.title}</p>
                  <span className="ml-auto text-[10px] text-slate-400">NOW</span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-white">{banner.sender}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-200">{banner.message}</p>
              </div>
              <span onClick={event => { event.stopPropagation(); dismiss(banner.id); }} className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></span>
            </div>
            <div className="h-1 origin-left animate-[shrink_20s_linear_forwards] bg-blue-400" />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}