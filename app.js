/* =========================================================
   VolleyTeam — Player App (companion offline)
   Importa un "pacchetto profilo" generato dall'app del coach.
   ========================================================= */
'use strict';
const APP_VERSION='1.2.0';
const LS='vtm_player_db';
const MONTHS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const today=()=>new Date(new Date().toDateString());
const fmt=iso=>{const d=new Date(iso);return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]}`;};
const fmtDay=iso=>String(new Date(iso).getDate()).padStart(2,'0');
const fmtMon=iso=>MONTHS[new Date(iso).getMonth()];

/* ---------- pacchetto d'esempio (così l'app è subito esplorabile) ---------- */
const SAMPLE={v:1,k:'vtm-player',team:'TEAM',gen:new Date().toISOString(),demo:true,
    p:{name:'Federico Tola',number:7,role:'Schiacciatore',hand:'Dx',height:188,cap:false,vice:true,status:'active',
       goal:'Migliorare la ricezione in zona 5 e tenere alta la percentuale di positiva.'},
    voti:[{d:'2026-06-07',v:7.2,o:'vs San Pio X'},{d:'2026-06-14',v:5.8,o:'vs Dinamo BVL'}],
    season:{matches:2,avgVoto:6.5,atkEff:34,recPos:62,ace:1,blk:0},
    training:{avg:6.9,count:2,byCat:{Ricezione:6.5,Palleggio:7,Attacco:7.5}},
    matches:[
        {d:'2026-06-07',o:'vs San Pio X',res:{w:3,l:1},row:{bErr:2,bAce:1,rTot:22,rPos:15,rPrf:9,aTot:24,aErr:5,aPt:13,mPt:0,voto:7.2}},
        {d:'2026-06-14',o:'vs Dinamo BVL',res:{w:1,l:3},row:{bErr:3,bAce:0,rTot:20,rPos:9,rPrf:5,aTot:22,aErr:8,aPt:9,mPt:0,voto:5.8}}
    ],
    cal:[
        {t:'Partita',d:'2026-06-07',n:'vs San Pio X',res:{w:3,l:1}},
        {t:'Allenamento',d:'2026-06-10',n:'Ricezione + Palleggio',res:null},
        {t:'Allenamento',d:'2026-06-12',n:'Fase cambio-palla',res:null},
        {t:'Partita',d:'2026-06-14',n:'vs Dinamo BVL',res:{w:1,l:3}},
        {t:'Allenamento',d:'2026-06-29',n:'Battuta in salto',res:null},
        {t:'Partita',d:'2026-07-04',n:'vs Ferrini',res:null}
    ],
    att:[{d:'2026-06-10',n:'Ricezione + Palleggio',s:'present'},{d:'2026-06-12',n:'Fase cambio-palla',s:'present'}],
    attPct:100,
    ex:[
        {d:'2026-06-10',n:'Ricezione + Palleggio',note:'Buona spinta gambe, controlla la chiusura del piano in ricezione.',items:[
            {name:'Ricezione in bagher zona 5',cat:'Ricezione',grade:6.5},
            {name:'Palleggio in salto',cat:'Palleggio',grade:7}]},
        {d:'2026-06-12',n:'Fase cambio-palla',note:'Bel braccio in attacco, varia di più le mani.',items:[
            {name:'Attacco da posto 4',cat:'Attacco',grade:7.5}]}
    ]};

/* ---------- stato locale ---------- */
function freshDB(pkg){ return {pkg:pkg||SAMPLE, self:{}, mine:[]}; }
function load(){ try{const r=localStorage.getItem(LS); if(r)return JSON.parse(r);}catch(e){} return {pkg:SAMPLE,self:{},mine:[],onboard:true}; }
let S=load();
function save(){ localStorage.setItem(LS,JSON.stringify(S)); }
const P=()=>S.pkg;

/* ---------- Mental Gym: stato locale (chiave dedicata, nessuna collisione con LS) ---------- */
const MG_LS='vtm_mg_v1';
function mgLoad(){ try{const r=localStorage.getItem(MG_LS); if(r)return JSON.parse(r);}catch(e){} return {calib:null,reaction:[],stroop:[],peripheral:[]}; }
let MG=mgLoad();
function mgSave(){ localStorage.setItem(MG_LS,JSON.stringify(MG)); }

/* ---------- Check-in benessere: stato locale (chiave dedicata, nessuna collisione con LS/MG_LS) ---------- */
const WL_LS='vtm_wellness_v1';
function wlLoad(){ try{const r=localStorage.getItem(WL_LS); if(r)return JSON.parse(r);}catch(e){} return {gender:null,checkins:[]}; }
let WL=wlLoad();
function wlSave(){ localStorage.setItem(WL_LS,JSON.stringify(WL)); }

/* ---------- import ---------- */
function decode(code){ return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
function applyPkg(pkg){
    if(!pkg||pkg.k!=='vtm-player'||!pkg.p) throw new Error('formato');
    S={pkg, self:{}, mine:[], onboard:false};
    if(pkg.photo){ PL_PHOTO=pkg.photo; idbSet('self',pkg.photo); }
    save(); closeOnboarding(); renderAll(); toast('Profilo caricato: '+pkg.p.name);
}
function openImport(){
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-arrow-right-to-bracket" style="color:var(--brand)"></i> Importa profilo</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
        <p style="color:var(--muted);font-size:.88rem;margin-bottom:1rem">Chiedi al mister il <b>file profilo</b> o il <b>codice</b>. Caricalo qui per vedere i tuoi dati reali.</p>
        <input type="file" id="imp-file" accept="application/json" style="display:none" onchange="impFile(event)">
        <button class="btn btn-accent" style="width:100%;margin-bottom:14px" onclick="document.getElementById('imp-file').click()"><i class="fa-solid fa-file-import"></i> Carica file profilo</button>
        <label style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600">Oppure incolla il codice</label>
        <textarea id="imp-code" style="height:90px;margin-top:6px;font-family:monospace;font-size:.72rem" placeholder="Incolla qui il codice…"></textarea>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="impCode()"><i class="fa-solid fa-check"></i> Carica codice</button>
        <div style="text-align:center;margin-top:1rem;border-top:1px solid var(--line-soft);padding-top:1rem">
            <span style="color:var(--muted);font-size:.82rem">Non hai un codice? </span><button class="link-btn" onclick="editMyProfile()">Crea il profilo a mano</button></div>
        </div>`);
}
function impCode(){ try{applyPkg(decode(document.getElementById('imp-code').value));closeModal();}catch(e){toast('Codice non valido','danger');} }
function impFile(e){ const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{applyPkg(JSON.parse(r.result));closeModal();}catch(err){toast('File non valido','danger');}};r.readAsText(f);e.target.value='';}

