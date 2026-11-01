export async function prepareToolLoaders(loaders,{onProgress=()=>{},minimumMs=3000,concurrency=6,warmData=async()=>{}}={}){
 const started=Date.now(),failures=[];let index=0,completed=0;
 const total=loaders.length+1;
 onProgress({completed,total,label:'Preparing your tools'});
 await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,loaders.length))},async()=>{
  while(index<loaders.length){const load=loaders[index++];try{await load();}catch(error){failures.push(error);}completed++;onProgress({completed,total,label:'Preparing your tools'});}
 }));
 try{onProgress({completed,total,label:'Preparing workspace data'});await warmData();}catch(error){failures.push(error);}
 completed++;onProgress({completed,total,label:failures.length?'Preparation needs attention':'Your workspace is ready'});
 const remaining=Math.max(0,minimumMs-(Date.now()-started));
 if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
 if(failures.length)throw new Error('Some workspace tools could not be prepared. Please retry.');
}

export async function waitForWorkspaceIdle(isIdle,{quietMs=300,timeoutMs=45000,pollMs=75}={}){
 const started=Date.now();let quietSince=null;
 while(Date.now()-started<timeoutMs){
  if(isIdle()){quietSince??=Date.now();if(Date.now()-quietSince>=quietMs)return;}else quietSince=null;
  await new Promise(resolve=>setTimeout(resolve,pollMs));
 }
 throw new Error('Workspace data is still loading. Please retry preparation.');
}
