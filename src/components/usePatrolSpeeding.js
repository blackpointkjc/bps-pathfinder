import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { subscribeLiveLocation } from '@/lib/liveLocationService';
import { announceVoice, isVoiceEnabled } from '@/utils/voiceAnnouncer';
import { advanceSpeedingEpisode, patrolSample, patrolSpeedLevel, shouldReportSpeeding } from '@/lib/patrolSpeeding';

// Use the existing live GPS stream; no additional GPS polling or map requests.
export function shouldAnnouncePatrolSpeedWarning({isAdmin=false,quiet=false,navMuted=false}={}) {
  // Administrator permission is required to silence this particular safety
  // alert. Officer and non-admin supervisor audio settings do not exempt it.
  return !isAdmin || !(quiet || navMuted);
}
export default function usePatrolSpeeding({user,limit,limitAt,road,source,estimated,navVoiceMuted=false}) {
  const [level,setLevel]=useState('unknown');
  const [reportStatus,setReportStatus]=useState('');
  const latest=useRef(null);
  const episode=useRef(null);
  const sendQueue=useRef(Promise.resolve());
  const lastVoice=useRef(0);
  const criteria=useRef({});

  const wasCritical=useRef(false);
  useEffect(()=>{
    criteria.current={userId:user?.id,isAdmin:user?.role==='admin',navVoiceMuted,limit,limitAt,road,source,estimated};
  },[user?.id,user?.role,navVoiceMuted,limit,limitAt,road,source,estimated]);

  const voiceAllowed=()=>{
    const c=criteria.current;
    return shouldAnnouncePatrolSpeedWarning({
      isAdmin:c.isAdmin,
      quiet:!isVoiceEnabled(),
      navMuted:c.navVoiceMuted
    });
  };
  const report=(event,completed=false)=>{
    if(!shouldReportSpeeding(event)||!criteria.current.userId)return;
    const time=Date.now();
    const snapshot={...event};
    const payload={
      event_id:snapshot.eventId,
      started_at:new Date(snapshot.startedAt).toISOString(),
      ended_at:completed?new Date(snapshot.last.timestamp).toISOString():undefined,
      completed,
      duration_seconds:Math.max(10,Math.round(snapshot.durationMs/1000)),
      critical_duration_seconds:Math.max(10,Math.round(snapshot.criticalDurationMs/1000)),
      distance_miles:snapshot.totalMiles,
      max_speed_mph:snapshot.maxSpeed,
      speed_limit_mph:snapshot.first.limit,
      max_over_mph:snapshot.maxExcess,
      road_name:snapshot.road,
      speed_limit_source:snapshot.source,
      gps_source:snapshot.last?.gpsSource||'Device GPS',
      gps_accuracy_m:snapshot.last.accuracy,
      samples:snapshot.samples
    };
    sendQueue.current=sendQueue.current.catch(()=>{}).then(async()=>{
      try {
        await base44.functions.invoke('reportPatrolSpeeding',payload);
        setReportStatus(completed?'Supervisor speed report finalized':'Supervisor speed review task created');
      }catch(error){
        // A transient network error should not silently lose the report.
        // Use one delayed retry only; 429 responses should not be hammered.
        const status=error?.response?.status;
        if(status!==429 && navigator.onLine){
          await new Promise(resolve=>window.setTimeout(resolve,6000));
          try {
            await base44.functions.invoke('reportPatrolSpeeding',payload);
            setReportStatus('Supervisor speed report synced');return;
          }catch { /* preserve the error state */ }
        }
        setReportStatus('Speed report could not sync; retry when connected');
      }
    });
    if(!completed && episode.current?.eventId===event.eventId)
      episode.current.lastReportAt=time;
  };

  useEffect(()=>{
    if(!user?.id)return undefined;
    const unsub=subscribeLiveLocation(fix=>{
      const c=criteria.current;
      if(!c.userId)return;
      const sample=patrolSample(fix,Number(c.limit),{
        estimated:c.estimated,
        limitAgeMs:Date.now()-Number(c.limitAt||0),
        road:c.road,source:c.source
      });
      if(!sample){
        // Never announce or accuse based on stale / coarse / missing road data.
        setLevel('unknown');
        wasCritical.current=false;
        return;
      }
      sample.gpsSource=String(fix.source||'Device GPS');
      latest.current=sample;
      const severity=patrolSpeedLevel(sample.speed,sample.limit);
      setLevel(previous=>previous===severity?previous:severity);
      if(severity==='critical'){
        if(voiceAllowed() && (!wasCritical.current||Date.now()-lastVoice.current>=20000)){
          announceVoice('You are speeding in your patrol vehicle. Slow down.',{
            priority:'high',force:true,canPlay:voiceAllowed,
            eventId:'patrol-speed-'+c.userId+'-'+sample.timestamp,
            dedupeMs:3000
          });
          lastVoice.current=Date.now();
        }
        wasCritical.current=true;
      }else wasCritical.current=false;
      const previous=episode.current;
      const next=advanceSpeedingEpisode(previous,sample);
      episode.current=next.episode;
      if(next.completed)report(next.completed,true);
      if(next.episode && shouldReportSpeeding(next.episode) &&
          Date.now()-Number(next.episode.lastReportAt||0)>=45000)
        report(next.episode,false);
    });
    return()=>{unsub(); if(episode.current && shouldReportSpeeding(episode.current))report(episode.current,true);};
  },[user?.id]);

  // Voice repeats while a trustworthy high-overage fix remains recent.
  useEffect(()=>{
    const interval=window.setInterval(()=>{
      const fix=latest.current;
      if(fix && Date.now()-fix.timestamp>45000 && episode.current){
        const interrupted=episode.current;
        episode.current=null;
        if(shouldReportSpeeding(interrupted))report(interrupted,true);
      }
      if(level!=='critical'||!fix||Date.now()-fix.timestamp>30000){
        if(level==='critical'&&fix&&Date.now()-fix.timestamp>30000)setLevel('unknown');
        return;
      }
      if(Date.now()-lastVoice.current<20000 || !voiceAllowed())return;
      announceVoice('You are speeding in your patrol vehicle. Slow down.',{
        priority:'high',force:true,canPlay:voiceAllowed,
        eventId:'patrol-speed-repeat-'+user?.id+'-'+Math.floor(Date.now()/20000),
        dedupeMs:3000
      });
      lastVoice.current=Date.now();
    },5000);
    return()=>window.clearInterval(interval);
  },[level,user?.id]);
  return {level,reportStatus};
}