/* ---------- chart ---------- */
function svgLine(values){
    if(!values.length) return '<div class="empty-chart">Nessun voto ancora</div>';
    const w=520,h=160,pad=26,min=2,max=10,iw=w-pad*2,ih=h-pad*2,n=values.length;
    const X=i=>pad+(n===1?iw/2:iw*i/(n-1)), Y=v=>pad+ih*(1-(v-min)/(max-min));
    const pts=values.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area=`${pad},${pad+ih} ${pts} ${pad+iw},${pad+ih}`;
    let grid='';[4,6,8].forEach(g=>{const y=Y(g);grid+=`<line class="" x1="${pad}" y1="${y}" x2="${pad+iw}" y2="${y}" stroke="var(--line-soft)"/><text class="chart-axis" x="${pad-5}" y="${y+3}" text-anchor="end">${g}</text>`;});
    const dots=values.map((v,i)=>`<circle class="spark-dot" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.6"/>`).join('');
    return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="sf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--brand)" stop-opacity=".28"/><stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
        <g>${grid}</g><polygon points="${area}" fill="url(#sf)"/><polyline class="spark-line" points="${pts}"/>${dots}</svg></div>`;
}

/* ---------- helpers ---------- */
function nextEvent(){const t=today();return (P().cal||[]).filter(e=>new Date(e.d+'T00:00:00')>=t).sort((a,b)=>new Date(a.d)-new Date(b.d))[0]||null;}
function form(){const v=(P().voti||[]).map(x=>x.v);if(v.length<2)return{d:'flat',t:'→ stabile'};
    const la=(v.slice(-2).reduce((a,b)=>a+b,0))/2, pa=v.slice(0,-2).length?v.slice(0,-2).reduce((a,b)=>a+b,0)/v.slice(0,-2).length:la,df=la-pa;
    return df>0.25?{d:'up',t:'↑ in crescita'}:df<-0.25?{d:'down',t:'↓ in calo'}:{d:'flat',t:'→ stabile'};}

/* =========================================================
   RENDER
   ========================================================= */
function renderAll(){
    document.getElementById('bar-team').textContent=P().team&&P().team!=='TEAM'?P().team:'Player';
    renderProfilo();renderStats();renderCalendar();renderTraining();renderProgress();
}
const SPORTS_P={
  pallavolo:{roles:['Palleggiatore','Schiacciatore','Centrale','Opposto','Libero']},
  calcio:{roles:['Portiere','Difensore','Centrocampista','Attaccante']},
  basket:{roles:['Playmaker','Guardia','Ala piccola','Ala grande','Centro']}
};
const sportOf=()=> (P().sport && SPORTS_P[P().sport]) ? P().sport : 'pallavolo';
function courtSVG(sport){
  if(sport==='pallavolo'){ return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none"><rect x="6" y="6" width="388" height="188" fill="none" stroke="#22C55E" stroke-width="2"/><line x1="200" y1="6" x2="200" y2="194" stroke="#22C55E" stroke-width="2.5"/><line x1="135" y1="6" x2="135" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/><line x1="265" y1="6" x2="265" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/></svg>`; }
  const c='rgba(255,255,255,.85)';
  if(sport==='calcio'){ return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none"><rect x="6" y="6" width="388" height="188" fill="none" stroke="${c}" stroke-width="2"/><line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2"/><circle cx="200" cy="100" r="34" fill="none" stroke="${c}" stroke-width="2"/><rect x="6" y="55" width="58" height="90" fill="none" stroke="${c}" stroke-width="2"/><rect x="336" y="55" width="58" height="90" fill="none" stroke="${c}" stroke-width="2"/></svg>`; }
  return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none"><rect x="6" y="6" width="388" height="188" fill="none" stroke="${c}" stroke-width="2"/><line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2"/><circle cx="200" cy="100" r="26" fill="none" stroke="${c}" stroke-width="2"/><rect x="6" y="64" width="74" height="72" fill="none" stroke="${c}" stroke-width="2"/><rect x="320" y="64" width="74" height="72" fill="none" stroke="${c}" stroke-width="2"/><path d="M80 64 A36 36 0 0 1 80 136" fill="none" stroke="${c}" stroke-width="2"/><path d="M320 64 A36 36 0 0 0 320 136" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
}

function demoBanner(){ return P().demo? `<div class="demo-banner" style="flex-direction:column;align-items:stretch;gap:10px"><div style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-circle-info"></i> Stai vedendo dati d'esempio.</div>
    <div style="display:flex;gap:8px"><button class="btn btn-accent" style="flex:1;padding:9px" onclick="editMyProfile()"><i class="fa-solid fa-user-pen"></i> Crea il mio profilo</button>
    <button class="btn btn-ghost" style="flex:1;padding:9px" onclick="openImport()"><i class="fa-solid fa-arrow-right-to-bracket"></i> Importa dal mister</button></div></div>`:''; }

function renderProfilo(){
    const p=P().p, f=form(), ne=nextEvent();
    let next='';
    if(ne){const days=Math.round((new Date(ne.d+'T00:00:00')-today())/86400000);
        next=`<div class="card"><div class="next-card"><div class="cd-circle"><b class="num">${days}</b><span>${days===1?'giorno':'giorni'}</span></div>
            <div class="next-info"><b>${ne.n}</b><span>${fmt(ne.d)} · <span class="pill ${ne.t==='Partita'?'match':'train'}">${ne.t}</span></span></div></div></div>`;}
    const goal=p.goal? `<div class="card"><div class="goal-box"><i class="fa-solid fa-bullseye"></i><div><div class="l">Obiettivo dal mister</div><p>${p.goal}</p></div></div></div>`:'';
    plMediaCSS();
    const avatar=`<div class="pl-avatar" onclick="pickPhoto()"><div class="im">${PL_PHOTO?`<img src="${PL_PHOTO}">`:`<div class="ph">＋<br>foto</div>`}</div><div class="cam"><i class="fa-solid fa-camera"></i></div></div>`;
    document.getElementById('profilo').innerHTML=`${demoBanner()}
        <div class="phero">${courtSVG(sportOf())}
            ${avatar}
            <div class="jersey-big ${p.cap?'cap':''}">${p.number}${p.cap?'<span class="lead">👑</span>':p.vice?'<span class="lead">🥈</span>':''}</div>
            <h2>${p.name}</h2><div class="role">${p.role} · ${p.hand} · ${p.height?p.height+' cm':''}</div>
            <div class="chips">
                <div class="chip">Media <span class="v num">${P().season.avgVoto?P().season.avgVoto.toFixed(1):'—'}</span></div>
                <div class="chip ${f.d}">Forma <span class="v">${f.t}</span></div>
                <div class="chip">Presenza <span class="v num">${P().attPct!=null?P().attPct+'%':'—'}</span></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%">
                <button class="pl-cardbtn" onclick="openMyCard()"><i class="fa-solid fa-id-card"></i> La mia card</button>
                ${P().lineup?`<button class="pl-cardbtn" onclick="openLineup()"><i class="fa-solid fa-people-group"></i> Formazione</button>`:''}
                <button class="pl-cardbtn" onclick="mgOpen()"><i class="fa-solid fa-brain"></i> Mental Gym</button>
                <button class="pl-cardbtn" onclick="wlOpen()"><i class="fa-solid fa-heart-pulse"></i> Check-in benessere</button>
            </div>
        </div>
        ${next}${goal}`;
}

function renderStats(){
    const s=P().season, voti=(P().voti||[]).map(v=>v.v);
    const cell=(l,v,suf='')=>`<div class="stat-cell"><div class="l">${l}</div><div class="v num">${v}${suf?`<small>${suf}</small>`:''}</div></div>`;
    const volleyMatchCells=r=>[['Bat. A/E',`${r.bAce}/${r.bErr}`],['Ric+',r.rTot?Math.round((r.rPos+r.rPrf)/r.rTot*100)+'%':'—'],['Att%',r.aTot?Math.round((r.aPt-r.aErr)/r.aTot*100)+'%':'—']];
    const M=P().matches||[];
    const mLabels=(M[0]&&M[0].cells)? M[0].cells.map(c=>c[0]) : ['Bat. A/E','Ric+','Att%'];
    let rows=M.map(m=>{
        const cs=m.cells? m.cells : volleyMatchCells(m.row||{});
        const voto=(m.voto!=null?m.voto:((m.row&&m.row.voto)||0));
        const tds=cs.map(c=>`<td class="num">${c[1]}</td>`).join('');
        return `<tr><td class="l">${m.o}<div style="font-size:.7rem;color:var(--muted-2)">${fmt(m.d)}</div></td>${tds}<td class="num voto" style="color:var(--brand);font-weight:800">${(+voto).toFixed(1)}</td></tr>`;
    }).join('');
    if(!rows) rows=`<tr><td colspan="${mLabels.length+2}" style="color:var(--muted-2);padding:1.4rem;font-style:italic">Nessuna gara registrata</td></tr>`;
    const seasonCells=(s.cells&&s.cells.length)? s.cells
        : [['Efficienza attacco',s.atkEff!=null?s.atkEff:'—','%'],['Ricezione positiva',s.recPos!=null?s.recPos:'—','%'],['Ace',s.ace!=null?s.ace:0,'']];
    const tr=P().training||{avg:null,byCat:{}};
    const catKeys=Object.keys(tr.byCat||{}).sort((a,b)=>tr.byCat[b]-tr.byCat[a]);
    const catCard=catKeys.length? `<div class="card"><h3><i class="fa-solid fa-dumbbell"></i> Allenamenti per categoria</h3>`+
        catKeys.map(c=>{const v=tr.byCat[c],pct=Math.round(v/10*100),col=v>=6?'linear-gradient(90deg,var(--brand-deep),var(--brand))':'var(--flame)';
            return `<div style="display:flex;align-items:center;gap:12px;padding:6px 0"><div style="width:100px;font-size:.84rem;font-weight:600">${c}</div>
                <div style="flex:1"><div class="bar-track" style="height:8px"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></div>
                <b class="num" style="width:34px;text-align:right;color:${v>=6?'var(--brand)':'var(--flame)'}">${v.toFixed(1)}</b></div>`;}).join('')+`</div>`:'';
    document.getElementById('statistiche').innerHTML=`<div class="sec-title">Rendimento</div><div class="sec-h">Le mie statistiche</div>
        <div class="card"><h3><i class="fa-solid fa-chart-line"></i> Andamento voti</h3>${svgLine(voti)}</div>
        <div class="card"><h3><i class="fa-solid fa-table-cells"></i> Stagione</h3>
            <div class="stat-grid">${cell('Media voto',s.avgVoto?s.avgVoto.toFixed(1):'—')}${cell('Media allenamenti',tr.avg!=null?tr.avg.toFixed(1):'—')}${seasonCells.map(c=>cell(c[0],c[1],c[2]||'')).join('')}${cell('Gare giocate',s.matches)}</div></div>
        ${catCard}
        <div class="card"><h3><i class="fa-solid fa-list-ol"></i> Gara per gara</h3>
            <div style="overflow-x:auto"><table class="mtable"><thead><tr><th style="text-align:left">Gara</th>${mLabels.map(l=>`<th>${l}</th>`).join('')}<th>Voto</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderCalendar(){
    const t=today();
    const evs=(P().cal||[]).slice().sort((a,b)=>new Date(a.d)-new Date(b.d));
    const ne=nextEvent();
    let html=evs.map(e=>{
        const isM=e.t==='Partita', past=new Date(e.d+'T00:00:00')<t, isNext=ne&&ne.d===e.d&&ne.n===e.n;
        let right=`<span class="pill ${isM?'match':'train'}">${e.t}</span>`;
        if(isM&&e.res){const win=e.res.w>e.res.l;right=`<span class="pill ${win?'win':'loss'}">${e.res.w}-${e.res.l}</span>`;}
        else if(isNext) right=`<span class="pill next">Prossima</span>`;
        return `<div class="ev"><div class="dt" style="${past?'opacity:.5':''}"><b class="num">${fmtDay(e.d)}</b><span>${fmtMon(e.d)}</span></div>
            <div class="info"><b>${e.n}</b></div>${right}</div>`;
    }).join('');
    if(!html) html=`<div class="empty-state"><i class="fa-solid fa-calendar"></i>Nessun evento in calendario</div>`;
    document.getElementById('calendario').innerHTML=`<div class="sec-title">Agenda</div><div class="sec-h">Calendario squadra</div><div class="card">${html}</div>`;
}

function renderTraining(){
    const ex=P().ex||[];
    const RT=[['good','Bene'],['mid','Così così'],['bad','Male']];
    let html=ex.map((sess,si)=>{
        const items=sess.items.map((it,ii)=>{
            const key=`${sess.d}|${si}|${ii}`; const cur=S.self[key];
            const grade=it.grade!=null?`<span class="coach-grade num" style="color:${it.grade>=6?'var(--brand)':'var(--flame)'}">${(+it.grade).toFixed(1)}</span>`:'';
            const cat=it.cat?`<span style="font-size:.68rem;color:var(--muted-2);text-transform:uppercase;letter-spacing:.5px">${it.cat}</span>`:'';
            const inote=it.note?`<div class="coach-note"><i>Mister:</i> ${it.note}</div>`:'';
            const rate=RT.map(([k,l])=>`<button class="${k} ${cur===k?'on':''}" onclick="rate('${key}','${k}')">${l}</button>`).join('');
            return `<div class="ex-item"><div class="top"><span class="name">${it.name} ${cat}</span>${grade}</div>${inote}
                <div class="self-rate">${rate}</div></div>`;
        }).join('');
        const snote=sess.note?`<div class="coach-note" style="margin:2px 0 10px"><i>Mister:</i> ${sess.note}</div>`:'';
        const savg=sess.items.filter(i=>i.grade!=null); const avg=savg.length?(savg.reduce((a,b)=>a+ (+b.grade),0)/savg.length):null;
        return `<div class="session"><div class="sh"><b>${sess.n}</b><span>${fmt(sess.d)}${avg!=null?` · media <b style="color:var(--brand)">${avg.toFixed(1)}</b>`:''}</span></div>${snote}${items}</div>`;
    }).join('');
    if(!html) html=`<div class="empty-state"><i class="fa-solid fa-dumbbell"></i>Nessun esercizio dal mister ancora.<br><span style="font-size:.82rem">Arriveranno qui dopo gli allenamenti.</span></div>`;
    document.getElementById('allenamenti').innerHTML=`<div class="sec-title">Crescita</div><div class="sec-h">Allenamenti</div>
        <p style="color:var(--muted);font-size:.86rem;margin-bottom:1rem;margin-top:-.4rem">Il voto del mister e la tua autovalutazione su ogni esercizio. Sii onesto: serve a te.</p>${html}`;
}
function rate(key,val){ S.self[key]=S.self[key]===val?undefined:val; if(!S.self[key])delete S.self[key]; save(); renderTraining(); }

function renderProgress(){
    const s=P().season, f=form(), att=P().attPct;
    const best=(P().voti||[]).reduce((m,x)=>x.v>m?x.v:m,0);
    const badges=[
        {ic:'fa-fire',n:'In forma',d:'Trend in crescita',ok:f.d==='up'},
        {ic:'fa-star',n:'Top rendimento',d:'Media ≥ 7.0',ok:s.avgVoto!=null&&s.avgVoto>=7},
        {ic:'fa-bolt',n:'Impatto',d:'Un voto ≥ 8.0',ok:best>=8},
        {ic:'fa-user-clock',n:'Presenze d\'oro',d:'≥ 85% presenze',ok:att!=null&&att>=85},
        {ic:'fa-medal',n:'Veterano',d:'≥ 5 gare giocate',ok:s.matches>=5},
        {ic:'fa-heart',n:'Sempre presente',d:'≥ 2 gare giocate',ok:s.matches>=2}
    ];
    const earned=badges.filter(b=>b.ok).length;
    const bg=badges.map(b=>`<div class="badge ${b.ok?'earned':'locked'}"><div class="ic"><i class="fa-solid ${b.ic}"></i></div><b>${b.n}</b><span>${b.d}</span></div>`).join('');
    document.getElementById('progressi').innerHTML=`<div class="sec-title">Obiettivi</div><div class="sec-h">I miei progressi</div>
        <div class="card"><h3><i class="fa-solid fa-user-check"></i> Costanza presenze</h3>
            <div class="bar-track"><div class="bar-fill" style="width:${att||0}%"></div></div>
            <div style="display:flex;justify-content:space-between;margin-top:8px"><span style="color:var(--muted);font-size:.85rem">Presenza agli allenamenti</span><b class="num">${att!=null?att+'%':'—'}</b></div></div>
        <div class="card"><h3><i class="fa-solid fa-star"></i> Record</h3>
            <div class="stat-grid"><div class="stat-cell"><div class="l">Voto più alto</div><div class="v num" style="color:var(--brand)">${best?best.toFixed(1):'—'}</div></div>
            <div class="stat-cell"><div class="l">Gare giocate</div><div class="v num">${s.matches}</div></div></div></div>
        <div class="card"><h3><i class="fa-solid fa-trophy"></i> Distintivi <span style="color:var(--muted);font-weight:600;font-size:.82rem">${earned}/${badges.length}</span></h3>
            <div class="badge-grid">${bg}</div></div>`;
}

/* ---------- nav / modal / toast ---------- */
function go(tab){
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.bottomnav button').forEach(b=>b.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    document.querySelector(`.bottomnav button[data-tab="${tab}"]`).classList.add('active');
    window.scrollTo({top:0,behavior:'instant'});
}
function openModal(html){document.getElementById('modal').innerHTML=html;document.getElementById('modal-overlay').classList.add('show');}
function closeModal(){document.getElementById('modal-overlay').classList.remove('show');if(typeof mgBump==='function')mgBump();}
document.getElementById('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay')closeModal();});
function toast(msg,type='success'){
    const s=document.getElementById('toast-stack');const el=document.createElement('div');el.className=`toast ${type}`;
    el.innerHTML=`<i class="fa-solid ${type==='danger'?'fa-circle-xmark':'fa-circle-check'}"></i><span>${msg}</span>`;
    s.appendChild(el);setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},3000);
}

renderAll();
if(S.onboard) showOnboarding();
idbGet('self').then(d=>{ if(d){ PL_PHOTO=d; renderProfilo(); } });
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        if(!nw)return;
        nw.addEventListener('statechange',()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller){
            showUpdateBanner();
          }
        });
      });
    }).catch(()=>{});
  });
}
function showUpdateBanner(){
  if(document.getElementById('upd-banner'))return;
  const b=document.createElement('div');
  b.id='upd-banner';
  b.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(var(--navh) + 12px + env(safe-area-inset-bottom));z-index:60;background:var(--brand);color:#04210f;padding:12px 14px;border-radius:14px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow);font-weight:700;';
  b.innerHTML='<i class="fa-solid fa-rotate"></i> Nuovo aggiornamento disponibile <button style="margin-left:auto;background:#04210f;color:#fff;border:none;padding:8px 12px;border-radius:10px;font-weight:800;cursor:pointer" onclick="location.reload()">Aggiorna</button>';
  document.body.appendChild(b);
}

