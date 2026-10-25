(function(){'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SPORT={run:{label:'Correr',one:'Carrera',vb:'Carrera'},ride:{label:'Ciclismo',one:'Rodada'}};
const S={acts:[],view:'boot',sport:'all',period:'month',sel:null,mapBy:'pace',loaded:false,user:null,authMode:'in',authMsg:'',authEmail:'',busy:false,pending:[],err:null,more:40,confirm:false};

/* ---------- formatos ---------- */
const nf=d=>new Intl.NumberFormat('es-CL',{minimumFractionDigits:d,maximumFractionDigits:d});
const f0=nf(0),f1=nf(1),f2=nf(2);
function dur(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(r).padStart(2,'0'):m+':'+String(r).padStart(2,'0')}
function durLong(s){const h=Math.floor(s/3600),m=Math.round(s%3600/60);return h?h+' h '+String(m).padStart(2,'0')+' min':m+' min'}
function pace(p){if(!isFinite(p)||p<=0)return'–';let m=Math.floor(p/60),r=Math.round(p%60);if(r===60){m++;r=0}return m+':'+String(r).padStart(2,'0')}
const kmh=a=>a.dist/1000/(a.time/3600);
const spk=a=>a.time/(a.dist/1000);
const metric=a=>a.sport==='run'?pace(spk(a))+' /km':f1.format(kmh(a))+' km/h';
const dShort=i=>new Date(i).toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'});
const dFull=i=>new Date(i).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const tClock=i=>new Date(i).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false});
const monthName=i=>new Date(i).toLocaleDateString('es-CL',{month:'long',year:'numeric'});
function newId(){return'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function autoName(sport,iso){const h=new Date(iso).getHours();const p=h<12?'de la mañana':h<19?'de la tarde':'de la noche';return(sport==='run'?'Carrera ':'Rodada ')+p}

/* ---------- geometría y métricas ---------- */
const R=6371000,rad=Math.PI/180;
function hav(a,b){const x=(b.lat-a.lat)*rad,y=(b.lon-a.lon)*rad;const h=Math.sin(x/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function build(raw,meta){
  let d=0,mov=0,gain=0,ref=null,hs=0,hn=0;const n=raw.length,cum=new Array(n);cum[0]=0;
  for(let i=0;i<n;i++){const p=raw[i];
    if(i>0){const q=raw[i-1],seg=p.brk?0:hav(q,p),dt=(p.t-q.t)/1000;d+=seg;if(!p.brk&&dt>0&&dt<60&&seg/dt>0.4)mov+=dt;cum[i]=d}
    if(p.ele!=null){if(ref==null)ref=p.ele;else if(p.ele>ref+3){gain+=p.ele-ref;ref=p.ele}else if(p.ele<ref-3)ref=p.ele}
    if(p.hr){hs+=p.hr;hn++}}
  const el=(raw[n-1].t-raw[0].t)/1000,m=Math.min(n,1500),pts=[];
  for(let k=0;k<m;k++){const i=m===1?0:Math.round(k*(n-1)/(m-1)),p=raw[i];
    pts.push([Math.round(p.lat*1e5)/1e5,Math.round(p.lon*1e5)/1e5,p.ele==null?null:Math.round(p.ele*10)/10,Math.round((p.t-raw[0].t)/1000),Math.round(cum[i])])}
  const sport=meta.sport||(d/Math.max(mov,1)>4.5?'ride':'run'),start=new Date(raw[0].t).toISOString();
  return{id:meta.id||newId(),sport,name:meta.name||autoName(sport,start),start,dist:Math.round(d),time:Math.round(mov||el),elapsed:Math.round(el),elev:Math.round(gain),hr:hn?Math.round(hs/hn):null,pts,src:meta.src||'gpx'}
}
function guessSport(s){s=String(s||'').toLowerCase();if(/bik|cycl|ride|ciclis|bici/.test(s))return'ride';if(/run|corr/.test(s))return'run';return null}
function parseTrack(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('El archivo no es un GPX o TCX válido.');
  const root=doc.documentElement.localName.toLowerCase();
  const g=(el,n)=>{const e=el.getElementsByTagNameNS('*',n)[0];return e?e.textContent.trim():''};
  const raw=[];let sport=null,name=null;
  if(root==='gpx'){
    const trk=doc.getElementsByTagNameNS('*','trk')[0];
    if(trk){sport=guessSport(g(trk,'type'));name=g(trk,'name')||null}
    for(const el of doc.getElementsByTagNameNS('*','trkpt')){
      const lat=parseFloat(el.getAttribute('lat')),lon=parseFloat(el.getAttribute('lon')),t=Date.parse(g(el,'time'));
      if(!isFinite(lat)||!isFinite(lon)||!isFinite(t))continue;
      const ele=parseFloat(g(el,'ele')),hr=parseInt(g(el,'hr'),10);
      raw.push({lat,lon,t,ele:isFinite(ele)?ele:null,hr:isFinite(hr)?hr:null})}
  }else if(root==='trainingcenterdatabase'){
    const act=doc.getElementsByTagNameNS('*','Activity')[0];if(act)sport=guessSport(act.getAttribute('Sport'));
    for(const el of doc.getElementsByTagNameNS('*','Trackpoint')){
      const lat=parseFloat(g(el,'LatitudeDegrees')),lon=parseFloat(g(el,'LongitudeDegrees')),t=Date.parse(g(el,'Time'));
      if(!isFinite(lat)||!isFinite(lon)||!isFinite(t))continue;
      const ele=parseFloat(g(el,'AltitudeMeters')),hr=parseInt(g(el,'Value'),10);
      raw.push({lat,lon,t,ele:isFinite(ele)?ele:null,hr:isFinite(hr)?hr:null})}
  }else throw new Error('Solo se aceptan archivos GPX o TCX.');
  if(raw.length<2)throw new Error('No encontré puntos con ubicación y hora.');
  raw.sort((a,b)=>a.t-b.t);
  return{raw,sport,name}
}
const bestMemo=new Map();
function bestEffort(a,T){
  if(a.best&&a.best[T]!=null)return a.best[T];if(a.best&&!a.pts)return null;if(!a.pts||a.pts.length<2||a.dist<T)return null;
  const k=a.id+':'+T;if(bestMemo.has(k))return bestMemo.get(k);
  const p=a.pts;let best=Infinity,j=0;
  for(let i=0;i<p.length-1;i++){
    if(j<i)j=i;
    while(j<p.length&&p[j][4]-p[i][4]<T)j++;
    if(j>=p.length)break;
    const dd=p[j][4]-p[j-1][4],f=dd>0?(p[i][4]+T-p[j-1][4])/dd:1;
    const te=p[j-1][3]+f*(p[j][3]-p[j-1][3]),e=te-p[i][3];
    if(e<best)best=e}
  const r=isFinite(best)?best:null;bestMemo.set(k,r);return r
}
function splitsOf(a){
  const p=a.pts;if(!p||p.length<2)return[];
  const tot=p[p.length-1][4],rows=[];let i=1,prevT=0,prevE=p[0][2],prevD=0;
  const at=D=>{while(i<p.length-1&&p[i][4]<D)i++;const dd=p[i][4]-p[i-1][4],f=dd>0?(D-p[i-1][4])/dd:1;
    return{t:p[i-1][3]+f*(p[i][3]-p[i-1][3]),e:p[i-1][2]==null||p[i][2]==null?null:p[i-1][2]+f*(p[i][2]-p[i-1][2])}};
  for(let D=1000;D<=tot;D+=1000){const q=at(D);rows.push({km:D/1000,dist:1000,sec:q.t-prevT,de:q.e==null||prevE==null?null:q.e-prevE});prevT=q.t;prevE=q.e;prevD=D}
  const rest=tot-prevD;
  if(rest>=100){const t1=p[p.length-1][3],e1=p[p.length-1][2];rows.push({km:Math.round((prevD+rest)/10)/100,dist:rest,sec:(t1-prevT)/(rest/1000),de:e1==null||prevE==null?null:e1-prevE,partial:true})}
  return rows
}


/* ---------- datos (Supabase) ---------- */
const CFG=window.APP_CONFIG;
const sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const COLS='id,sport,name,start_at,dist,time,elapsed,elev,hr,src,thumb,best';
const TARGETS={run:[1000,5000,10000,21097],ride:[10000,20000,40000,100000]};
const rowToAct=r=>({id:r.id,sport:r.sport,name:r.name,start:new Date(r.start_at).toISOString(),dist:r.dist,time:r.time,elapsed:r.elapsed||r.time,elev:r.elev||0,hr:r.hr,src:r.src,thumb:r.thumb||null,best:r.best||{},pts:r.pts});
function actToRow(a){
  const best={};
  if(a.pts)for(const T of TARGETS[a.sport]){const e=bestEffort(Object.assign({},a,{best:null,id:a.id+a.sport}),T);if(e!=null)best[T]=Math.round(e*10)/10}
  let thumb=null;
  if(a.pts&&a.pts.length>1){const st=Math.max(1,Math.floor(a.pts.length/80));thumb=[];for(let i=0;i<a.pts.length;i+=st)thumb.push([a.pts[i][0],a.pts[i][1]]);const l=a.pts[a.pts.length-1];thumb.push([l[0],l[1]])}
  return{id:a.id,sport:a.sport,name:a.name,start_at:a.start,dist:a.dist,time:a.time,elapsed:a.elapsed,elev:a.elev,hr:a.hr,src:a.src||null,thumb,best,pts:a.pts||null}
}
const sortActs=()=>S.acts.sort((a,b)=>a.start<b.start?1:-1);
const store={
  async load(){let all=[],from=0;for(;;){const{data,error}=await sb.from('activities').select(COLS).order('start_at',{ascending:false}).range(from,from+999);if(error)throw error;all=all.concat(data);if(data.length<1000)break;from+=1000}return all.map(rowToAct)},
  async loadFull(){let all=[],from=0;for(;;){const{data,error}=await sb.from('activities').select(COLS+',pts').order('start_at',{ascending:true}).range(from,from+14);if(error)throw error;all=all.concat(data);if(data.length<15)break;from+=15}return all.map(rowToAct)},
  async save(a){
    const row=actToRow(a),{error}=await sb.from('activities').upsert(row,{onConflict:'user_id,id'});if(error)throw error;
    const local=rowToAct(Object.assign({},row,{pts:undefined}));
    S.acts=S.acts.filter(x=>x.id!==a.id);S.acts.push(local);sortActs()
  },
  async patch(id,p){const{error}=await sb.from('activities').update(p).eq('id',id);if(error)throw error;S.acts=S.acts.map(x=>x.id===id?Object.assign({},x,p):x)},
  async remove(id){const{error}=await sb.from('activities').delete().eq('id',id);if(error)throw error;S.acts=S.acts.filter(x=>x.id!==id)},
  async pts(id){const{data,error}=await sb.from('activities').select('pts').eq('id',id).maybeSingle();if(error)throw error;return data?data.pts:null}
};
let chain=Promise.resolve();
function queue(fn){chain=chain.then(fn).catch(e=>{S.err='No se pudo completar la acción'+(e&&e.message?' ('+e.message+')':'')+'.';renderNotices()});return chain}
const ptsLoading=new Set();
function ensurePts(a){
  if(!a||a.pts!==undefined||ptsLoading.has(a.id))return;
  ptsLoading.add(a.id);
  store.pts(a.id).then(p=>{a.pts=p},()=>{a.pts=null}).finally(()=>{ptsLoading.delete(a.id);render()})
}
let lastLoad=0;
async function refresh(){
  try{S.acts=await store.load();sortActs();S.loaded=true;S.err=null;lastLoad=Date.now()}
  catch(e){S.loaded=true;S.err=navigator.onLine===false?'Sin conexión. Mostrando lo último que pude cargar.':'No pude cargar tus actividades ('+(e&&e.message||'error')+').'}
  if(S.view!=='add')render();else renderNotices()
}

/* ---------- cuenta ---------- */
const AUTH_ERR=[[/invalid login credentials/i,'Correo o contraseña incorrectos.'],[/email not confirmed/i,'Falta confirmar tu correo. Revisa tu bandeja de entrada.'],[/already registered|already been registered/i,'Ya existe una cuenta con ese correo. Prueba iniciar sesión.'],[/at least|weak|short|password should/i,'La contraseña debe tener al menos 8 caracteres.'],[/rate limit|too many|security purposes|after \d+ seconds/i,'Demasiados intentos. Espera unos minutos y vuelve a intentar.'],[/valid email|invalid format|unable to validate email|invalid email/i,'Escribe un correo válido.'],[/same password|different from the old/i,'La contraseña nueva debe ser distinta a la actual.'],[/network|failed to fetch|load failed/i,'No hay conexión. Revisa tu internet.']];
const authErr=e=>{const m=(e&&e.message)||'';for(const[r,t]of AUTH_ERR)if(r.test(m))return t;return'No se pudo completar la acción'+(m?' ('+m+')':'')+'.'};
async function doAuth(){
  const email=($('#a-email').value||'').trim(),pw=$('#a-pw')?$('#a-pw').value:'';
  S.authEmail=email;S.authMsg='';
  if(!/^\S+@\S+\.\S+$/.test(email)){S.authMsg='err:Escribe un correo válido.';return render()}
  if(S.authMode!=='forgot'&&pw.length<(S.authMode==='up'?8:1)){S.authMsg='err:'+(S.authMode==='up'?'La contraseña debe tener al menos 8 caracteres.':'Escribe tu contraseña.');return render()}
  S.busy=true;render();
  try{
    if(S.authMode==='in'){const{error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error}
    else if(S.authMode==='up'){
      const{data,error}=await sb.auth.signUp({email,password:pw,options:{emailRedirectTo:SITE}});if(error)throw error;
      if(!data.session){S.authMode='in';S.authMsg='ok:Te enviamos un correo para confirmar tu cuenta. Cuando lo confirmes, inicia sesión.'}}
    else{const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:SITE});if(error)throw error;S.authMode='in';S.authMsg='ok:Si existe una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva.'}
  }catch(e){S.authMsg='err:'+authErr(e)}
  S.busy=false;if(!S.user)render()
}
async function setPassword(id,fromRecovery){
  const pw=$('#'+id).value;
  if(pw.length<8){const m='La contraseña debe tener al menos 8 caracteres.';if(fromRecovery){S.authMsg='err:'+m;return render()}return toast(m)}
  S.busy=true;if(fromRecovery)render();
  const{error}=await sb.auth.updateUser({password:pw});S.busy=false;
  if(error){const m=authErr(error);if(fromRecovery){S.authMsg='err:'+m;return render()}return toast(m)}
  $('#'+id).value='';toast('Contraseña actualizada');
  if(fromRecovery){S.authMsg='';history.replaceState(null,'',location.pathname);S.view='home';render();refresh()}
}
sb.auth.onAuthStateChange((ev,session)=>{setTimeout(()=>{
  if(ev==='PASSWORD_RECOVERY'){S.user=session&&session.user;S.view='recover';S.authMsg='';render();return}
  if(session&&session.user){
    const first=!S.user||S.user.id!==session.user.id;S.user=session.user;
    if(first){S.loaded=false;S.acts=[];if(S.view==='boot'||S.view==='auth')S.view='home';render();refresh()}else renderNotices()
  }else{S.user=null;S.acts=[];S.loaded=false;S.pending=[];S.sel=null;S.view='auth';S.authMode='in';render()}
},0)});

/* ---------- color y trabajos de dibujo por ancho ---------- */
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function hex2rgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255]}
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return'rgb('+A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')+')'}
let jobs=[],ro=null;
function job(fn){jobs.push(fn);return'<div class="chart" data-j="'+(jobs.length-1)+'"></div>'}
function drawJob(el){const w=Math.floor(el.clientWidth)||320;if(el._w===w&&el._k===el.dataset.j)return;el._w=w;el._k=el.dataset.j;const f=jobs[+el.dataset.j];el.innerHTML=f?f(w):''}
function mountJobs(){
  if(ro)ro.disconnect();
  if(window.ResizeObserver)ro=new ResizeObserver(es=>es.forEach(e=>drawJob(e.target)));
  document.querySelectorAll('.chart').forEach(el=>{drawJob(el);if(ro)ro.observe(el)})
}
function niceTicks(lo,hi,n){const span=hi-lo||1,raw=span/Math.max(1,n),pow=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/pow,step=(f<1.5?1:f<3?2:f<7?5:10)*pow,out=[];for(let v=Math.ceil(lo/step-1e-9)*step;v<=hi+1e-9;v+=step)out.push(+v.toFixed(10));return out}
const anchor=(x,w,m)=>x<m.l+14?'start':x>w-m.r-14?'end':'middle';

