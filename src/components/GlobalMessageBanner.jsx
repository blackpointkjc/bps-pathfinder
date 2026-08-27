import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, MessageCircle, Siren, Volume2, VolumeX, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { announceVoice, isVoiceEnabled, retryVoiceAnnouncement, setVoiceEnabled, setVoiceRuntimeConfig, stopVoice } from '@/utils/voiceAnnouncer';
import { cleanIncident } from '@/utils/callUtils';
import { getLocalReadAnnouncementIds } from '@/lib/announcementReadState';

const SOURCES = [
  // Microsoft Teams is the source of truth for Officer/Supervisor chat. Those
  // notifications are owned by TeamsNotificationMonitor so the local metadata
  // cache cannot produce a second banner/unread count for the same Teams message.
  { entity: 'Announcement', label: 'New Announcement', page: 'Announcements', kind: 'announcement' },
  { entity: 'ChatMention', label: 'You Were Mentioned', page: 'OfficerChat', kind: 'mention', mention: true },
  // CAD unit assignment/unassignment. manageCadUnitAssignment writes one of
  // these Notification rows to the assigned officer -- previously nothing
  // told them dispatch had put them on a call. Filtered to the current user
  // the same way ChatMention is (see the `assignment` check in showBanner).
  { entity: 'Notification', label: 'Assigned to Call', page: 'DispatchCenter', kind: 'assignment', assignment: 'call_assignment' },
  { entity: 'Notification', label: 'Unassigned from Call', page: 'DispatchCenter', kind: 'assignment', assignment: 'call_unassignment' },
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

function speakNotification(text, options = {}) {
  const { rate = 0.82, pitch = 0.68, dedupeMs = 1800, force = false, ...rest } = options;
  return announceVoice(text, {
    ...rest,
    rate,
    pitch,
    dedupeMs,
    force,
  });
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
  if (source.kind === 'assignment') {
    return {
      sender: record.source_name || 'Dispatch',
      message: record.message || record.title || 'A call assignment changed.',
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

const HIDDEN_EXISTING_CALL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);

function callStatusKey(value) {
  return normalized(value).replace(/[\s_-]+/g, '');
}

function propertyCallSummary(alert, call = {}) {
  const incident = cleanIncident({ ...call, incident: call.incident || alert?.callIncident || '', agency: call.agency || alert?.agency || '' });
  const address = call.location || alert?.callLocation || 'Address unavailable';
  const details = [
    `${incident}`,
    `At ${address}`,
    call.priority && `Priority ${call.priority}`,
    call.status && `Status ${call.status}`,
    alert?.propertyName && `Property ${alert.propertyName}`,
    call.cross_street && `Cross street ${call.cross_street}`,
    call.landmark && `Landmark ${call.landmark}`,
    call.agency && `Agency ${call.agency}`,
    call.zone && `Zone ${call.zone}`,
    (call.agency_cad_number || call.bps_reference || call.call_id) && `Call reference ${call.agency_cad_number || call.bps_reference || call.call_id}`,
    call.hazards && `Known hazards ${call.hazards}`,
    call.description && call.description !== `${call.incident} at ${call.location}` && `Additional information ${call.description}`,
  ].filter(Boolean);
  return details.join('. ');
}

function BannerIcon({ kind }) {
  if (kind === 'property' || kind === 'bolo' || kind === 'assignment') return <Siren className="h-5 w-5 text-red-200" />;
  if (kind === 'announcement') return <Bell className="h-5 w-5 text-amber-200" />;
  if (kind === 'mention') return <Bell className="h-5 w-5 animate-pulse text-fuchsia-200" />;
  return <MessageCircle className="h-5 w-5 text-blue-200" />;
}

export default function GlobalMessageBanner({ user }) {
  const [banners, setBanners] = useState([]);
  const [voiceWarning, setVoiceWarning] = useState(null);
  const [voiceEnabled, setVoiceEnabledState] = useState(() => isVoiceEnabled());
  const audioSettings = useRef({ enabled: true, volume: 1, voice_profile: 'american_ai', enabled_event_types: [] });
  const knownIds = useRef(new Set());
  const recentFingerprints = useRef(new Map());
  const timers = useRef(new Map());
  const announcedPropertyCallStatuses = useRef(new Map());

  useEffect(() => {
    const onVoiceBlocked = event => setVoiceWarning(event?.detail?.reason || 'Audio playback was blocked by this browser.');
    const onVoiceStarted = () => setVoiceWarning(null);
    window.addEventListener('bps-voice-blocked', onVoiceBlocked);
    window.addEventListener('bps-voice-started', onVoiceStarted);
    return () => {
      window.removeEventListener('bps-voice-blocked', onVoiceBlocked);
      window.removeEventListener('bps-voice-started', onVoiceStarted);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const applySettings = record => {
      if (!record || !active) return;
      audioSettings.current = { ...audioSettings.current, ...record };
      setVoiceRuntimeConfig({ volume: audioSettings.current.volume, voiceProfile: audioSettings.current.voice_profile });
    };
    base44.entities.CadAudioSettings.filter({ settings_key: 'global' }, '-updated_date', 1)
      .then(rows => applySettings(rows?.[0]))
      .catch(() => null);
    const unsubscribe = base44.entities.CadAudioSettings.subscribe(event => {
      if ((event?.type === 'create' || event?.type === 'update') && event.data?.settings_key === 'global') applySettings(event.data);
    });
    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

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
      if (source.assignment && (record.type !== source.assignment || normalized(record.recipient_email) !== normalized(user.email))) return;
      if (source.kind === 'announcement' && record.audience === 'supervisors' && user.role !== 'admin' && !roles.has('supervisor')) return;

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
          // Use concise CAD radio wording and the shared dispatch voice.
          speakNotification('Dispatch message received. Check your mobile data terminal.', { rate: 0.82, pitch: 0.68 });
        } else if (source.kind === 'assignment') {
          // The durable CallStatusLog event owns assignment speech. This targeted
          // notification remains visual so the officer receives the assignment
          // without creating a second competing announcement.
          playNotificationChime(true);
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
      // manageBolo publishes the durable CallStatusLog event that owns speech.
      // This BOLO subscription only owns the matching visual alert and chime.
      playNotificationChime(true);
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

    const activeMonitoredPropertyForAlert = async record => {
      if (!record?.callId || !record?.propertyId) return null;
      const location = await base44.entities.Location.get(record.propertyId).catch(() => null);
      if (!location || location.active === false || location.property_monitoring_enabled !== true) return null;
      return location;
    };

    const showPropertyCall = async record => {
      if (!record?.id) return;
      const key = `PropertyAlert:${record.id}`;
      if (knownIds.current.has(key)) return;
      knownIds.current.add(key);

      const call = record.callId
        ? await base44.entities.DispatchCall.get(record.callId).catch(() => null)
        : null;
      // Property-call speech is allowlisted by an active Property Monitoring site.
      // Never announce an orphaned/stale alert or a call for a disabled property.
      const monitoredProperty = await activeMonitoredPropertyForAlert(record);
      // Canceled calls may announce once through the live status-change listener,
      // but they must never be replayed or displayed as an existing active call.
      if (!call || !monitoredProperty || HIDDEN_EXISTING_CALL_STATUSES.has(normalized(call.status))) return;

      // PropertyAlert can contain duplicate rows for the same CAD call/property.
      // Announce once per call+status, regardless of how many alert rows arrive.
      const callKey = String(call.id || record.callId);
      const currentStatus = callStatusKey(call.status || 'new');
      if (announcedPropertyCallStatuses.current.get(callKey) === currentStatus) return;
      announcedPropertyCallStatuses.current.set(callKey, currentStatus);

      const summary = propertyCallSummary(record, call);
      const propertyEventKey = `property:${callKey}:${currentStatus}`;
      const settings = audioSettings.current;
      const enabledTypes = Array.isArray(settings.enabled_event_types) ? settings.enabled_event_types : [];
      const email = normalized(user.email);
      const priorAcknowledgements = email
        ? await Promise.all([
            base44.entities.PropertyAlertReceipt.filter({ event_key: propertyEventKey, user_email: email }, '-dismissed_at', 1).catch(() => []),
            // Backward compatibility for receipts created before the canonical
            // call+status event key was introduced.
            base44.entities.PropertyAlertReceipt.filter({ call_id: callKey, user_email: email }, '-dismissed_at', 1).catch(() => []),
          ]).then(results => results.flat())
        : [];
      if (priorAcknowledgements?.length) return;
      const priorReceipts = email
        ? await base44.entities.CadAnnouncementReceipt.filter({ event_key: propertyEventKey, user_email: email }, '-processed_at', 1).catch(() => [])
        : [];
      if (settings.enabled !== false && (!enabledTypes.length || enabledTypes.includes('property_alert')) && !priorReceipts?.length) {
        const accepted = speakNotification(`Property alert. ${summary}`, { rate: 0.82, pitch: 0.66, dedupeMs: 10000, eventId: propertyEventKey, priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal', volume: settings.volume, voiceProfile: settings.voice_profile });
        if (email) {
          base44.entities.CadAnnouncementReceipt.create({
            event_key: propertyEventKey,
            event_id: record.id,
            user_email: email,
            device_id: navigator.userAgent.slice(0, 250),
            state: accepted ? 'played' : (isVoiceEnabled() ? 'blocked' : 'quiet'),
            processed_at: new Date().toISOString(),
            cad_number: call.agency_cad_number || call.bps_reference || call.call_id || '',
            event_type: 'property_alert',
          }).catch(() => null);
        }
      }
      window.dispatchEvent(new CustomEvent('bps-unread-notification', {
        detail: { page: 'DispatchCenter', key },
      }));

      const banner = {
        id: key,
        title: 'ACTIVE CALL FOR SERVICE',
        page: 'DispatchCenter',
        kind: 'property',
        persistent: false,
        recordId: record.id,
        fingerprint: key,
        sender: record.propertyName || 'Monitored Property',
        photo: '',
        message: summary,
        propertyAcknowledgement: {
          alert_id: record.id,
          call_id: callKey,
          property_id: record.propertyId,
          event_key: propertyEventKey,
        },
      };
      setBanners(current => [...current.slice(-4), banner]);
      const timer = window.setTimeout(() => {
        setBanners(current => current.filter(entry => entry.id !== key));
        timers.current.delete(key);
      }, 30000);
      timers.current.set(key, timer);
    };

    try {
      // CallStatusLog is the durable source of verified transition events. A raw
      // DispatchCall fetch/update is never enough to create speech.
      const cadAuthorized = user.role === 'admin'
        || user.role === 'dispatch'
        || Boolean(user.dispatch_role)
        || roles.has('full_access')
        || roles.has('supervisor')
        || roles.has('cad_access');

      const showCadAnnouncementEvent = async record => {
        if (!record?.id || !record?.event_key || !record?.announcement_text || record.audio_enabled === false) return;
        if (record.sensitive === true && !cadAuthorized) return;
        const settings = audioSettings.current;
        const enabledTypes = Array.isArray(settings.enabled_event_types) ? settings.enabled_event_types : [];
        if (settings.enabled === false || (enabledTypes.length && !enabledTypes.includes(record.event_type))) return;
        const key = `CallStatusLog:${record.event_key}`;
        if (knownIds.current.has(key)) return;
        knownIds.current.add(key);
        const email = normalized(user.email);
        const existing = email
          ? await base44.entities.CadAnnouncementReceipt.filter({ event_key: record.event_key, user_email: email }, '-processed_at', 1).catch(() => [])
          : [];
        if (existing?.length) return;
        const accepted = speakNotification(record.announcement_text, {
          dedupeMs: 4000,
          eventId: record.event_key,
          priority: record.announcement_priority || 'normal',
          volume: settings.volume,
          voiceProfile: settings.voice_profile,
        });
        if (email) {
          base44.entities.CadAnnouncementReceipt.create({
            event_key: record.event_key,
            event_id: record.id,
            user_email: email,
            device_id: navigator.userAgent.slice(0, 250),
            state: accepted ? 'played' : (isVoiceEnabled() ? 'blocked' : 'quiet'),
            processed_at: new Date().toISOString(),
            cad_number: record.cad_number || '',
            event_type: record.event_type || '',
          }).catch(() => null);
        }
        // BOLOAlert realtime owns the BOLO visual card; this durable event owns
        // its one-time speech receipt. Avoid showing two visual banners.
        if (record.event_type === 'bolo_published') return;
        const banner = {
          id: key,
          title: String(record.event_type || 'CAD STATUS').replaceAll('_', ' ').toUpperCase(),
          page: 'DispatchCenter',
          kind: record.announcement_priority === 'emergency' ? 'property' : 'assignment',
          persistent: false,
          recordId: record.id,
          fingerprint: record.event_key,
          sender: record.cad_number ? `CAD ${record.cad_number}` : 'CAD Operations',
          photo: '',
          message: record.announcement_text,
        };
        setBanners(current => [...current.slice(-4), banner]);
        const timer = window.setTimeout(() => {
          setBanners(current => current.filter(entry => entry.id !== key));
          timers.current.delete(key);
        }, 30000);
        timers.current.set(key, timer);
      };

      const statusLogUnsubscribe = base44.entities.CallStatusLog.subscribe(event => {
        if (event?.type === 'create') showCadAnnouncementEvent(event.data);
      });
      if (typeof statusLogUnsubscribe === 'function') unsubscribers.push(statusLogUnsubscribe);

      // Seed existing rows as known. Refresh/reconnect must not replay history.
      base44.entities.CallStatusLog.list('-created_date', 500).then(records => {
        (records || []).forEach(record => {
          if (record?.event_key) knownIds.current.add(`CallStatusLog:${record.event_key}`);
        });
      }).catch(() => null);

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

      // Seed existing BOLOs as already known. Only a BOLO created after this
      // listener is active is announced. This prevents refresh/login replay.
      base44.entities.BOLOAlert.list('-created_date', 100).then(records => {
        (records || []).forEach(record => {
          if (!record?.id) return;
          knownIds.current.add(`BOLOAlert:${record.id}`);
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
        window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
      });
      if (typeof unsubscribeReceipts === 'function') unsubscribers.push(unsubscribeReceipts);
    } catch (error) {
      console.warn('Unable to subscribe to announcement receipts:', error?.message);
    }

    // Load announcements missed while the user was offline. A persistent banner
    // remains until the Announcements page is opened and records the view.
    const announcementSource = SOURCES.find(source => source.kind === 'announcement');
    Promise.all([
      base44.entities.Announcement.list('-created_date', 100),
      base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 5000),
    ]).then(([announcements, receipts]) => {
      const seen = getLocalReadAnnouncementIds(user.email);
      (receipts || []).forEach(receipt => {
        if (receipt?.announcement_id) seen.add(String(receipt.announcement_id));
      });
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
      unsubscribers.forEach(unsubscribe => unsubscribe());
      timers.current.forEach(timer => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, [user?.id, user?.email, user?.role, JSON.stringify(user?.additional_roles || [])]);

  const toggleQuietMode = () => {
    const enabled = !voiceEnabled;
    setVoiceEnabled(enabled);
    setVoiceEnabledState(enabled);
    if (!enabled) stopVoice();
  };

  const dismiss = async id => {
    const banner = banners.find(entry => entry.id === id);
    const receipt = banner?.propertyAcknowledgement;
    if (receipt && user?.email) {
      const userEmail = normalized(user.email);
      const existing = await Promise.all([
        base44.entities.PropertyAlertReceipt.filter({ event_key: receipt.event_key, user_email: userEmail }, '-dismissed_at', 1).catch(() => []),
        base44.entities.PropertyAlertReceipt.filter({ call_id: receipt.call_id, user_email: userEmail }, '-dismissed_at', 1).catch(() => []),
      ]).then(results => results.flat());
      if (!existing?.length) {
        await base44.entities.PropertyAlertReceipt.create({
          ...receipt,
          user_email: userEmail,
          action: 'acknowledged',
          dismissed_at: new Date().toISOString(),
        }).catch(error => console.warn('Unable to save property alert acknowledgement:', error?.message));
      }
    }
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setBanners(current => current.filter(entry => entry.id !== id));
  };

  return (
    <div className="pointer-events-none fixed left-1/2 top-1 z-[220] flex w-[min(760px,calc(100vw-16px))] -translate-x-1/2 flex-col gap-2 md:top-2">
      <div className="pointer-events-auto ml-auto">
        <button
          type="button"
          onClick={toggleQuietMode}
          aria-pressed={!voiceEnabled}
          aria-label={voiceEnabled ? 'Enable CAD quiet mode' : 'Disable CAD quiet mode'}
          className="flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur hover:bg-slate-900"
        >
          {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-amber-300" />}
          {voiceEnabled ? 'CAD AUDIO ON' : 'QUIET MODE'}
        </button>
      </div>
      {voiceWarning && (
        <div role="alert" className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-950/95 px-4 py-3 text-sm font-semibold text-amber-50 shadow-2xl">
          <span>CAD audio could not play. Visual alerts remain active.</span>
          <button type="button" onClick={() => { setVoiceEnabled(true); setVoiceEnabledState(true); retryVoiceAnnouncement(); }} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-300">RETRY AUDIO</button>
        </div>
      )}
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
              await dismiss(banner.id);
              window.location.href = createPageUrl(banner.page);
            }}
            className={`pointer-events-auto w-full overflow-hidden rounded-2xl border text-left text-white shadow-2xl backdrop-blur-xl ${banner.kind === 'property' || banner.kind === 'bolo' || banner.kind === 'assignment' ? 'border-red-400/40 bg-red-950/95' : banner.kind === 'announcement' ? 'border-amber-300/35 bg-[#29200d]/95' : 'border-white/15 bg-[#111827]/95'}`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${banner.kind === 'property' || banner.kind === 'bolo' || banner.kind === 'assignment' ? 'bg-red-600/30 ring-red-300/40' : banner.kind === 'announcement' ? 'bg-amber-500/25 ring-amber-200/30' : 'bg-blue-600/30 ring-blue-300/30'}`}>
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
            <div className={`h-1 origin-left animate-[shrink_20s_linear_forwards] ${banner.kind === 'property' || banner.kind === 'bolo' || banner.kind === 'assignment' ? 'bg-red-400' : banner.kind === 'announcement' ? 'bg-amber-300' : 'bg-blue-400'}`} />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
