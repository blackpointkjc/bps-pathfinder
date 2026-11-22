import {useEffect,useState} from 'react';
const defaultVideo='https://media.base44.com/videos/public/694de31c7e0f5645fb95de52/8b3f7aa83_pathfinder-sign-in-background.mp4';
const defaultPoster='https://media.base44.com/images/public/694de31c7e0f5645fb95de52/a30c3100c_pathfinder_login_video_preview.jpg';
export default function LoginGalleryMedia({item,multiple=false,onNext,showDefault=true}){
 const [failed,setFailed]=useState(false);
 const source=item?.kind==='photo'?item.image_url:item?.video_url||defaultVideo;
 useEffect(()=>setFailed(false),[source]);
 if(!item&&!showDefault)return <div className="p-8 text-center text-xs font-bold tracking-widest text-amber-200">BLACKPOINT · FIELD OPERATIONS</div>;
 if(item?.kind==='photo'||failed)return <img className="bp-showcase-photo" src={failed?item?.image_url||defaultPoster:source} alt={item?.title||'BlackPoint fleet and operations'} onError={()=>{if(multiple)onNext?.();}}/>;
 return <video key={source} className="bp-login-fleet-video" src={source} autoPlay muted loop={!multiple} playsInline preload="metadata" poster={item?.image_url||defaultPoster} aria-label={item?.title||'BlackPoint security vehicles'} onEnded={()=>{if(multiple)onNext?.();}} onError={()=>{setFailed(true);if(multiple)onNext?.();}}/>;
}
