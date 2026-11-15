export async function prepareToolLoaders(loaders,{onProgress=()=>{},minimumMs=700,concurrency=10,warmData=async()=>{}}={}){
 const started=Date.now(),failures=[];let index=0,completed=0;
 const total=loaders.length+1;
 onProgress({completed,total,label:'Preparing your tools'});
 await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,loaders.length))},async()=>{
  while(index<loaders.length){const load=loaders[index++];try{await load();}catch(error){failures.push(error);}completed++;onProgress({completed,total,label:'Preparing your tools'});}
 }));
 try{onProgress({completed,total,label:'Preparing workspace data'});await warmData();}catch(error){failures.push(error);}
 completed++;onProgress({completed,total,label:'Your workspace is ready'});
 const remaining=Math.max(0,minimumMs-(Date.now()-started));
 if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
 // Preloading is an optimization, never a gate. A tool that could not be
 // preloaded still loads on demand the moment it is opened, so a slow or
 // interrupted request must not lock the operator out of the workspace.
 if(failures.length)console.warn(`[Pathfinder] ${failures.length} workspace tool(s) could not be preloaded; they will load on demand.`);
}

export async function waitForWorkspaceIdle(isIdle,{quietMs=300,timeoutMs=45000,pollMs=75}={}){
 const started=Date.now();let quietSince=null;
 while(Date.now()-started<timeoutMs){
  if(isIdle()){quietSince??=Date.now();if(Date.now()-quietSince>=quietMs)return;}else quietSince=null;
  await new Promise(resolve=>setTimeout(resolve,pollMs));
 }
 throw new Error('Workspace data is still loading. Please retry preparation.');
}