/* ---------- creazione / modifica profilo a mano ---------- */
function scaffold(sport){ sport=(sport&&SPORTS_P[sport])?sport:'pallavolo';
    return {v:2,k:'vtm-player',sport,team:(P().team&&!P().demo)?P().team:'',demo:false,
        p:{name:'',number:0,role:SPORTS_P[sport].roles[0],hand:'Dx',height:0,cap:false,vice:false,status:'active',goal:''},
        voti:[],season:{matches:0,avgVoto:null,cells:[]},
        training:{avg:null,count:0,byCat:{}},
        matches:[],cal:[],att:[],attPct:null,ex:[]};
}
function plRolesOptions(sport,cur){ return SPORTS_P[sport].roles.map(r=>`<option ${r===cur?'selected':''}>${r}</option>`).join(''); }
function plSyncRoles(){ const sp=document.getElementById('me-sport').value; document.getElementById('me-role').innerHTML=plRolesOptions(sp,''); }
function editMyProfile(forceSport){
    const p=P().p, curSport=(forceSport&&SPORTS_P[forceSport])?forceSport:sportOf();
    const opt=(arr,cur)=>arr.map(r=>`<option ${r===cur?'selected':''}>${r}</option>`).join('');
    const sportOpts=Object.keys(SPORTS_P).map(k=>`<option value="${k}" ${k===curSport?'selected':''}>${k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join('');
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-user-pen" style="color:var(--brand)"></i> ${P().demo?'Crea il mio profilo':'Modifica profilo'}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
        <label style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600">Nome e cognome</label>
        <input id="me-name" style="margin:6px 0 12px" value="${P().demo?'':(p.name||'')}" placeholder="Es. Mario Rossi">
        <div style="display:flex;gap:10px">
            <div style="flex:1"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Squadra</label>
                <input id="me-team" style="margin:6px 0 12px" value="${P().demo?'':(P().team||'')}" placeholder="La tua squadra"></div>
            <div style="width:90px"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">N°</label>
                <input id="me-num" type="number" min="1" max="99" style="margin:6px 0 12px" value="${P().demo?'':(p.number||'')}" placeholder="7"></div>
        </div>
        <label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Sport</label>
        <select id="me-sport" onchange="plSyncRoles()" style="margin:6px 0 12px;width:100%">${sportOpts}</select>
        <div style="display:flex;gap:10px">
            <div style="flex:1"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Ruolo</label>
                <select id="me-role" style="margin:6px 0 12px;width:100%">${plRolesOptions(curSport,P().demo?'':p.role)}</select></div>
            <div style="width:80px"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Mano</label>
                <select id="me-hand" style="margin:6px 0 12px;width:100%">${opt(['Dx','Sx'],p.hand)}</select></div>
            <div style="width:90px"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Altezza</label>
                <input id="me-height" type="number" min="120" max="230" style="margin:6px 0 12px" value="${P().demo?'':(p.height||'')}" placeholder="188"></div>
        </div>
        <label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Obiettivo personale (facoltativo)</label>
        <textarea id="me-goal" style="height:64px;margin:6px 0 4px">${P().demo?'':(p.goal||'')}</textarea>
        <button class="btn btn-accent" style="width:100%;margin-top:1rem" onclick="saveMyProfile()"><i class="fa-solid fa-floppy-disk"></i> Salva profilo</button>
        ${P().demo?'':'<p style="color:var(--muted-2);font-size:.76rem;text-align:center;margin-top:.8rem">Le statistiche restano quelle importate dal mister.</p>'}
        </div>`);
    document.querySelectorAll('.modal input,.modal select,.modal textarea').forEach(el=>{
        el.style.width='100%';el.style.background='var(--surface-2)';el.style.border='1px solid var(--line)';
        el.style.color='var(--text)';el.style.borderRadius='10px';el.style.padding='10px';el.style.fontSize='.9rem';
    });
}
function saveMyProfile(){
    const name=document.getElementById('me-name').value.trim();
    if(!name){toast('Inserisci almeno il nome','danger');return;}
    const sport=document.getElementById('me-sport').value;
    const pkg=P().demo? scaffold(sport) : JSON.parse(JSON.stringify(P()));
    pkg.sport=sport; pkg.demo=false;
    pkg.team=document.getElementById('me-team').value.trim()||pkg.team||'';
    pkg.p.name=name;
    pkg.p.number=parseInt(document.getElementById('me-num').value)||pkg.p.number||0;
    pkg.p.role=document.getElementById('me-role').value;
    pkg.p.hand=document.getElementById('me-hand').value;
    pkg.p.height=parseInt(document.getElementById('me-height').value)||pkg.p.height||0;
    pkg.p.goal=document.getElementById('me-goal').value.trim();
    S.pkg=pkg; S.onboard=false; save(); closeModal(); closeOnboarding(); renderAll(); toast('Profilo salvato');
}

/* =========================================================
   ONBOARDING — intro animata + scelta sport (prima apertura)
   ========================================================= */
var PL_STEP=0, PL_SPORT=null, PL_PHOTO=null;
function plCSS(){
  if(document.getElementById('pl-onb-css'))return;
  const st=document.createElement('style'); st.id='pl-onb-css';
  st.textContent=`
  #pl-onb{position:fixed;inset:0;z-index:300;overflow:hidden;color:var(--text);
    background:radial-gradient(1100px 700px at 80% -10%,rgba(34,197,94,.16),transparent 60%),radial-gradient(900px 600px at 0% 110%,rgba(91,155,255,.12),transparent 55%),linear-gradient(170deg,#0C1526,#060A18 60%);
    display:flex;flex-direction:column;animation:plFade .4s ease;}
  @keyframes plFade{from{opacity:0}to{opacity:1}}
  @keyframes plUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes plFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  #pl-onb .track{display:flex;flex:1;transition:transform .38s cubic-bezier(.4,0,.2,1);}
  #pl-onb .panel{min-width:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:40px 30px;gap:14px;overflow-y:auto;}
  #pl-onb .panel.on>*{animation:plUp .45s ease both;}
  #pl-onb .panel.on>*:nth-child(2){animation-delay:.06s}
  #pl-onb .panel.on>*:nth-child(3){animation-delay:.12s}
  #pl-onb .panel.on>*:nth-child(4){animation-delay:.18s}
  #pl-onb .logo{width:128px;height:128px;border-radius:30px;box-shadow:0 24px 50px -18px rgba(0,0,0,.7);animation:plFloat 3.4s ease-in-out infinite;}
  #pl-onb .ic{font-size:74px;filter:drop-shadow(0 10px 22px rgba(0,0,0,.5));}
  #pl-onb h2{font-family:'Outfit',sans-serif;font-weight:800;font-size:1.85rem;line-height:1.12;}
  #pl-onb p{color:var(--muted);font-size:1.02rem;line-height:1.5;max-width:460px;}
  #pl-onb .brandsub{font-size:.72rem;letter-spacing:3px;text-transform:uppercase;color:var(--brand);font-weight:700;}
  #pl-onb .sports{display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;margin-top:6px;}
  #pl-onb .sp{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:16px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;transition:.18s;}
  #pl-onb .sp .e{font-size:34px;}
  #pl-onb .sp b{font-family:'Outfit',sans-serif;font-size:1.1rem;} #pl-onb .sp span{display:block;color:var(--muted);font-size:.82rem;font-weight:500;}
  #pl-onb .sp.on{border-color:var(--brand);background:rgba(34,197,94,.12);transform:translateY(-1px);}
  #pl-onb .sp .chk{margin-left:auto;color:var(--brand);opacity:0;font-size:1.2rem;} #pl-onb .sp.on .chk{opacity:1;}
  #pl-onb .actions{display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;margin-top:6px;}
  #pl-onb .pbtn{border:0;cursor:pointer;border-radius:14px;padding:15px;font-family:'Outfit',sans-serif;font-weight:800;font-size:1.05rem;}
  #pl-onb .pbtn.primary{background:var(--brand);color:#04140A;}
  #pl-onb .pbtn.ghost{background:var(--surface-2);color:var(--text);border:1px solid var(--line);}
  #pl-onb .link{background:none;border:0;color:var(--muted);font-size:.9rem;cursor:pointer;text-decoration:underline;}
  #pl-onb .nav{display:flex;align-items:center;justify-content:space-between;padding:16px 26px calc(16px + env(safe-area-inset-bottom));}
  #pl-onb .dots{display:flex;gap:8px;} #pl-onb .dots i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.2);transition:.2s;}
  #pl-onb .dots i.on{background:var(--brand);width:26px;border-radius:5px;}
  #pl-onb .nbtn{background:none;border:0;color:var(--text);font-family:'Outfit',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;padding:8px 4px;}
  #pl-onb .nbtn.hidden{visibility:hidden;} #pl-onb .skip{position:absolute;top:14px;right:16px;z-index:2;}
  `;
  document.head.appendChild(st);
}
function plPanels(){
  const logo=`<img class="logo" src="icons/logo-badge.png" alt="">`;
  return [
    {html:`${logo}<div class="brandsub">Player Manager</div><h2>La tua carriera,<br>in un'app.</h2><p>Statistiche, calendario, allenamenti e progressi — sempre in tasca.</p>`},
    {html:`<div class="ic">📊</div><h2>Le tue statistiche</h2><p>Voti, medie e andamento gara per gara. Vedi nero su bianco come stai crescendo.</p>`},
    {html:`<div class="ic">🔄</div><h2>Sincronizzata col mister</h2><p>Ricevi il pacchetto dal tuo allenatore e la tua app si riempie di dati reali.</p>`},
    {html:`<div class="ic">🏆</div><h2>Progressi e obiettivi</h2><p>Autovaluta gli allenamenti e sblocca i distintivi. La motivazione che cresce.</p>`},
    {sport:true, html:`<div class="ic">🎯</div><h2>Qual è il tuo sport?</h2><p>Così l'app imposta ruoli e statistiche giuste per te.</p>
      <div class="sports">
        <div class="sp" data-sp="pallavolo"><span class="e">🏐</span><div style="text-align:left"><b>Pallavolo</b><span>palleggiatore, schiacciatore…</span></div><i class="chk fa-solid fa-circle-check"></i></div>
        <div class="sp" data-sp="calcio"><span class="e">⚽</span><div style="text-align:left"><b>Calcio</b><span>portiere, difensore, attaccante…</span></div><i class="chk fa-solid fa-circle-check"></i></div>
        <div class="sp" data-sp="basket"><span class="e">🏀</span><div style="text-align:left"><b>Basket</b><span>playmaker, ala, centro…</span></div><i class="chk fa-solid fa-circle-check"></i></div>
      </div>`},
    {last:true, html:`<div class="ic">🚀</div><h2>Tutto pronto!</h2><p>Come vuoi iniziare?</p>
      <div class="actions">
        <button class="pbtn primary" onclick="plImport()"><i class="fa-solid fa-arrow-right-to-bracket"></i> Importa dal mister</button>
        <button class="pbtn ghost" onclick="plCreate()"><i class="fa-solid fa-user-pen"></i> Crea il mio profilo</button>
        <button class="link" onclick="plDemo()">Guarda un esempio</button>
      </div>`}
  ];
}
function showOnboarding(){
  if(document.getElementById('pl-onb'))return;
  plCSS(); PL_STEP=0; PL_SPORT=null;
  const panels=plPanels();
  const o=document.createElement('div'); o.id='pl-onb';
  o.innerHTML=`<button class="link skip" onclick="plDemo()">Salta</button>
    <div class="track" id="pl-track">${panels.map(p=>`<div class="panel">${p.html}</div>`).join('')}</div>
    <div class="nav">
      <button class="nbtn hidden" id="pl-back" onclick="plGo(PL_STEP-1)">Indietro</button>
      <div class="dots" id="pl-dots">${panels.map((_,i)=>`<i class="${i===0?'on':''}"></i>`).join('')}</div>
      <button class="nbtn" id="pl-next" onclick="plNext()">Avanti</button>
    </div>`;
  document.body.appendChild(o);
  o.querySelectorAll('.sp').forEach(el=>el.onclick=()=>{PL_SPORT=el.dataset.sp;
    o.querySelectorAll('.sp').forEach(x=>x.classList.toggle('on',x===el));});
  plRender(); plSwipe(o);
}
function plRender(){
  const panels=plPanels();
  const t=document.getElementById('pl-track'); if(!t)return;
  t.style.transform=`translateX(-${PL_STEP*100}%)`;
  document.querySelectorAll('#pl-onb .panel').forEach((p,i)=>p.classList.toggle('on',i===PL_STEP));
  document.querySelectorAll('#pl-dots i').forEach((d,i)=>d.classList.toggle('on',i===PL_STEP));
  document.getElementById('pl-back').classList.toggle('hidden',PL_STEP===0);
  document.getElementById('pl-next').style.visibility= panels[PL_STEP].last?'hidden':'visible';
}
function plGo(i){ const n=plPanels().length; PL_STEP=Math.max(0,Math.min(n-1,i)); plRender(); }
function plNext(){ const panels=plPanels();
  if(panels[PL_STEP].sport && !PL_SPORT){ toast('Scegli uno sport per continuare','danger'); return; }
  plGo(PL_STEP+1);
}
function plSwipe(o){ let x0=null;
  o.addEventListener('pointerdown',e=>{x0=e.clientX;});
  o.addEventListener('pointerup',e=>{ if(x0==null)return; const dx=e.clientX-x0; x0=null;
    if(Math.abs(dx)<50)return; if(dx<0) plNext(); else plGo(PL_STEP-1); });
}
function closeOnboarding(){ const o=document.getElementById('pl-onb'); if(o)o.remove(); }
function plImport(){ closeOnboarding(); openImport(); }
function plCreate(){ closeOnboarding(); editMyProfile(PL_SPORT||'pallavolo'); }
function plDemo(){ S.pkg=demoFor(PL_SPORT||'pallavolo'); S.onboard=false; save(); closeOnboarding(); renderAll(); }
function demoFor(sport){
  const base=JSON.parse(JSON.stringify(SAMPLE)); base.sport=sport; base.demo=true;
  base.p.role=SPORTS_P[sport].roles[Math.min(1,SPORTS_P[sport].roles.length-1)];
  const D={
    pallavolo:{c:[['Efficienza attacco',34,'%'],['Ricezione positiva',62,'%'],['Ace',1,'']],m:[['Efficienza attacco','30%'],['Ricezione positiva','60%'],['Ace','1']]},
    calcio:{c:[['Gol',3,''],['Assist',2,''],['Tiri in porta',7,'']],m:[['Gol','1'],['Assist','1'],['Tiri in porta','3']]},
    basket:{c:[['Punti',14,''],['Rimbalzi',6,''],['Assist',4,'']],m:[['Punti','14'],['Rimbalzi','6'],['Assist','4']]}
  }[sport]||{c:[],m:[]};
  base.season={matches:2,avgVoto:6.5,cells:D.c};
  base.matches=(base.matches||[]).map((mm,i)=>({d:mm.d,o:mm.o,res:mm.res,voto:mm.row?mm.row.voto:(i?5.8:7.2),cells:D.m}));
  return base;
}

