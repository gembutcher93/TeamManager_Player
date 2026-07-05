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
        {d:'2026-06-10',n:'Ricezione + Palleggio',items:[
            {name:'Ricezione in bagher zona 5',grade:6.5,note:'Buona spinta gambe, controlla la chiusura del piano.'},
            {name:'Palleggio in salto',grade:7,note:''}]},
        {d:'2026-06-12',n:'Fase cambio-palla',items:[
            {name:'Attacco da posto 4',grade:7.5,note:'Bel braccio, varia di più le mani.'}]}
    ]};

/* ---------- stato locale ---------- */
function freshDB(pkg){ return {pkg:pkg||SAMPLE, self:{}, mine:[]}; }
function load(){ try{const r=localStorage.getItem(LS); if(r)return JSON.parse(r);}catch(e){} return freshDB(); }
let S=load();
function save(){ localStorage.setItem(LS,JSON.stringify(S)); }
const P=()=>S.pkg;

/* ---------- import ---------- */
function decode(code){ return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
function applyPkg(pkg){
    if(!pkg||pkg.k!=='vtm-player'||!pkg.p) throw new Error('formato');
    S={pkg, self:S.self||{}, mine:S.mine||[]};
    save(); renderAll(); toast('Profilo caricato: '+pkg.p.name);
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
const COURT=`<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none"><rect x="6" y="6" width="388" height="188" fill="none" stroke="#22C55E" stroke-width="2"/><line x1="200" y1="6" x2="200" y2="194" stroke="#22C55E" stroke-width="2.5"/><line x1="135" y1="6" x2="135" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/><line x1="265" y1="6" x2="265" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/></svg>`;

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
    document.getElementById('profilo').innerHTML=`${demoBanner()}
        <div class="phero">${COURT}
            <div class="jersey-big ${p.cap?'cap':''}">${p.number}${p.cap?'<span class="lead">👑</span>':p.vice?'<span class="lead">🥈</span>':''}</div>
            <h2>${p.name}</h2><div class="role">${p.role} · ${p.hand} · ${p.height?p.height+' cm':''}</div>
            <div class="chips">
                <div class="chip">Media <span class="v num">${P().season.avgVoto?P().season.avgVoto.toFixed(1):'—'}</span></div>
                <div class="chip ${f.d}">Forma <span class="v">${f.t}</span></div>
                <div class="chip">Presenza <span class="v num">${P().attPct!=null?P().attPct+'%':'—'}</span></div>
            </div>
        </div>
        ${next}${goal}`;
}

function renderStats(){
    const s=P().season, voti=(P().voti||[]).map(v=>v.v);
    const cell=(l,v,suf='')=>`<div class="stat-cell"><div class="l">${l}</div><div class="v num">${v}${suf?`<small>${suf}</small>`:''}</div></div>`;
    let rows=(P().matches||[]).map(m=>{const r=m.row;return `<tr><td class="l">${m.o}<div style="font-size:.7rem;color:var(--muted-2)">${fmt(m.d)}</div></td>
        <td class="num">${r.bAce}/${r.bErr}</td><td class="num">${r.rTot?Math.round((r.rPos+r.rPrf)/r.rTot*100)+'%':'—'}</td>
        <td class="num">${r.aTot?Math.round((r.aPt-r.aErr)/r.aTot*100)+'%':'—'}</td>
        <td class="num voto" style="color:var(--brand);font-weight:800">${r.voto.toFixed(1)}</td></tr>`;}).join('');
    if(!rows) rows=`<tr><td colspan="5" style="color:var(--muted-2);padding:1.4rem;font-style:italic">Nessuna gara registrata</td></tr>`;
    document.getElementById('statistiche').innerHTML=`<div class="sec-title">Rendimento</div><div class="sec-h">Le mie statistiche</div>
        <div class="card"><h3><i class="fa-solid fa-chart-line"></i> Andamento voti</h3>${svgLine(voti)}</div>
        <div class="card"><h3><i class="fa-solid fa-table-cells"></i> Stagione</h3>
            <div class="stat-grid">${cell('Media voto',s.avgVoto?s.avgVoto.toFixed(1):'—')}${cell('Efficienza attacco',s.atkEff!=null?s.atkEff:'—','%')}${cell('Ricezione positiva',s.recPos!=null?s.recPos:'—','%')}${cell('Ace',s.ace)}${cell('Muri punto',s.blk)}${cell('Gare giocate',s.matches)}</div></div>
        <div class="card"><h3><i class="fa-solid fa-list-ol"></i> Gara per gara</h3>
            <table class="mtable"><thead><tr><th style="text-align:left">Gara</th><th>Bat. A/E</th><th>Ric+</th><th>Att%</th><th>Voto</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
            const note=it.note?`<div class="coach-note"><i>Mister:</i> ${it.note}</div>`:'';
            const rate=RT.map(([k,l])=>`<button class="${k} ${cur===k?'on':''}" onclick="rate('${key}','${k}')">${l}</button>`).join('');
            return `<div class="ex-item"><div class="top"><span class="name">${it.name}</span>${grade}</div>${note}
                <div class="self-rate">${rate}</div></div>`;
        }).join('');
        return `<div class="session"><div class="sh"><b>${sess.n}</b><span>${fmt(sess.d)}</span></div>${items}</div>`;
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
        {ic:'fa-bomb',n:'Bomber',d:'Eff. attacco ≥ 40%',ok:s.atkEff!=null&&s.atkEff>=40},
        {ic:'fa-shield-halved',n:'Muraglia',d:'≥ 8 muri punto',ok:s.blk>=8},
        {ic:'fa-bolt',n:'Battitore',d:'≥ 5 ace stagione',ok:s.ace>=5},
        {ic:'fa-user-clock',n:'Presenze d\'oro',d:'≥ 85% presenze',ok:att!=null&&att>=85},
        {ic:'fa-medal',n:'Veterano',d:'≥ 5 gare giocate',ok:s.matches>=5}
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
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}

/* ---------- creazione / modifica profilo a mano ---------- */
function scaffold(){
    return {v:1,k:'vtm-player',team:(P().team&&!P().demo)?P().team:'',demo:false,
        p:{name:'',number:0,role:'Schiacciatore',hand:'Dx',height:0,cap:false,vice:false,status:'active',goal:''},
        voti:[],season:{matches:0,avgVoto:null,atkEff:null,recPos:null,ace:0,blk:0},
        matches:[],cal:[],att:[],attPct:null,ex:[]};
}
function editMyProfile(){
    const p=P().p, roles=['Palleggiatore','Schiacciatore','Centrale','Opposto','Libero'];
    const opt=(arr,cur)=>arr.map(r=>`<option ${r===cur?'selected':''}>${r}</option>`).join('');
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
        <div style="display:flex;gap:10px">
            <div style="flex:1"><label style="font-size:.72rem;text-transform:uppercase;color:var(--muted);font-weight:600">Ruolo</label>
                <select id="me-role" style="margin:6px 0 12px;width:100%">${opt(roles,p.role)}</select></div>
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
    const pkg=P().demo? scaffold() : JSON.parse(JSON.stringify(P()));
    pkg.demo=false;
    pkg.team=document.getElementById('me-team').value.trim()||pkg.team||'';
    pkg.p.name=name;
    pkg.p.number=parseInt(document.getElementById('me-num').value)||pkg.p.number||0;
    pkg.p.role=document.getElementById('me-role').value;
    pkg.p.hand=document.getElementById('me-hand').value;
    pkg.p.height=parseInt(document.getElementById('me-height').value)||pkg.p.height||0;
    pkg.p.goal=document.getElementById('me-goal').value.trim();
    S.pkg=pkg; save(); closeModal(); renderAll(); toast('Profilo salvato');
}
