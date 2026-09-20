const CACHE="dender-county-shell-v9.0";
const CHUNK_CACHE="dender-county-geodata-v9.0";
const SHELL=["./","./index.html","./style.css","./game.js?v=7.2","./assets-manifest.json"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("dender-county-")&&![CACHE,CHUNK_CACHE].includes(k)).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin!==location.origin)return;
  const isGeo=u.pathname.includes("/geodata/chunks/")||u.pathname.endsWith("_runtime.geojson")||u.pathname.endsWith("_meta.json");
  if(isGeo){
    event.respondWith(caches.open(CHUNK_CACHE).then(async cache=>{
      const hit=await cache.match(req);
      const net=fetch(req).then(r=>{if(r.ok)cache.put(req,r.clone());return r}).catch(()=>hit);
      return hit||net;
    }));
    return;
  }
  event.respondWith(fetch(req).then(async r=>{
    if(r.ok){const c=await caches.open(CACHE);c.put(req,r.clone())}
    return r;
  }).catch(()=>caches.match(req)));
});