/* =========================================================
   FOTO (IndexedDB) + CARD stile FC
   ========================================================= */
function idb(){ return new Promise((res,rej)=>{const r=indexedDB.open('pm-media',1);
  r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('img')) r.result.createObjectStore('img'); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }
async function idbGet(k){ try{const db=await idb(); return await new Promise(res=>{const t=db.transaction('img').objectStore('img').get(k); t.onsuccess=()=>res(t.result||null); t.onerror=()=>res(null);});}catch(e){return null;} }
async function idbSet(k,v){ try{const db=await idb(); return await new Promise(res=>{const t=db.transaction('img','readwrite').objectStore('img').put(v,k); t.onsuccess=()=>res(true); t.onerror=()=>res(false);});}catch(e){return false;} }
async function idbDel(k){ try{const db=await idb(); db.transaction('img','readwrite').objectStore('img').delete(k);}catch(e){} }

function plMediaCSS(){
  if(document.getElementById('pl-media-css'))return;
  const st=document.createElement('style'); st.id='pl-media-css';
  st.textContent=`
  .rp-checker{background:conic-gradient(#3a3f47 25%,#262a30 0 50%,#3a3f47 0 75%,#262a30 0) 0 0/22px 22px;}
  .pl-avatar{width:104px;height:104px;border-radius:50%;margin:2px auto 8px;position:relative;cursor:pointer;
    border:3px solid var(--brand);background:var(--surface-2);overflow:visible;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 28px -12px rgba(0,0,0,.65);}
  .pl-avatar>.im{width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;}
  .pl-avatar img{width:100%;height:100%;object-fit:cover;}
  .pl-avatar .ph{color:var(--muted);font-size:.72rem;font-weight:800;text-align:center;line-height:1.15;}
  .pl-avatar .cam{position:absolute;bottom:-2px;right:-2px;width:32px;height:32px;border-radius:50%;background:var(--brand);color:#04140A;display:flex;align-items:center;justify-content:center;border:3px solid #0b1424;font-size:.78rem;}
  .pl-cardbtn{width:100%;margin-top:12px;background:linear-gradient(90deg,var(--brand-deep),var(--brand));color:#04140A;border:0;border-radius:12px;padding:12px;font-weight:800;font-family:'Outfit',sans-serif;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}
  .fc-wrap{display:flex;flex-direction:column;align-items:center;}
  .fc{position:relative;width:300px;max-width:100%;border-radius:24px;overflow:hidden;background:linear-gradient(160deg,var(--fc-a),var(--fc-b));padding:18px 18px 20px;color:#0b1220;box-shadow:0 30px 70px -24px rgba(0,0,0,.75);}
  .fc::before{content:"";position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.4),transparent 38%,transparent 60%,rgba(255,255,255,.22));mix-blend-mode:overlay;pointer-events:none;}
  .fc .top{display:flex;justify-content:space-between;align-items:flex-start;position:relative;}
  .fc .ovr{text-align:center;line-height:.95;} .fc .ovr b{font-family:'Outfit',sans-serif;font-size:2.5rem;font-weight:900;display:block;}
  .fc .ovr span{font-size:.72rem;font-weight:800;letter-spacing:1px;}
  .fc .sporticon{font-size:1.7rem;}
  .fc .photo{width:176px;height:234px;margin:4px auto 8px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;position:relative;}
  .fc .photo img{width:100%;height:100%;object-fit:cover;} .fc .photo .ini{font-family:'Outfit';font-weight:900;font-size:3rem;color:rgba(0,0,0,.32);}
  .fc .nm{text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:1.35rem;text-transform:uppercase;letter-spacing:.4px;line-height:1;}
  .fc .tm{text-align:center;font-weight:700;font-size:.82rem;opacity:.82;margin-top:3px;}
  .fc .stats{display:grid;grid-template-columns:1fr 1fr;gap:7px 16px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,.2);position:relative;}
  .fc .st{display:flex;justify-content:space-between;font-weight:800;font-size:.85rem;} .fc .st span{opacity:.68;font-weight:700;}
  `;
  document.head.appendChild(st);
}
function overallOf(){ const a=P().season.avgVoto; return a? Math.max(40,Math.min(99,Math.round((a-2)/8*59+40))):null; }
function roleAbbr(r){ return (r||'').replace(/[^A-Za-zÀ-ÿ]/g,'').slice(0,3).toUpperCase()||'—'; }
function initialsOf(n){ return (n||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'?'; }
function pickPhoto(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f)return;
    const rd=new FileReader(); rd.onload=()=>{ const im=new Image(); im.onload=()=>{
      const MAX=1000, r=Math.min(MAX/im.width,MAX/im.height,1), w=Math.round(im.width*r), h=Math.round(im.height*r);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(im,0,0,w,h);
      repositionPhoto(cv.toDataURL('image/png'));
    }; im.src=rd.result; };
    rd.readAsDataURL(f);
  };
  inp.click();
}
function repositionPhoto(srcDataURL){
  plMediaCSS();
  const Fw=246, Fh=328; // frame 3:4
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-crop-simple" style="color:var(--brand)"></i> Posiziona la foto</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body" style="text-align:center">
      <div id="rp-frame" class="rp-checker" style="width:${Fw}px;height:${Fh}px;margin:0 auto;border-radius:16px;overflow:hidden;position:relative;touch-action:none;border:2px solid var(--brand)">
        <img id="rp-img" src="${srcDataURL}" style="position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;pointer-events:none;max-width:none">
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
        <i class="fa-solid fa-magnifying-glass-minus" style="color:var(--muted)"></i>
        <input id="rp-zoom" type="range" min="100" max="300" value="100" style="flex:1">
        <i class="fa-solid fa-magnifying-glass-plus" style="color:var(--muted)"></i>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-ghost" id="rp-bgbtn" style="width:100%" onclick="rpAiRemove()"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--brand)"></i> Rimuovi sfondo</button>
        <div id="rp-bgstatus" style="display:none;font-size:.78rem;color:var(--muted);margin-top:8px"></div>
        <button class="btn btn-ghost btn-sm" id="rp-bgreset" style="display:none;margin-top:6px" onclick="rpReset()"><i class="fa-solid fa-rotate-left"></i> Ripristina originale</button>
      </div>
      <p style="color:var(--muted-2);font-size:.78rem;margin-top:6px">Trascina per spostare, usa lo slider per lo zoom. Se la foto ha già lo sfondo trasparente, lasciala così.</p>
      <button class="btn btn-accent" style="width:100%;margin-top:12px" onclick="confirmPhoto()"><i class="fa-solid fa-check"></i> Conferma</button>
    </div>`);
  const frame=document.getElementById('rp-frame'), img=document.getElementById('rp-img');
  const st={imgW:0,imgH:0,cover:1,zoom:1,tx:0,ty:0};
  const dispW=()=>st.imgW*st.cover*st.zoom, dispH=()=>st.imgH*st.cover*st.zoom;
  const clamp=()=>{ st.tx=Math.min(0,Math.max(Fw-dispW(),st.tx)); st.ty=Math.min(0,Math.max(Fh-dispH(),st.ty)); };
  const apply=()=>{ img.style.transform=`translate(${st.tx}px,${st.ty}px) scale(${st.cover*st.zoom})`; };
  const init=()=>{ st.imgW=img.naturalWidth; st.imgH=img.naturalHeight; st.cover=Math.max(Fw/st.imgW,Fh/st.imgH);
    st.zoom=1; st.tx=(Fw-dispW())/2; st.ty=(Fh-dispH())/2; clamp(); apply(); };
  let firstInit=true;
  img.onload=()=>{ if(firstInit){ init(); firstInit=false; } else { clamp(); apply(); } };
  if(img.complete && img.naturalWidth){ init(); firstInit=false; }
  document.getElementById('rp-zoom').oninput=e=>{ const z=e.target.value/100; const cx=Fw/2-st.tx, cy=Fh/2-st.ty, ratio=z/st.zoom;
    st.zoom=z; st.tx=Fw/2-cx*ratio; st.ty=Fh/2-cy*ratio; clamp(); apply(); };
  let px,py,drag=false;
  frame.addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;try{frame.setPointerCapture(e.pointerId);}catch(_){}});
  frame.addEventListener('pointermove',e=>{ if(!drag)return; st.tx+=e.clientX-px; st.ty+=e.clientY-py; px=e.clientX; py=e.clientY; clamp(); apply(); });
  frame.addEventListener('pointerup',()=>drag=false); frame.addEventListener('pointercancel',()=>drag=false);
  window.__rp={st,Fw,Fh,img,original:srcDataURL};
}
/* rimuovi-sfondo: AI (segmentazione soggetto, @imgly in-browser) con fallback chroma-key sugli angoli */
let _imglyRemoveP=null;
async function loadImglyP(){ if(_imglyRemoveP) return _imglyRemoveP; const m=await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm'); _imglyRemoveP=m.removeBackground||m.default; return _imglyRemoveP; }
function blobToDataURLP(b){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); }); }
async function aiRemoveBgP(src,onProgress){
  const rem=await loadImglyP();
  const blob=await rem(src,{ output:{format:'image/png'}, progress:(k,c,t)=>{ try{ if(onProgress&&t) onProgress(c/t); }catch(_){} } });
  return await blobToDataURLP(blob);
}
function chromaApplyP(p,w,h,tol){
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  let br=0,bg=0,bb=0; corners.forEach(([x,y])=>{const i=(y*w+x)*4; br+=p[i];bg+=p[i+1];bb+=p[i+2];}); br/=4;bg/=4;bb/=4;
  const T=tol*tol;
  for(let i=0;i<p.length;i+=4){ const dr=p[i]-br,dg=p[i+1]-bg,db=p[i+2]-bb, dist=dr*dr+dg*dg+db*db;
    if(dist<T) p[i+3]=0; else if(dist<T*2.2) p[i+3]=Math.round(p[i+3]*Math.min(1,(dist-T)/(T*1.2))); }
  return p;
}
function chromaKeyDataURLP(srcDataURL,tol){ return new Promise(res=>{ const im=new Image(); im.onload=()=>{
  const c=document.createElement('canvas'); c.width=im.naturalWidth||im.width; c.height=im.naturalHeight||im.height;
  const ctx=c.getContext('2d'); ctx.drawImage(im,0,0); const d=ctx.getImageData(0,0,c.width,c.height);
  chromaApplyP(d.data,c.width,c.height,tol); ctx.putImageData(d,0,0); res(c.toDataURL('image/png')); }; im.src=srcDataURL; }); }
async function rpAiRemove(){
  const R=window.__rp; if(!R) return;
  const btn=document.getElementById('rp-bgbtn'), status=document.getElementById('rp-bgstatus'), reset=document.getElementById('rp-bgreset');
  if(btn) btn.disabled=true; if(status){ status.style.display='block'; status.textContent='Preparo il ritaglio…'; }
  try{
    const out=await aiRemoveBgP(R.original, p=>{ if(status) status.textContent = p<1?`Elaboro… ${Math.round(p*100)}%`:'Quasi fatto…'; });
    R.img.src=out; if(status) status.textContent='Sfondo rimosso ✓'; if(reset) reset.style.display='block';
  }catch(e){
    if(status) status.textContent='AI non disponibile, uso il metodo veloce…';
    try{ const out=await chromaKeyDataURLP(R.original,72); R.img.src=out; if(status) status.textContent='Sfondo rimosso (metodo veloce) ✓'; if(reset) reset.style.display='block'; }
    catch(_){ if(status) status.textContent='Non riesco a rimuovere lo sfondo qui. Prova con connessione attiva.'; }
  }
  if(btn) btn.disabled=false;
}
function rpReset(){ const R=window.__rp; if(!R)return; R.img.src=R.original; const s=document.getElementById('rp-bgstatus'); if(s) s.style.display='none'; const b=document.getElementById('rp-bgreset'); if(b) b.style.display='none'; }
function confirmPhoto(){
  const R=window.__rp; if(!R){closeModal();return;}
  const {st,Fw,Fh,img}=R, Tw=480, Th=640, s=st.cover*st.zoom;
  const c=document.createElement('canvas'); c.width=Tw; c.height=Th; const ctx=c.getContext('2d');
  ctx.drawImage(img, (-st.tx)/s, (-st.ty)/s, Fw/s, Fh/s, 0,0,Tw,Th);
  const data=c.toDataURL('image/png');
  PL_PHOTO=data; idbSet('self',data); closeModal(); renderProfilo();
  if(S && S.pkg) openMyCard();
  toast('Foto aggiornata');
}
function removePhoto(){ PL_PHOTO=null; idbDel('self'); renderProfilo(); if(document.querySelector('.fc')) openMyCard(); toast('Foto rimossa'); }
/* ---------- Card a tier (stesso motore del coach: layout ufficiale + attributi FIFA-style) ---------- */
const TIER_ORDER=['goat','mythic','diamond','gold','silver'];
const TIER_LABEL={goat:'GOAT',mythic:'MYTHIC',diamond:'DIAMOND',gold:'GOLD',silver:'SILVER'};
const BASE_CARD_LAYOUT={
  photo:{show:1,x:50,y:40,w:66,h:44}, logo:{show:1,x:72,y:9,w:15},
  overall:{show:1,x:22,y:15,size:12,color:'#ffffff',align:'center'},
  role:{show:1,x:22,y:24,size:4.6,color:'#ffffff',align:'center'},
  number:{show:1,x:78,y:15,size:9,color:'#ffffff',align:'center'},
  name:{show:1,x:50,y:66,size:7.4,color:'#ffffff',align:'center'},
  attrs:{show:1,x:50,y:82,size:5,color:'#ffffff'},
  tierName:{show:0,x:50,y:94,size:4,color:'#ffffff',align:'center'}
};
const DEPLOY_CARD_LAYOUTS={
  goat:{photo:{show:1,x:50,y:23.5,w:86,h:47},logo:{show:1,x:78,y:20.5,w:22.5},overall:{show:1,x:18.5,y:20,size:11,color:'#fff1b3',align:'center'},role:{show:1,x:18.5,y:29,size:4.6,color:'#ffcc02',align:'center'},number:{show:1,x:77.5,y:28.5,size:6.2,color:'#ffcc02',align:'center'},name:{show:1,x:50,y:56.5,size:6.4,color:'#fff7bd',align:'center'},attrs:{show:1,x:50,y:67.5,size:6.4,color:'#fff2d0'},tierName:{show:1,x:50,y:85,size:5.2,color:'#ff6a00',align:'center'}},
  mythic:{photo:{show:1,x:50,y:31,w:66,h:42.5},logo:{show:1,x:79.5,y:19,w:22},overall:{show:1,x:19,y:18,size:12,color:'#fcdbff',align:'center'},role:{show:1,x:19,y:24.5,size:4.6,color:'#ffffff',align:'center'},number:{show:1,x:79,y:26.5,size:6.8,color:'#ffedfe',align:'center'},name:{show:1,x:50,y:57,size:7.2,color:'#ffd7ff',align:'center'},attrs:{show:1,x:50,y:72,size:6.6,color:'#ffffff'},tierName:{show:1,x:50,y:88.5,size:4.2,color:'#efcaff',align:'center'}},
  diamond:{photo:{show:1,x:50,y:30,w:66,h:44},logo:{show:1,x:81.5,y:22,w:22.5},overall:{show:1,x:17,y:21,size:12,color:'#12fffe',align:'center'},role:{show:1,x:17.5,y:29.5,size:5.4,color:'#ffffff',align:'center'},number:{show:1,x:81.5,y:30,size:6.2,color:'#ffffff',align:'center'},name:{show:1,x:50,y:57.5,size:7.4,color:'#7bf7ff',align:'center'},attrs:{show:1,x:50,y:73,size:7.8,color:'#ffffff'},tierName:{show:1,x:50,y:88.5,size:4.2,color:'#93e3fd',align:'center'}},
  gold:{photo:{show:1,x:50,y:26.5,w:66,h:49},logo:{show:1,x:82.5,y:19.5,w:22},overall:{show:1,x:17.5,y:18.5,size:11,color:'#ffffff',align:'center'},role:{show:1,x:17,y:28,size:6.2,color:'#fcfcff',align:'center'},number:{show:1,x:81.5,y:27.5,size:6.8,color:'#ffffff',align:'center'},name:{show:1,x:50,y:59.5,size:7,color:'#ffffff',align:'center'},attrs:{show:1,x:50,y:74.5,size:7.8,color:'#ffffff'},tierName:{show:1,x:50,y:91,size:4.6,color:'#c49e00',align:'center'}},
  silver:{photo:{show:1,x:50,y:29.5,w:72,h:44},logo:{show:1,x:82.5,y:19.5,w:22},overall:{show:1,x:17.5,y:18.5,size:13.6,color:'#ffffff',align:'center'},role:{show:1,x:17,y:28,size:5.2,color:'#ffffff',align:'center'},number:{show:1,x:82,y:28,size:6.4,color:'#ffffff',align:'center'},name:{show:1,x:50,y:58.5,size:7,color:'#ffffff',align:'center'},attrs:{show:1,x:50,y:73.5,size:7.8,color:'#ffffff'},tierName:{show:1,x:50,y:90,size:4,color:'#d6d6d6',align:'center'}}
};
function deepMerge(base,over){ const o=JSON.parse(JSON.stringify(base)); if(over) Object.keys(over).forEach(k=>{ o[k]=(typeof over[k]==='object'&&!Array.isArray(over[k]))?deepMerge(o[k]||{},over[k]):over[k]; }); return o; }
function getCardLayout(tier){ return deepMerge(BASE_CARD_LAYOUT, DEPLOY_CARD_LAYOUTS[tier]); }
function ownLineupEntry(){
  const lu=P().lineup, p=P().p; if(!lu||!Array.isArray(lu.slots))return null;
  return lu.slots.find(s=>p.number!=null && s.number===p.number) || lu.slots.find(s=>s.playerName===p.name) || null;
}
function myTier(){
  const e=ownLineupEntry(); if(e&&e.tier&&DEPLOY_CARD_LAYOUTS[e.tier])return e.tier;
  const o=overallOf(); if(o==null)return 'silver';
  if(o>=90)return 'goat'; if(o>=80)return 'mythic'; if(o>=70)return 'diamond'; if(o>=55)return 'gold'; return 'silver';
}
function myOverallForCard(){ const e=ownLineupEntry(); if(e&&e.overall!=null)return e.overall; return overallOf(); }
const CARD_SILHOUETTE="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><g fill="rgba(255,255,255,.22)"><circle cx="50" cy="42" r="24"/><path d="M12 130c0-24 17-42 38-42s38 18 38 42z"/></g></svg>');
function frameCandidates(tier){ const C=tier.charAt(0).toUpperCase()+tier.slice(1);
  return [`cards/${tier}.png`,`cards/${C}_.png`,`cards/${C}.png`,`cards/${tier}_.png`]; }
function tcFrameFallback(img){ const fb=(img.getAttribute('data-fb')||'').split('|').filter(Boolean);
  if(fb.length){ img.src=fb[0]; img.setAttribute('data-fb',fb.slice(1).join('|')); } else { img.style.opacity=0; } }
/* attributi stile FIFA: media dei voti allenamento per categoria (pkg.ex), ×10; se nessun voto -> stima dall'overall */
const ATTR_MAP_P={
  pallavolo:[['Attacco','ATT',['Attacco']],['Battuta','BAT',['Battuta']],['Ricezione','RIC',['Ricezione']],['Muro','MUR',['Muro']],['Difesa','DIF',['Difesa']],['Atletismo','ATL',['Fisico','Riscaldamento']]],
  calcio:[['Finalizzazione','FIN',['Finalizzazione']],['Difesa','DIF',['Difesa']],['Tecnica','TEC',['Tecnica']],['Velocità','VEL',['Riscaldamento','Fisico']],['Possesso','POS',['Possesso']],['Transizioni','TRA',['Transizioni','Partite a tema']]],
  calcio_gk:[['Portiere','POR',['Portieri']],['Difesa','DIF',['Difesa']],['Tecnica','TEC',['Tecnica']],['Velocità','VEL',['Riscaldamento','Fisico']],['Possesso','POS',['Possesso']],['Finalizzazione','FIN',['Finalizzazione']]],
  basket:[['Tiro','TIR',['Tiro']],['Palleggio','PAL',['Palleggio']],['Difesa','DIF',['Difesa']],['Velocità','VEL',['Riscaldamento','Fisico']],['Rimbalzo','RIM',['Rimbalzo']],['Tattica','TAT',['Tattica','Transizione']]]
};
function myCatRatings(){
  const acc={};
  (P().ex||[]).forEach(tr=>{ (tr.items||[]).forEach(it=>{ if(it.grade!=null){ const c=it.cat||'?'; (acc[c]=acc[c]||{s:0,n:0}); acc[c].s+=it.grade; acc[c].n++; } }); });
  const out={}; Object.keys(acc).forEach(c=>out[c]=acc[c].s/acc[c].n); return out;
}
function myAttributes(){
  const sport=sportOf(), cats=myCatRatings(), p=P().p, ovr=myOverallForCard()||60;
  let defs=ATTR_MAP_P[sport]||ATTR_MAP_P.pallavolo;
  if(sport==='calcio'){ const gk=/portier|^\s*p\s*$|^por/i.test((p&&p.role)||''); defs = gk?ATTR_MAP_P.calcio_gk:ATTR_MAP_P.calcio; }
  return defs.map(([label,short,src])=>{
    const vals=src.map(c=>cats[c]).filter(v=>v!=null);
    let rating = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10) : ovr;
    return {label,short,rating:Math.max(1,Math.min(100,rating))};
  });
}
function renderCardAttrs(el,width){
  if(!el||!el.show) return '';
  const cells=myAttributes().map(a=>`<div class="tc-attr"><b>${a.rating}</b><span>${a.short}</span></div>`).join('');
  return `<div class="tc-attrs" style="left:${el.x}%;top:${el.y}%;transform:translate(-50%,-50%);font-size:${(el.size/100*width).toFixed(1)}px;color:${el.color}"><div class="tc-attr-grid">${cells}</div></div>`;
}
/* Render card, stesso ordinamento DOM/stacking del coach: frame z-index 0, contenuto sopra */
function renderMyTierCard(width){
  width=width||300; const H=width*1.4;
  const p=P().p, tier=myTier(), L=getCardLayout(tier), ovr=myOverallForCard();
  const photoSrc = PL_PHOTO || CARD_SILHOUETTE;
  const alignT=a=>a==='left'?'0':a==='right'?'-100%':'-50%';
  const txt=(key,val)=>{ const e=L[key]; if(!e||!e.show||val==null||val==='')return '';
    return `<div class="tc-el" style="left:${e.x}%;top:${e.y}%;transform:translate(${alignT(e.align)},-50%);font-size:${(e.size/100*width).toFixed(1)}px;color:${e.color};text-align:${e.align}">${val}</div>`; };
  const ph=L.photo; const photoEl = ph&&ph.show ? `<div class="tc-photo" style="left:${ph.x}%;top:${ph.y}%;width:${ph.w}%;height:${(ph.h/100*H/width*100).toFixed(2)}%"><img src="${photoSrc}"></div>`:'';
  const cands=frameCandidates(tier);
  return `<div class="tiercard tier-${tier}" style="width:${width}px;height:${H}px">
    <img class="tc-frame" src="${cands[0]}" data-fb="${cands.slice(1).join('|')}" onerror="tcFrameFallback(this)" alt="">
    ${photoEl}
    ${txt('overall',ovr!=null?ovr:'—')}
    ${txt('role',roleAbbr(p.role))}
    ${txt('number','#'+(p.number||''))}
    ${txt('name',(p.name||'').toUpperCase())}
    ${renderCardAttrs(L.attrs,width)}
    ${txt('tierName',TIER_LABEL[tier])}
  </div>`;
}
function cardCSS(){
  if(document.getElementById('tier-card-css')) return;
  const st=document.createElement('style'); st.id='tier-card-css';
  st.textContent=`
  .tiercard{position:relative;border-radius:12px;font-family:'Outfit',sans-serif;font-weight:900;overflow:hidden;margin:0 auto;}
  .tiercard .tc-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;pointer-events:none;}
  .tiercard .tc-photo{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:1;}
  .tiercard .tc-photo img{width:100%;height:100%;object-fit:contain;object-position:bottom;}
  .tiercard .tc-el{position:absolute;white-space:nowrap;line-height:1;text-shadow:0 2px 6px rgba(0,0,0,.5);letter-spacing:.5px;z-index:2;}
  .tiercard .tc-attrs{position:absolute;z-index:2;text-shadow:0 2px 6px rgba(0,0,0,.55);font-family:'Outfit',sans-serif;}
  .tc-attr-grid{display:grid;grid-template-columns:auto auto;gap:.15em 1.1em;}
  .tc-attr{display:flex;align-items:baseline;gap:.3em;line-height:1;}
  .tc-attr b{font-weight:900;font-variant-numeric:tabular-nums;} .tc-attr span{font-weight:800;opacity:.72;font-size:.7em;letter-spacing:.5px;}
  `;
  document.head.appendChild(st);
}
function openMyCard(){
  plMediaCSS(); cardCSS();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-id-card" style="color:var(--brand)"></i> La mia card <span class="pill" style="margin-left:6px">${TIER_LABEL[myTier()]}</span></h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body fc-wrap">
      ${renderMyTierCard(300)}
      <button class="btn btn-accent" style="width:100%;margin-top:16px" onclick="pickPhoto()"><i class="fa-solid fa-camera"></i> ${PL_PHOTO?'Cambia foto':'Aggiungi la tua foto'}</button>
      ${PL_PHOTO?'<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="removePhoto()"><i class="fa-solid fa-trash"></i> Rimuovi foto</button>':''}
    </div>`);
}