/* ---------- gráfico de línea / área ---------- */
function chartLine(o){
  const m={l:o.ml||44,r:10,t:10,b:24},w=o.w,h=o.h,iw=w-m.l-m.r,ih=h-m.t-m.b,xs=o.xs,ys=o.ys;
  let x0=xs[0],x1=xs[xs.length-1],y0=Infinity,y1=-Infinity;
  for(const y of ys){if(y==null)continue;if(y<y0)y0=y;if(y>y1)y1=y}
  if(!isFinite(y0))return'';
  if(o.yMin!=null)y0=o.yMin;if(o.yMax!=null)y1=o.yMax;
  if(y1-y0<1e-9){y0-=1;y1+=1}
  const pad=(y1-y0)*.08;if(o.yMin==null)y0-=pad;if(o.yMax==null)y1+=pad;
  const sx=x=>m.l+(x-x0)/((x1-x0)||1)*iw,sy=y=>m.t+(o.invert?(y-y0)/(y1-y0):1-(y-y0)/(y1-y0))*ih;
  let s='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(o.label||'Gráfico')+'">';
  for(const t of niceTicks(y0,y1,o.yTicks||4)){const y=sy(t);s+='<line class="grl" x1="'+m.l+'" x2="'+(w-m.r)+'" y1="'+y+'" y2="'+y+'"/><text class="ax" x="'+(m.l-6)+'" y="'+(y+4)+'" text-anchor="end">'+(o.yfmt?o.yfmt(t):t)+'</text>'}
  for(const t of(o.xTicks||niceTicks(x0,x1,Math.max(2,Math.floor(iw/90))))){const x=sx(t);s+='<text class="ax" x="'+x+'" y="'+(h-6)+'" text-anchor="'+anchor(x,w,m)+'">'+(o.xfmt?o.xfmt(t):t)+'</text>'}
  const st=Math.max(1,Math.floor(xs.length/iw));let d='',pen=false,first=null,last=null;
  for(let i=0;i<xs.length;i+=st){const y=ys[i];if(y==null){pen=false;continue}const X=sx(xs[i]).toFixed(1),Y=sy(y).toFixed(1);d+=(pen?'L':'M')+X+' '+Y;pen=true;if(first==null)first=X;last=X}
  if(o.area&&first!=null)s+='<path d="'+d+'L'+last+' '+(m.t+ih)+'L'+first+' '+(m.t+ih)+'Z" style="fill:'+o.color+';opacity:.16"/>';
  s+='<path d="'+d+'" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="stroke:'+o.color+'"/>';
  if(o.dots)for(let i=0;i<xs.length;i++){if(ys[i]!=null)s+='<circle cx="'+sx(xs[i]).toFixed(1)+'" cy="'+sy(ys[i]).toFixed(1)+'" r="3.6" style="fill:'+o.color+';stroke:var(--surface);stroke-width:1.5"/>'}
  return s+'</svg>'
}

