import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, MessageCircle, Siren, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';

const SOURCES = [
  { entity: 'ChatMessage', label: 'Team Chat', page: 'TeamChat', kind: 'message' },
  { entity: 'SupervisorChatMessage', label: 'Supervisor Chat', page: 'SupervisorChat', supervisorOnly: true, kind: 'message' },
  { entity: 'Message', label: 'New Message', page: 'OfficerInbox', direct: true, kind: 'message' },
  { entity: 'Announcement', label: 'New Announcement', page: 'Announcements', kind: 'announcement' },
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

function speakNotification(text, { rate = 0.9, pitch = 0.78 } = {}) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('Notification voice unavailable:', error?.message);
  }
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

function boloSummary(record) {
  const party = record?.parties?.[0] || null;
  const vehicle = record?.vehicles?.[0] || null;
  const subject = party?.name || record?.subject_name || '';
  const vehicleText = [vehicle?.year || record?.vehicle_year, vehicle?.color || record?.vehicle_color, vehicle?.make || record?.vehicle_make, vehicle?.model || record?.vehicle_model].filter(Boolean).join(' ');
  const plate = vehicle?.plate || record?.vehicle_plate || '';
  const details = [
    record?.title,
    subject && `Subject ${subject}`,
    vehicleText && `Vehicle ${vehicleText}`,
    plate && `Plate ${plate}`,
    record?.last_known_location && `Last known location ${record.last_known_location}`,
    record?.description,
  ].filter(Boolean);
  return details.join('. ') || 'Review the active BOLO for details.';
}

function propertyCallSummary(alert, call = {}) {
  const details = [
    alert?.propertyName && `Property ${alert.propertyName}`,
    (call.incident || alert?.callIncident) && `Call type ${call.incident || alert.callIncident}`,
    call.priority && `Priority ${call.priority}`,
    call.status && `Status ${call.status}`,
    (call.location || alert?.callLocation) && `Address ${call.location || alert.callLocation}`,
    call.cross_street && `Cross street ${call.cross_street}`,
    call.landmark && `Landmark ${call.landmark}`,
    call.agency && `Agency ${call.agency}`,
    call.zone && `Zone ${call.zone}`,
    (call.agency_cad_number || call.bps_reference || call.call_id) && `Call reference ${call.agency_cad_number || call.bps_reference || call.call_id}`,
    call.hazards && `Known hazards ${call.hazards}`,
    call.description && call.description !== `${call.incident} at ${call.location}` && `Details ${call.description}`,
  ].filter(Boolean);
  return details.join('. ') || 'Review the monitored property call for details.';
}

