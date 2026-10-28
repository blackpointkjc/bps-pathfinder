const CACHE='pathfinder-offline-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/')).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='SAVE_ASSETS')event.waitUntil(caches.open(CACHE).then(cache=>Promise.all((event.data.urls||[]).filter(url=>{const u=new URL(url,self.location.origin);return u.origin===self.location.origin&&/\.(js|css|woff2?|svg|webp|png)$/.test(u.pathname)&&!u.pathname.includes('/api/');}).map(url=>cache.add(url).catch(()=>{})))));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);await cache.put('/',response.clone());}return response;}).catch(async()=>await caches.match('/')||Response.error()));return;
 }
 if(/\.(js|css|woff2?|svg|webp|png)$/.test(url.pathname))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone());}return response;})));
});
