import { useEffect } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { announceVoiceAsync, cancelVoiceEvent } from '@/utils/voiceAnnouncer';

// Mounted by Layout so page navigation cannot disconnect operational audio.
export default function CadVoiceBroadcastMonitor({ user }) {
  useEffect(() => {
    if (!user?.id || !user?.email) return;
    let disposed = false, busy = false, timer, speakingId, lastRecovery = 0, needsAudioUnlock = false;
    const keyFor = id => 'bps:cad-broadcast-played:' + user.id + ':' + id;
    const invoke = async payload => {
      const response = await base44.functions.invoke('cad-voice-broadcast', payload);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    };
    const process = async record => {
      if (disposed) return;
      const eventId = 'cad-broadcast:' + user.id + ':' + record.id;
      const deliver = async () => {
        if (disposed) return;
        let played = false;
        try { played = localStorage.getItem(keyFor(record.id)) === '1' || localStorage.getItem('bps-voice-event:' + eventId) === '1'; } catch {}
        if (!played) {
          speakingId = eventId;
          // Duty is checked on the server at playback, including after time spent
          // queued behind emergency traffic. A new shift never inherits old audio.
          const timeout = window.setTimeout(() => cancelVoiceEvent(eventId), 120000);
          try {
            played = await announceVoiceAsync(record.message, {
              eventId, force:true, priority:'high', managedRecovery:true, dedupeMs:0,
              canPlay:async () => {
                if (disposed) return false;
                clearBase44ReadCacheMatching('function:cad-voice-broadcast:');
                const result = await invoke({action:'check',broadcast_id:record.id});
                return !disposed && result.eligible === true;
              },
            });
          } finally { window.clearTimeout(timeout); speakingId = null; }
          needsAudioUnlock = !played;
          if (played) { try { localStorage.setItem(keyFor(record.id), '1'); } catch {} }
        }
        // A failed acknowledgement is retried during recovery without speaking again.
        if (played && !disposed) await invoke({action:'ack',broadcast_id:record.id});
      };
      if (navigator.locks?.request) await navigator.locks.request(eventId, {ifAvailable:true}, lock => lock ? deliver() : undefined);
      else await deliver();
    };
    const schedule = (ms = 180000) => {
      window.clearTimeout(timer);
      if (!disposed) timer = window.setTimeout(recover, ms + Math.random() * (ms < 10000 ? 1000 : 10000));
    };
    const recover = async () => {
      if (disposed || busy || navigator.onLine === false) { schedule(); return; }
      busy = true; lastRecovery = Date.now();
      try {
        clearBase44ReadCacheMatching('function:cad-voice-broadcast:');
        const data = await invoke({action:'list'});
        for (const record of data.broadcasts || []) await process(record);
      } catch (error) {
        console.warn('CAD voice recovery will retry:', error?.message || 'Connection unavailable');
      } finally { busy = false; schedule(); }
    };
    const wake = () => { if (!busy) schedule(Math.max(300, 10000 - (Date.now() - lastRecovery))); };
    const unlock = () => { if (needsAudioUnlock) wake(); };
    const dutyChanged = event => {
      const row = event?.data;
      if (!row || String(row.officer_email || row.email || '').toLowerCase() !== user.email.toLowerCase()) return;
      if ((row.clock_out || String(row.status || '').toLowerCase() === 'out of service') && speakingId) cancelVoiceEvent(speakingId);
      wake();
    };
    const unsubscribers = [
      base44.entities.CadVoiceBroadcast.subscribe(event => { if (event.type === 'create') wake(); }),
      base44.entities.TimeEntry.subscribe(dutyChanged),
      base44.entities.User.subscribe(dutyChanged),
    ];
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pointerdown', unlock);
    schedule(1000);
    return () => {
      disposed = true; window.clearTimeout(timer);
      if (speakingId) cancelVoiceEvent(speakingId);
      unsubscribers.forEach(unsubscribe => unsubscribe?.());
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [user?.id, user?.email]);
  return null;
}
