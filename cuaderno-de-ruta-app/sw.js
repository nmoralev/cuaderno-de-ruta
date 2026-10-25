const CACHE='cuaderno-v4';
const SHELL=['/','/index.html','/styles.css','/app.js','/config.js','/vendor/supabase.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  // Datos y autenticación: siempre a la red, nunca desde caché.
  if(u.hostname.endsWith('.supabase.co'))return;
  // Tipografías: caché con actualización en segundo plano.
  if(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(hit=>{const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}).catch(()=>hit);return hit||net})));return}
  if(u.origin!==location.origin)return;
  // Páginas: red primero, caché si no hay conexión.
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('/index.html',cp));return res}).catch(()=>caches.match('/index.html')));return}
  // Archivos de la app: caché primero y se actualiza en segundo plano.
  e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(hit=>{const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}).catch(()=>hit);return hit||net})))
});
