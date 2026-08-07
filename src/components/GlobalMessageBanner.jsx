import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, MessageCircle, Siren, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';

const SOURCES = [
  { entity: 'ChatMessage', label: 'Team Chat', page: 'TeamChat', kind: 'message' },
  { entity: 'SupervisorChatMessage', label: 'Supervisor Chat', page: 'SupervisorChat', supervisorOnly: true, kind: 'message' },
  { entity: 'Message', label: 'New Message', page: 'OfficerInbox', direct: true, kind: 'message' },
  { entity: 'Announcement', label: 'New Announcement', page: 'Announcements', kind: 'announcement' },
  { entity: 'PropertyAlert', label: 'Monitored Property Call', page: 'DispatchCenter', kind: 'property' },
  { entity: 'ChatMention', label: 'You Were Mentioned', page: 'TeamChat', kind: 'mention', mention: true },
];

const lowerRoles = user => new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
const normalized = value => String(value || '').trim().toLowerCase();

let notificationAudioContext;

function audioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!notificationAudioContext) notificationAudioContext = new AudioContextClass();
  return notificationAudioContext;
}

function playNotificationChime(urgent = false) {
  try {
    const context = audioContext();
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    const start = context.currentTime + 0.02;
    const notes = urgent
      ? [{ frequency: 740, at: 0 }, { frequency: 740, at: 0.18 }, { frequency: 988, at: 0.36 }]
      : [{ frequency: 880, at: 0 }, { frequency: 1175, at: 0.16 }];

    notes.forEach(({ frequency, at }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start + at);
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.16, start + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + at);
      oscillator.stop(start + at + 0.24);
    });
  } catch (error) {
    console.warn('Notification chime unavailable:', error?.message);
  }
}

function bannerText(source, record) {
  if (source.kind === 'mention') {
    return {
      sender: record.sender_name || 'Black Point User',
      message: record.message || 'You were mentioned in a chat.',
    };
  }
  if (source.kind === 'announcement') {
    return {
      sender: record.author_name || record.created_by || 'Black Point Protection',
      message: [record.title, record.message || record.body || record.content].filter(Boolean).join(' — ') || 'A new announcement was posted.',
    };
  }
  if (source.kind === 'property') {
    const location = record.callLocation || record.propertyName || '';
    return {
      sender: record.propertyName || 'Monitored property',
      message: [record.callIncident || 'New call for service', location, record.description].filter(Boolean).join(' — '),
    };
  }
  return {
    sender: record.sender_name || record.created_by || 'Black Point User',
    message: record.message || record.body || record.content || record.description || 'You received a new message.',
  };
}

function BannerIcon({ kind }) {
  if (kind === 'property') return <Siren className="h-5 w-5 text-red-200" />;
  if (kind === 'announcement') return <Bell className="h-5 w-5 text-amber-200" />;
  if (kind === 'mention') return <Bell className="h-5 w-5 animate-pulse text-fuchsia-200" />;
  return <MessageCircle className="h-5 w-5 text-blue-200" />;
}

