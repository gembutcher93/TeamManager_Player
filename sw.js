const CACHE_VERSION='vtm-player-v19';
const APP_SHELL=['./','./index.html','./app.js','./manifest.json','./icons/logo-badge.png','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png','./body/male.png','./body/female.png','./body/male_back.png','./body/female_back.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_VERSION).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE_VERSION).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin===self.location.origin){e.respondWith(caches.match(r).then(c=>c||fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE_VERSION).then(ch=>ch.put(r,cp));return res;}).catch(()=>caches.match('./index.html'))));}
  else{e.respondWith(caches.open(CACHE_VERSION).then(ch=>ch.match(r).then(c=>{const n=fetch(r).then(res=>{ch.put(r,res.clone());return res;}).catch(()=>c);return c||n;})));}});