/* ---------- barras apiladas por semana ---------- */
function chartBars(o){
  const m={l:40,r:8,t:10,b:24},w=o.w,h=o.h,iw=w-m.l-m.r,ih=h-m.t-m.b,n=o.labels.length;
  const tot=o.labels.map((_,i)=>o.series.reduce((a,s)=>a+s.vals[i],0)),ymax=Math.max(1,...tot)*1.08;
  const sy=v=>m.t+ih-v/ymax*ih,bw=iw/n,bar=Math.min(34,bw*.64),skip=Math.ceil(n*54/iw);
  let s='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(o.label)+'">';
  for(const t of niceTicks(0,ymax,3)){const y=sy(t);s+='<line class="grl" x1="'+m.l+'" x2="'+(w-m.r)+'" y1="'+y+'" y2="'+y+'"/><text class="ax" x="'+(m.l-6)+'" y="'+(y+4)+'" text-anchor="end">'+t+'</text>'}
  for(let i=0;i<n;i++){
    const cx=m.l+bw*(i+.5);let acc=0;
    for(const se of o.series){const v=se.vals[i];if(v<=0)continue;const y=sy(acc+v),hh=sy(acc)-y;s+='<rect x="'+(cx-bar/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bar.toFixed(1)+'" height="'+Math.max(1,hh).toFixed(1)+'" rx="1.5" style="fill:'+se.color+'"/>';acc+=v}
    if(i%skip===(n-1)%skip)s+='<text class="ax" x="'+cx.toFixed(1)+'" y="'+(h-6)+'" text-anchor="middle">'+o.labels[i]+'</text>'}
  return s+'</svg>'
}

/* ---------- mapa de ruta (sin mapa base) ---------- */
function project(pts,W,H,pad){
  let la0=1e9,la1=-1e9,lo0=1e9,lo1=-1e9;
  for(const p of pts){if(p[0]<la0)la0=p[0];if(p[0]>la1)la1=p[0];if(p[1]<lo0)lo0=p[1];if(p[1]>lo1)lo1=p[1]}
  const cl=Math.cos((la0+la1)/2*rad),dx=Math.max((lo1-lo0)*cl,1e-6),dy=Math.max(la1-la0,1e-6),sc=Math.min((W-2*pad)/dx,(H-2*pad)/dy),ox=(W-dx*sc)/2,oy=(H-dy*sc)/2;
  return{x:lon=>ox+(lon-lo0)*cl*sc,y:lat=>H-oy-(lat-la0)*sc,ppm:sc/111320}
}
function hasEle(a){return a.pts&&a.pts.some(p=>p[2]!=null)}
function metricSeries(a,mode){
  const p=a.pts,n=p.length,v=new Array(n);
  if(mode==='ele'&&hasEle(a)){let last=0;for(let i=0;i<n;i++){if(p[i][2]!=null)last=p[i][2];v[i]=last}}
  else{for(let i=0;i<n;i++){let i0=i,i1=i;while(p[i1][3]-p[i0][3]<25&&(i0>0||i1<n-1)){if(i0>0)i0--;if(i1<n-1)i1++}const dt=p[i1][3]-p[i0][3];v[i]=dt>0?(p[i1][4]-p[i0][4])/dt:0}}
  return v
}
function range(v){const s=v.slice().sort((a,b)=>a-b),q=f=>s[Math.min(s.length-1,Math.floor(f*(s.length-1)))];let lo=q(.05),hi=q(.95);if(hi-lo<1e-6)hi=lo+1;return[lo,hi]}
function mapMode(a,mode){return mode==='ele'&&hasEle(a)?'ele':'pace'}
function routeMap(a,w,mode){
  const p=a.pts;if(!p||p.length<2)return'';
  mode=mapMode(a,mode);const h=Math.round(Math.min(480,Math.max(260,w*.62))),pr=project(p,w,h,34);
  const slow=cssv('--slow')||'#9db0bc',fast=cssv(a.sport==='run'?'--run':'--ride')||'#c4440d';
  const v=metricSeries(a,mode),[lo,hi]=range(v),B=20,runs=[];let cur=null,all='';
  const X=i=>pr.x(p[i][1]),Y=i=>pr.y(p[i][0]);
  for(let i=1;i<p.length;i++){
    const t=Math.max(0,Math.min(.999,(v[i]-lo)/(hi-lo))),b=Math.floor(t*B),x0=X(i-1).toFixed(1),y0=Y(i-1).toFixed(1);
    if(!cur||cur.b!==b){cur={b,d:'M'+x0+' '+y0};runs.push(cur)}
    cur.d+='L'+X(i).toFixed(1)+' '+Y(i).toFixed(1)}
  all='M'+X(0).toFixed(1)+' '+Y(0).toFixed(1);for(let i=1;i<p.length;i++)all+='L'+X(i).toFixed(1)+' '+Y(i).toFixed(1);
  let s='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Mapa de la ruta de '+esc(a.name)+'">';
  const cands=[50,100,200,500,1000,2000,5000,10000,20000,50000];let sp=cands[cands.length-1];
  for(const c of cands){if(c*pr.ppm>=64){sp=c;break}}
  const g=sp*pr.ppm;
  for(let x=g;x<w;x+=g)s+='<line class="grl" x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="0" y2="'+h+'"/>';
  for(let y=h-g;y>0;y-=g)s+='<line class="grl" x1="0" x2="'+w+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/>';
  s+='<path d="'+all+'" fill="none" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" style="stroke:var(--surface)"/>';
  for(const r of runs)s+='<path d="'+r.d+'" fill="none" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" stroke="'+mix(slow,fast,(r.b+.5)/B)+'"/>';
  const totKm=a.dist/1000,stepKm=[1,2,5,10,20,50].find(k=>totKm/k<=9)||50;let nextKm=stepKm;
  for(let i=1;i<p.length;i++){if(p[i][4]>=nextKm*1000){const cx=X(i),cy=Y(i);s+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="9" style="fill:var(--surface);stroke:var(--muted);stroke-width:1"/><text x="'+cx.toFixed(1)+'" y="'+(cy+3.5).toFixed(1)+'" text-anchor="middle" style="fill:var(--ink);font:600 10px var(--body)">'+nextKm+'</text>';nextKm+=stepKm}}
  s+='<circle cx="'+X(0).toFixed(1)+'" cy="'+Y(0).toFixed(1)+'" r="6.5" style="fill:var(--ink);stroke:var(--surface);stroke-width:2.5"/>';
  const ex=X(p.length-1),ey=Y(p.length-1);
  s+='<rect x="'+(ex-6).toFixed(1)+'" y="'+(ey-6).toFixed(1)+'" width="12" height="12" rx="2" style="fill:var(--surface);stroke:var(--ink);stroke-width:3"/>';
  s+='<line x1="14" x2="'+(14+g).toFixed(1)+'" y1="'+(h-16)+'" y2="'+(h-16)+'" stroke-width="2" style="stroke:var(--ink)"/><line x1="14" x2="14" y1="'+(h-20)+'" y2="'+(h-12)+'" stroke-width="2" style="stroke:var(--ink)"/><line x1="'+(14+g).toFixed(1)+'" x2="'+(14+g).toFixed(1)+'" y1="'+(h-20)+'" y2="'+(h-12)+'" stroke-width="2" style="stroke:var(--ink)"/>';
  s+='<text class="ax" x="'+(22+g).toFixed(1)+'" y="'+(h-12)+'">'+(sp>=1000?sp/1000+' km':sp+' m')+' por cuadro</text>';
  s+='<text class="axl" x="'+(w-14)+'" y="22" text-anchor="end">N ↑</text>';
  return s+'</svg>'
}
function mapLegend(a,mode){
  mode=mapMode(a,mode);const v=metricSeries(a,mode),[lo,hi]=range(v);
  const slow=cssv('--slow')||'#9db0bc',fast=cssv(a.sport==='run'?'--run':'--ride')||'#c4440d';
  const f=x=>mode==='ele'?f0.format(x)+' m':a.sport==='run'?pace(1000/Math.max(x,.1))+' /km':f1.format(x*3.6)+' km/h';
  const l=mode==='ele'?'bajo':'lento',r=mode==='ele'?'alto':'rápido';
  return'<div class="legend"><span>'+l+' '+f(lo)+'</span><i style="background:linear-gradient(90deg,'+slow+','+fast+')"></i><span>'+r+' '+f(hi)+'</span></div>'
}
function thumb(a){
  const p=a.thumb||(a.pts?a.pts.map(q=>[q[0],q[1]]):null);
  if(!p||p.length<2)return'<svg viewBox="0 0 76 52" aria-hidden="true"><text x="38" y="30" text-anchor="middle" class="ax">manual</text></svg>';
  const pr=project(p,76,52,6);let d='';
  p.forEach((q,i)=>{d+=(i?'L':'M')+pr.x(q[1]).toFixed(1)+' '+pr.y(q[0]).toFixed(1)});
  return'<svg viewBox="0 0 76 52" aria-hidden="true"><path d="'+d+'" fill="none" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="stroke:var('+(a.sport==='run'?'--run':'--ride')+')"/></svg>'
}

/* ---------- periodos ---------- */
function periodRange(p,off){
  const n=new Date(),d0=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  if(p==='week'){const s=new Date(d0);s.setDate(s.getDate()-((d0.getDay()+6)%7)-7*off);const e=new Date(s);e.setDate(e.getDate()+7);return[s.getTime(),e.getTime()]}
  if(p==='month')return[new Date(n.getFullYear(),n.getMonth()-off,1).getTime(),new Date(n.getFullYear(),n.getMonth()-off+1,1).getTime()];
  if(p==='year')return[new Date(n.getFullYear()-off,0,1).getTime(),new Date(n.getFullYear()-off+1,0,1).getTime()];
  return off?[0,0]:[0,Infinity]
}
const inRange=(l,r)=>l.filter(a=>{const t=Date.parse(a.start);return t>=r[0]&&t<r[1]});
function totals(l){let d=0,t=0,e=0;for(const a of l){d+=a.dist;t+=a.time;e+=a.elev}return{d,t,e,n:l.length}}
const filtered=()=>S.acts.filter(a=>S.sport==='all'||a.sport===S.sport);
const PL={week:'Semana',month:'Mes',year:'Año',all:'Todo'},PP={week:'la semana anterior',month:'el mes anterior',year:'el año anterior'};
const chip=(act,val,label,on)=>'<button class="chip" data-act="'+act+'" data-val="'+val+'" aria-pressed="'+(on?'true':'false')+'">'+label+'</button>';
const sportChips=()=>'<div class="chips" role="group" aria-label="Deporte">'+chip('sport','all','Todo',S.sport==='all')+chip('sport','run','Correr',S.sport==='run')+chip('sport','ride','Ciclismo',S.sport==='ride')+'</div>';
const kpi=(l,v,u,d)=>'<div class="kpi"><div class="lbl">'+l+'</div><div class="val">'+v+(u?'<small>'+u+'</small>':'')+'</div><div class="dl">'+(d||'')+'</div></div>';
function kt(sec){const tot=Math.round(sec/60),h=Math.floor(tot/60),m=tot%60;return h?[h+':'+String(m).padStart(2,'0'),'h']:[String(m),'min']}
function delta(a,b){if(!b)return'';if(a/b>=5)return'↑ ×'+f0.format(a/b)+' vs '+PP[S.period];const p=(a-b)/b*100;return(p>=0?'↑ ':'↓ ')+f0.format(Math.abs(p))+' % vs '+PP[S.period]}

/* ---------- resumen ---------- */
function weeklyData(){
  const labels=[],run=[],ride=[];
  for(let k=11;k>=0;k--){
    const r=periodRange('week',k),inW=inRange(S.acts,r);
    labels.push(new Date(r[0]).toLocaleDateString('es-CL',{day:'numeric',month:'short'}).replace('.',''));
    run.push(S.sport==='ride'?0:inW.filter(a=>a.sport==='run').reduce((s,a)=>s+a.dist,0)/1000);
    ride.push(S.sport==='run'?0:inW.filter(a=>a.sport==='ride').reduce((s,a)=>s+a.dist,0)/1000)}
  return{labels,run,ride}
}
function trendPanel(sport){
  const min=sport==='run'?2000:5000;
  const l=S.acts.filter(a=>a.sport===sport&&a.dist>=min).slice(0,24).reverse();
  const title=sport==='run'?'Ritmo en carreras':'Velocidad en rodadas',unit=sport==='run'?'min/km · arriba es más rápido':'km/h';
  if(l.length<2)return'<div class="panel"><h3>'+title+'</h3><div class="empty">Registra al menos dos '+(sport==='run'?'carreras':'rodadas')+' de '+(min/1000)+' km o más para ver la tendencia.</div></div>';
  const xs=l.map(a=>Date.parse(a.start)),ys=l.map(a=>sport==='run'?spk(a):kmh(a));
  const tk=[xs[0],(xs[0]+xs[xs.length-1])/2,xs[xs.length-1]];
  const col='var(--'+(sport==='run'?'run':'ride')+')';
  return'<div class="panel"><div class="bar"><h3>'+title+'</h3><span class="note">'+unit+'</span></div>'+job(w=>chartLine({w,h:190,xs,ys,color:col,dots:true,invert:sport==='run',yfmt:sport==='run'?pace:v=>f0.format(v),xTicks:tk,xfmt:d=>new Date(d).toLocaleDateString('es-CL',{day:'numeric',month:'short'}).replace('.',''),label:title}))+'</div>'
}
function ringHero(T,P){
  const fr=P&&P.d>0?Math.min(1,T.d/P.d):(T.d>0?1:0),C=2*Math.PI*44,ang=fr*2*Math.PI-Math.PI/2;
  const kx=50+44*Math.cos(ang),ky=50+44*Math.sin(ang);
  const svg='<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6CF5A0"/><stop offset="1" stop-color="#2FE0C4"/></linearGradient></defs><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(108,245,160,.12)" stroke-width="7"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#rg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+(fr*C).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 50 50)"/>'+(fr>0?'<circle cx="'+kx.toFixed(1)+'" cy="'+ky.toFixed(1)+'" r="3.6" fill="#EAF6EF"/>':'')+'</svg>';
  const k=kt(T.t);
  return '<div class="panel hero"><div class="ringbox">'+svg+'<div class="mid"><div class="big">'+f1.format(T.d/1000)+'</div><div class="unit">KM</div></div></div><div class="cap2">'+(P?'Antes: '+f1.format(P.d/1000)+' km · '+delta(T.d,P.d):'Total acumulado')+'</div><div class="mini"><div><b>'+k[0]+'</b><span>'+(k[1]||'tiempo')+'</span></div><div><b>'+T.n+'</b><span>salidas</span></div></div></div>'
}
function viewHome(){
  if(!S.acts.length)return'<div class="panel"><h2>Empieza por tu primera salida</h2><p class="note" style="margin:8px 0 14px">Graba una salida con el GPS del teléfono, importa un archivo GPX o TCX de tu reloj o registra una a mano.</p><div class="chips"><button class="btn" data-act="nav" data-val="rec">Comenzar actividad</button><button class="btn ghost" data-act="nav" data-val="add">Añadir actividad</button></div></div>';
  const list=filtered(),T=totals(inRange(list,periodRange(S.period,0)));
  const P=S.period==='all'?null:totals(inRange(list,periodRange(S.period,1)));
  let h='<button class="btn big" data-act="nav" data-val="rec">Comenzar actividad</button><div class="bar">'+sportChips()+'<div class="chips" role="group" aria-label="Periodo">'+['week','month','year','all'].map(p=>chip('period',p,PL[p],S.period===p)).join('')+'</div></div>';
  let k=kpi('Tiempo',kt(T.t)[0],kt(T.t)[1],P?delta(T.t,P.t):'')+kpi('Desnivel',f0.format(T.e),'m',P?delta(T.e,P.e):'')+kpi('Salidas',T.n,'',P?delta(T.n,P.n):'');
  if(S.sport!=='all'&&T.d>0)k+=S.sport==='run'?kpi('Ritmo medio',pace(T.t/(T.d/1000)),'/km',''):kpi('Velocidad media',f1.format(T.d/1000/(T.t/3600)),'km/h','');
  h+=ringHero(T,P)+'<div class="kpis">'+k+'</div>';
  const wk=weeklyData(),series=[];
  if(S.sport!=='ride')series.push({vals:wk.run,color:'var(--run)'});
  if(S.sport!=='run')series.push({vals:wk.ride,color:'var(--ride)'});
  h+='<div class="panel"><div class="bar"><h3>Kilómetros por semana</h3><span>'+(S.sport==='all'?'<span class="tag s-run">Correr</span>&nbsp;&nbsp;<span class="tag s-ride">Ciclismo</span>':'')+'</span></div>'+job(w=>chartBars({w,h:200,labels:wk.labels,series,label:'Kilómetros por semana, últimas 12 semanas'}))+'</div>';
  const tp=[];if(S.sport!=='ride')tp.push(trendPanel('run'));if(S.sport!=='run')tp.push(trendPanel('ride'));
  h+='<div class="grid2">'+tp.join('')+'</div>';
  const last=list[0];
  if(last)h+='<div class="panel"><div class="bar"><h3>Última salida</h3><button class="btn ghost" data-act="open" data-id="'+esc(last.id)+'">Ver detalle</button></div><div style="height:10px"></div><div><b>'+esc(last.name)+'</b> <span class="note">· '+dShort(last.start)+' · '+f2.format(last.dist/1000)+' km · '+dur(last.time)+' · '+metric(last)+'</span></div>'+(last.pts?job(w=>routeMap(last,w,'pace')):(last.pts===undefined?(ensurePts(last),'<div class="empty">Cargando ruta…</div>'):''))+'</div>';
  return h
}

/* ---------- lista ---------- */
function viewList(){
  const l=filtered();
  let h='<div class="bar">'+sportChips()+'<span class="note">'+l.length+' '+(l.length===1?'actividad':'actividades')+' · <button class="back" data-act="xlsx" style="text-decoration:underline;color:var(--neon)">Descargar Excel</button></span></div>';
  if(!l.length)return h+'<div class="panel"><div class="empty">Aún no hay actividades de este deporte.</div></div>';
  h+='<div class="list">';let mo='';
  for(const a of l.slice(0,S.more)){
    const m=monthName(a.start);if(m!==mo){mo=m;h+='<div class="mh">'+esc(m)+'</div>'}
    h+='<button class="row" data-act="open" data-id="'+esc(a.id)+'"><div class="thumb">'+thumb(a)+'</div><div class="mn"><div class="nm">'+esc(a.name)+'</div><div class="sub"><span class="tag s-'+a.sport+'">'+SPORT[a.sport].label+'</span> · '+dShort(a.start)+' · '+tClock(a.start)+'</div></div><div class="st"><div><b>'+f2.format(a.dist/1000)+'</b><span>km</span></div><div><b>'+dur(a.time)+'</b></div><div><b>'+(a.sport==='run'?pace(spk(a)):f1.format(kmh(a)))+'</b><span>'+(a.sport==='run'?'/km':'km/h')+'</span></div><div><b>'+f0.format(a.elev)+'</b><span>m↑</span></div></div></button>'}
  h+='</div>';
  if(l.length>S.more)h+='<div style="text-align:center"><button class="btn ghost" data-act="more">Mostrar más</button></div>';
  return h
}

/* ---------- detalle ---------- */
function speedSeries(a){
  const v=metricSeries(a,'pace');
  return v.map(x=>x<.5?null:a.sport==='run'?Math.min(720,Math.max(150,1000/x)):Math.min(70,x*3.6))
}
function viewDetail(){
  const a=S.acts.find(x=>x.id===S.sel);if(!a)return'<div class="empty">No encontré esa actividad.</div>';
  const col='var(--'+(a.sport==='run'?'run':'ride')+')',km=a.dist/1000;
  let h='<button class="back" data-act="back">← Actividades</button>';
  h+='<div class="panel"><div class="tag s-'+a.sport+'">'+SPORT[a.sport].label+(a.demo?' · ejemplo':'')+'</div><div class="field" style="margin:6px 0 4px"><label for="d-name" class="note">Nombre</label><input id="d-name" value="'+esc(a.name)+'" maxlength="80"'+(a.demo?' disabled':'')+'></div><div class="note cap">'+dFull(a.start)+' · '+tClock(a.start)+'</div></div>';
  if(a.pts===undefined){ensurePts(a);h+='<div class="panel"><div class="empty">Cargando ruta…</div></div>'}
  if(a.pts){
    const ele=hasEle(a),mode=ele?S.mapBy:'pace',p0=a.pts[0];
    h+='<div class="panel"><div class="bar"><h3>Ruta</h3><div class="chips" role="group" aria-label="Color del trazado">'+chip('mapby','pace',a.sport==='run'?'Ritmo':'Velocidad',mode==='pace')+(ele?chip('mapby','ele','Altura',mode==='ele'):'')+'</div></div><div style="height:10px"></div>'+job(w=>routeMap(a,w,mode))+mapLegend(a,mode)+'<div class="note" style="margin-top:8px">Solo se dibuja tu recorrido, sin calles de fondo. <a href="https://www.openstreetmap.org/?mlat='+p0[0]+'&amp;mlon='+p0[1]+'#map=14/'+p0[0]+'/'+p0[1]+'" target="_blank" rel="noopener" style="color:inherit">Ver el punto de salida en un mapa real</a>.</div></div>'
  }
  const rows=[['Distancia',f2.format(km),'km'],['Tiempo',dur(a.time),''],[a.sport==='run'?'Ritmo medio':'Velocidad media',a.sport==='run'?pace(spk(a)):f1.format(kmh(a)),a.sport==='run'?'/km':'km/h'],['Desnivel positivo',f0.format(a.elev),'m']];
  if(a.hr)rows.push(['FC media',a.hr,'ppm']);
  if(a.elapsed-a.time>60)rows.push(['Tiempo total',dur(a.elapsed),'']);
  h+='<div class="panel"><div class="stats">'+rows.map(r=>'<div><div class="lbl">'+r[0]+'</div><div class="val">'+r[1]+(r[2]?'<small>'+r[2]+'</small>':'')+'</div></div>').join('')+'</div></div>';
  if(a.pts&&a.pts.length>2){
    const xs=a.pts.map(p=>p[4]/1000);
    const charts=[];
    if(hasEle(a))charts.push('<div class="panel"><h3>Perfil de altura</h3>'+job(w=>chartLine({w,h:180,xs,ys:a.pts.map(p=>p[2]),color:col,area:true,yfmt:v=>f0.format(v)+' m',ml:56,xfmt:v=>f0.format(v)+' km',label:'Perfil de altura'}))+'</div>');
    const ss=speedSeries(a);
    charts.push('<div class="panel"><div class="bar"><h3>'+(a.sport==='run'?'Ritmo a lo largo de la ruta':'Velocidad a lo largo de la ruta')+'</h3><span class="note">'+(a.sport==='run'?'min/km · arriba es más rápido':'km/h')+'</span></div>'+job(w=>chartLine({w,h:180,xs,ys:ss,color:col,invert:a.sport==='run',yfmt:a.sport==='run'?pace:v=>f0.format(v),xfmt:v=>f0.format(v)+' km',label:'Ritmo o velocidad'}))+'</div>');
    h+='<div class="grid2">'+charts.join('')+'</div>';
    const sp=splitsOf(a);
    if(sp.length>1){
      const vals=sp.map(r=>a.sport==='run'?r.sec:3600/r.sec),mn=Math.min(...vals),mx=Math.max(...vals);
      h+='<div class="panel"><div class="bar"><h3>Parciales por kilómetro</h3><span class="note">incluye pausas</span></div><div style="height:6px"></div>'+sp.map((r,i)=>{
        const v=vals[i],fr=mx===mn?1:a.sport==='run'?(mx-v)/(mx-mn):(v-mn)/(mx-mn);
        return'<div class="split"><span>'+(r.partial?f1.format(r.km):r.km)+'</span><div class="b"><i style="width:'+(35+65*fr).toFixed(0)+'%;background:'+col+'"></i></div><span>'+(a.sport==='run'?pace(v):f1.format(v))+'</span><span class="e">'+(r.de==null?'':(r.de>=0?'+':'−')+f0.format(Math.abs(r.de))+' m')+'</span></div>'}).join('')+'</div>'
    }
  }
  if(!a.demo)h+='<div><button class="btn danger" data-act="del">'+(S.confirm?'Confirmar: eliminar para siempre':'Eliminar actividad')+'</button></div>';
  return h
}

/* ---------- récords ---------- */
function viewRecords(){
  const real=S.acts;let h='';
  const T=totals(real);
  h+='<div class="kpis">'+kpi('Distancia total',f0.format(T.d/1000),'km','')+kpi('Tiempo total',kt(T.t)[0],kt(T.t)[1],'')+kpi('Desnivel total',f0.format(T.e),'m','')+kpi('Salidas',T.n,'','')+'</div>';
  const defs={run:[[1000,'1 km'],[5000,'5 km'],[10000,'10 km'],[21097,'Media maratón']],ride:[[10000,'10 km'],[20000,'20 km'],[40000,'40 km'],[100000,'100 km']]};
  for(const sp of['run','ride']){
    const l=real.filter(a=>a.sport===sp);if(!l.length)continue;
    let rows='';
    const link=a=>'<button class="lk" data-act="open" data-id="'+esc(a.id)+'">'+esc(a.name)+' · '+dShort(a.start)+'</button>';
    const rec=(lbl,val,unit,a)=>'<div class="rec"><div><div class="lbl">'+lbl+'</div>'+link(a)+'</div><div class="val">'+val+(unit?'<small>'+unit+'</small>':'')+'</div></div>';
    for(const[T2,lbl]of defs[sp]){
      let best=null,ba=null;
      for(const a of l){const e=bestEffort(a,T2);if(e!=null&&(best==null||e<best)){best=e;ba=a}}
      if(ba)rows+=rec('Mejor '+lbl,dur(best),sp==='run'?pace(best/(T2/1000))+' /km':f1.format(T2/1000/(best/3600))+' km/h',ba)}
    const lg=l.reduce((m,a)=>a.dist>m.dist?a:m,l[0]);rows+=rec('Distancia más larga',f2.format(lg.dist/1000),'km',lg);
    const el=l.reduce((m,a)=>a.elev>m.elev?a:m,l[0]);if(el.elev>0)rows+=rec('Mayor desnivel positivo',f0.format(el.elev),'m',el);
    const el2=l.filter(a=>a.dist>=(sp==='run'?3000:10000));
    if(el2.length){if(sp==='run'){const b=el2.reduce((m,a)=>spk(a)<spk(m)?a:m,el2[0]);rows+=rec('Mejor ritmo medio (desde 3 km)',pace(spk(b)),'/km',b)}else{const b=el2.reduce((m,a)=>kmh(a)>kmh(m)?a:m,el2[0]);rows+=rec('Mayor velocidad media (desde 10 km)',f1.format(kmh(b)),'km/h',b)}}
    h+='<div class="panel"><h2 class="s-'+sp+'">'+SPORT[sp].label+'</h2><div style="height:6px"></div>'+rows+'<div class="note" style="margin-top:8px">Las mejores marcas por distancia se calculan solo con actividades que tienen ruta.</div></div>'
  }
  return h
}

/* ---------- añadir ---------- */
function viewAdd(){
  const today=new Date().toLocaleDateString('sv-SE'),ok=S.pending.filter(p=>p.act&&!p.dup);
  let h='<div class="panel"><h2>Importar desde tu reloj o app</h2><div style="height:10px"></div><label class="drop" id="drop"><input type="file" id="files" accept=".gpx,.tcx" multiple><b>Elegir archivos GPX o TCX</b>Garmin, Coros, Polar, Suunto, Apple, Strava y la mayoría de relojes los exportan. Se leen en tu navegador.</label>';
  if(S.pending.length){
    h+='<div style="margin-top:12px">'+S.pending.map((p,i)=>{
      if(!p.act)return'<div class="pend"><div><b>'+esc(p.file)+'</b></div><div class="s-run" style="color:var(--warn)">'+esc(p.err)+'</div><button class="btn ghost" data-act="rmp" data-i="'+i+'">Quitar</button></div>';
      const a=p.act;
      return'<div class="pend"><div class="field"><label for="pn'+i+'">Nombre</label><input id="pn'+i+'" data-pn="'+i+'" value="'+esc(a.name)+'" maxlength="80"></div><div class="field"><label for="ps'+i+'">Deporte</label><select id="ps'+i+'" data-ps="'+i+'"><option value="run"'+(a.sport==='run'?' selected':'')+'>Correr</option><option value="ride"'+(a.sport==='ride'?' selected':'')+'>Ciclismo</option></select></div><button class="btn ghost" data-act="rmp" data-i="'+i+'">Quitar</button><div class="sub">'+dFull(a.start)+' · '+f2.format(a.dist/1000)+' km · '+dur(a.time)+' · '+f0.format(a.elev)+' m↑ · '+esc(p.file)+(p.dup?' · <b>ya está registrada, se omitirá</b>':'')+'</div></div>'}).join('')+'</div><div style="margin-top:12px"><button class="btn" data-act="savep"'+(ok.length?'':' disabled')+'>Guardar '+ok.length+' '+(ok.length===1?'actividad':'actividades')+'</button></div>'}
  h+='</div>';
  h+='<div class="panel"><h2>Registrar a mano</h2><div style="height:10px"></div><div class="form">'
   +'<div class="field"><label for="m-sport">Deporte</label><select id="m-sport"><option value="run">Correr</option><option value="ride">Ciclismo</option></select></div>'
   +'<div class="field"><label for="m-name">Nombre (opcional)</label><input id="m-name" maxlength="80"></div>'
   +'<div class="field"><label for="m-date">Fecha</label><input id="m-date" type="date" value="'+today+'"></div>'
   +'<div class="field"><label for="m-time">Hora de salida</label><input id="m-time" type="time" value="07:00"></div>'
   +'<div class="field"><label for="m-dist">Distancia (km)</label><input id="m-dist" inputmode="decimal" placeholder="10,5"></div>'
   +'<div class="field"><label for="m-dur">Duración (h:mm:ss)</label><input id="m-dur" placeholder="52:30"></div>'
   +'<div class="field"><label for="m-elev">Desnivel positivo (m)</label><input id="m-elev" inputmode="numeric" placeholder="120"></div>'
   +'<div class="field"><label for="m-hr">FC media (opcional)</label><input id="m-hr" inputmode="numeric" placeholder="150"></div>'
   +'</div><div id="m-err" class="note" style="color:var(--warn);min-height:1.4em;margin-top:8px"></div><button class="btn" data-act="savem">Guardar actividad</button></div>';
  h+=accountPanel();
  h+='<div class="panel"><h2>Respaldo y Excel</h2><p class="note" style="margin:8px 0 12px">Descarga todas tus actividades en Excel (.xlsx) para analizarlas, o guarda un respaldo completo con las rutas y restáuralo cuando quieras.</p><div class="chips"><button class="btn" data-act="xlsx">Descargar Excel</button><button class="btn ghost" data-act="export">Descargar respaldo</button><label class="btn ghost" style="display:inline-block;position:relative">Restaurar respaldo<input type="file" id="bk" accept=".json,application/json" style="position:absolute;opacity:0;inset:0;width:100%;cursor:pointer"></label></div></div>';
  return h
}
function parseDur(s){s=String(s).trim().replace(',','.');if(!s)return 0;const p=s.split(':').map(Number);if(p.some(x=>!isFinite(x)||x<0))return 0;return p.length===1?p[0]*60:p.length===2?p[0]*60+p[1]:p[0]*3600+p[1]*60+p[2]}
const num=id=>parseFloat(String($('#'+id).value).replace(',','.'));
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>{e.hidden=true},3200)}
function saveManual(){
  const err=m=>{$('#m-err').textContent=m},km=num('m-dist'),sec=parseDur($('#m-dur').value),d=$('#m-date').value,t=$('#m-time').value||'07:00';
  if(!(km>0))return err('Escribe la distancia en kilómetros, por ejemplo 10,5.');
  if(!(sec>0))return err('Escribe la duración, por ejemplo 52:30 o 1:05:10.');
  if(!d)return err('Elige la fecha.');
  const start=new Date(d+'T'+t),sport=$('#m-sport').value,el=num('m-elev'),hr=num('m-hr');
  if(isNaN(start.getTime()))return err('La fecha u hora no es válida.');
  const a={id:newId(),sport,name:$('#m-name').value.trim()||autoName(sport,start.toISOString()),start:start.toISOString(),dist:Math.round(km*1000),time:Math.round(sec),elapsed:Math.round(sec),elev:isFinite(el)&&el>0?Math.round(el):0,hr:isFinite(hr)&&hr>0?Math.round(hr):null,pts:null,src:'manual'};
  err('');
  queue(async()=>{await store.save(a);return true}).then(ok=>{if(ok){toast('Actividad guardada');go('list')}})
}
async function handleFiles(files){
  for(const f of files){
    if(f.size>25*1048576){S.pending.push({file:f.name,err:'El archivo pesa más de 25 MB.'});continue}
    try{
      const r=parseTrack(await f.text()),a=build(r.raw,{sport:r.sport,name:r.name&&r.name.trim()||null});
      if(a.dist<100)throw new Error('La actividad tiene menos de 100 m.');
      const dup=S.acts.some(x=>!x.demo&&Math.abs(Date.parse(x.start)-Date.parse(a.start))<2000&&Math.abs(x.dist-a.dist)<Math.max(30,a.dist*.01));
      S.pending.push({file:f.name,act:a,dup})
    }catch(e){S.pending.push({file:f.name,err:e.message||'No pude leer este archivo.'})}
  }
  render()
}
async function handleBackup(f){
  try{
    const j=JSON.parse(await f.text()),l=Array.isArray(j)?j:j.activities;
    const ok=(l||[]).filter(a=>a&&a.id&&(a.sport==='run'||a.sport==='ride')&&a.start&&a.dist>0&&a.time>0&&!a.demo);
    if(!ok.length)return toast('El archivo no tiene actividades válidas.');
    queue(async()=>{for(const a of ok)await store.save(a);return true}).then(r=>{if(r){toast('Restauradas '+ok.length+' actividades');go('list')}})
  }catch(e){toast('No pude leer ese respaldo.')}
}

function accountPanel(){
  return'<div class="panel"><h2>Cuenta</h2><p class="note" style="margin:8px 0 12px">Sesión iniciada como <b>'+esc(S.user&&S.user.email||'')+'</b>.</p><div class="form"><div class="field"><label for="c-pw">Contraseña nueva (mínimo 8 caracteres)</label><input id="c-pw" type="password" autocomplete="new-password"></div></div><div class="chips" style="margin-top:12px"><button class="btn ghost" data-act="chpw">Cambiar contraseña</button><button class="btn ghost" data-act="signout">Cerrar sesión</button></div></div>'
}


/* ---------- exportar a Excel (.xlsx, sin librerías) ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=t[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}})();
function zipStore(files){
  const enc=new TextEncoder(),parts=[],cen=[];let off=0;
  const u16=v=>[v&255,v>>>8&255],u32=v=>[v&255,v>>>8&255,v>>>16&255,v>>>24&255];
  for(const[name,txt]of files){
    const nb=enc.encode(name),db=enc.encode(txt),crc=CRC(db);
    const lh=new Uint8Array([0x50,0x4B,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),...u16(0)]);
    parts.push(lh,nb,db);
    cen.push(new Uint8Array([0x50,0x4B,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb);
    off+=lh.length+nb.length+db.length}
  const cs=cen.reduce((s,p)=>s+p.length,0);
  const end=new Uint8Array([0x50,0x4B,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cs),...u32(off),...u16(0)]);
  return new Blob([...parts,...cen,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
const xe=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
function colL(i){let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function sheetXml(head,rows,widths){
  // celdas: {v:número,s:estilo} | {t:texto} | null
  const cell=(c,r,x)=>{const ref=colL(c)+r;if(x==null||x.v===null)return'';if(x.t!==undefined)return'<c r="'+ref+'" t="inlineStr"'+(x.s?' s="'+x.s+'"':'')+'><is><t xml:space="preserve">'+xe(x.t)+'</t></is></c>';return'<c r="'+ref+'"'+(x.s?' s="'+x.s+'"':'')+'><v>'+x.v+'</v></c>'};
  let h='<row r="1" ht="22" customHeight="1">'+head.map((t,i)=>cell(i,1,{t,s:1})).join('')+'</row>';
  rows.forEach((r,ri)=>{h+='<row r="'+(ri+2)+'">'+r.map((x,i)=>cell(i,ri+2,x)).join('')+'</row>'});
  return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+h+'</sheetData><autoFilter ref="A1:'+colL(head.length-1)+(rows.length+1)+'"/></worksheet>'
}
function exportXlsx(){
  const l=S.acts.slice().sort((a,b)=>a.start<b.start?1:-1);
  if(!l.length)return toast('Aún no hay actividades para exportar.');
  const ser=iso=>{const d=new Date(iso);return(d.getTime()-d.getTimezoneOffset()*60000)/86400000+25569};
  const T=(s,fmt)=>({v:+(s/86400).toFixed(8),s:fmt});
  const rows=l.map(a=>{const d=new Date(a.start),km=a.dist/1000;return[
    {v:Math.floor(ser(a.start)),s:2},{t:tClock(a.start)},{t:a.name},{t:SPORT[a.sport].label},
    {v:+km.toFixed(3),s:3},T(a.time,4),T(a.elapsed||a.time,4),
    a.sport==='run'&&a.dist>0&&a.time>0?T(a.time/km,5):null,
    a.dist>0&&a.time>0?{v:+kmh(a).toFixed(2),s:7}:null,
    {v:a.elev||0,s:6},a.hr?{v:a.hr,s:6}:null,{t:a.src==='gps'?'GPS (grabada en la app)':a.src==='manual'?'Manual':a.src?String(a.src).toUpperCase():''}]});
  const head=['Fecha','Hora','Nombre','Deporte','Distancia (km)','Tiempo en movimiento','Tiempo total','Ritmo medio (min/km)','Velocidad media (km/h)','Desnivel positivo (m)','FC media (lpm)','Origen'];
  const s1=sheetXml(head,rows,[12,8,34,11,14,20,13,19,21,19,14,22]);
  // resumen mensual
  const g={};for(const a of l){const d=new Date(a.start),k=d.getFullYear()*100+d.getMonth()+1+'|'+a.sport;(g[k]=g[k]||{y:d.getFullYear(),m:d.getMonth(),sp:a.sport,n:0,d:0,t:0,e:0});const o=g[k];o.n++;o.d+=a.dist;o.t+=a.time;o.e+=a.elev||0}
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const ks=Object.keys(g).sort().reverse();
  const rows2=ks.map(k=>{const o=g[k];return[{t:meses[o.m][0].toUpperCase()+meses[o.m].slice(1)+' '+o.y},{t:SPORT[o.sp].label},{v:o.n,s:6},{v:+(o.d/1000).toFixed(2),s:3},T(o.t,4),o.d>0&&o.t>0?(o.sp==='run'?T(o.t/(o.d/1000),5):{v:+(o.d/1000/(o.t/3600)).toFixed(2),s:7}):null,{v:Math.round(o.e),s:6}]});
  const s2=sheetXml(['Mes','Deporte','Salidas','Distancia (km)','Tiempo en movimiento','Ritmo (min/km) o velocidad (km/h)','Desnivel positivo (m)'],rows2,[20,11,10,14,20,30,19]);
  const ns='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const files=[
   ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
   ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook '+ns+' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Actividades" sheetId="1" r:id="rId1"/><sheet name="Resumen mensual" sheetId="2" r:id="rId2"/></sheets></workbook>'],
   ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet '+ns+'><numFmts count="4"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="[h]:mm:ss"/><numFmt numFmtId="166" formatCode="m:ss"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F3D27"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
   ['xl/worksheets/sheet1.xml',s1],['xl/worksheets/sheet2.xml',s2]];
  const blob=zipStore(files),u=URL.createObjectURL(blob),el=document.createElement('a');
  el.href=u;el.download='cuaderno-de-ruta-'+new Date().toLocaleDateString('sv-SE')+'.xlsx';document.body.appendChild(el);el.click();el.remove();
  setTimeout(()=>URL.revokeObjectURL(u),4000);toast('Excel listo: '+l.length+' actividades')
}

async function exportData(){
  toast('Preparando respaldo…');
  try{
    const l=await store.loadFull();if(!l.length)return toast('Aún no hay actividades para respaldar.');
    const blob=new Blob([JSON.stringify({version:1,activities:l.map(a=>Object.assign({},a,{thumb:undefined,best:undefined}))})],{type:'application/json'});
    const u=URL.createObjectURL(blob),el=document.createElement('a');
    el.href=u;el.download='cuaderno-de-ruta-'+new Date().toLocaleDateString('sv-SE')+'.json';document.body.appendChild(el);el.click();el.remove();
    setTimeout(()=>URL.revokeObjectURL(u),4000);toast('Respaldo listo')
  }catch(e){toast('No se pudo crear el respaldo.')}
}

/* ---------- acceso ---------- */
function authView(){
  const m=S.authMode,msg=S.authMsg,ok=msg.startsWith('ok:'),txt=msg.replace(/^(ok|err):/,'');
  const title=m==='in'?'Entrar':m==='up'?'Crear cuenta':'Recuperar contraseña';
  return'<div class="auth"><div><div class="brand big">Cuaderno<span> de ruta</span></div><p class="note" style="margin:8px 0 0">Tus carreras y rodadas en un solo lugar. Solo tú ves tus datos.</p></div>'
   +'<form id="authform" class="panel" novalidate><h2>'+title+'</h2><div style="height:12px"></div><div class="form" style="grid-template-columns:1fr">'
   +'<div class="field"><label for="a-email">Correo</label><input id="a-email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" value="'+esc(S.authEmail||'')+'"></div>'
   +(m!=='forgot'?'<div class="field"><label for="a-pw">Contraseña'+(m==='up'?' (mínimo 8 caracteres)':'')+'</label><input id="a-pw" type="password" autocomplete="'+(m==='in'?'current-password':'new-password')+'"></div>':'')
   +'</div><div class="msg '+(ok?'ok':'bad')+'" role="alert">'+esc(txt)+'</div>'
   +'<button class="btn full" type="submit"'+(S.busy?' disabled':'')+'>'+(S.busy?'Un momento…':title)+'</button>'
   +'<div class="linkrow">'+(m==='in'?'<button type="button" class="back" data-act="authmode" data-val="up">Crear cuenta</button><button type="button" class="back" data-act="authmode" data-val="forgot">Olvidé mi contraseña</button>':'<button type="button" class="back" data-act="authmode" data-val="in">← Volver a entrar</button>')+'</div></form></div>'
}
function recoverView(){
  const msg=S.authMsg,txt=msg.replace(/^(ok|err):/,'');
  return'<div class="auth"><div class="brand big">Cuaderno<span> de ruta</span></div><form id="recoverform" class="panel" novalidate><h2>Nueva contraseña</h2><div style="height:12px"></div><div class="field"><label for="r-pw">Contraseña nueva (mínimo 8 caracteres)</label><input id="r-pw" type="password" autocomplete="new-password"></div><div class="msg bad" role="alert">'+esc(txt)+'</div><button class="btn full" type="submit"'+(S.busy?' disabled':'')+'>Guardar contraseña</button></form></div>'
}

/* ---------- grabación con GPS ---------- */
const RLS='cuaderno-rec-v1';
const MAXV={run:9,ride:28};
const REC={st:'idle',sport:'run',pts:[],t0:0,pausedMs:0,pauseAt:0,dist:0,gain:0,ref:null,ele:null,gaps:0,gapSec:0,needBreak:false,watch:null,fix:null,acc:null,err:'',final:null,confirm:'',wake:null,restore:null,dirty:false,lastSave:0,hiddenAt:0,notice:''};
try{const raw=localStorage.getItem(RLS);if(raw){const d=JSON.parse(raw);if(d&&d.pts&&d.pts.length>1)REC.restore=d}}catch(e){}
const recActive=()=>REC.st==='run'||REC.st==='pause';
function elapsedMs(){if(!REC.t0)return 0;const end=REC.st==='pause'?REC.pauseAt:Date.now();return Math.max(0,end-REC.t0-REC.pausedMs)}
const SITE=(window.APP_CONFIG&&APP_CONFIG.siteUrl)||location.origin;
const NATIVE=!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const BGG=NATIVE?((window.Capacitor.Plugins||{}).BackgroundGeolocation||(Capacitor.registerPlugin?Capacitor.registerPlugin('BackgroundGeolocation'):null)):null;
function startWatch(){
  if(REC.watch!=null)return;
  if(BGG&&recActive()){
    // App nativa: GPS en segundo plano (servicio en primer plano en Android, modo "location" en iOS)
    REC.watch='pending';
    BGG.addWatcher({backgroundTitle:'Cuaderno de Ruta',backgroundMessage:'Grabando tu actividad…',requestPermissions:true,stale:false,distanceFilter:0},(loc,err)=>{
      if(err){
        if(err.code==='NOT_AUTHORIZED'){REC.err='Sin permiso de ubicación. Actívalo en Ajustes del teléfono (Ubicación: «Siempre» o «Mientras se usa») y vuelve a intentar.';stopWatch();recLive(false)}
        return}
      if(loc)onFix({coords:{latitude:loc.latitude,longitude:loc.longitude,accuracy:loc.accuracy,altitude:loc.altitude,speed:loc.speed},native:true,time:loc.time})
    }).then(id=>{if(REC.watch==='pending')REC.watch=id;else BGG.removeWatcher({id}).catch(()=>{})}).catch(()=>{REC.watch=null;REC.err='No se pudo iniciar el GPS en segundo plano.';recLive(false)});
    return}
  if(!navigator.geolocation){REC.err='Este navegador no tiene GPS disponible.';return}
  REC.watch=navigator.geolocation.watchPosition(onFix,onGeoErr,{enableHighAccuracy:true,maximumAge:0,timeout:30000})
}
function stopWatch(){
  const w=REC.watch;if(w==null)return;REC.watch=null;
  if(w==='pending')return;
  if(typeof w==='string'&&BGG){try{BGG.removeWatcher({id:w}).catch(()=>{})}catch(e){}return}
  try{navigator.geolocation.clearWatch(w)}catch(e){}
}
function onGeoErr(e){
  if(e.code===1){REC.err='Sin permiso de ubicación. Actívalo para este sitio en los ajustes del navegador y vuelve a intentar.';stopWatch()}
  else if(e.code===2)REC.err='No se pudo obtener la ubicación. Revisa que el GPS esté activado.';
  recLive(false)
}
function onFix(pos){
  const c=pos.coords,now=pos.native&&pos.time?pos.time:Date.now();
  REC.acc=c.accuracy;REC.fix={lat:c.latitude,lon:c.longitude,t:now};REC.err='';
  if(REC.st==='run'&&c.accuracy<=35)addPoint(c,now);
  recLive(true)
}
function addPoint(c,now){
  const t=now-REC.pausedMs,alt=c.altitude;
  if(alt!=null&&isFinite(alt))REC.ele=REC.ele==null?alt:REC.ele*.75+alt*.25;
  const p={lat:c.latitude,lon:c.longitude,t,ele:REC.ele,brk:false,cd:REC.dist},last=REC.pts[REC.pts.length-1];
  if(last&&!REC.needBreak){
    const d=hav(last,p),dt=(p.t-last.t)/1000;
    if(dt<=0)return;
    if(d/dt>MAXV[REC.sport])return;
    if(d<Math.max(4,c.accuracy*.5))return;
    if(c.speed!=null&&c.speed<.3&&d<15)return;
    if(dt>20){REC.gaps++;REC.gapSec+=dt}
    REC.dist+=d;p.cd=REC.dist
  }else if(last){p.brk=true;REC.needBreak=false}
  if(p.ele!=null){if(REC.ref==null)REC.ref=p.ele;else if(p.ele>REC.ref+4){REC.gain+=p.ele-REC.ref;REC.ref=p.ele}else if(p.ele<REC.ref-4)REC.ref=p.ele}
  REC.pts.push(p);REC.dirty=true
}
function curSpeed(){
  const n=REC.pts.length;if(n<2||REC.st!=='run')return null;
  const last=REC.pts[n-1],tNow=Date.now()-REC.pausedMs;if(tNow-last.t>15000)return 0;
  let i=n-1;while(i>0&&last.t-REC.pts[i].t<25000)i--;
  const dt=(last.t-REC.pts[i].t)/1000;return dt>=5?(last.cd-REC.pts[i].cd)/dt:null
}
async function wakeOn(){try{if(!NATIVE&&navigator.wakeLock&&!REC.wake){REC.wake=await navigator.wakeLock.request('screen');REC.wake.addEventListener('release',()=>{REC.wake=null})}}catch(e){}}
function wakeOff(){try{if(REC.wake)REC.wake.release()}catch(e){}REC.wake=null}
function persist(force){
  if(REC.st==='idle'||!REC.pts.length)return;
  const now=Date.now();if(!force&&(!REC.dirty||now-REC.lastSave<10000))return;
  try{localStorage.setItem(RLS,JSON.stringify({sport:REC.sport,t0:REC.t0,pausedMs:REC.pausedMs,st:REC.st,gaps:REC.gaps,gapSec:REC.gapSec,pts:REC.pts.map(p=>[+p.lat.toFixed(6),+p.lon.toFixed(6),p.t,p.ele==null?null:+p.ele.toFixed(1),p.brk?1:0,Math.round(p.cd)])}));REC.dirty=false;REC.lastSave=now}catch(e){}
}
function recClear(){
  Object.assign(REC,{st:'idle',pts:[],t0:0,pausedMs:0,pauseAt:0,dist:0,gain:0,ref:null,ele:null,gaps:0,gapSec:0,needBreak:false,final:null,confirm:'',restore:null,dirty:false,notice:''});
  try{localStorage.removeItem(RLS)}catch(e){}
  wakeOff()
}
function recStart(){
  const sport=REC.sport;recClear();REC.sport=sport;
  REC.st='run';REC.t0=Date.now();REC.err='';
  stopWatch();startWatch();wakeOn();render()
}
function recPause(){REC.st='pause';REC.pauseAt=Date.now();REC.confirm='';persist(true);render()}
function recResume(){REC.pausedMs+=Date.now()-REC.pauseAt;REC.pauseAt=0;REC.needBreak=true;REC.st='run';REC.confirm='';startWatch();wakeOn();render()}
function recFinishNow(){
  if(REC.st==='run')REC.pauseAt=Date.now();
  REC.confirm='';
  if(REC.pts.length<2){REC.err='Se registraron muy pocos puntos GPS, no hay nada que guardar.';recClear();render();return}
  const a=build(REC.pts.map(p=>({lat:p.lat,lon:p.lon,t:p.t,ele:p.ele,hr:null,brk:p.brk})),{sport:REC.sport,src:'gps'});
  if(a.dist<50){REC.err='Se registraron menos de 50 m, no hay nada que guardar.';recClear();render();return}
  REC.final=a;REC.st='review';wakeOff();stopWatch();persist(true);render()
}
function recRestore(){
  const d=REC.restore;if(!d)return;
  REC.sport=d.sport;REC.pts=d.pts.map(q=>({lat:q[0],lon:q[1],t:q[2],ele:q[3],brk:!!q[4],cd:q[5]}));REC.gaps=d.gaps||0;REC.gapSec=d.gapSec||0;REC.restore=null;REC.st='pause';REC.pauseAt=Date.now();
  recFinishNow()
}

/* ---------- mapa en vivo ---------- */
function liveMap(w){
  const h=Math.round(Math.min(380,Math.max(240,w*.72))),col='var(--'+(REC.sport==='run'?'run':'ride')+')',cur=REC.fix,pts=REC.pts;
  let s='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Mapa de tu recorrido en vivo">';
  if(!pts.length&&!cur)return s+'<text class="ax" x="'+w/2+'" y="'+h/2+'" text-anchor="middle">Esperando señal GPS…</text></svg>';
  const all=pts.map(p=>[p.lat,p.lon]);if(cur)all.push([cur.lat,cur.lon]);
  let la=0,lo=0;for(const q of all){la+=q[0];lo+=q[1]}la/=all.length;lo/=all.length;
  const pr=project(all.concat([[la+.0009,lo+.0012],[la-.0009,lo-.0012]]),w,h,30);
  let sp=50000;for(const c of[50,100,200,500,1000,2000,5000,10000,20000]){if(c*pr.ppm>=60){sp=c;break}}
  const g=sp*pr.ppm;
  for(let x=g;x<w;x+=g)s+='<line class="grl" x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="0" y2="'+h+'"/>';
  for(let y=h-g;y>0;y-=g)s+='<line class="grl" x1="0" x2="'+w+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/>';
  if(pts.length){
    const st=Math.max(1,Math.ceil(pts.length/700));let d='';
    pts.forEach((p,i)=>{if(i%st&&!p.brk&&i!==pts.length-1)return;d+=((i===0||p.brk)?'M':'L')+pr.x(p.lon).toFixed(1)+' '+pr.y(p.lat).toFixed(1)});
    s+='<path d="'+d+'" fill="none" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" style="stroke:var(--surface)"/><path d="'+d+'" fill="none" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" style="stroke:'+col+'"/>';
    s+='<circle cx="'+pr.x(pts[0].lon).toFixed(1)+'" cy="'+pr.y(pts[0].lat).toFixed(1)+'" r="6" style="fill:var(--ink);stroke:var(--surface);stroke-width:2.5"/>'
  }
  if(cur){const x=pr.x(cur.lon).toFixed(1),y=pr.y(cur.lat).toFixed(1);s+='<circle cx="'+x+'" cy="'+y+'" r="15" style="fill:'+col+';opacity:.22"/><circle cx="'+x+'" cy="'+y+'" r="7" style="fill:'+col+';stroke:var(--surface);stroke-width:3"/>'}
  s+='<line x1="14" x2="'+(14+g).toFixed(1)+'" y1="'+(h-16)+'" y2="'+(h-16)+'" stroke-width="2" style="stroke:var(--ink)"/><text class="ax" x="'+(22+g).toFixed(1)+'" y="'+(h-12)+'">'+(sp>=1000?sp/1000+' km':sp+' m')+' por cuadro</text><text class="axl" x="'+(w-14)+'" y="22" text-anchor="end">N ↑</text>';
  return s+'</svg>'
}
function gpsHtml(){
  if(REC.err)return'<span class="sig bad">'+esc(REC.err)+'</span>';
  if(REC.acc==null)return'<span class="sig">Buscando señal GPS…</span>';
  const a=Math.round(REC.acc),q=a<=12?['good','buena']:a<=25?['ok','regular']:['bad','débil'];
  return'<span class="sig '+q[0]+'"><i></i>Señal '+q[1]+' · ±'+a+' m</span>'
}
function recLive(map){
  if(S.view!=='rec')return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&e.textContent!==v)e.textContent=v};
  if(recActive()){
    const el=elapsedMs()/1000,sp=curSpeed();
    set('r-time',dur(el));{const te=document.getElementById('r-time');if(te)te.classList.toggle('long',te.textContent.length>5)}set('r-dist',f2.format(REC.dist/1000));
    set('r-cur',sp>.3?(REC.sport==='run'?pace(1000/sp):f1.format(sp*3.6)):'–');
    set('r-avg',REC.dist>20&&el>0?(REC.sport==='run'?pace(el/(REC.dist/1000)):f1.format(REC.dist/1000/(el/3600))):'–');
    set('r-gain',f0.format(REC.gain))
  }
  const g=document.getElementById('r-gps');if(g)g.innerHTML=gpsHtml();
  if(map){const m=document.getElementById('r-map');if(m)m.innerHTML=liveMap(Math.floor(m.clientWidth)||320)}
}
function recSync(){
  if(S.view==='rec'&&REC.st==='idle')startWatch();
  else if(REC.st==='idle'||REC.st==='review')stopWatch()
}