/* ---------- Formazione consigliata (ricevuta dal mister) ---------- */
function openLineup(){
  const lu=P().lineup;
  if(!lu||!Array.isArray(lu.slots)||!lu.slots.length){
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-people-group" style="color:var(--brand)"></i> Formazione consigliata</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><p style="opacity:.7">Il mister non ha ancora condiviso una formazione consigliata.</p></div>`);
    return;
  }
  const p=P().p, myNum=p.number;
  const tokens=lu.slots.map(s=>{
    const mine = (myNum!=null && s.number===myNum) || s.playerName===p.name;
    const ovrTxt = lu.showOverall ? (s.overall!=null ? s.overall : 'NC') : '';
    return `<div style="position:absolute;left:${(s.x*100).toFixed(1)}%;top:${(s.y*100).toFixed(1)}%;transform:translate(-50%,-50%);text-align:center">
      <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;
        background:${mine?'var(--brand)':'rgba(255,255,255,.12)'};color:${mine?'#04210f':'#fff'};border:2px solid ${mine?'var(--brand)':'rgba(255,255,255,.35)'};">${s.number!=null?s.number:''}</div>
      <div style="font-size:10px;margin-top:2px;color:${mine?'var(--brand)':'rgba(255,255,255,.75)'};font-weight:${mine?'800':'600'};white-space:nowrap">${s.playerName||s.ruolo_o_zona||''}</div>
      ${lu.showOverall?`<div style="font-size:9px;color:rgba(255,255,255,.55)">${ovrTxt}</div>`:''}
    </div>`;
  }).join('');
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-people-group" style="color:var(--brand)"></i> Formazione consigliata</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="opacity:.65;font-size:13px;margin-bottom:10px">Scelti in base alla media voto: per ogni ruolo gioca chi rende di più.</p>
      <div style="position:relative;width:100%;aspect-ratio:2/3;border-radius:12px;overflow:hidden">
        ${courtSVG(lu.sport||sportOf())}
        ${tokens}
      </div>
    </div>`);
}

/* =========================================================
   MENTAL GYM — 3 mini-test cognitivi + calibrazione dispositivo
   Solo dati locali (localStorage, chiave MG_LS). Nessun invio al mister.
   ========================================================= */
function mgCSS(){
  if(document.getElementById('mg-css'))return;
  const st=document.createElement('style'); st.id='mg-css';
  st.textContent=`
  .mg-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .mg-tile{background:var(--surface-2);border:1px solid var(--line-soft);border-radius:14px;padding:1rem;text-align:center;cursor:pointer;transition:.15s;}
  .mg-tile:hover{border-color:var(--brand);}
  .mg-tile.locked{opacity:.5;filter:grayscale(.5);cursor:default;}
  .mg-tile .ic{font-size:1.6rem;color:var(--brand);margin-bottom:6px;}
  .mg-tile.locked .ic{color:var(--muted-2);}
  .mg-tile b{display:block;font-size:.86rem;}
  .mg-tile .pb{font-size:.7rem;color:var(--muted);margin-top:4px;line-height:1.3;}
  .mg-disclaimer{font-size:.76rem;color:var(--muted-2);margin-top:1rem;line-height:1.4;background:var(--surface-2);border:1px solid var(--line-soft);border-radius:12px;padding:.7rem .8rem;display:flex;gap:8px;align-items:flex-start;}
  .mg-disclaimer i{margin-top:2px;flex-shrink:0;}
  .mg-stage{position:relative;background:var(--surface-2);border:1px solid var(--line-soft);border-radius:16px;height:min(58vh,440px);display:flex;align-items:center;justify-content:center;overflow:hidden;margin:1rem 0;}
  .mg-circle{width:120px;height:120px;border-radius:50%;background:var(--surface-3);border:3px solid var(--line);transition:background .12s,border-color .12s;display:flex;align-items:center;justify-content:center;color:var(--muted);font-weight:700;font-size:.85rem;text-align:center;cursor:pointer;user-select:none;}
  .mg-circle.go{background:var(--brand);border-color:var(--brand);color:#04140A;}
  .mg-word{font-family:'Outfit',sans-serif;font-weight:900;font-size:2.1rem;text-align:center;letter-spacing:.5px;}
  .mg-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:1.1rem;}
  .mg-choice{border:none;border-radius:12px;padding:16px;font-weight:800;color:#04140A;cursor:pointer;font-family:'Outfit',sans-serif;font-size:.92rem;}
  .mg-fix{width:12px;height:12px;border-radius:50%;background:var(--muted);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
  .mg-zone{position:absolute;width:22%;height:22%;border-radius:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;cursor:pointer;}
  .mg-zone .dot{width:26px;height:26px;border-radius:50%;background:transparent;transition:background .1s;}
  .mg-zone.on .dot{background:var(--brand);box-shadow:0 0 16px 5px var(--brand-glow);}
  .mg-result{text-align:center;padding:.6rem 0 .2rem;}
  .mg-result .big{font-family:'Outfit',sans-serif;font-weight:900;font-size:2.3rem;color:var(--brand);}
  .mg-hist{margin-top:1.1rem;}
  .mg-hist .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:.82rem;color:var(--text);}
  .mg-hist .row:last-child{border:none;}
  `;
  document.head.appendChild(st);
}
let MG_GEN=0;
function mgBump(){ MG_GEN++; return MG_GEN; }
function mgCorrect(raw){ const b=(MG.calib&&MG.calib.baseline)||0; return Math.max(0,Math.round(raw-b)); }
function mgHistRows(arr,fmtFn){
  if(!arr||!arr.length) return `<div style="color:var(--muted-2);font-size:.82rem;padding:.6rem 0">Nessun tentativo ancora.</div>`;
  return arr.slice(-5).slice().reverse().map(e=>`<div class="row">${fmtFn(e)}</div>`).join('');
}
function mgBestOf(arr){ if(!arr||!arr.length) return null; return arr.reduce((best,e)=>mgIsBetter(e,best)?e:best,null); }
function mgIsBetter(e,best){
  if(!best) return true;
  if(e.accuracy!==best.accuracy) return e.accuracy>best.accuracy;
  const ea=e.avgTime==null?Infinity:e.avgTime, ba=best.avgTime==null?Infinity:best.avgTime;
  return ea<ba;
}
function mgPbLabel(e){ return e? `${e.accuracy}% · ${e.avgTime!=null?e.avgTime+' ms':'—'}` : '—'; }
function mgReactionBestVal(arr){ if(!arr||!arr.length) return null; return arr.reduce((m,x)=>x.corrected<m?x.corrected:m,arr[0].corrected); }
function mgReactionPB(){ const b=mgReactionBestVal(MG.reaction); return b!=null?`PB: ${b} ms`:'Nessun tentativo ancora'; }
function mgStroopPB(){ const b=mgBestOf(MG.stroop); return b?`PB: ${mgPbLabel(b)}`:'Nessun tentativo ancora'; }
function mgPeripheralPB(){ const b=mgBestOf(MG.peripheral); return b?`PB: ${mgPbLabel(b)}`:'Nessun tentativo ancora'; }

/* ---------- schermata elenco Mental Gym ---------- */
function mgOpen(){
  mgCSS(); mgBump();
  const tiles=[
    {id:'reaction',ic:'fa-bolt',label:'Tempo di reazione',pb:mgReactionPB()},
    {id:'stroop',ic:'fa-palette',label:'Stroop test',pb:mgStroopPB()},
    {id:'peripheral',ic:'fa-eye',label:'Vista periferica',pb:mgPeripheralPB()}
  ];
  const tileHtml=tiles.map(t=>`<div class="mg-tile" onclick="mgOpenGame('${t.id}')"><div class="ic"><i class="fa-solid ${t.ic}"></i></div><b>${t.label}</b><div class="pb">${t.pb}</div></div>`).join('');
  const lockedTile=`<div class="mg-tile locked"><div class="ic"><i class="fa-solid fa-lock"></i></div><b>Prossimamente</b><div class="pb">Stiamo creando nuovi allenamenti mentali per te</div></div>`;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-brain" style="color:var(--brand)"></i> Mental Gym</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-grid">${tileHtml}${lockedTile}</div>
      <div class="mg-disclaimer"><i class="fa-solid fa-circle-info"></i> Il punteggio dipende anche dal tuo dispositivo: usalo per seguire i tuoi progressi nel tempo, non per confrontarti con dispositivi diversi dal tuo.</div>
      <button class="btn btn-ghost" style="width:100%;margin-top:1rem" onclick="mgRecalibrate()"><i class="fa-solid fa-crosshairs"></i> Ricalibra dispositivo</button>
    </div>`);
}
function mgOpenGame(id){
  if(!MG.calib){ mgStartCalibration(id); return; }
  if(id==='reaction') mgReactionIntro();
  else if(id==='stroop') mgStroopIntro();
  else if(id==='peripheral') mgPeripheralIntro();
}
function mgRecalibrate(){ mgStartCalibration(null); }