function BannerIcon({ kind }) {
  if (kind === 'property' || kind === 'bolo') return <Siren className="h-5 w-5 text-red-200" />;
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
        if (source.kind === 'message' && source.direct) {
          // Deliberately use the familiar phrase the user requested rather than a
          // generic notification tone. Keep it short so it does not delay the banner.
          speakNotification('You got mail', { rate: 0.82, pitch: 0.72 });
        } else {
          playNotificationChime(source.kind === 'property');
        }
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

    // BOLOs use their own global alert path because they must notify every
    // authorized user, including the person who issued the BOLO.
    const showBolo = record => {
      if (!record?.id || record.status !== 'active') return;
      const key = `BOLOAlert:${record.id}`;
      if (knownIds.current.has(key)) return;
      knownIds.current.add(key);

      const summary = boloSummary(record);
      playNotificationChime(true);
      speakNotification(`Be on the lookout. ${summary}`, { rate: 0.8, pitch: 0.72 });
      window.dispatchEvent(new CustomEvent('bps-unread-notification', {
        detail: { page: 'BOLOAlerts', key },
      }));

      const banner = {
        id: key,
        title: 'BE ON THE LOOKOUT',
        page: 'BOLOAlerts',
        kind: 'bolo',
        persistent: false,
        recordId: record.id,
        fingerprint: key,
        sender: `${String(record.priority || 'medium').toUpperCase()} PRIORITY${record.bolo_number ? ` · ${record.bolo_number}` : ''}`,
        photo: record.photo_urls?.[0] || '',
        message: summary,
      };
      setBanners(current => [...current.slice(-4), banner]);
      const timer = window.setTimeout(() => {
        setBanners(current => current.filter(entry => entry.id !== key));
        timers.current.delete(key);
      }, 30000);
      timers.current.set(key, timer);
    };

    const showPropertyCall = async record => {
      if (!record?.id) return;
      const key = `PropertyAlert:${record.id}`;
      if (knownIds.current.has(key)) return;
      knownIds.current.add(key);

      const call = record.callId
        ? await base44.entities.DispatchCall.get(record.callId).catch(() => null)
        : null;
      const summary = propertyCallSummary(record, call || {});
      playNotificationChime(true);
      // Use the exact same proven speech path as BOLO announcements.
      speakNotification(`Attention. New monitored property call. ${summary}`, { rate: 0.8, pitch: 0.72 });
      window.dispatchEvent(new CustomEvent('bps-unread-notification', {
        detail: { page: 'DispatchCenter', key },
      }));

      const banner = {
        id: key,
        title: 'MONITORED PROPERTY CALL',
        page: 'DispatchCenter',
        kind: 'property',
        persistent: false,
        recordId: record.id,
        fingerprint: key,
        sender: record.propertyName || 'Monitored Property',
        photo: '',
        message: summary,
      };
      setBanners(current => [...current.slice(-4), banner]);
      const timer = window.setTimeout(() => {
        setBanners(current => current.filter(entry => entry.id !== key));
        timers.current.delete(key);
      }, 30000);
      timers.current.set(key, timer);
    };

    try {
      const propertyUnsubscribe = base44.entities.PropertyAlert.subscribe(event => {
        if (event?.type !== 'create' || !event.data?.id) return;
        showPropertyCall(event.data);
      });
      if (typeof propertyUnsubscribe === 'function') unsubscribers.push(propertyUnsubscribe);

      // Match BOLO reliability: recover a call created while realtime was connecting.
      const propertyCutoff = Date.now() - 2 * 60 * 1000;
      base44.entities.PropertyAlert.list('-created_date', 20).then(records => {
        (records || []).slice().reverse().forEach(record => {
          const created = new Date(record.created_date || 0).getTime();
          if (created >= propertyCutoff) showPropertyCall(record);
        });
      }).catch(() => null);

      const boloUnsubscribe = base44.entities.BOLOAlert.subscribe(event => {
        if (event?.type !== 'create' || !event.data?.id) return;
        showBolo(event.data);
      });
      if (typeof boloUnsubscribe === 'function') unsubscribers.push(boloUnsubscribe);

      // Catch a newly issued BOLO if realtime delivery was missed while the page
      // was loading or the browser briefly lost its connection.
      const cutoff = Date.now() - 2 * 60 * 1000;
      base44.entities.BOLOAlert.list('-created_date', 20).then(records => {
        (records || []).slice().reverse().forEach(record => {
          const created = new Date(record.created_date || 0).getTime();
          if (record.status === 'active' && created >= cutoff) showBolo(record);
        });
      }).catch(() => null);
    } catch (error) {
      console.warn('Unable to subscribe to BOLO alerts:', error?.message);
    }

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

    const clearAnnouncementBanners = () => setBanners(current => current.filter(entry => entry.kind !== 'announcement'));
    window.addEventListener('bps-announcements-opened', clearAnnouncementBanners);

    try {
      const unsubscribeReceipts = base44.entities.AnnouncementReceipt.subscribe(event => {
        if (event?.type !== 'create' || normalized(event.data?.user_email) !== normalized(user.email)) return;
        const announcementId = event.data?.announcement_id;
        setBanners(current => current.filter(entry => !(entry.kind === 'announcement' && entry.recordId === announcementId)));
      });
      if (typeof unsubscribeReceipts === 'function') unsubscribers.push(unsubscribeReceipts);
    } catch (error) {
      console.warn('Unable to subscribe to announcement receipts:', error?.message);
    }

    // Reconcile direct messages on initial load and periodically. Realtime subscriptions
    // can be delayed when the browser is backgrounded, so an unread message must still
    // produce the same in-app "NEW MESSAGE" banner when the user returns.
    const messageSource = SOURCES.find(source => source.direct && source.entity === 'Message');
    const loadUnreadMessages = async () => {
      try {
        const unread = await base44.entities.Message.filter({ read: false }, '-created_date', 50);
        const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
        (unread || []).slice().reverse().forEach(record => {
          const created = new Date(record.created_date || 0).getTime();
          if (!created || created >= recentCutoff) showBanner(messageSource, record);
        });
      } catch (error) {
        console.warn('Unable to reconcile unread messages:', error?.message);
      }
    };
    loadUnreadMessages();
    const messagePoll = window.setInterval(loadUnreadMessages, 12000);

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
      window.removeEventListener('bps-announcements-opened', clearAnnouncementBanners);
      window.clearInterval(messagePoll);
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
    <div className="pointer-events-none fixed left-1/2 top-1 z-[220] flex w-[min(760px,calc(100vw-16px))] -translate-x-1/2 flex-col gap-2 md:top-2">
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
            className={`pointer-events-auto w-full overflow-hidden rounded-2xl border text-left text-white shadow-2xl backdrop-blur-xl ${banner.kind === 'property' || banner.kind === 'bolo' ? 'border-red-400/40 bg-red-950/95' : banner.kind === 'announcement' ? 'border-amber-300/35 bg-[#29200d]/95' : 'border-white/15 bg-[#111827]/95'}`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${banner.kind === 'property' || banner.kind === 'bolo' ? 'bg-red-600/30 ring-red-300/40' : banner.kind === 'announcement' ? 'bg-amber-500/25 ring-amber-200/30' : 'bg-blue-600/30 ring-blue-300/30'}`}>
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
            <div className={`h-1 origin-left animate-[shrink_20s_linear_forwards] ${banner.kind === 'property' || banner.kind === 'bolo' ? 'bg-red-400' : banner.kind === 'announcement' ? 'bg-amber-300' : 'bg-blue-400'}`} />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