/* ---------- pantallas de grabación ---------- */
function viewRec(){
  if(REC.st==='review')return viewReview();
  const sp=REC.sport,lbl=SPORT[sp].label;
  if(REC.st==='idle'){
    let h='';
    if(REC.restore){const d=REC.restore,last=d.pts[d.pts.length-1];h+='<div class="banner" style="flex-direction:column;align-items:stretch"><span>Quedó una actividad sin guardar ('+f2.format(last[5]/1000)+' km, '+SPORT[d.sport].label.toLowerCase()+'). Puede que la app se haya cerrado mientras grababas.</span><div class="chips"><button class="btn" data-act="recrestore">Terminar y guardar</button><button class="btn ghost" data-act="recdropold">Descartar</button></div></div>'}
    h+='<div class="panel"><h2>Nueva actividad</h2><div style="height:12px"></div><div class="chips" role="group" aria-label="Deporte">'+chip('recsport','run','Correr',sp==='run')+chip('recsport','ride','Ciclismo',sp==='ride')+'</div><div style="height:12px"></div><div id="r-gps" class="gps"></div><div style="height:12px"></div><button class="btn big" data-act="recstart">Comenzar</button><p class="note" style="margin:12px 0 0">'+(BGG?'Puedes bloquear el teléfono o usar otras aplicaciones: la grabación continúa en segundo plano.':'Mantén esta pantalla abierta y encendida mientras grabas. Si el teléfono la apaga o cambias de aplicación, el GPS deja de registrar.')+'</p></div>';
    h+='<div class="panel"><h3>Tu ubicación</h3><div id="r-map" class="chart"></div></div>';
    if(REC.err)h+='';
    return h
  }
  const paused=REC.st==='pause';
  let h='<div class="panel"><div class="bar"><span class="tag s-'+sp+'">'+lbl+'</span><span class="rstate">'+(paused?'En pausa':'<i class="recdot"></i>Grabando')+'</span></div><div class="rec-hero"><div class="rec-ring'+(paused?' paused':'')+'"><div class="rec-time" id="r-time">0:00</div><div class="lbl">Tiempo</div></div></div>';
  h+='<div class="rec-grid"><div><div class="lbl">Distancia</div><div class="val"><span id="r-dist">0,00</span><small>km</small></div></div><div><div class="lbl">'+(sp==='run'?'Ritmo actual':'Velocidad actual')+'</div><div class="val"><span id="r-cur">–</span><small>'+(sp==='run'?'/km':'km/h')+'</small></div></div><div><div class="lbl">'+(sp==='run'?'Ritmo medio':'Velocidad media')+'</div><div class="val"><span id="r-avg">–</span><small>'+(sp==='run'?'/km':'km/h')+'</small></div></div><div><div class="lbl">Desnivel positivo</div><div class="val"><span id="r-gain">0</span><small>m</small></div></div></div>';
  if(REC.confirm==='finish')h+='<div class="msg" style="margin:14px 0 8px">¿Terminar la actividad? Podrás revisarla antes de guardarla.</div><div class="recbar"><button class="btn big" data-act="recfinishyes">Sí, terminar</button><button class="btn big ghost" data-act="recback">Seguir</button></div>';
  else h+='<div class="recbar" style="margin-top:16px">'+(paused?'<button class="btn big" data-act="recresume">Reanudar</button>':'<button class="btn big ghost" data-act="recpause">Pausar</button>')+'<button class="btn big stop" data-act="recfinish">Terminar</button></div>';
  h+='<div id="r-gps" class="gps" style="margin-top:12px"></div><p class="note" style="margin:8px 0 0">'+(BGG?'Puedes bloquear el teléfono: la grabación sigue en segundo plano.':navigator.wakeLock?'Se intenta mantener la pantalla encendida; aun así, no cambies de aplicación mientras grabas.':'Tu navegador no puede mantener la pantalla encendida: no la bloquees mientras grabas.')+'</p></div>';
  h+='<div class="panel"><div id="r-map" class="chart"></div></div>';
  return h
}
function viewReview(){
  const a=REC.final,col='var(--'+(a.sport==='run'?'run':'ride')+')';
  const rows=[['Distancia',f2.format(a.dist/1000),'km'],['Tiempo',dur(a.time),''],[a.sport==='run'?'Ritmo medio':'Velocidad media',a.sport==='run'?pace(spk(a)):f1.format(kmh(a)),a.sport==='run'?'/km':'km/h'],['Desnivel positivo',f0.format(a.elev),'m']];
  if(a.elapsed-a.time>60)rows.push(['Tiempo total',dur(a.elapsed),'']);
  let h='<div class="panel"><h2>Revisa tu actividad</h2><div style="height:12px"></div><div class="form"><div class="field"><label for="rv-name">Nombre</label><input id="rv-name" value="'+esc(a.name)+'" maxlength="80"></div><div class="field"><label for="rv-sport">Deporte</label><select id="rv-sport"><option value="run"'+(a.sport==='run'?' selected':'')+'>Correr</option><option value="ride"'+(a.sport==='ride'?' selected':'')+'>Ciclismo</option></select></div></div><div class="note cap" style="margin-top:8px">'+dFull(a.start)+' · '+tClock(a.start)+'</div></div>';
  h+='<div class="panel"><h3>Ruta</h3><div style="height:8px"></div>'+job(w=>routeMap(a,w,'pace'))+mapLegend(a,'pace')+'</div>';
  h+='<div class="panel"><div class="stats">'+rows.map(r=>'<div><div class="lbl">'+r[0]+'</div><div class="val">'+r[1]+(r[2]?'<small>'+r[2]+'</small>':'')+'</div></div>').join('')+'</div>';
  if(REC.gaps>0)h+='<p class="note" style="margin:12px 0 0">El GPS dejó de registrar '+REC.gaps+(REC.gaps===1?' vez':' veces')+' ('+durLong(REC.gapSec)+' en total). Esos tramos se miden en línea recta.</p>';
  h+='<p class="note" style="margin:8px 0 0">El desnivel viene del GPS del teléfono y es aproximado.</p></div>';
  if(REC.confirm==='discard')h+='<div class="panel"><div class="msg" style="margin:0 0 10px">¿Descartar esta actividad? Se pierde el recorrido.</div><div class="recbar"><button class="btn big danger" data-act="recdiscardyes">Sí, descartar</button><button class="btn big ghost" data-act="recback">No</button></div></div>';
  else h+='<div class="recbar"><button class="btn big" data-act="recsave">Guardar actividad</button><button class="btn big ghost" data-act="recdiscard">Descartar</button></div>';
  return h
}
function recAct(a,t){
  if(a==='recsport'){REC.sport=t.dataset.val;render();return true}
  if(a==='recstart'){recStart();return true}
  if(a==='recpause'){recPause();return true}
  if(a==='recresume'){recResume();return true}
  if(a==='recfinish'){REC.confirm='finish';render();return true}
  if(a==='recfinishyes'){recFinishNow();return true}
  if(a==='recback'){REC.confirm='';render();return true}
  if(a==='recdiscard'){REC.confirm='discard';render();return true}
  if(a==='recdiscardyes'){recClear();render();return true}
  if(a==='recrestore'){recRestore();return true}
  if(a==='recdropold'){REC.restore=null;try{localStorage.removeItem(RLS)}catch(e){}render();return true}
  if(a==='recsave'){
    const f=REC.final;f.name=(f.name||'').trim()||autoName(f.sport,f.start);
    queue(async()=>{await store.save(f);return true}).then(ok=>{if(ok){recClear();toast('Actividad guardada');S.sel=f.id;S.mapBy='pace';go('detail')}else toast('No se pudo guardar. Tu actividad sigue aquí, intenta de nuevo.')});
    return true}
  return false
}
document.addEventListener('input',e=>{if(e.target.id==='rv-name'&&REC.final)REC.final.name=e.target.value});
document.addEventListener('change',e=>{if(e.target.id==='rv-sport'&&REC.final){REC.final.sport=e.target.value;render()}});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){REC.hiddenAt=Date.now();persist(true)}
  else if(recActive()&&!BGG){stopWatch();startWatch();wakeOn()}
});
window.addEventListener('pagehide',()=>persist(true));
window.addEventListener('beforeunload',e=>{if(recActive()){e.preventDefault();e.returnValue=''}});
setInterval(()=>{if(recActive()){recLive(false);persist(false);if(REC.st==='run'&&!REC.wake)wakeOn()}},1000);