/* ---------- calibrazione dispositivo (una tantum, riusata dai 3 giochi) ---------- */
let MG_CALIB={n:0,times:[],afterId:null,gen:0};
function mgStartCalibration(afterId){
  mgCSS(); mgBump();
  MG_CALIB={n:0,times:[],afterId,gen:MG_GEN};
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-crosshairs" style="color:var(--brand)"></i> Calibrazione dispositivo</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.88rem">Prima di iniziare misuriamo il tempo di risposta del tuo dispositivo: serve a rendere i punteggi confrontabili nel tempo. Tocca il bersaglio verde il più veloce possibile, 5 volte.</p>
      <div class="mg-stage"><div class="mg-circle" id="mg-cal-circle">Preparati…</div></div>
      <div style="text-align:center;color:var(--muted);font-size:.82rem">Tentativo <b id="mg-cal-n" class="num">0</b> di 5</div>
    </div>`);
  const myGen=MG_GEN;
  setTimeout(()=>{ if(myGen===MG_GEN) mgCalibRound(); },900);
}
function mgCalibRound(){
  if(MG_CALIB.gen!==MG_GEN) return;
  const circle=document.getElementById('mg-cal-circle'); if(!circle) return;
  circle.textContent='Attendi…'; circle.classList.remove('go'); circle.onclick=null;
  const wait=300+Math.random()*600, myGen=MG_GEN;
  setTimeout(()=>{
    if(myGen!==MG_GEN) return;
    const c=document.getElementById('mg-cal-circle'); if(!c) return;
    c.textContent='TOCCA!'; c.classList.add('go');
    const t0=performance.now();
    c.onclick=()=>{
      if(myGen!==MG_GEN) return;
      MG_CALIB.times.push(performance.now()-t0); MG_CALIB.n++;
      const nEl=document.getElementById('mg-cal-n'); if(nEl) nEl.textContent=String(MG_CALIB.n);
      if(MG_CALIB.n>=5) mgCalibFinish();
      else setTimeout(()=>{ if(myGen===MG_GEN) mgCalibRound(); },400);
    };
  },wait);
}
function mgCalibFinish(){
  const avg=MG_CALIB.times.reduce((a,b)=>a+b,0)/MG_CALIB.times.length;
  MG.calib={baseline:Math.round(avg),date:new Date().toISOString()};
  mgSave();
  toast('Calibrazione completata');
  if(MG_CALIB.afterId) mgOpenGame(MG_CALIB.afterId); else mgOpen();
}

/* ---------- GIOCO 1: tempo di reazione ---------- */
function mgReactionIntro(){
  mgCSS(); mgBump();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-bolt" style="color:var(--brand)"></i> Tempo di reazione</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.88rem">Il cerchio resterà grigio per un tempo casuale, poi diventerà VERDE: toccalo il più veloce possibile. Se tocchi troppo presto si riparte.</p>
      <div class="mg-stage"><div class="mg-circle" id="mg-r-circle">Preparati…</div></div>
    </div>`);
  const myGen=MG_GEN;
  setTimeout(()=>{ if(myGen===MG_GEN) mgReactionRoundStart(); },600);
}
function mgReactionRoundStart(){
  const myGen=MG_GEN;
  const c=document.getElementById('mg-r-circle'); if(!c) return;
  c.textContent='Attendi…'; c.classList.remove('go');
  c.onclick=()=>{ if(myGen!==MG_GEN) return; mgReactionTooEarly(); };
  const wait=1000+Math.random()*3000;
  setTimeout(()=>{
    if(myGen!==MG_GEN) return;
    const cc=document.getElementById('mg-r-circle'); if(!cc) return;
    cc.textContent='VAI!'; cc.classList.add('go');
    const t0=performance.now();
    cc.onclick=()=>{ if(myGen!==MG_GEN) return; mgReactionResult(performance.now()-t0); };
  },wait);
}
function mgReactionTooEarly(){ toast('Troppo presto, riprova','danger'); mgReactionRoundStart(); }
function mgReactionResult(raw){
  const corrected=mgCorrect(raw);
  const pbBefore=mgReactionBestVal(MG.reaction);
  MG.reaction.push({date:new Date().toISOString(),raw:Math.round(raw),corrected}); mgSave();
  const isNewPB=pbBefore!=null && corrected<pbBefore;
  const pbMsg=pbBefore==null?'Primo tentativo registrato! Diventa il tuo punto di partenza.':(isNewPB?'🎉 Nuovo personal best!':`Personal best: ${pbBefore} ms`);
  const histHtml=mgHistRows(MG.reaction,e=>`<span>${fmt(e.date)}</span><span>${e.corrected} ms</span>`);
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-bolt" style="color:var(--brand)"></i> Tempo di reazione</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-result"><div class="big num">${corrected} ms</div><div style="color:var(--muted);margin-top:6px">${pbMsg}</div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-accent" style="flex:1" onclick="mgReactionIntro()"><i class="fa-solid fa-rotate-right"></i> Riprova</button>
      <button class="btn btn-ghost" style="flex:1" onclick="mgOpen()"><i class="fa-solid fa-arrow-left"></i> Mental Gym</button></div>
      <div class="mg-hist"><b style="font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Ultimi tentativi</b>${histHtml}</div>
    </div>`);
}

/* ---------- GIOCO 2: Stroop test ---------- */
const MG_COLORS=[['Rosso','#F0463C'],['Blu','#3B82F6'],['Verde','#22C55E'],['Giallo','#F5B301']];
let MG_S={i:0,correct:0,times:[],gen:0,t0:0};
function mgStroopIntro(){
  mgCSS(); mgBump();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-palette" style="color:var(--brand)"></i> Stroop test</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.88rem">Vedrai una parola-colore scritta in un colore diverso da quello che nomina. Tocca il bottone del COLORE IN CUI È SCRITTA la parola, non quello che nomina. 10 stimoli.</p>
      <button class="btn btn-accent" style="width:100%" onclick="mgStroopStart()"><i class="fa-solid fa-play"></i> Inizia</button>
    </div>`);
}
function mgStroopStart(){ mgBump(); MG_S={i:0,correct:0,times:[],gen:MG_GEN,t0:0}; mgStroopRound(); }
function mgStroopRound(){
  if(MG_S.gen!==MG_GEN) return;
  if(MG_S.i>=10){ mgStroopResult(); return; }
  const nameIdx=Math.floor(Math.random()*MG_COLORS.length);
  let dispIdx=Math.floor(Math.random()*MG_COLORS.length);
  while(dispIdx===nameIdx) dispIdx=Math.floor(Math.random()*MG_COLORS.length);
  const word=MG_COLORS[nameIdx][0].toUpperCase(), dispColor=MG_COLORS[dispIdx][1];
  const btnsHtml=MG_COLORS.map((c,ci)=>`<button class="mg-choice" style="background:${c[1]}" onclick="mgStroopAnswer(${ci},${dispIdx})">${c[0]}</button>`).join('');
  document.getElementById('modal').innerHTML=`<div class="modal-head"><h3><i class="fa-solid fa-palette" style="color:var(--brand)"></i> Stroop test <span style="color:var(--muted);font-size:.76rem;margin-left:6px" class="num">${MG_S.i+1}/10</span></h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-word" style="color:${dispColor}">${word}</div>
      <div class="mg-choices">${btnsHtml}</div>
    </div>`;
  MG_S.t0=performance.now();
}
function mgStroopAnswer(chosenIdx,correctIdx){
  if(MG_S.gen!==MG_GEN) return;
  const raw=performance.now()-MG_S.t0;
  if(chosenIdx===correctIdx){ MG_S.correct++; MG_S.times.push(mgCorrect(raw)); }
  MG_S.i++; mgStroopRound();
}
function mgStroopResult(){
  const accuracy=Math.round(MG_S.correct/10*100);
  const avgTime=MG_S.times.length?Math.round(MG_S.times.reduce((a,b)=>a+b,0)/MG_S.times.length):null;
  const entry={date:new Date().toISOString(),avgTime,accuracy};
  const pbBefore=mgBestOf(MG.stroop);
  MG.stroop.push(entry); mgSave();
  const isNewPB=mgIsBetter(entry,pbBefore) && pbBefore!=null;
  const pbMsg=pbBefore==null?'Primo tentativo registrato! Diventa il tuo punto di partenza.':(isNewPB?'🎉 Nuovo personal best!':`Personal best: ${mgPbLabel(pbBefore)}`);
  const histHtml=mgHistRows(MG.stroop,e=>`<span>${fmt(e.date)}</span><span>${e.accuracy}% · ${e.avgTime!=null?e.avgTime+' ms':'—'}</span>`);
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-palette" style="color:var(--brand)"></i> Stroop test</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-result"><div class="big num">${accuracy}%</div><div style="color:var(--muted)">Tempo medio risposte corrette: ${avgTime!=null?avgTime+' ms':'—'}</div>
      <div style="color:var(--muted);margin-top:6px">${pbMsg}</div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-accent" style="flex:1" onclick="mgStroopStart()"><i class="fa-solid fa-rotate-right"></i> Riprova</button>
      <button class="btn btn-ghost" style="flex:1" onclick="mgOpen()"><i class="fa-solid fa-arrow-left"></i> Mental Gym</button></div>
      <div class="mg-hist"><b style="font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Ultimi tentativi</b>${histHtml}</div>
    </div>`);
}

/* ---------- GIOCO 3: vista periferica ---------- */
const MG_ZONES=[{id:0,x:50,y:8},{id:1,x:85,y:15},{id:2,x:92,y:50},{id:3,x:85,y:85},{id:4,x:50,y:92},{id:5,x:15,y:85},{id:6,x:8,y:50},{id:7,x:15,y:15}];
let MG_P={i:0,correct:0,times:[],gen:0,curZone:null,answered:false,t0:0};
function mgPeripheralIntro(){
  mgCSS(); mgBump();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-eye" style="color:var(--brand)"></i> Vista periferica</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.88rem">Tieni lo sguardo fisso sul puntino al centro per tutta la durata del test. Un piccolo pallino apparirà per una frazione di secondo ai bordi: toccalo SENZA spostare gli occhi dal centro. Non possiamo verificare tecnicamente dove guardi: il test ha senso solo se rispetti questa regola. 10 round.</p>
      <button class="btn btn-accent" style="width:100%" onclick="mgPeripheralStart()"><i class="fa-solid fa-play"></i> Inizia</button>
    </div>`);
}
function mgPeripheralStart(){ mgBump(); MG_P={i:0,correct:0,times:[],gen:MG_GEN,curZone:null,answered:false,t0:0}; mgPeripheralRenderStage(); mgPeripheralRound(); }
function mgPeripheralRenderStage(){
  const zonesHtml=MG_ZONES.map(z=>`<div class="mg-zone" id="mg-z${z.id}" style="left:${z.x}%;top:${z.y}%" onclick="mgPeripheralTap(${z.id})"><div class="dot"></div></div>`).join('');
  document.getElementById('modal').innerHTML=`<div class="modal-head"><h3><i class="fa-solid fa-eye" style="color:var(--brand)"></i> Vista periferica <span style="color:var(--muted);font-size:.76rem;margin-left:6px" class="num" id="mg-p-count">1/10</span></h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-stage" style="height:min(50vh,360px)"><div class="mg-fix"></div>${zonesHtml}</div>
      <p style="text-align:center;color:var(--muted-2);font-size:.8rem">Sguardo fisso al centro</p>
    </div>`;
}
function mgPeripheralRound(){
  if(MG_P.gen!==MG_GEN) return;
  if(MG_P.i>=10){ mgPeripheralResult(); return; }
  const cEl=document.getElementById('mg-p-count'); if(cEl) cEl.textContent=`${MG_P.i+1}/10`;
  const wait=600+Math.random()*800, myGen=MG_GEN;
  setTimeout(()=>{
    if(myGen!==MG_GEN) return;
    const zone=Math.floor(Math.random()*MG_ZONES.length);
    MG_P.curZone=zone; MG_P.answered=false;
    const el=document.getElementById('mg-z'+zone); if(!el) return;
    el.classList.add('on');
    MG_P.t0=performance.now();
    const dur=400+Math.random()*200;
    setTimeout(()=>{ if(myGen===MG_GEN) el.classList.remove('on'); },dur);
    setTimeout(()=>{
      if(myGen!==MG_GEN) return;
      if(!MG_P.answered){ MG_P.answered=true; MG_P.i++; mgPeripheralRound(); }
    },1300);
  },wait);
}
function mgPeripheralTap(zoneId){
  if(MG_P.curZone==null || MG_P.answered) return;
  MG_P.answered=true;
  const raw=performance.now()-MG_P.t0;
  if(zoneId===MG_P.curZone){ MG_P.correct++; MG_P.times.push(mgCorrect(raw)); }
  const el=document.getElementById('mg-z'+MG_P.curZone); if(el) el.classList.remove('on');
  MG_P.i++;
  const myGen=MG_GEN;
  setTimeout(()=>{ if(myGen===MG_GEN) mgPeripheralRound(); },350);
}
function mgPeripheralResult(){
  const accuracy=Math.round(MG_P.correct/10*100);
  const avgTime=MG_P.times.length?Math.round(MG_P.times.reduce((a,b)=>a+b,0)/MG_P.times.length):null;
  const entry={date:new Date().toISOString(),avgTime,accuracy};
  const pbBefore=mgBestOf(MG.peripheral);
  MG.peripheral.push(entry); mgSave();
  const isNewPB=mgIsBetter(entry,pbBefore) && pbBefore!=null;
  const pbMsg=pbBefore==null?'Primo tentativo registrato! Diventa il tuo punto di partenza.':(isNewPB?'🎉 Nuovo personal best!':`Personal best: ${mgPbLabel(pbBefore)}`);
  const histHtml=mgHistRows(MG.peripheral,e=>`<span>${fmt(e.date)}</span><span>${e.accuracy}% · ${e.avgTime!=null?e.avgTime+' ms':'—'}</span>`);
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-eye" style="color:var(--brand)"></i> Vista periferica</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="mg-result"><div class="big num">${accuracy}%</div><div style="color:var(--muted)">Tempo medio reazione: ${avgTime!=null?avgTime+' ms':'—'}</div>
      <div style="color:var(--muted);margin-top:6px">${pbMsg}</div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-accent" style="flex:1" onclick="mgPeripheralStart()"><i class="fa-solid fa-rotate-right"></i> Riprova</button>
      <button class="btn btn-ghost" style="flex:1" onclick="mgOpen()"><i class="fa-solid fa-arrow-left"></i> Mental Gym</button></div>
      <div class="mg-hist"><b style="font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Ultimi tentativi</b>${histHtml}</div>
    </div>`);
}

/* =========================================================
   CHECK-IN BENESSERE — form locale (sonno, affaticamento, umore, mappa corporea)
   Solo dati locali (localStorage, chiave WL_LS). Nessun invio al mister.
   ========================================================= */
function wlCSS(){
  if(document.getElementById('wl-css'))return;
  const st=document.createElement('style'); st.id='wl-css';
  st.textContent=`
  .wl-gender-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .wl-gender-card{background:var(--surface-2);border:1px solid var(--line-soft);border-radius:14px;padding:1rem;text-align:center;cursor:pointer;transition:.15s;}
  .wl-gender-card:hover{border-color:var(--brand);}
  .wl-gender-card img{width:100%;max-width:96px;margin:0 auto .5rem;display:block;}
  .wl-slider-row{margin-bottom:1.1rem;}
  .wl-slider-row .lbl{display:flex;justify-content:space-between;font-size:.82rem;font-weight:700;margin-bottom:6px;}
  .wl-slider-row .lbl .v{color:var(--brand);}
  .wl-slider-row input[type=range]{width:100%;accent-color:var(--brand);}
  .wl-scale-labels{display:flex;justify-content:space-between;font-size:.66rem;color:var(--muted-2);margin-top:2px;}
  .wl-body-head{display:flex;justify-content:space-between;align-items:center;margin:1.2rem 0 .6rem;flex-wrap:wrap;gap:8px;}
  .wl-toggle{display:flex;gap:6px;}
  .wl-toggle button{background:var(--surface-2);border:1px solid var(--line);color:var(--muted);padding:6px 12px;border-radius:20px;font-size:.74rem;font-weight:700;cursor:pointer;font-family:'Urbanist';}
  .wl-toggle button.on{background:var(--brand);color:#04140A;border-color:var(--brand);}
  .wl-map{position:relative;width:100%;max-width:240px;margin:0 auto;aspect-ratio:620/1120;border-radius:14px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line-soft);cursor:crosshair;}
  .wl-map img{width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;}
  .wl-marker{position:absolute;width:24px;height:24px;border-radius:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;color:#04140A;font-weight:800;font-size:.7rem;border:2px solid rgba(255,255,255,.75);box-shadow:0 2px 8px rgba(0,0,0,.45);cursor:pointer;}
  .wl-hint{text-align:center;color:var(--muted-2);font-size:.74rem;margin-top:8px;}
  .wl-pending{background:var(--surface-2);border:1px solid var(--brand);border-radius:14px;padding:.9rem;margin-top:.8rem;}
  .wl-pending .t{font-size:.8rem;font-weight:700;margin-bottom:8px;}
  .wl-int-row{display:flex;gap:6px;}
  .wl-int-btn{flex:1;border:none;border-radius:10px;padding:10px 0;font-weight:800;color:#04140A;cursor:pointer;font-family:'Outfit',sans-serif;}
  .wl-zonelist{margin-top:.6rem;}
  .wl-zonelist .row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line-soft);font-size:.8rem;}
  .wl-zonelist .row:last-child{border:none;}
  .wl-zonelist .row .dot{width:13px;height:13px;border-radius:50%;flex-shrink:0;}
  .wl-zonelist .row .x{margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:.9rem;padding:4px;}
  .wl-hist .row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:.8rem;}
  .wl-hist .row:last-child{border:none;}
  .wl-hist .row span:last-child{color:var(--muted);text-align:right;}
  `;
  document.head.appendChild(st);
}
const WL_FATICA_LABELS=['Fresco','In forma','Nella norma','Stanco','Esausto'];
const WL_UMORE_LABELS=['Giù','Sottotono','Nella norma','Carico','Al top'];
const WL_INT_COLORS=['#22C55E','#84CC16','#F5B301','#F0763C','#F0463C'];
let WL_DRAFT=null;
function wlIntensityColor(n){ return WL_INT_COLORS[Math.max(1,Math.min(5,n))-1]; }
function wlFreshDraft(){ return {view:'front',zones:[],sonno:8,fatica:3,umore:3,pending:null}; }

/* ---------- selezione MASCHIO/FEMMINA (una tantum, modificabile) ---------- */
function wlGenderPicker(fromForm){
  wlCSS();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-person" style="color:var(--brand)"></i> Check-in benessere</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1rem">Scegli la sagoma da usare per segnalare le zone del corpo. Potrai cambiarla in qualsiasi momento.</p>
      <div class="wl-gender-grid">
        <div class="wl-gender-card" onclick="wlSetGender('male')"><img src="body/male.png" alt="Maschio"><b>Maschio</b></div>
        <div class="wl-gender-card" onclick="wlSetGender('female')"><img src="body/female.png" alt="Femmina"><b>Femmina</b></div>
      </div>
      ${fromForm?'<button class="btn btn-ghost" style="width:100%;margin-top:1rem" onclick="wlForm()"><i class="fa-solid fa-arrow-left"></i> Annulla</button>':''}
    </div>`);
}
function wlSetGender(g){
  WL.gender=g; wlSave();
  if(!WL_DRAFT) WL_DRAFT=wlFreshDraft();
  wlForm();
}

