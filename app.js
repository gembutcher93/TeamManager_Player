/* =========================================================
   VolleyTeam — Player App (companion offline)
   Importa un "pacchetto profilo" generato dall'app del coach.
   ========================================================= */
'use strict';
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

/* ---------- import ---------- */
function decode(code){ return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
function applyPkg(pkg){
    if(!pkg||pkg.k!=='vtm-player'||!pkg.p) throw new Error('formato');
    S={pkg, self:{}, mine:[], onboard:false};
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
            <button class="pl-cardbtn" onclick="openMyCard()"><i class="fa-solid fa-id-card"></i> La mia card</button>
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
function closeModal(){document.getElementById('modal-overlay').classList.remove('show');}
document.getElementById('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay')closeModal();});
function toast(msg,type='success'){
    const s=document.getElementById('toast-stack');const el=document.createElement('div');el.className=`toast ${type}`;
    el.innerHTML=`<i class="fa-solid ${type==='danger'?'fa-circle-xmark':'fa-circle-check'}"></i><span>${msg}</span>`;
    s.appendChild(el);setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},3000);
}

renderAll();
if(S.onboard) showOnboarding();
idbGet('self').then(d=>{ if(d){ PL_PHOTO=d; renderProfilo(); } });
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}

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
  .fc .photo{width:152px;height:152px;margin:4px auto 8px;border-radius:18px;overflow:hidden;background:rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;position:relative;}
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
    const rd=new FileReader(); rd.onload=()=>{ const img=new Image(); img.onload=()=>{
      const MAX=440, r=Math.min(MAX/img.width,MAX/img.height,1), w=Math.round(img.width*r), h=Math.round(img.height*r);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h);
      const data=cv.toDataURL('image/jpeg',0.72);
      PL_PHOTO=data; idbSet('self',data); renderProfilo();
      if(document.querySelector('.fc')) openMyCard();
      toast('Foto aggiornata');
    }; img.src=rd.result; };
    rd.readAsDataURL(f);
  };
  inp.click();
}
function removePhoto(){ PL_PHOTO=null; idbDel('self'); renderProfilo(); if(document.querySelector('.fc')) openMyCard(); toast('Foto rimossa'); }
function openMyCard(){
  plMediaCSS();
  const p=P().p, ovr=overallOf(), sport=sportOf();
  const pal={pallavolo:['#F6D365','#E2A13C'],calcio:['#7BE0A3','#34A853'],basket:['#FDBA74','#F97316']}[sport]||['#F6D365','#E2A13C'];
  const ic={pallavolo:'🏐',calcio:'⚽',basket:'🏀'}[sport]||'🏅';
  const cells=(P().season.cells||[]).slice(0,4);
  const photo=PL_PHOTO?`<img src="${PL_PHOTO}">`:`<div class="ini">${initialsOf(p.name)}</div>`;
  const stats=cells.length?cells.map(c=>`<div class="st"><span>${c[0]}</span> ${c[1]}${c[2]||''}</div>`).join('')
     :`<div class="st"><span>Media voto</span> ${P().season.avgVoto?P().season.avgVoto.toFixed(1):'—'}</div><div class="st"><span>Presenza</span> ${P().attPct!=null?P().attPct+'%':'—'}</div>`;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-id-card" style="color:var(--brand)"></i> La mia card</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body fc-wrap">
      <div class="fc" style="--fc-a:${pal[0]};--fc-b:${pal[1]}">
        <div class="top"><div class="ovr"><b>${ovr||'—'}</b><span>${roleAbbr(p.role)}</span></div><div class="sporticon">${ic}</div></div>
        <div class="photo">${photo}</div>
        <div class="nm">${p.name||'Il tuo nome'} <span style="opacity:.55">#${p.number||''}</span></div>
        <div class="tm">${P().team||''}</div>
        <div class="stats">${stats}</div>
      </div>
      <button class="btn btn-accent" style="width:100%;margin-top:16px" onclick="pickPhoto()"><i class="fa-solid fa-camera"></i> ${PL_PHOTO?'Cambia foto':'Aggiungi la tua foto'}</button>
      ${PL_PHOTO?'<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="removePhoto()"><i class="fa-solid fa-trash"></i> Rimuovi foto</button>':''}
    </div>`);
}