export default function GlobalMessageBanner({ user }) {
  const [banners, setBanners] = useState([]);
  const knownIds = useRef(new Set());
  const recentFingerprints = useRef(new Map());
  const timers = useRef(new Map());

  useEffect(() => {
    if (!user?.id && !user?.email) return undefined;

    const roles = lowerRoles(user);
    const myIds = [user.id, user.email].filter(Boolean).map(normalized);
    const unsubscribers = [];

    const visibleDirectMessage = message => {
      const recipient = normalized(message.recipient_id || message.recipient_email || message.to);
      const sender = normalized(message.sender_id || message.sender_email || message.created_by);
      if (myIds.includes(sender)) return false;
      return recipient === 'company'
        || recipient === 'all'
        || recipient === '*'
        || myIds.includes(recipient)
        || (recipient === 'dispatch' && (user.role === 'admin' || user.role === 'dispatch' || roles.has('cad_access')));
    };

    const showBanner = (source, record) => {
      if (!record?.id) return;
      const senderIdentity = normalized(record.created_by_id || record.sender_user_id || record.sender_id || record.sender_email || record.created_by);
      const isOwnRecord = myIds.includes(senderIdentity);
      if (isOwnRecord) return;
      if (source.direct && !visibleDirectMessage(record)) return;
      if (source.mention && normalized(record.recipient_email) !== normalized(user.email)) return;

      const key = `${source.entity}:${record.id}`;
      if (knownIds.current.has(key)) return;
      knownIds.current.add(key);

      const fingerprint = `${senderIdentity}:${normalized(record.message || record.body || record.content)}`;
      const lastSeen = recentFingerprints.current.get(fingerprint);
      const duplicate = Boolean(fingerprint && lastSeen && Date.now() - lastSeen < 5000);
      if (duplicate && !source.mention) return;
      if (source.mention) {
        setBanners(current => current.filter(entry => entry.fingerprint !== fingerprint));
      }
      recentFingerprints.current.set(fingerprint, Date.now());
      window.setTimeout(() => recentFingerprints.current.delete(fingerprint), 5000);

      if (!duplicate) {
        playNotificationChime(source.kind === 'property');
        window.dispatchEvent(new CustomEvent('bps-unread-notification', {
          detail: { page: record.page || source.page, key },
        }));
      }

      const text = bannerText(source, record);
      const banner = {
        id: key,
        title: source.label,
        page: record.page || source.page,
        kind: source.kind,
        persistent: Boolean(source.mention || source.kind === 'announcement'),
        recordId: (source.mention || source.kind === 'announcement') ? record.id : null,
        fingerprint,
        sender: text.sender,
        photo: record.sender_photo_url || '',
        message: text.message,
      };

      setBanners(current => [...current.slice(-4), banner]);
      if (!banner.persistent) {
        const timer = window.setTimeout(() => {
          setBanners(current => current.filter(entry => entry.id !== key));
          timers.current.delete(key);
        }, 20000);
        timers.current.set(key, timer);
      }
    };

    for (const source of SOURCES) {
      if (source.supervisorOnly && user.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) continue;
      try {
        const unsubscribe = base44.entities[source.entity].subscribe(event => {
          if (source.mention && event?.type === 'update' && event.data?.read) {
            setBanners(current => current.filter(entry => entry.id !== `${source.entity}:${event.data.id}`));
            return;
          }
          if (event?.type !== 'create') return;
          showBanner(source, event.data);
        });
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch (error) {
        console.warn(`Unable to subscribe to ${source.entity}:`, error?.message);
      }
    }

    const mentionSource = SOURCES.find(source => source.mention);
    base44.entities.ChatMention.filter({ recipient_email: user.email, read: false }, '-created_date', 20)
      .then(records => (records || []).reverse().forEach(record => showBanner(mentionSource, record)))
      .catch(() => null);

    // Load announcements missed while the user was offline. A persistent banner
    // remains until the Announcements page is opened and records the view.
    const announcementSource = SOURCES.find(source => source.kind === 'announcement');
    Promise.all([
      base44.entities.Announcement.list('-created_date', 100),
      base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 500),
    ]).then(([announcements, receipts]) => {
      const seen = new Set((receipts || []).map(receipt => receipt.announcement_id));
      const accountCreated = user?.created_date ? new Date(user.created_date).getTime() : 0;
      (announcements || []).slice().reverse().forEach(record => {
        const created = new Date(record.created_date || 0).getTime();
        if (!created || (accountCreated && created < accountCreated) || seen.has(record.id)) return;
        const ageDays = (Date.now() - created) / 86400000;
        const active = record.priority === 'urgent' ? ageDays <= 30 : record.priority === 'important' ? ageDays <= 14 : ageDays <= 7;
        if (active) showBanner(announcementSource, record);
      });
    }).catch(() => null);

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      timers.current.forEach(timer => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, [user?.id, user?.email, user?.role, JSON.stringify(user?.additional_roles || [])]);

  const dismiss = id => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setBanners(current => current.filter(entry => entry.id !== id));
  };

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[140] flex w-[min(440px,calc(100vw-24px))] flex-col gap-2">
      <AnimatePresence>
        {banners.map(banner => (
          <motion.button
            key={banner.id}
            type="button"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            onClick={async () => {
              if (banner.kind === 'mention' && banner.recordId) {
                await base44.entities.ChatMention.update(banner.recordId, { read: true, read_at: new Date().toISOString() }).catch(() => null);
              }
              dismiss(banner.id);
              window.location.href = createPageUrl(banner.page);
            }}
            className={`pointer-events-auto w-full overflow-hidden rounded-2xl border text-left text-white shadow-2xl backdrop-blur-xl ${banner.kind === 'property' ? 'border-red-400/40 bg-red-950/95' : banner.kind === 'announcement' ? 'border-amber-300/35 bg-[#29200d]/95' : 'border-white/15 bg-[#111827]/95'}`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${banner.kind === 'property' ? 'bg-red-600/30 ring-red-300/40' : banner.kind === 'announcement' ? 'bg-amber-500/25 ring-amber-200/30' : 'bg-blue-600/30 ring-blue-300/30'}`}>
                {banner.photo ? <img src={banner.photo} alt="" className="h-full w-full object-cover" /> : <BannerIcon kind={banner.kind} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-white">{banner.title}</p>
                  <span className="ml-auto text-[10px] text-slate-300">NOW</span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-white">{banner.sender}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-100">{banner.message}</p>
              </div>
              {!banner.persistent && <span onClick={event => { event.stopPropagation(); dismiss(banner.id); }} className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></span>}
            </div>
            <div className={`h-1 origin-left animate-[shrink_20s_linear_forwards] ${banner.kind === 'property' ? 'bg-red-400' : banner.kind === 'announcement' ? 'bg-amber-300' : 'bg-blue-400'}`} />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
