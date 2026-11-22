const imageExtensions=new Set(['jpg','jpeg','jfif','png','apng','webp','gif','avif','heic','heif','bmp','tif','tiff','svg','ico','jxl']);
const videoExtensions=new Set(['mp4','mov','m4v','webm','mkv','avi','mpg','mpeg','mpe','3gp','3g2','mts','m2ts','ts','ogv','ogg','wmv','flv','vob']);
const documentExtensions=new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','csv','html','htm','xml','json','zip','exe','js']);
export const showcaseAccept='image/*,video/*,.mov,.m4v,.mkv,.avi,.mpg,.mpeg,.3gp,.3g2,.mts,.m2ts,.ts,.wmv,.flv,.heic,.heif,.tif,.tiff,.avif,.bmp,.svg,.gif,.jxl';
export const mediaExtension=file=>String(file?.name||'').split('.').pop().toLowerCase();
export function showcaseMediaKind(file){
 const ext=mediaExtension(file),type=String(file?.type||'').toLowerCase();
 if(documentExtensions.has(ext)||type.startsWith('application/pdf')||type.startsWith('text/')||/officedocument|msword|spreadsheet|presentation/.test(type))throw Error('Choose a photo or video. Documents are not part of the login gallery.');
 const kind=videoExtensions.has(ext)||type.startsWith('video/')?'video':imageExtensions.has(ext)||type.startsWith('image/')?'photo':'';
 if(!kind)throw Error('This is not a recognized photo or video file.');
 if(file.size>(kind==='video'?250:50)*1024*1024)throw Error(kind==='video'?'Choose a video under 250 MB.':'Choose a photo under 50 MB.');
 return kind;
}
export const videoConversionArgs=(input,output)=>['-i',input,'-map','0:v:0','-map','0:a?','-vf',"scale='min(1280,iw)':-2,fps=30",'-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',output];
let converter,converterLoading;
async function getConverter(onProgress){
 if(converter?.loaded)return converter;
 if(converterLoading)return converterLoading;
 converterLoading=(async()=>{
  onProgress('Preparing media conversion…');
  const [{FFmpeg},{default:coreURL},{default:wasmURL}]=await Promise.all([import('@ffmpeg/ffmpeg'),import('@ffmpeg/core?url'),import('@ffmpeg/core/wasm?url')]);
  const engine=new FFmpeg();
  await engine.load({classWorkerURL:new URL('/media-converter/worker.js',window.location.origin).href,coreURL:new URL(coreURL,window.location.origin).href,wasmURL:new URL(wasmURL,window.location.origin).href});
  converter=engine;return engine;
 })();
 try{return await converterLoading;}finally{converterLoading=null;}
}
const imageBlob=(blob)=>new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(blob),image=new Image();
 image.onload=()=>{try{const ratio=Math.min(1,1920/image.naturalWidth,1440/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(result=>result?resolve(result):reject(Error('Unable to prepare this image.')),'image/webp',.88);}catch(error){reject(error);}finally{URL.revokeObjectURL(url);}};
 image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('This photo needs conversion.'));};image.src=url;
});
export async function prepareShowcaseMedia(file,onProgress=()=>{}){
 const kind=showcaseMediaKind(file),ext=mediaExtension(file),base=String(file.name||'gallery').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,100)||'gallery';
 if(kind==='photo'){
  onProgress('Preparing photo…');
  if(['gif','apng'].includes(ext))return {kind,file,poster:null};
  let photo=file;
  if(['heic','heif'].includes(ext)||/image\/hei[cf]/i.test(file.type)){
   const {default:heic2any}=await import('heic2any');
   const converted=await heic2any({blob:file,toType:'image/jpeg',quality:.9});photo=Array.isArray(converted)?converted[0]:converted;
  }
  try{const ready=await imageBlob(photo);return {kind,file:new File([ready],base+(ready.type==='image/webp'?'.webp':'.png'),{type:ready.type}),poster:null};}catch{
   const engine=await getConverter(onProgress),input='image-input.'+ext,output='image-output.png';
   try{await engine.writeFile(input,new Uint8Array(await file.arrayBuffer()));const code=await engine.exec(['-i',input,'-frames:v','1',output],120000);if(code!==0)throw Error('The photo could not be converted. Choose another photo file.');const bytes=await engine.readFile(output);const ready=await imageBlob(new Blob([bytes],{type:'image/png'}));return {kind,file:new File([ready],base+'.webp',{type:ready.type}),poster:null};}finally{await engine.deleteFile(input).catch(()=>{});await engine.deleteFile(output).catch(()=>{});}
  }
 }
 const engine=await getConverter(onProgress),input='video-input.'+ext,output='video-output.mp4',poster='video-poster.jpg';
 const progress=({progress})=>onProgress('Preparing video for playback · '+Math.max(0,Math.min(99,Math.round(progress*100)))+'%');
 engine.on('progress',progress);
 try{
  onProgress('Reading video…');await engine.writeFile(input,new Uint8Array(await file.arrayBuffer()));
  const code=await engine.exec(videoConversionArgs(input,output),600000);if(code!==0)throw Error('This video could not be converted. The file may be damaged or use an unsupported codec.');
  const bytes=await engine.readFile(output);let thumbnail=null;
  if(await engine.exec(['-i',output,'-frames:v','1','-q:v','3',poster],30000)===0){const photo=await engine.readFile(poster);thumbnail=new File([photo],base+'-poster.jpg',{type:'image/jpeg'});}
  return {kind,file:new File([bytes],base+'.mp4',{type:'video/mp4'}),poster:thumbnail};
 }finally{engine.off('progress',progress);await Promise.all([input,output,poster].map(path=>engine.deleteFile(path).catch(()=>{})));}
}
export async function uploadShowcaseMedia(file,{upload,onProgress=()=>{}}={}){
 const prepared=await prepareShowcaseMedia(file,onProgress);
 onProgress('Uploading '+(prepared.kind==='video'?'video':'photo')+'…');
 const result=await upload(prepared.file);const url=result?.file_url;if(!url)throw Error('Media upload did not return a saved file.');
 let poster='';if(prepared.poster){const saved=await upload(prepared.poster);poster=saved?.file_url||'';}
 return {kind:prepared.kind,image_url:prepared.kind==='photo'?url:poster,video_url:prepared.kind==='video'?url:'',title:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')};
}