/* ---------- avisos, render, navegación ---------- */
function renderNotices(){
  let h='';
  if(S.user&&navigator.onLine===false)h+='<div class="banner"><span>Sin conexión. Puedes ver lo que ya cargó, pero no guardar cambios.</span></div>';
  if(S.err)h+='<div class="banner err"><span>'+esc(S.err)+'</span><button class="btn ghost" data-act="dismiss">Cerrar</button></div>';
  $('#notices').innerHTML=h;
  $('#storeNote').innerHTML=S.user?esc(S.user.email||'')+' · <button class="back" data-act="signout">Salir</button>':''
}
const APP_VIEWS=['home','rec','list','detail','records','add'];
function render(){
  jobs=[];
  const inApp=!!S.user&&APP_VIEWS.includes(S.view);
  $('#tabs').hidden=!inApp;
  document.querySelector('.top').hidden=(S.view==='auth'||S.view==='recover');
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===(S.view==='detail'?'list':S.view))));
  const rt=document.querySelector('#tabs [data-view=rec]');if(rt)rt.classList.toggle('on',recActive());
  renderNotices();
  const app=$('#app');
  if(S.view==='auth'){app.innerHTML=authView();return}
  if(S.view==='recover'){app.innerHTML=recoverView();return}
  if(S.view==='boot'||!S.user){app.innerHTML='<div class="empty">Cargando…</div>';return}
  if(!S.loaded){app.innerHTML='<div class="empty">Cargando tus actividades…</div>';return}
  const v={home:viewHome,list:viewList,detail:viewDetail,records:viewRecords,add:viewAdd,rec:viewRec}[S.view]||viewHome;
  app.innerHTML=v();mountJobs();if(S.view==='rec')recLive(true);recSync()
}
function go(v,top){S.view=v;S.confirm=false;render();if(top!==false)window.scrollTo(0,0)}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act],[data-view]');if(!t)return;
  if(t.dataset.view&&!t.dataset.act)return go(t.dataset.view);
  const a=t.dataset.act,val=t.dataset.val;
  if(a==='nav')go(val);
  else if(a==='sport'){S.sport=val;S.more=40;render()}
  else if(a==='period'){S.period=val;render()}
  else if(a==='open'){S.sel=t.dataset.id;S.mapBy='pace';go('detail')}
  else if(a==='back')go('list');
  else if(a==='mapby'){S.mapBy=val;render()}
  else if(a==='more'){S.more+=40;render()}
  else if(a==='dismiss'){S.err=null;renderNotices()}
  else if(a==='authmode'){S.authMode=val;S.authMsg='';render()}
  else if(a==='signout'){sb.auth.signOut()}
  else if(a==='chpw')setPassword('c-pw',false);
  else if(a==='del'){
    if(!S.confirm){S.confirm=true;render();clearTimeout(S._ct);S._ct=setTimeout(()=>{if(S.confirm){S.confirm=false;if(S.view==='detail')render()}},5000)}
    else{const id=S.sel;S.confirm=false;queue(async()=>{await store.remove(id);return true}).then(ok=>{if(ok){toast('Actividad eliminada');go('list')}})}}
  else if(a==='rmp'){S.pending.splice(+t.dataset.i,1);render()}
  else if(a==='savep'){
    const items=S.pending.filter(p=>p.act&&!p.dup).map(p=>p.act);if(!items.length)return;
    queue(async()=>{for(const a of items)await store.save(a);return true}).then(ok=>{if(ok){S.pending=[];S.sport='all';toast(items.length+(items.length===1?' actividad guardada':' actividades guardadas'));go('list')}})}
  else if(a==='savem')saveManual();
  else if(a==='export')exportData();
  else if(a==='xlsx')exportXlsx();
  else recAct(a,t)
});
document.addEventListener('submit',e=>{
  if(e.target.id==='authform'){e.preventDefault();doAuth()}
  else if(e.target.id==='recoverform'){e.preventDefault();setPassword('r-pw',true)}
});
document.addEventListener('input',e=>{const i=e.target.dataset&&e.target.dataset.pn;if(i!=null&&S.pending[i]&&S.pending[i].act)S.pending[i].act.name=e.target.value.trim()||S.pending[i].act.name});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.ps!=null&&S.pending[t.dataset.ps])S.pending[t.dataset.ps].act.sport=t.value;
  else if(t.id==='files'&&t.files.length){handleFiles(Array.from(t.files));t.value=''}
  else if(t.id==='bk'&&t.files.length){handleBackup(t.files[0]);t.value=''}
  else if(t.id==='d-name'){const a=S.acts.find(x=>x.id===S.sel),n=t.value.trim();if(a&&n&&n!==a.name)queue(async()=>{await store.patch(a.id,{name:n});return true})}
});
document.addEventListener('dragover',e=>{if(e.target.closest&&e.target.closest('#drop'))e.preventDefault()});
document.addEventListener('drop',e=>{if(e.target.closest&&e.target.closest('#drop')){e.preventDefault();const f=Array.from(e.dataTransfer.files).filter(x=>/\.(gpx|tcx)$/i.test(x.name));if(f.length)handleFiles(f)}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.user&&S.view!=='add'&&Date.now()-lastLoad>30000)refresh()});
window.addEventListener('online',renderNotices);window.addEventListener('offline',renderNotices);
try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(S.view!=='add')render()})}catch(e){}
render();
if('serviceWorker' in navigator&&!NATIVE)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
})();