/* ---------- form check-in ---------- */
function wlOpen(){
  wlCSS();
  if(!WL.gender){ wlGenderPicker(false); return; }
  WL_DRAFT=wlFreshDraft();
  wlForm();
}
function wlBodyImg(){
  const g=WL.gender==='female'?'female':'male';
  return `body/${g}${WL_DRAFT.view==='back'?'_back':''}.png`;
}
function wlMapMarkers(){
  return WL_DRAFT.zones.map((z,i)=>({z,i})).filter(o=>o.z.view===WL_DRAFT.view)
    .map(o=>`<div class="wl-marker" style="left:${o.z.x}%;top:${o.z.y}%;background:${wlIntensityColor(o.z.intensita)}" onclick="event.stopPropagation();wlMarkerTap(${o.i})">${o.z.intensita}</div>`).join('');
}
function wlZoneListHtml(){
  if(!WL_DRAFT.zones.length) return `<div style="color:var(--muted-2);font-size:.8rem;padding:.4rem 0">Nessuna zona segnalata in questo check-in.</div>`;
  return `<div class="wl-zonelist">${WL_DRAFT.zones.map((z,i)=>`<div class="row"><span class="dot" style="background:${wlIntensityColor(z.intensita)}"></span><span>${z.view==='back'?'Retro':'Fronte'} · intensità ${z.intensita}/5</span><button class="x" onclick="wlRemoveZone(${i})" title="Rimuovi"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div>`;
}
function wlPendingHtml(){
  if(!WL_DRAFT.pending) return '';
  const isEdit=WL_DRAFT.pending.mode==='edit';
  const curVal=isEdit?WL_DRAFT.zones[WL_DRAFT.pending.idx].intensita:0;
  const btns=[1,2,3,4,5].map(n=>`<button class="wl-int-btn" style="background:${wlIntensityColor(n)};${curVal===n?'outline:2px solid #fff':''}" onclick="wlPendingSetIntensity(${n})">${n}</button>`).join('');
  return `<div class="wl-pending">
    <div class="t">${isEdit?'Modifica intensità della zona':'Che intensità di fastidio senti qui?'} (1 = lieve, 5 = forte)</div>
    <div class="wl-int-row">${btns}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      ${isEdit?`<button class="btn btn-ghost" style="flex:1" onclick="wlPendingRemove()"><i class="fa-solid fa-xmark"></i> Rimuovi zona</button>`:''}
      <button class="btn btn-ghost" style="flex:1" onclick="wlPendingCancel()">Annulla</button>
    </div>
  </div>`;
}
function wlForm(){
  wlCSS();
  const histHtml=WL.checkins.length? WL.checkins.slice(-5).slice().reverse().map(e=>`<div class="row"><span>${fmt(e.date)}</span><span>${wlSummary(e)}</span></div>`).join('') : `<div style="color:var(--muted-2);font-size:.82rem;padding:.4rem 0">Nessun check-in registrato ancora.</div>`;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-heart-pulse" style="color:var(--brand)"></i> Check-in benessere</h3>
    <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:.86rem;margin-bottom:1rem">Compilalo quando vuoi, non è obbligatorio né giornaliero. Resta solo sul tuo dispositivo.</p>

      <div class="wl-slider-row">
        <div class="lbl"><span>Ore di sonno</span><span class="v num" id="wl-sonno-v">${(+WL_DRAFT.sonno).toFixed(1).replace('.0','')}h</span></div>
        <input type="range" min="0" max="12" step="0.5" value="${WL_DRAFT.sonno}" oninput="WL_DRAFT.sonno=+this.value;document.getElementById('wl-sonno-v').textContent=(+this.value).toFixed(1).replace('.0','')+'h'">
      </div>

      <div class="wl-slider-row">
        <div class="lbl"><span>Affaticamento generale</span><span class="v" id="wl-fatica-v">${WL_FATICA_LABELS[WL_DRAFT.fatica-1]}</span></div>
        <input type="range" min="1" max="5" step="1" value="${WL_DRAFT.fatica}" oninput="WL_DRAFT.fatica=+this.value;document.getElementById('wl-fatica-v').textContent=WL_FATICA_LABELS[this.value-1]">
        <div class="wl-scale-labels"><span>Fresco</span><span>Esausto</span></div>
      </div>

      <div class="wl-slider-row">
        <div class="lbl"><span>Umore / energia percepita</span><span class="v" id="wl-umore-v">${WL_UMORE_LABELS[WL_DRAFT.umore-1]}</span></div>
        <input type="range" min="1" max="5" step="1" value="${WL_DRAFT.umore}" oninput="WL_DRAFT.umore=+this.value;document.getElementById('wl-umore-v').textContent=WL_UMORE_LABELS[this.value-1]">
        <div class="wl-scale-labels"><span>Giù</span><span>Al top</span></div>
      </div>

      <div class="wl-body-head">
        <b style="font-size:.86rem">Mappa corporea <button class="link-btn" style="font-size:.78rem;margin-left:6px" onclick="wlGenderPicker(true)">Cambia corpo</button></b>
        <div class="wl-toggle">
          <button class="${WL_DRAFT.view==='front'?'on':''}" onclick="wlSetView('front')">Fronte</button>
          <button class="${WL_DRAFT.view==='back'?'on':''}" onclick="wlSetView('back')">Retro</button>
        </div>
      </div>
      <div class="wl-map" onclick="wlMapClick(event)"><img src="${wlBodyImg()}" alt="Sagoma corpo">${wlMapMarkers()}</div>
      <div class="wl-hint">Tocca sulla sagoma per segnalare una zona indolenzita/affaticata. Tocca un pallino già segnato per modificarlo o rimuoverlo.</div>
      ${wlPendingHtml()}
      ${wlZoneListHtml()}

      <button class="btn btn-accent" style="width:100%;margin-top:1.2rem" onclick="wlSaveCheckin()"><i class="fa-solid fa-floppy-disk"></i> Salva check-in</button>

      <div class="wl-hist" style="margin-top:1.2rem"><b style="font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Ultimi check-in</b>${histHtml}</div>
    </div>`);
}
function wlSetView(v){ WL_DRAFT.view=v; WL_DRAFT.pending=null; wlForm(); }
function wlMapClick(e){
  if(e.target.closest('.wl-marker')) return;
  const rect=e.currentTarget.getBoundingClientRect();
  const x=Math.min(100,Math.max(0,(e.clientX-rect.left)/rect.width*100));
  const y=Math.min(100,Math.max(0,(e.clientY-rect.top)/rect.height*100));
  WL_DRAFT.pending={mode:'add',x:+x.toFixed(1),y:+y.toFixed(1)};
  wlForm();
}
function wlMarkerTap(idx){ WL_DRAFT.pending={mode:'edit',idx}; wlForm(); }
function wlPendingSetIntensity(n){
  if(!WL_DRAFT.pending) return;
  if(WL_DRAFT.pending.mode==='add') WL_DRAFT.zones.push({x:WL_DRAFT.pending.x,y:WL_DRAFT.pending.y,intensita:n,view:WL_DRAFT.view});
  else WL_DRAFT.zones[WL_DRAFT.pending.idx].intensita=n;
  WL_DRAFT.pending=null; wlForm();
}
function wlPendingRemove(){
  if(WL_DRAFT.pending && WL_DRAFT.pending.mode==='edit') WL_DRAFT.zones.splice(WL_DRAFT.pending.idx,1);
  WL_DRAFT.pending=null; wlForm();
}
function wlPendingCancel(){ WL_DRAFT.pending=null; wlForm(); }
function wlRemoveZone(idx){ WL_DRAFT.zones.splice(idx,1); wlForm(); }
function wlSummary(e){
  const sonno=(+e.sonno).toFixed(1).replace('.0','');
  const n=e.zone?e.zone.length:0;
  return `${sonno}h sonno, affaticamento ${e.affaticamento}/5, ${n} zona${n===1?'':'e'} segnalat${n===1?'a':'e'}`;
}
function wlSaveCheckin(){
  const entry={date:new Date().toISOString(),sonno:+WL_DRAFT.sonno,affaticamento:+WL_DRAFT.fatica,umore:+WL_DRAFT.umore,
    zone:WL_DRAFT.zones.map(z=>({x:z.x,y:z.y,intensita:z.intensita,view:z.view}))};
  WL.checkins.push(entry); wlSave();
  toast('Check-in salvato');
  closeModal();
}
