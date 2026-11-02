// Compact inline portraits are stored in Pathfinder User records without paid
// Base44 upload integrations. Do not put multi-megabyte originals in an entity.
export async function compactProfilePhoto(value, maximum=640) {
  const input=String(value||'');
  if(!input.startsWith('data:image/'))return input;
  const image=await new Promise((resolve,reject)=>{
    const element=new Image();element.onload=()=>resolve(element);
    element.onerror=()=>reject(new Error('The cropped photo is not a supported image.'));
    element.src=input;
  });
  const factor=Math.min(1,maximum/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.82,0.68,0.52]){
    const url=canvas.toDataURL('image/jpeg',quality);
    if(url.length<280_000)return url;
  }
  throw new Error('The profile portrait is too large to store. Try a smaller crop.');
}
