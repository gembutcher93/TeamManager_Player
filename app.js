/* =========================================================
   INTERRUTTORE + CONFIG — punto unico da toccare per il deploy
   ========================================================= */
const DEMO_BUILD = false;                 // false = completa; true sul deploy demo
const DEMO_DAYS = 20;
const DEMO_HARD_DEADLINE = '2026-10-31';  // oltre questa data la demo e' morta per tutti, comunque
const CARD_STUDIO_ENABLED = false;        // officina card nascosta (si riattiva con true)
const CONTACT_INFO = '+39 3498290606';    // mostrato nella schermata di scadenza
const STRIPE_MONTHLY_URL = '';            // lasciare vuoto per ora (nessun bottone); si incolla dopo
const STRIPE_ANNUAL_URL  = '';            // idem
const MULTITEAM_ENABLED = false;          // pannello multi-squadra/società = feature tier Club
/* Tutta la logica demo (countdown, blocco a scadenza) si attiva SOLO se DEMO_BUILD===true. */

/* ---------- STATO PROVA (solo DEMO_BUILD) ---------- */
function demoDaysLeft(){
  const raw=localStorage.getItem('vt_demo_start');
  if(!raw) return DEMO_DAYS;
  const elapsed=Math.floor((Date.now()-new Date(raw).getTime())/86400000);
  return DEMO_DAYS-elapsed;
}
function demoExpired(){
  if(Date.now() > new Date(DEMO_HARD_DEADLINE+'T23:59:59').getTime()) return true; // il hard deadline vince sempre
  return demoDaysLeft()<=0;
}
function activateDemo(){
  if(!localStorage.getItem('vt_demo_start')) localStorage.setItem('vt_demo_start', new Date().toISOString());
}

/* =========================================================
   VolleyTeam Manager — logica applicativa
   Dati in un unico oggetto DB persistito in localStorage.
   ========================================================= */
'use strict';

const LS_KEY = 'volleyteam_db';
const PROFILES_KEY='vt_profiles', ACTIVE_KEY='vt_active';
function activeProfile(){ return localStorage.getItem(ACTIVE_KEY)||''; }
function dbKey(){ const p=activeProfile(); return p? LS_KEY+':'+p : LS_KEY; }
function getProfiles(){ try{ return JSON.parse(localStorage.getItem(PROFILES_KEY))||[]; }catch(e){ return []; } }
function setProfiles(a){ localStorage.setItem(PROFILES_KEY, JSON.stringify(a)); }
const MONTHS = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const today = () => new Date(new Date().toDateString());

/* =========================================================
   SCOUT — schemi per sport (una engine, tre tabellini).
   La schermata scout si costruisce da qui in base a DB.sport.
   ========================================================= */
function curSport(){ try{ return (DB && DB.sport) || 'pallavolo'; }catch(e){ return 'pallavolo'; } }
const clampVoto = v => Math.max(2.0, Math.min(10.0, v));

const SCOUT = {
  pallavolo:{
    groups:[
      {label:'Battuta',   fields:[['bErr','Err'],['bAce','Ace']]},
      {label:'Ricezione', fields:[['rTot','Tot'],['rPos','Pos'],['rPrf','Prf']]},
      {label:'Attacco',   fields:[['aTot','Tot'],['aErr','Err'],['aPt','Pt']]},
      {label:'Muro',      fields:[['mPt','Pt']]}
    ],
    voto(s, role){ return volleyVoto(s, role).voto; },
    why(s, role){ return volleyVoto(s, role).parts; },
    season(a){
      const atk=a.aTot?Math.round((a.aPt-a.aErr)/a.aTot*100):null;
      const rec=a.rTot?Math.round((a.rPos+a.rPrf)/a.rTot*100):null;
      return [['Efficienza attacco',atk!=null?atk:'—',atk!=null?'%':''],
              ['Ricezione positiva',rec!=null?rec:'—',rec!=null?'%':''],
              ['Ace totali',a.bAce||0,''],['Muri punto',a.mPt||0,'']];
    },
    note:'Voto: algoritmo dinamico (base 6.0) su battuta, ricezione, attacco e muro.'
  },
  calcio:{
    groups:[
      {label:'Offensivo',  fields:[['gol','Gol'],['assist','Ass'],['tiroPorta','Tiro P.'],['dribbling','Drib']]},
      {label:'Difensivo',  fields:[['contrasto','Contr'],['intercetto','Interc'],['chiusura','Chius']]},
      {label:'Disciplina', fields:[['fallo','Falli'],['ammonizione','Amm'],['espulsione','Esp'],['pallaPersa','P.Persa']]},
      {label:'Portiere',   fields:[['parata','Parate'],['uscita','Uscite'],['respinta','Resp'],['golSubito','Sub']]},
      {label:'',           fields:[['min','Min']]}
    ],
    /* Pesi calibrati per dare pari dignità alle azioni difensive/portiere rispetto a gol
       e assist: un difensore o un portiere che gioca un'ottima gara fatta di sole azioni
       difensive (contrasti, intercetti, chiusure, parate, uscite) deve poter superare il
       voto base 6.0 tanto quanto un attaccante che segna, non restare relegato alla sola
       assenza di demeriti. */
    voto(s){
      let v=6.0;
      v+=(s.gol||0)*1.0 + (s.assist||0)*0.6 + (s.tiroPorta||0)*0.15 + (s.dribbling||0)*0.12
        +(s.contrasto||0)*0.15 + (s.intercetto||0)*0.15 + (s.chiusura||0)*0.2
        +(s.parata||0)*0.3 + (s.uscita||0)*0.25 + (s.respinta||0)*0.2;
      v-=(s.fallo||0)*0.05 + (s.ammonizione||0)*0.3 + (s.espulsione||0)*1.5
        +(s.pallaPersa||0)*0.1 + (s.golSubito||0)*0.3;
      return clampVoto(v);
    },
    season(a){
      return [['Gol',a.gol||0,''],['Assist',a.assist||0,''],
              ['Contrasti vinti',a.contrasto||0,''],['Parate',a.parata||0,''],
              ['Ammonizioni',a.ammonizione||0,'']];
    },
    note:'Voto (base 6.0): +gol, assist, tiri in porta, dribbling, contrasti vinti, intercetti, chiusure, parate, uscite, respinte · −falli, ammonizioni, espulsioni, palle perse, gol subiti.'
  },
  basket:{
    groups:[
      {label:'',        fields:[['punti','Pt']]},
      {label:'Rimbalzi',fields:[['roff','Off'],['rdif','Dif']]},
      {label:'',        fields:[['assist','Ass'],['rubate','Rub'],['perse','Perse'],['stoppate','Stop'],['falli','Falli']]},
      {label:'2 Punti', fields:[['fg2m','Fatti'],['fg2a','Tent']]},
      {label:'3 Punti', fields:[['fg3m','Fatti'],['fg3a','Tent']]},
      {label:'Liberi',  fields:[['ftm','Fatti'],['fta','Tent']]},
      {label:'',        fields:[['min','Min']]}
    ],
    voto(s){
      const miss=(s.fg2a-s.fg2m)+(s.fg3a-s.fg3m)+(s.fta-s.ftm);
      const val=s.punti+(s.roff+s.rdif)+s.assist+s.rubate+s.stoppate-s.perse-miss-s.falli*0.5;
      return clampVoto(6.0+val*0.15);
    },
    season(a){
      const p3=a.fg3a?Math.round(a.fg3m/a.fg3a*100):null;
      return [['Punti',a.punti||0,''],['Rimbalzi',(a.roff||0)+(a.rdif||0),''],
              ['Assist',a.assist||0,''],['% da 3',p3!=null?p3:'—',p3!=null?'%':''],
              ['Stoppate',a.stoppate||0,'']];
    },
    note:'PT si calcola automaticamente da tiri da 2/3 e liberi fatti (non è modificabile a mano). Voto (base 6.0) dalla valutazione: punti, rimbalzi, assist, rubate, stoppate − perse, errori al tiro, falli.'
  }
};
function scoutFields(sport){ return SCOUT[sport||curSport()].groups.flatMap(g=>g.fields.map(f=>f[0])); }
function blankStat(sport){ const o={}; scoutFields(sport).forEach(k=>o[k]=0); return o; }
function computeVoto(s, sport, role){ return SCOUT[sport||curSport()].voto(s, role); }
/* =========================================================
   MOTORE VOTO PALLAVOLO — pesi in configurazione (regolabili da admin)
   I default qui sotto = calibrazione attuale: cambiarli NON è necessario,
   ma l'allenatore/admin può ritoccarli dal pannello in Impostazioni.
   Il voto viene sempre RICALCOLATO live da queste + le statistiche,
   quindi ritoccare un peso aggiorna anche le partite già registrate.
   ========================================================= */
const DEFAULT_VOLLEY_WEIGHTS = {
  base: 6.0,
  /* curva attacco: [sogliaEff, punti]; sotto l'ultima soglia → attackFloor */
  attackCurve: [[0.45,1.2],[0.40,1.0],[0.30,0.6],[0.25,0.4],[0.15,0.15],[0.10,0.0]],
  attackFloor: -1.0,
  /* curva ricezione: [sogliaPos%, punti]; sotto l'ultima → recFloor */
  recCurve: [[0.95,1.7],[0.85,1.4],[0.75,1.1],[0.68,0.85],[0.60,0.6],[0.52,0.32],[0.45,0.08],[0.38,-0.3],[0.30,-0.7]],
  recFloor: -1.2,
  recVolumeDenom: 14,               /* n° ricezioni per "volume pieno" */
  volBonus: {minEff:0.30, minAtt:18, val:0.3},  /* bonus attaccante prolifico */
  /* pesi per ruolo. att = moltiplicatore curva attacco; rec = moltiplicatore curva ricezione */
  roles: {
    Libero:        {att:0,   rec:2.1,  block:0.4,  ace:0.3,  servErrPen:0.30, attPt:0.6, attErrPen:0.2, recVolBonus:{minPos:0.60,minTot:15,val:0.5}},
    Schiacciatore: {att:1.0, rec:1.05, block:0.25, ace:0.15, servErrPen:0.30, volBonus:true},
    Opposto:       {att:1.3, rec:0.6,  block:0.25, ace:0.2,  servErrPen:0.30, volBonus:true},
    Centrale:      {att:1.0, rec:0.6,  block:0.4,  ace:0.15, servErrPen:0.30, blockNote:'(x2)'},
    Palleggiatore: {att:0.5, rec:0.6,  block:0.25, ace:0.2,  servErrPen:0.30}
  }
};
let WEIGHTS_OVERRIDE=null;   /* usato dall'editor admin per l'anteprima live */
function getVolleyWeights(){
  if(WEIGHTS_OVERRIDE) return WEIGHTS_OVERRIDE;
  if(!DB.settings) DB.settings={};
  if(!DB.settings.volleyWeights) DB.settings.volleyWeights=JSON.parse(JSON.stringify(DEFAULT_VOLLEY_WEIGHTS));
  return DB.settings.volleyWeights;
}
/* Voto di una riga di scout, RICALCOLATO live da stat + ruolo + pesi correnti */
function rowVoto(row, sport){
  if(row && typeof row.votoOverride==='number' && !isNaN(row.votoOverride)) return row.votoOverride;
  const p=playerById(row.pId);
  return computeVoto(row, sport||curSport(), p?p.role:null);
}
function computeWhy(s, sport, role){ const sc=SCOUT[sport||curSport()]; return sc && sc.why ? sc.why(s,role) : []; }
function volleyVoto(s, role){
  const W=getVolleyWeights();
  role = W.roles[role] ? role : 'Schiacciatore';
  const R=W.roles[role];
  const aTot=s.aTot||0, rTot=s.rTot||0;
  const attEff = aTot>0 ? (s.aPt - s.aErr)/aTot : null;
  const recPos = rTot>0 ? ((s.rPos||0)+(s.rPrf||0))/rTot : null;
  const aces=s.bAce||0, servErr=s.bErr||0, blocks=s.mPt||0;
  let v=W.base; const parts=[];
  const add=(val,lbl)=>{ if(val){ v+=val; parts.push(lbl+' '+(val>0?'+':'')+val.toFixed(1)); } };
  const onCurve=(x,curve,floor)=>{ if(x==null)return null; for(const [th,val] of curve){ if(x>=th) return val; } return floor; };
  const attackPts=(eff,mult)=>{ if(eff==null) return 0; return onCurve(eff,W.attackCurve,W.attackFloor)*(mult||1); };
  const volBonus=(eff)=> (R.volBonus && eff!=null && eff>=W.volBonus.minEff && aTot>=W.volBonus.minAtt) ? W.volBonus.val : 0;
  const recPts=()=>{ if(recPos==null||!rTot) return 0; return onCurve(recPos,W.recCurve,W.recFloor)*R.rec*Math.min(1, rTot/W.recVolumeDenom); };
  const effPct = attEff!=null?Math.round(attEff*100)+'%':'';
  const posPct = recPos!=null?Math.round(recPos*100)+'%':'';
  const recLbl = recPos!=null?'Ricezione '+posPct:null;
  if(role==='Libero'){
    add(recPts(), recLbl);
    if(R.recVolBonus) add((recPos!=null && recPos>=R.recVolBonus.minPos && rTot>=R.recVolBonus.minTot)?R.recVolBonus.val:0, rTot>=(R.recVolBonus.minTot||99)?'volume ricezione':null);
    add((s.aPt||0)*(R.attPt||0), s.aPt?s.aPt+' attacchi pt':null);
    add(-(s.aErr||0)*(R.attErrPen||0), s.aErr?s.aErr+' err.att':null);
    add(blocks*R.block, blocks?blocks+' muri':null);
    add(aces*R.ace, aces?aces+' ace':null);
    add(-servErr*R.servErrPen, servErr?servErr+' err.batt':null);
  } else {
    add(attackPts(attEff,R.att)+volBonus(attEff),'Attacco '+effPct);
    add(recPts(), recLbl);
    add(blocks*R.block, blocks?blocks+' muri'+(R.blockNote||''):null);
    add(aces*R.ace, aces?aces+' ace':null);
    add(-servErr*R.servErrPen, servErr?servErr+' err.batt':null);
  }
  return { voto: clampVoto(v), parts };
}

/* =========================================================
   TUTORIAL SCOUT (Fase 2) — spiega uso + come nasce il voto,
   generato dai PESI REALI così resta sempre aggiornato.
   ========================================================= */
const ROLE_ORDER=['Palleggiatore','Schiacciatore','Centrale','Opposto','Libero'];
function openScoutTutorial(){
  weightsCSS();
  const sport=curSport();
  const isVolley = sport==='pallavolo';
  const isBasket = sport==='basket';
  const uso = isVolley ? `
    <ol class="tut-steps">
      <li><b>Tocca un giocatore</b> nella lista a sinistra: si evidenzia.</li>
      <li>Scegli il <b>fondamentale</b> (Ricezione / Attacco / Battuta / Muro).</li>
      <li>Tocca il <b>grado</b> del tocco: <b>#</b> perfetto · <b>+</b> positivo · <b>!</b> ok · <b>−</b> negativo · <b>=</b> errore.</li>
      <li>Ogni tocco aggiorna subito le percentuali e il voto del giocatore.</li>
      <li>Sbagliato? Usa <b>Annulla ultimo</b>, oppure seleziona il giocatore e togli il singolo tocco dalla lista delle <b>chip</b>.</li>
      <li><b>Registra statistiche</b> per salvare tutto nelle schede atleti.</li>
    </ol>` : isBasket ? `
    <ol class="tut-steps">
      <li><b>Tocca un giocatore</b> nella lista a sinistra: si evidenzia.</li>
      <li>Scegli la <b>categoria</b>: Tiro da 2 / da 3 / libero, Rimbalzo, oppure Assist · Palla rubata · Palla persa · Stoppata · Fallo.</li>
      <li>Per i tiri e il rimbalzo tocca l'<b>esito</b> (Fatto/Sbagliato oppure Offensivo/Difensivo). Per le altre categorie il tocco sulla categoria registra subito l'evento.</li>
      <li>Il <b>PT</b> si calcola da solo dai tiri fatti: non si inserisce a mano.</li>
      <li>Il <b>MIN</b> (minutaggio) si inserisce a parte, sotto il nome del giocatore.</li>
      <li>Sbagliato? Usa <b>Annulla ultimo</b>, oppure seleziona il giocatore e togli il singolo tocco dalla lista delle <b>chip</b>.</li>
      <li><b>Registra statistiche</b> per salvare tutto nelle schede atleti.</li>
    </ol>` : sport==='calcio' ? `
    <ol class="tut-steps">
      <li><b>Tocca un giocatore</b> nella lista a sinistra: si evidenzia.</li>
      <li>Scegli la <b>categoria</b>: Offensivo, Difensivo, Disciplina o (solo per il portiere) Portiere.</li>
      <li>Tocca l'<b>azione</b>: ogni tocco registra subito l'evento (Gol, Contrasto vinto, Parata, Fallo…).</li>
      <li>Difensori e portieri guadagnano voto anche senza segnare: contrasti, intercetti, chiusure e parate pesano quanto gol e assist.</li>
      <li>Il <b>MIN</b> (minutaggio) si inserisce a parte, sotto il nome del giocatore.</li>
      <li>Sbagliato? Usa <b>Annulla ultimo</b>, oppure seleziona il giocatore e togli il singolo tocco dalla lista delle <b>chip</b>.</li>
      <li><b>Registra statistiche</b> per salvare tutto nelle schede atleti.</li>
    </ol>` : `
    <ol class="tut-steps">
      <li>Compila la <b>tabella</b> fondamentale per fondamentale, riga per riga.</li>
      <li>Il <b>voto</b> di ogni atleta si calcola da solo mentre digiti.</li>
      <li><b>Registra statistiche</b> per salvare nello storico.</li>
    </ol>`;
  const voto = isVolley ? weightsExplainerHTML() : `<p class="tut-p">Il voto parte da 6.0 e sale o scende in base al rendimento nei fondamentali registrati.</p>`;
  openModal(`
    <div class="modal-head"><h3><i class="fa-solid fa-circle-question" style="color:var(--brand)"></i> Come funziona lo Scout</h3>
      <button class="icon-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="tut-body">
      <div class="tut-sec"><h4><i class="fa-solid fa-hand-pointer"></i> Come si usa</h4>${uso}</div>
      <div class="tut-sec"><h4><i class="fa-solid fa-scale-balanced"></i> Come nasce il voto</h4>${voto}
        <p class="tut-note">I pesi qui sopra sono quelli attualmente in uso. Si regolano da <b>Impostazioni → Motore voto</b> (area riservata).</p>
      </div>
    </div>`, true);
}
/* spiega, ruolo per ruolo, cosa pesa — leggendo i pesi correnti */
function weightsExplainerHTML(){
  const W=getVolleyWeights();
  const pct=n=>Math.round(n*100);
  const rows=ROLE_ORDER.map(role=>{
    const R=W.roles[role]; const bits=[];
    if(role==='Libero'){
      bits.push(`ricezione peso <b>${R.rec}×</b> (fino al 10 se non sbaglia mai)`);
      bits.push(`ogni attacco a punto <b>+${R.attPt}</b>, muro <b>+${R.block}</b>, ace <b>+${R.ace}</b>`);
    } else {
      bits.push(`attacco peso <b>${R.att}×</b> (su Eff%)`);
      bits.push(`ricezione peso <b>${R.rec}×</b> (su Pos%${role==='Palleggiatore'||role==='Centrale'||role==='Opposto'?', conta poco ma non zero':''})`);
      bits.push(`muro <b>+${R.block}</b>${R.blockNote||''}, ace <b>+${R.ace}</b>`);
    }
    bits.push(`errore battuta <b>−${R.servErrPen}</b>`);
    return `<tr><td class="tut-role">${role}</td><td>${bits.join(' · ')}</td></tr>`;
  }).join('');
  return `<p class="tut-p">Il voto parte da <b>${W.base.toFixed(1)}</b>. Poi ogni fondamentale aggiunge o toglie in base al ruolo:</p>
    <table class="tut-table"><tbody>${rows}</tbody></table>`;
}

/* =========================================================
   PANNELLO ADMIN — MOTORE VOTO (Fase 3)
   Regola i pesi per ruolo + curve, con anteprima live, reset e password.
   Soft-lock lato browser: protegge da modifiche accidentali, non è crittografia.
   ========================================================= */
const ADMIN_PASS='coach173';   /* password admin di default — cambiabile qui */
let WADRAFT=null;              /* copia di lavoro dei pesi durante l'editing */
function openWeightsAdmin(){
  const tries=prompt('Password admin per regolare il motore voto:');
  if(tries===null) return;
  if(tries!==ADMIN_PASS){ toast('Password errata','info'); return; }
  WADRAFT=JSON.parse(JSON.stringify(getVolleyWeights()));
  WEIGHTS_OVERRIDE=WADRAFT;
  weightsCSS();
  renderWeightsEditor();
}
function closeWeightsAdmin(){ WEIGHTS_OVERRIDE=null; WADRAFT=null; closeModal(); }
function renderWeightsEditor(){
  const W=WADRAFT;
  const slider=(path,label,min,max,step)=>{
    const val=wGet(path);
    return `<div class="w-row"><span class="w-lbl">${label}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" oninput="wSet('${path}',this.value)">
      <span class="w-val" id="wv-${cssId(path)}">${(+val).toFixed(2)}</span></div>`;
  };
  const roleBlock=role=>{
    const R=W.roles[role]; const p=`roles.${role}`;
    let s=`<div class="w-role"><div class="w-role-h"><b>${role}</b>
      <button class="w-reset" onclick="wResetRole('${role}')"><i class="fa-solid fa-rotate-left"></i> default</button></div>`;
    if(role==='Libero'){
      s+=slider(p+'.rec','Ricezione ×',0,3,0.05)+slider(p+'.attPt','Attacco a punto +',0,1.5,0.05)
        +slider(p+'.attErrPen','Errore attacco −',0,1,0.05)+slider(p+'.block','Muro +',0,1,0.05)
        +slider(p+'.ace','Ace +',0,1,0.05)+slider(p+'.servErrPen','Err. battuta −',0,1,0.05);
    } else {
      s+=slider(p+'.att','Attacco ×',0,2,0.05)+slider(p+'.rec','Ricezione ×',0,2.5,0.05)
        +slider(p+'.block','Muro +',0,1,0.05)+slider(p+'.ace','Ace +',0,1,0.05)
        +slider(p+'.servErrPen','Err. battuta −',0,1,0.05);
    }
    s+=`<div class="w-prev" id="wp-${role}"></div></div>`;
    return s;
  };
  const curveRows=(arr,path,unit)=>arr.map((pair,i)=>`
    <div class="w-curve-row">
      <span>${unit} ≥ <input type="number" step="0.01" value="${pair[0]}" onchange="wSetCurve('${path}',${i},0,this.value)"></span>
      <span>→ <input type="number" step="0.05" value="${pair[1]}" onchange="wSetCurve('${path}',${i},1,this.value)"> punti</span>
    </div>`).join('');
  openModal(`
    <div class="modal-head"><h3><i class="fa-solid fa-sliders" style="color:var(--brand)"></i> Motore voto · admin</h3>
      <button class="icon-btn" onclick="closeWeightsAdmin()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="w-body">
      <p class="w-intro">Regola quanto pesa ogni fondamentale per ruolo. L'anteprima sotto ogni ruolo mostra il voto di un caso d'esempio, aggiornato mentre muovi gli slider. Le partite già registrate si ricalcolano da sole quando salvi.</p>
      <div class="w-roles">${ROLE_ORDER.map(roleBlock).join('')}</div>
      <details class="w-adv"><summary>Curve e parametri avanzati</summary>
        <div class="w-adv-body">
          ${slider('base','Voto di partenza',4,7,0.1)}
          ${slider('recVolumeDenom','Ricezioni per "volume pieno"',6,30,1)}
          <h5>Curva ricezione (Pos% → punti)</h5>${curveRows(W.recCurve,'recCurve','Pos%')}
          <div class="w-curve-row"><span>sotto tutte → <input type="number" step="0.05" value="${W.recFloor}" onchange="wSetScalar('recFloor',this.value)"> punti</span></div>
          <h5>Curva attacco (Eff% → punti)</h5>${curveRows(W.attackCurve,'attackCurve','Eff%')}
          <div class="w-curve-row"><span>sotto tutte → <input type="number" step="0.05" value="${W.attackFloor}" onchange="wSetScalar('attackFloor',this.value)"> punti</span></div>
        </div>
      </details>
      <div class="w-actions">
        <button class="btn btn-ghost" onclick="wResetAll()"><i class="fa-solid fa-rotate-left"></i> Ripristina tutti i default</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="closeWeightsAdmin()">Annulla</button>
        <button class="btn btn-accent" onclick="wSave()"><i class="fa-solid fa-floppy-disk"></i> Salva</button>
      </div>
    </div>`, true);
  wPreviewAll();
}
/* get/set su WADRAFT via path tipo "roles.Libero.rec" */
function wGet(path){ return path.split('.').reduce((o,k)=>o[k],WADRAFT); }
function wSetRaw(path,val){ const ks=path.split('.'); const last=ks.pop(); ks.reduce((o,k)=>o[k],WADRAFT)[last]=val; }
function cssId(s){ return s.replace(/[^a-zA-Z0-9]/g,'-'); }
function wSet(path,val){ wSetRaw(path,+val); const el=document.getElementById('wv-'+cssId(path)); if(el)el.textContent=(+val).toFixed(2); wPreviewAll(); }
function wSetScalar(key,val){ WADRAFT[key]=+val; wPreviewAll(); }
function wSetCurve(path,i,j,val){ wGet(path)[i][j]=+val; wPreviewAll(); }
function wResetRole(role){ WADRAFT.roles[role]=JSON.parse(JSON.stringify(DEFAULT_VOLLEY_WEIGHTS.roles[role])); renderWeightsEditor(); }
function wResetAll(){ WADRAFT=JSON.parse(JSON.stringify(DEFAULT_VOLLEY_WEIGHTS)); WEIGHTS_OVERRIDE=WADRAFT; renderWeightsEditor(); }
function wSave(){ DB.settings=DB.settings||{}; DB.settings.volleyWeights=JSON.parse(JSON.stringify(WADRAFT)); WEIGHTS_OVERRIDE=null; WADRAFT=null; save(); closeModal(); toast('Pesi salvati — voti aggiornati'); if(document.getElementById('roster').classList.contains('active')) renderRoster(); }
/* casi d'esempio per l'anteprima, uno per ruolo */
const WPREVIEW_CASE={
  Palleggiatore:{aTot:6,aPt:3,aErr:1,mPt:1,bAce:1,rTot:2,rPrf:1},
  Schiacciatore:{aTot:20,aPt:9,aErr:3,rTot:14,rPrf:8,rPos:2},
  Centrale:{aTot:12,aPt:8,aErr:1,mPt:3},
  Opposto:{aTot:22,aPt:11,aErr:4,mPt:2},
  Libero:{rTot:18,rPrf:11,rPos:3}
};
function wPreviewAll(){
  ROLE_ORDER.forEach(role=>{
    const box=document.getElementById('wp-'+role); if(!box) return;
    const s=Object.assign(blankStat('pallavolo'),WPREVIEW_CASE[role]);
    const v=computeVoto(s,'pallavolo',role);
    const rec=s.rTot?Math.round((s.rPos+s.rPrf)/s.rTot*100):null;
    const eff=s.aTot?Math.round((s.aPt-s.aErr)/s.aTot*100):null;
    box.innerHTML=`Esempio${eff!=null?' · Att '+eff+'%':''}${rec!=null?' · Ric '+rec+'%':''} → <b>voto ${v.toFixed(1)}</b>`;
  });
}
function weightsCSS(){
  if(document.getElementById('weights-css')) return;
  const st=document.createElement('style'); st.id='weights-css';
  st.textContent=`
  .tut-body,.w-body{max-height:70vh;overflow:auto;padding:4px 2px;}
  .tut-sec{margin-bottom:1.2rem;} .tut-sec h4{display:flex;align-items:center;gap:8px;margin:.2rem 0 .6rem;font-size:1rem;}
  .tut-steps{margin:0 0 0 1.1rem;padding:0;display:flex;flex-direction:column;gap:.45rem;} .tut-steps li{line-height:1.4;}
  .tut-p{margin:.2rem 0 .7rem;color:var(--muted);} .tut-note{margin-top:.7rem;font-size:.82rem;color:var(--muted);}
  .tut-table{width:100%;border-collapse:collapse;font-size:.86rem;} .tut-table td{border-top:1px solid var(--border,rgba(255,255,255,.1));padding:.5rem .4rem;vertical-align:top;line-height:1.4;}
  .tut-role{font-weight:800;color:var(--brand);white-space:nowrap;padding-right:.7rem!important;}
  .w-intro{color:var(--muted);font-size:.88rem;margin-bottom:1rem;}
  .w-roles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
  .w-role{border:1px solid var(--border,rgba(255,255,255,.12));border-radius:14px;padding:12px;background:var(--surface-2,rgba(255,255,255,.03));}
  .w-role-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;} .w-role-h b{font-size:1rem;color:var(--brand);}
  .w-reset{background:none;border:1px solid var(--border,rgba(255,255,255,.18));color:var(--muted);border-radius:8px;padding:3px 8px;font-size:.72rem;cursor:pointer;}
  .w-row{display:grid;grid-template-columns:1fr 110px 42px;align-items:center;gap:8px;margin:.35rem 0;font-size:.82rem;}
  .w-row input[type=range]{width:100%;} .w-val{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted);}
  .w-prev{margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--border,rgba(255,255,255,.14));font-size:.82rem;color:var(--muted);} .w-prev b{color:var(--text,#fff);}
  .w-adv{margin-top:1rem;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;padding:.4rem .8rem;}
  .w-adv summary{cursor:pointer;font-weight:600;padding:.4rem 0;} .w-adv-body h5{margin:.9rem 0 .3rem;font-size:.85rem;color:var(--brand);}
  .w-curve-row{display:flex;gap:14px;flex-wrap:wrap;font-size:.82rem;color:var(--muted);margin:.25rem 0;align-items:center;}
  .w-curve-row input{width:70px;padding:3px 6px;border-radius:7px;border:1px solid var(--border,rgba(255,255,255,.18));background:var(--surface,rgba(0,0,0,.2));color:inherit;}
  .w-actions{display:flex;align-items:center;gap:8px;margin-top:1.2rem;flex-wrap:wrap;}
  `;
  document.head.appendChild(st);
}

/* ---------- STATO VUOTO (squadra nuova: nessun dato precompilato, qualunque sia lo sport) ---------- */
function emptyDB(){
    return {teamName:'TEAM',players:[],events:[],scoutHistory:[],attendance:{},rotationStats:{},trainings:{},substitutions:{},nextId:1};
}

/* ---------- LOAD / SAVE ---------- */
function loadDB(){
    try{
        const raw = localStorage.getItem(dbKey());
        if(raw) return JSON.parse(raw);
    }catch(e){ console.warn('DB corrotto, ricreo.', e); }
    // migrazione dalla vecchia versione VolleyStats 2.0
    try{
        const oldP = JSON.parse(localStorage.getItem('volley_players'));
        if(oldP && oldP.length){
            const db = emptyDB();
            db.players = oldP.map(p=>({...p,hand:p.hand||'Dx',height:p.height||0,status:p.status||'active'}));
            db.events = JSON.parse(localStorage.getItem('volley_events')) || db.events;
            db.teamName = localStorage.getItem('volley_team_name') || 'TEAM';
            db.scoutHistory = []; db.attendance = {}; db.rotationStats = {};
            return db;
        }
    }catch(e){}
    return emptyDB();
}
const FRESH_INSTALL = !localStorage.getItem(dbKey()); // nessun dato squadra salvato per questo profilo
let DB = loadDB();
if(!DB.trainings) DB.trainings = {};
if(!DB.substitutions) DB.substitutions = {};
if(!DB.physicalTests) DB.physicalTests = {sprint:[],jump:[]};
if(!DB.nextId) DB.nextId = Date.now();
function save(){ localStorage.setItem(dbKey(), JSON.stringify(DB)); }
function uid(){ return DB.nextId++; }

/* =========================================================
   TUTORIAL — primo avvio (ENTRAMBE le build), riapribile da Impostazioni.
   ========================================================= */
const ONB_STEPS = [
  {icon:'fa-shield-halved',title:'Crea la tua squadra',body:'Dai un nome alla squadra e scegli lo sport — pallavolo, calcio o basket — da Impostazioni. Si cambia quando vuoi.'},
  {icon:'fa-users',title:'Aggiungi i giocatori',body:'Vai su Roster &amp; Ruoli e costruisci la rosa: nome, numero, ruolo. Da lì assegni anche capitano e vice capitano.'},
  {icon:'fa-calendar-days',title:'Pianifica gli allenamenti',body:'In Calendario crei sedute singole o serie ricorrenti, e assegni gli esercizi da far votare.'},
  {icon:'fa-clipboard-list',title:'In partita usa lo Scout',body:'Durante la gara registra i fondamentali in Scout Gara: il voto di ogni giocatore nasce automaticamente da lì.'},
  {icon:'fa-id-badge',title:'Guarda le card',body:'Ogni giocatore ottiene una card a tier — GOAT, Mythic, Diamond, Gold, Silver — in base al rendimento stagionale.'},
  {icon:'fa-share-nodes',title:'Condividi con il Player',body:"Da Roster apri un giocatore e tocca Condividi: gli mandi file o codice con card, statistiche e formazione consigliata. Aggiorna e reinvia dopo ogni partita o allenamento. Il giocatore può a sua volta rimandarti le sue statistiche mentali (Mental Gym) da reimportare."},
  {icon:'fa-database',title:"L'app funziona offline",body:"Tutti i dati restano sul tuo dispositivo, non in un cloud. Fai backup regolari da Impostazioni per non perderli se cambi telefono o disinstalli l'app."}
];
const ONB_DEMO_STEPS = [
  {icon:'fa-hourglass-half',title:`${DEMO_DAYS} giorni per provarla`,body:`Usa l'app con la tua squadra vera per ${DEMO_DAYS} giorni. Alla scadenza scarichi un backup dei dati: le foto restano sul telefono e le ricarichi nella versione completa.`},
  {icon:'fa-mobile-screen-button',title:"L'app dei giocatori è a parte",body:"Statistiche in tempo reale e card personali per i giocatori sono incluse solo con l'acquisto: in prova usi solo la parte coach."},
  {icon:'fa-play',title:'Pronto a iniziare?',body:'Da quando attivi la prova parte il conto alla rovescia. Puoi rivedere questa guida quando vuoi da Impostazioni.'}
];
let _onbIdx=0, _onbList=[];
function onbCSS(){
  if(document.getElementById('onb-css')) return;
  const st=document.createElement('style'); st.id='onb-css';
  st.textContent=`
#onb-overlay{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:1.2rem;
  overflow-y:auto;
  background:rgba(4,8,18,.86);backdrop-filter:blur(6px);}
.onb-card{width:100%;max-width:460px;max-height:90vh;overflow-y:auto;margin:auto;background:var(--surface,#0E1525);border:1px solid var(--line,#22304E);border-radius:20px;
  padding:1.8rem 1.6rem;text-align:center;box-shadow:0 20px 50px -20px rgba(0,0,0,.7);animation:onbPop .25s cubic-bezier(.2,.8,.2,1);}
  @keyframes onbPop{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
  .onb-ic{width:64px;height:64px;border-radius:18px;background:rgba(34,197,94,.14);color:var(--brand,#22C55E);
    display:flex;align-items:center;justify-content:center;font-size:1.7rem;margin:0 auto 1.1rem;}
  .onb-card h3{font-family:'Outfit',sans-serif;font-size:1.3rem;font-weight:800;margin-bottom:.6rem;}
  .onb-card p{color:var(--muted,#8395B4);font-size:.94rem;line-height:1.55;margin-bottom:1.5rem;}
  .onb-dots{display:flex;gap:6px;justify-content:center;margin-bottom:1.3rem;}
  .onb-dots span{width:7px;height:7px;border-radius:50%;background:var(--line,#22304E);transition:.2s;}
  .onb-dots span.on{background:var(--brand,#22C55E);width:20px;border-radius:5px;}
  .onb-skip{background:transparent;border:none;color:var(--muted-2,#5C6C8C);font-size:.82rem;font-weight:600;cursor:pointer;margin-top:1rem;padding:6px;width:100%;}
  @media(min-width:600px){.onb-card{padding:2.2rem 2rem;}}
  `;
  document.head.appendChild(st);
}
function openOnboarding(force){
  if(!force && localStorage.getItem('vt_tutorial_done')) return;
  onbCSS();
  _onbList = ONB_STEPS.concat(DEMO_BUILD?ONB_DEMO_STEPS:[]);
  _onbIdx=0;
  if(!document.getElementById('onb-overlay')){
    const o=document.createElement('div'); o.id='onb-overlay';
    document.body.appendChild(o);
  }
  onbRender();
}
function onbRender(){
  const o=document.getElementById('onb-overlay'); if(!o) return;
  const s=_onbList[_onbIdx]; const last=_onbIdx===_onbList.length-1;
  const isDemoCta = last && DEMO_BUILD;
  const label = isDemoCta ? 'Attiva versione di prova' : (last?'Inizia':'Avanti');
  o.innerHTML=`<div class="onb-card">
    <div class="onb-ic"><i class="fa-solid ${s.icon}"></i></div>
    <h3>${s.title}</h3>
    <p>${s.body}</p>
    <div class="onb-dots">${_onbList.map((_,i)=>`<span class="${i===_onbIdx?'on':''}"></span>`).join('')}</div>
    <button class="btn btn-accent" style="width:100%" onclick="onbNext()"><i class="fa-solid ${isDemoCta?'fa-play':'fa-arrow-right'}"></i> ${label}</button>
    ${last?'':'<button class="onb-skip" onclick="onbFinish()">Salta</button>'}
  </div>`;
}
function onbNext(){
  if(_onbIdx>=_onbList.length-1){ onbFinish(); return; }
  _onbIdx++; onbRender();
}
function onbFinish(){
  localStorage.setItem('vt_tutorial_done','1');
  if(DEMO_BUILD) activateDemo();
  const o=document.getElementById('onb-overlay'); if(o) o.remove();
  updateDemoBadge(); checkDemoLock();
}

/* =========================================================
   TOUR CONTESTUALE (Modulo S) — overlay leggero con 2-3 punti,
   mostrato alla PRIMA visita di Scout Gara, Formazione consigliata,
   Calendario e Impostazioni/Backup (traccia con localStorage
   tut_seen_<schermata>). Non si ripresenta da solo dopo la prima
   volta: si riapre a mano col bottone "?" su ciascuna delle 4
   schermate. I passi il cui elemento non è presente/visibile (es.
   "Importa" nascosto in demo, "Modulo/rotazione" per il basket che
   non ce l'ha) vengono saltati senza errori.
   ========================================================= */
const CTX_TOURS = {
  scout: [
    {sel:'#scout-select', title:'Scegli la partita', text:'Seleziona qui la gara da analizzare: lo scout si apre per quella partita.'},
    {sel:'#scout-panel', title:'Registra i fondamentali', text:"Tocca il giocatore, poi la categoria (o il fondamentale), poi il tocco per registrare l'evento: il voto si aggiorna da solo."},
    {sel:'#scout-help-btn', title:'Serve aiuto?', text:'Tocca qui in qualsiasi momento per la spiegazione completa di come nasce il voto.'}
  ],
  formazione: [
    {sel:'#formazione-content .fpitch-wrap', title:'Formazione automatica', text:"L'app propone i titolari in base alla media voto: per ogni ruolo gioca chi rende di più."},
    {sel:'#formazione-content .mod-chips', title:'Modulo o rotazione', text:'Per calcio scegli il modulo (4-3-3, 4-4-2…); per pallavolo scegli da che zona (P1…P6) parte il palleggiatore.'},
    {sel:'#formazione-content .fbench', title:'Panchina per rendimento', text:'Chi non è titolare compare qui, ordinato per media voto: la prima scelta per un cambio.'}
  ],
  calendario: [
    {sel:'#cal-form', title:'Aggiungi un evento', text:'Crea partite e allenamenti da qui: tipo, data e avversario o focus tecnico.'},
    {sel:'#cal-grid', title:'Agenda del mese', text:'Tocca un giorno per vedere gli eventi già programmati.'},
    {sel:'#cal-day', title:'Eventi del giorno', text:"Qui gestisci l'evento selezionato, incluso il risultato a set delle partite."}
  ],
  backup: [
    {sel:'#ctx-backup-export', title:'Backup dei dati', text:"Scarica qui un file con tutti i dati: rosa, calendario, statistiche, presenze. Fallo regolarmente — l'app è offline, i dati vivono solo su questo dispositivo."},
    {sel:'#ctx-backup-import', title:'Ripristina o trasferisci', text:'Carica un backup per ripristinare i dati o spostarli su un altro dispositivo.'},
    {sel:'#ctx-backup-guide', title:'Rivedi la guida', text:'Puoi riaprire il tutorial introduttivo in qualsiasi momento da qui.'}
  ]
};
let _ctx=null;
function ctxCSS(){
  if(document.getElementById('ctx-css')) return;
  const st=document.createElement('style'); st.id='ctx-css';
  st.textContent=`
  .ctx-help-btn{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1px solid var(--line,rgba(255,255,255,.18));
    background:var(--surface-2,rgba(255,255,255,.04));color:var(--muted,#8395B4);font-weight:800;cursor:pointer;font-size:.9rem;
    display:inline-flex;align-items:center;justify-content:center;}
  .ctx-help-btn:hover{border-color:var(--brand,#22C55E);color:var(--brand,#22C55E);}
  #ctx-block{position:fixed;inset:0;z-index:9996;background:transparent;}
  #ctx-hole{position:fixed;z-index:9997;border-radius:12px;box-shadow:0 0 0 4000px rgba(4,8,18,.6);pointer-events:none;
    transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease;}
  #ctx-bubble{position:fixed;z-index:9998;width:280px;max-width:calc(100vw - 24px);background:var(--surface,#0E1525);
    border:1px solid var(--brand,#22C55E);border-radius:16px;padding:14px 16px;box-shadow:0 16px 40px -14px rgba(0,0,0,.7);}
  #ctx-bubble h4{font-family:'Outfit',sans-serif;font-size:1rem;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:8px;color:var(--text,#fff);}
  #ctx-bubble h4 i{color:var(--brand,#22C55E);}
  #ctx-bubble p{color:var(--muted,#8395B4);font-size:.86rem;line-height:1.5;margin-bottom:12px;}
  #ctx-bubble .ctx-dots{display:flex;gap:5px;margin-bottom:10px;}
  #ctx-bubble .ctx-dots span{width:6px;height:6px;border-radius:50%;background:var(--line,#22304E);}
  #ctx-bubble .ctx-dots span.on{background:var(--brand,#22C55E);width:16px;border-radius:4px;}
  #ctx-bubble .ctx-acts{display:flex;justify-content:space-between;align-items:center;gap:8px;}
  #ctx-bubble .ctx-skip{background:none;border:none;color:var(--muted-2,#5C6C8C);font-size:.8rem;font-weight:600;cursor:pointer;padding:6px;}
  #ctx-bubble .ctx-next{background:var(--brand,#22C55E);color:#04140a;border:none;border-radius:10px;padding:8px 14px;font-weight:800;cursor:pointer;font-size:.86rem;}
  `;
  document.head.appendChild(st);
}
function ctxAutoShow(key){
  if(!CTX_TOURS[key]) return;
  try{ if(localStorage.getItem('tut_seen_'+key)) return; }catch(e){ return; }
  ctxStart(key);
}
function ctxStart(key){
  const steps=(CTX_TOURS[key]||[]).filter(s=>{ const el=document.querySelector(s.sel); return el && el.offsetParent!==null; });
  if(!steps.length) return;
  ctxCSS();
  _ctx={key,steps,idx:0};
  if(!document.getElementById('ctx-block')){
    document.body.appendChild(Object.assign(document.createElement('div'),{id:'ctx-block'}));
    document.body.appendChild(Object.assign(document.createElement('div'),{id:'ctx-hole'}));
    document.body.appendChild(Object.assign(document.createElement('div'),{id:'ctx-bubble'}));
  }
  ctxRender();
}
function ctxRender(){
  if(!_ctx) return;
  const step=_ctx.steps[_ctx.idx];
  const el=document.querySelector(step.sel);
  const hole=document.getElementById('ctx-hole'), bub=document.getElementById('ctx-bubble');
  if(!hole||!bub) return;
  if(el){
    const r=el.getBoundingClientRect(), pad=6;
    hole.style.display='block';
    hole.style.left=(r.left-pad)+'px'; hole.style.top=(r.top-pad)+'px';
    hole.style.width=(r.width+pad*2)+'px'; hole.style.height=(r.height+pad*2)+'px';
    bub.style.transform='none';
    const bh=220;
    bub.style.top=((r.bottom+14+bh<window.innerHeight)?(r.bottom+14):Math.max(14,r.top-14-bh))+'px';
    let left=r.left; if(left+280>window.innerWidth-12) left=window.innerWidth-292; if(left<12) left=12;
    bub.style.left=left+'px';
  } else {
    hole.style.display='none';
    bub.style.top='40%'; bub.style.left='50%'; bub.style.transform='translate(-50%,-50%)';
  }
  const last=_ctx.idx===_ctx.steps.length-1;
  bub.innerHTML=`<h4><i class="fa-solid fa-circle-info"></i> ${step.title}</h4><p>${step.text}</p>
    <div class="ctx-dots">${_ctx.steps.map((_,i)=>`<span class="${i===_ctx.idx?'on':''}"></span>`).join('')}</div>
    <div class="ctx-acts"><button class="ctx-skip" onclick="ctxFinish()">Salta</button><button class="ctx-next" onclick="ctxNext()">${last?'Fatto':'Avanti'}</button></div>`;
}
function ctxNext(){
  if(!_ctx) return;
  if(_ctx.idx>=_ctx.steps.length-1){ ctxFinish(); return; }
  _ctx.idx++; ctxRender();
}
function ctxFinish(){
  if(_ctx){ try{ localStorage.setItem('tut_seen_'+_ctx.key,'1'); }catch(e){} }
  ['ctx-block','ctx-hole','ctx-bubble'].forEach(id=>{ const e=document.getElementById(id); if(e) e.remove(); });
  _ctx=null;
}
window.addEventListener('resize', ()=>{ if(_ctx) ctxRender(); });

/* =========================================================
   COUNTDOWN + SCADENZA (solo DEMO_BUILD)
   ========================================================= */
function updateDemoBadge(){
  const b=document.getElementById('demo-badge');
  if(!DEMO_BUILD){ if(b) b.remove(); return; }
  const side=document.querySelector('.side-foot');
  if(!side) return;
  let el=b;
  if(!el){ el=document.createElement('p'); el.id='demo-badge'; el.style.cssText='margin-top:6px;font-size:.72rem;font-weight:700;letter-spacing:.3px;color:var(--brand,#22C55E);'; side.appendChild(el); }
  const left=Math.max(0,demoDaysLeft());
  el.textContent = `Prova - ${left} giorni rimasti`;
}
function dexpCSS(){
  if(document.getElementById('dexp-css')) return;
  const st=document.createElement('style'); st.id='dexp-css';
  st.textContent=`
  #dexp-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:1.2rem;
    background:linear-gradient(170deg,#0A1020,#060A18);}
  .dexp-card{width:100%;max-width:480px;background:var(--surface,#0E1525);border:1px solid var(--line,#22304E);border-radius:20px;
    padding:2rem 1.7rem;text-align:center;box-shadow:0 20px 50px -20px rgba(0,0,0,.7);}
  .dexp-ic{width:60px;height:60px;border-radius:16px;background:rgba(240,70,60,.14);color:var(--flame,#F0463C);
    display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 1rem;}
  .dexp-card h2{font-family:'Outfit',sans-serif;font-size:1.5rem;font-weight:800;margin-bottom:.5rem;}
  .dexp-card p{color:var(--muted,#8395B4);font-size:.94rem;line-height:1.55;}
  .dexp-contact{margin-top:1.3rem;padding:.9rem 1rem;border-radius:12px;background:var(--surface-2,#141D31);border:1px solid var(--line,#22304E);font-size:.9rem;color:var(--text,#F3F7FC);}
  .dexp-acts{display:flex;flex-direction:column;gap:10px;margin-top:1.1rem;}
  @media(min-width:600px){.dexp-card{padding:2.4rem 2.2rem;}}
  `;
  document.head.appendChild(st);
}
function checkDemoLock(){
  if(!DEMO_BUILD || !demoExpired()){ const o=document.getElementById('dexp-overlay'); if(o) o.remove(); return; }
  dexpCSS();
  if(document.getElementById('dexp-overlay')) return;
  const stripeBtns = (STRIPE_MONTHLY_URL?`<button class="btn btn-accent" style="width:100%" onclick="window.open('${STRIPE_MONTHLY_URL}','_blank')"><i class="fa-solid fa-credit-card"></i> Abbonamento mensile</button>`:'')
    + (STRIPE_ANNUAL_URL?`<button class="btn btn-ghost" style="width:100%" onclick="window.open('${STRIPE_ANNUAL_URL}','_blank')"><i class="fa-solid fa-credit-card"></i> Abbonamento annuale - risparmi</button>`:'');
  const o=document.createElement('div'); o.id='dexp-overlay';
  o.innerHTML=`<div class="dexp-card">
    <div class="dexp-ic"><i class="fa-solid fa-gear"></i></div>
    <h2>Impostazioni</h2>
    <p>Prova terminata. Scarica i tuoi dati; ti invieremo la versione completa dove importare il backup.</p>
    <button class="btn btn-accent" style="width:100%;margin-top:1.2rem" onclick="exportData()"><i class="fa-solid fa-download"></i> Scarica backup dati</button>
    <div class="dexp-contact">Per acquistare la versione completa contatta: <b>${CONTACT_INFO}</b></div>
    ${stripeBtns?`<div class="dexp-acts">${stripeBtns}</div>`:''}
  </div>`;
  document.body.appendChild(o);
}
function checkOnboardingAndDemo(){
  updateDemoBadge();
  if(DEMO_BUILD && demoExpired()){ checkDemoLock(); return; }
  if(FRESH_INSTALL && !localStorage.getItem('vt_tutorial_done')) openOnboarding(false);
}

/* ---------- HELPERS DATI ---------- */
function playerById(id){ return DB.players.find(p=>p.id===id); }
function activePlayers(){ return DB.players.filter(p=>p.status!=='suspended'); }
function fmtDate(iso){ const d=new Date(iso); return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]}`; }
function fmtDateLong(iso){ const d=new Date(iso); return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

function getPlayerVoti(pId){
    const out=[];
    DB.scoutHistory.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(m=>{
        const r=m.rows.find(x=>x.pId===pId);
        if(r) out.push({date:m.date,voto:rowVoto(r,m.sport),opp:m.opponent});
    });
    return out;
}
function getSeasonStats(pId){
    const sport=curSport();
    const acc={...blankStat(sport),matches:0,voti:[]};
    const fields=scoutFields(sport);
    DB.scoutHistory.forEach(m=>{
        const r=m.rows.find(x=>x.pId===pId);
        if(!r) return;
        acc.matches++; acc.voti.push(rowVoto(r,m.sport));
        fields.forEach(k=>acc[k]+=r[k]||0);
    });
    acc.avgVoto = acc.voti.length? (acc.voti.reduce((a,b)=>a+b,0)/acc.voti.length):null;
    acc.lastVoto = acc.voti.length? acc.voti[acc.voti.length-1]:null;
    acc.cells = SCOUT[sport].season(acc);
    return acc;
}
function playerForm(pId){ // confronto media ultime 2 vs precedenti
    const v=getPlayerVoti(pId).map(x=>x.voto);
    if(v.length<2) return {dir:'flat',txt:'—'};
    const last=v.slice(-2), prev=v.slice(0,-2);
    const la=last.reduce((a,b)=>a+b,0)/last.length;
    const pa=prev.length? prev.reduce((a,b)=>a+b,0)/prev.length : la;
    const d=la-pa;
    if(d>0.25) return {dir:'up',txt:'↑ in crescita'};
    if(d<-0.25) return {dir:'down',txt:'↓ in calo'};
    return {dir:'flat',txt:'→ stabile'};
}
function playerAttendance(pId){
    let pres=0,tot=0;
    DB.events.filter(e=>e.type==='Allenamento').forEach(e=>{
        const a=DB.attendance[e.id];
        if(a && a[pId]){ if(a[pId]!=='excused'){tot++; if(a[pId]==='present')pres++;} }
    });
    return tot? Math.round(pres/tot*100):null;
}
function teamAvgVoto(){
    const all=DB.scoutHistory.flatMap(m=>m.rows.map(r=>rowVoto(r,m.sport)));
    return all.length? (all.reduce((a,b)=>a+b,0)/all.length):null;
}
function teamRecord(){
    let w=0,l=0;
    DB.events.forEach(e=>{ if(e.type==='Partita'&&e.result){ if(e.result.w>e.result.l)w++; else l++; }});
    return {w,l};
}
function nextEvent(){
    const t=today();
    return DB.events.filter(e=>new Date(e.date)>=t).sort((a,b)=>new Date(a.date)-new Date(b.date))[0]||null;
}
function teamAttendancePct(){
    let pres=0,tot=0;
    Object.values(DB.attendance).forEach(map=>Object.values(map).forEach(v=>{
        if(v!=='excused'){tot++; if(v==='present')pres++;}
    }));
    return tot? Math.round(pres/tot*100):null;
}

/* ---------- CHARTS (SVG, zero dipendenze) ---------- */
function svgLine(values, opts={}){
    if(!values.length) return '<div class="empty-chart">Nessun voto registrato</div>';
    const w=opts.w||560, h=opts.h||170, pad=28, min=opts.min??2, max=opts.max??10;
    const iw=w-pad*2, ih=h-pad*2, n=values.length;
    const X=i=> pad + (n===1? iw/2 : iw*i/(n-1));
    const Y=v=> pad + ih*(1-(v-min)/(max-min));
    const pts=values.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area=`${pad},${(pad+ih).toFixed(1)} ${pts} ${(pad+iw).toFixed(1)},${(pad+ih).toFixed(1)}`;
    let grid='';
    [4,6,8].forEach(g=>{const y=Y(g);grid+=`<line x1="${pad}" y1="${y}" x2="${pad+iw}" y2="${y}"/><text class="chart-axis" x="${pad-6}" y="${y+3}" text-anchor="end">${g}</text>`;});
    const dots=values.map((v,i)=>`<circle class="spark-dot" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.6"/>`).join('');
    return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity=".28"/><stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
        <g class="chart-grid">${grid}</g>
        <polygon class="spark-area" points="${area}"/>
        <polyline class="spark-line" points="${pts}"/>${dots}</svg></div>`;
}
function svgBars(items, opts={}){
    if(!items.length) return '<div class="empty-chart">Nessun dato</div>';
    const w=opts.w||560, bh=34, gap=12, pad=70, h=items.length*(bh+gap)+gap;
    const maxV=Math.max(1,...items.map(i=>Math.abs(i.value)));
    let body='';
    items.forEach((it,idx)=>{
        const y=gap+idx*(bh+gap);
        const bw=(w-pad-20)*(Math.abs(it.value)/maxV);
        const col=it.color||'var(--brand)';
        body+=`<text class="chart-axis" x="0" y="${y+bh/2+4}" font-weight="700" fill="var(--text)">${it.label}</text>
        <rect x="${pad}" y="${y}" width="${(w-pad-20)}" height="${bh}" rx="8" fill="var(--surface-3)"/>
        <rect x="${pad}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" rx="8" fill="${col}"/>
        <text class="chart-axis" x="${w-12}" y="${y+bh/2+4}" text-anchor="end" font-weight="800" fill="var(--text)">${it.display??it.value}</text>`;
    });
    return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${body}</svg></div>`;
}
/* radar/spider chart — assi = axes (array label), datasets = [{label,color,values(0-100)}] */
function svgRadar(axes, datasets, opts={}){
    if(!axes.length) return '<div class="empty-chart">Nessun asse disponibile</div>';
    const w=opts.w||420, h=opts.h||420, cx=w/2, cy=h/2, R=Math.min(w,h)/2-48, n=axes.length, rings=4;
    const angle=i=> -Math.PI/2 + i*2*Math.PI/n;
    const pt=(i,frac)=>{ const a=angle(i), r=R*frac; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; };
    let grid='';
    for(let ring=1;ring<=rings;ring++){
        const poly=axes.map((_,i)=>pt(i,ring/rings).join(',')).join(' ');
        grid+=`<polygon points="${poly}" fill="none" stroke="var(--line-soft)" stroke-width="1"/>`;
    }
    let axisLines='', labels='';
    axes.forEach((label,i)=>{
        const [x,y]=pt(i,1);
        axisLines+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`;
        const [lx,ly]=pt(i,1.16);
        labels+=`<text class="chart-axis" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    });
    const shapes=(datasets||[]).map(ds=>{
        const vals=ds.values.map(v=>Math.max(0,Math.min(100,v||0)));
        const poly=vals.map((v,i)=>pt(i,v/100).join(',')).join(' ');
        const dots=vals.map((v,i)=>{ const [x,y]=pt(i,v/100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${ds.color}"/>`; }).join('');
        return `<polygon points="${poly}" fill="${ds.color}" fill-opacity=".18" stroke="${ds.color}" stroke-width="2.2"/>${dots}`;
    }).join('');
    return `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${grid}${axisLines}${shapes}${labels}</svg></div>`;
}

/* ---------- TOAST / MODAL / CONFIRM ---------- */
function toast(msg,type='success'){
    const stack=document.getElementById('toast-stack');
    const el=document.createElement('div');
    el.className=`toast ${type}`;
    const ic={success:'fa-circle-check',danger:'fa-circle-xmark',warning:'fa-triangle-exclamation',info:'fa-circle-info'}[type];
    el.innerHTML=`<i class="fa-solid ${ic}"></i><span>${msg}</span>`;
    stack.appendChild(el);
    setTimeout(()=>{el.style.animation='fadeOut .3s forwards';setTimeout(()=>el.remove(),300);},3200);
}
function iosToggle(checked,onchange,label){
    return `<label class="ios-switch"><input type="checkbox" ${checked?'checked':''} onchange="${onchange}"><span class="ios-switch-track"><span class="ios-switch-thumb"></span></span>${label?`<span class="ios-switch-label">${label}</span>`:''}</label>`;
}
let _confirmCb=null;
function confirmAction(text,cb){
    document.getElementById('confirm-text').textContent=text;
    document.getElementById('confirm-overlay').classList.add('show');
    _confirmCb=cb;
}
function openModal(html,wide){
    const m=document.getElementById('modal');
    m.className='modal'+(wide?' wide':'');
    m.innerHTML=html;
    document.getElementById('modal-overlay').classList.add('show');
}
function closeModal(){
    document.getElementById('modal-overlay').classList.remove('show');
    if(typeof PHYS!=='undefined' && PHYS){ if(PHYS.videoURL) URL.revokeObjectURL(PHYS.videoURL); PHYS=null; }
}

/* =========================================================
   LAYOUT — costruzione delle sezioni dentro <main>
   ========================================================= */
function buildLayout(){
    document.getElementById('main').innerHTML = `
    <!-- DASHBOARD -->
    <section id="dashboard" class="section active">
        <div id="dash-content"></div>
    </section>

    <!-- ROSTER -->
    <section id="roster" class="section">
        <div class="page-head"><div><div class="eyebrow">Squadra</div><h2>Roster &amp; Ruoli</h2>
            <p class="sub">Gestisci la rosa, i ruoli di leadership e lo stato fisico. Tocca un giocatore per la scheda completa con storico e statistiche.</p></div></div>
        <div class="card">
            <h3><i class="fa-solid fa-user-plus"></i> Aggiungi atleta</h3>
            <form onsubmit="addPlayer(event)">
                <div class="form-row">
                    <div class="fg"><label>Nome e cognome</label><input id="p-name" placeholder="Es. Giuseppe Manunta" required></div>
                    <div class="fg" style="min-width:90px;max-width:110px"><label>N° maglia</label><input id="p-number" type="number" min="1" max="99" placeholder="10" required></div>
                    <div class="fg"><label>Ruolo</label><select id="p-role" required>
                        <option value="">Scegli…</option><option>Palleggiatore</option><option>Schiacciatore</option><option>Centrale</option><option>Opposto</option><option>Libero</option></select></div>
                    <div class="fg" style="min-width:80px;max-width:100px"><label>Mano</label><select id="p-hand"><option>Dx</option><option>Sx</option></select></div>
                    <div class="fg" style="min-width:90px;max-width:110px"><label>Altezza cm</label><input id="p-height" type="number" min="120" max="230" placeholder="190"></div>
                    <div class="fg" style="flex:0"><label>&nbsp;</label><button class="btn btn-accent" type="submit"><i class="fa-solid fa-plus"></i> Inserisci</button></div>
                </div>
            </form>
            <p class="hint">Tocca il numero di maglia in tabella per assegnare i gradi: Standard ➔ Capitano 👑 ➔ Vice 🥈.</p>
        </div>
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:1rem">
                <h3 style="margin:0"><i class="fa-solid fa-users"></i> Rosa <span id="roster-count" style="color:var(--muted);font-weight:600;font-size:.85rem"></span></h3>
                <button class="btn btn-ghost btn-sm" onclick="openRadarCompare()"><i class="fa-solid fa-chart-area"></i> Confronta (Radar)</button>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Maglia</th><th style="text-align:left">Giocatore</th><th>Ruolo</th><th>Stato</th><th>Media</th><th>Forma</th><th>Pres.</th><th>Azioni</th></tr></thead>
                <tbody id="roster-body"></tbody></table></div>
        </div>
    </section>

    <!-- CALENDARIO -->
    <section id="calendario" class="section">
        <div class="page-head"><div><div class="eyebrow">Agenda</div><h2>Calendario &amp; Match</h2>
            <p class="sub">Partite e allenamenti in un'unica agenda. Sulle partite puoi registrare il risultato a set.</p></div>
            <button class="ctx-help-btn" onclick="ctxStart('calendario')" title="Guida rapida"><i class="fa-solid fa-question"></i></button></div>
        <div class="card">
            <h3><i class="fa-solid fa-calendar-plus"></i> Nuovo evento</h3>
            <form id="cal-form" onsubmit="addEvent(event)"><div class="form-row">
                <div class="fg"><label>Tipo</label><select id="e-type"><option>Partita</option><option>Allenamento</option></select></div>
                <div class="fg"><label>Data</label><input id="e-date" type="date" required></div>
                <div class="fg"><label>Avversario o focus tecnico</label><input id="e-notes" placeholder="Es. vs San Pio X — oppure Ricezione" required></div>
                <div class="fg" style="flex:0"><label>&nbsp;</label><button class="btn btn-accent" type="submit"><i class="fa-solid fa-check"></i> Salva</button></div>
            </div></form>
            <div style="margin-top:10px;border-top:1px solid var(--line,rgba(255,255,255,.1));padding-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="openRecurring()"><i class="fa-solid fa-calendar-week"></i> Serie di allenamenti ricorrenti</button><button class="btn btn-ghost btn-sm" onclick="openImportMatches()"><i class="fa-solid fa-file-import"></i> Importa partite (CSV/Excel)</button></div>
        </div>
        <div class="card">
            <div class="cal-top">
                <button class="cal-nav" onclick="calShift(-1)" aria-label="Mese precedente"><i class="fa-solid fa-chevron-left"></i></button>
                <h3 id="cal-title" style="margin:0;text-align:center;flex:1"></h3>
                <button class="cal-nav" onclick="calShift(1)" aria-label="Mese successivo"><i class="fa-solid fa-chevron-right"></i></button>
                <button class="btn btn-ghost btn-sm" onclick="calToday()">Oggi</button>
            </div>
            <div class="cal-legend">
                <span><i class="cal-dot cal-dot-match"></i> Partita</span>
                <span><i class="cal-dot cal-dot-train"></i> Allenamento</span>
            </div>
            <div class="cal-grid" id="cal-grid"></div>
        </div>
        <div class="card">
            <h3 id="cal-day-title"><i class="fa-solid fa-calendar-day"></i> Eventi del giorno</h3>
            <div id="cal-day"></div>
        </div>
    </section>

    <!-- SCOUT -->
    <section id="scout" class="section">
        <div class="page-head"><div><div class="eyebrow">Analisi</div><h2>Scout Gara</h2>
            <p class="sub">Inserisci il tabellino fondamentale per fondamentale: voti e statistiche vengono salvati nello storico di ogni atleta.</p></div>
            <button class="ctx-help-btn" onclick="ctxStart('scout')" title="Guida rapida"><i class="fa-solid fa-question"></i></button></div>
        <div class="card">
            <div style="display:flex;gap:1rem;align-items:flex-end;flex-wrap:wrap">
                <div class="fg" style="max-width:420px;flex:1"><label>Partita da analizzare</label>
                    <select id="scout-select" onchange="setupScout()"><option value="">Scegli una partita…</option></select></div>
                <button class="btn btn-ghost" id="scout-help-btn" onclick="openScoutTutorial()"><i class="fa-solid fa-circle-question"></i> Come funziona</button>
            </div>
        </div>
        <div id="scout-rot-summary" style="display:none"></div>
        <div id="subs-panel" style="display:none"></div>
        <div class="card" id="scout-panel" style="display:none">
            <h3 id="scout-title"><i class="fa-solid fa-clipboard-list"></i> Tabellino</h3>
            <!-- MODALITÀ NUMERICA (calcio/basket + fallback): tabella per fondamentale -->
            <div id="scout-numeric">
                <div class="table-wrap"><table class="scout-table">
                    <thead id="scout-head"></thead>
                    <tbody id="scout-body"></tbody>
                </table></div>
                <div style="display:flex;justify-content:flex-end;margin-top:1.2rem">
                    <button class="btn btn-accent" onclick="saveScout()"><i class="fa-solid fa-floppy-disk"></i> Registra statistiche</button>
                </div>
            </div>
            <!-- MODALITÀ TAP A TOCCHI (pallavolo): tap giocatore → tap grado -->
            <div id="scout-tap" style="display:none"></div>
            <!-- ROTAZIONI di questa gara (solo pallavolo) -->
            <div id="scout-rot" style="display:none"></div>
            <div class="legend-grid" id="scout-legend"></div>
        </div>
    </section>

    <!-- FORMAZIONE -->
    <section id="formazione" class="section">
        <div class="page-head"><div><div class="eyebrow">Meritocrazia</div><h2>Formazione consigliata</h2>
            <p class="sub">L'app propone i titolari in base alla media voto: per ogni ruolo gioca chi rende di più. Chi merita, gioca.</p></div>
            <button class="ctx-help-btn" onclick="ctxStart('formazione')" title="Guida rapida"><i class="fa-solid fa-question"></i></button></div>
        <div id="formazione-content"></div>
    </section>

    <!-- PRESENZE -->
    <section id="presenze" class="section">
        <div class="page-head"><div><div class="eyebrow">Gestione gruppo</div><h2>Presenze Allenamenti</h2>
            <p class="sub">Segna chi c'è ad ogni seduta. Tieni d'occhio la costanza del gruppo e dei singoli.</p></div></div>
        <div class="card">
            <div class="fg" style="max-width:420px"><label>Seduta di allenamento</label>
                <select id="att-select" onchange="renderAttendance()"><option value="">Scegli una seduta…</option></select></div>
        </div>
        <div class="card" id="att-panel" style="display:none">
            <h3><i class="fa-solid fa-user-check"></i> Appello</h3>
            <div id="att-list"></div>
            <div style="margin-top:1rem"><span style="font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;font-weight:600">Presenza seduta</span>
                <div class="bar-track"><div class="bar-fill" id="att-bar" style="width:0%"></div></div>
                <span class="num" id="att-pct" style="font-weight:800;font-family:'Outfit'"></span></div>
        </div>
        <div class="card"><h3><i class="fa-solid fa-ranking-star"></i> Costanza stagionale</h3>
            <div id="att-season"></div>
        </div>
    </section>

    <!-- ALLENAMENTI -->
    <section id="allenamenti" class="section">
        <div class="page-head"><div><div class="eyebrow">Programmazione</div><h2>Allenamenti &amp; Voti</h2>
            <p class="sub">Costruisci la seduta con gli esercizi e assegna un voto a ogni giocatore. Le medie confluiscono nelle schede atleta e nell'app del giocatore.</p></div></div>
        <div class="card">
            <div class="form-row">
                <div class="fg" style="max-width:420px"><label>Seduta di allenamento</label>
                    <select id="tr-select" onchange="renderTraining()"><option value="">Scegli una seduta…</option></select></div>
                <div class="fg" style="flex:0"><label>&nbsp;</label><button class="btn btn-ghost" onclick="go('calendario')"><i class="fa-solid fa-calendar-plus"></i> Nuova seduta</button></div>
            </div>
            <p class="hint">Le sedute sono gli eventi di tipo "Allenamento" del calendario.</p>
        </div>
        <div id="tr-panel" style="display:none">
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                    <h3 style="margin:0"><i class="fa-solid fa-list-check"></i> Esercizi della seduta</h3>
                    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-ghost" onclick="openFieldEditor()"><i class="fa-solid fa-pen-ruler"></i> Disegna esercizio</button><button type="button" class="btn btn-ghost" onclick="openExLibrary()"><i class="fa-solid fa-book-open"></i> Libreria esercizi</button></div>
                </div>
                <form onsubmit="addExercise(event)"><div class="form-row" style="margin-top:.8rem">
                    <div class="fg"><label>Nome esercizio</label><input id="ex-name" placeholder="Es. Ricezione in bagher zona 5" required></div>
                    <div class="fg" style="max-width:190px"><label>Categoria</label><select id="ex-cat"></select></div>
                    <div class="fg" style="flex:0"><label>&nbsp;</label><button class="btn btn-accent" type="submit"><i class="fa-solid fa-plus"></i> Aggiungi</button></div>
                </div></form>
                <div id="ex-chips" style="margin-top:1rem"></div>
            </div>
            <div class="card" id="grade-card">
                <h3><i class="fa-solid fa-star-half-stroke"></i> Voti per giocatore <span style="color:var(--muted);font-weight:600;font-size:.82rem">(1–10, lascia vuoto se non valutato)</span></h3>
                <div class="table-wrap"><table class="scout-table" id="grade-table"></table></div>
                <p class="hint">Tocca l'icona nota accanto al giocatore per lasciargli un commento sulla seduta.</p>
                <div class="legend-grid" style="margin-top:.8rem">
                    <div class="legend-item"><strong>SCALA VOTO</strong><b>≤4</b> insufficiente · <b>6</b> sufficiente · <b>7</b> buono · <b>8</b> ottimo · <b>9-10</b> eccellente</div>
                    <div class="legend-item"><strong>NOTA</strong>Il voto dell'allenamento è a giudizio del mister e non entra nella media delle partite.</div>
                </div>
            </div>
        </div>
    </section>

    <!-- TEST FISICI -->
    <section id="test-fisici" class="section">
        <div class="page-head"><div><div class="eyebrow">Preparazione</div><h2>Test Fisici</h2>
            <p class="sub">Misura sprint, tempo di reazione e salto verticale da un video con telecamera ferma su cavalletto — calibrazione manuale, nessuna intelligenza artificiale.</p></div></div>
        <div class="phys-grid">
            <div class="card">
                <h3><i class="fa-solid fa-person-running"></i> Sprint &amp; Reazione</h3>
                <p class="hint" style="margin-bottom:.8rem">Tempo di reazione al via e velocità media su una distanza nota, da un video con 3 marcatori (via, partenza, arrivo).</p>
                <div class="fg"><label>Giocatore</label><select id="phys-sprint-player"></select></div>
                <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="openPhysTest('sprint')"><i class="fa-solid fa-stopwatch"></i> Nuovo test Sprint</button>
            </div>
            <div class="card">
                <h3><i class="fa-solid fa-arrow-up-long"></i> Salto Verticale</h3>
                <p class="hint" style="margin-bottom:.8rem">Altezza del salto dalla differenza fra stacco e massima elevazione, con calibrazione pixel→metri.</p>
                <div class="fg"><label>Giocatore</label><select id="phys-jump-player"></select></div>
                <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="openPhysTest('jump')"><i class="fa-solid fa-ruler-vertical"></i> Nuovo test Salto</button>
                <p class="hint" style="margin-top:8px" title="Versione base a marcatori manuali. In arrivo (V2) tracking automatico su dispositivi più potenti."><i class="fa-solid fa-circle-info"></i> Versione base a marcatori manuali. In arrivo (V2) tracking automatico.</p>
            </div>
        </div>
        <div class="card">
            <h3><i class="fa-solid fa-clock-rotate-left"></i> Storico test</h3>
            <div class="fg" style="max-width:320px"><label>Giocatore</label><select id="phys-hist-player" onchange="renderPhysHistory()"></select></div>
            <div id="phys-hist" style="margin-top:1rem"></div>
        </div>
        <p class="hint">Precisione dipende da stabilità della telecamera, qualità del video e precisione dei marcatori inseriti manualmente. Per misurazioni ufficiali/agonistiche usa strumentazione certificata.</p>
    </section>

    <section id="tattica" class="section">
        <div class="page-head"><div><div class="eyebrow">Spogliatoio</div><h2>Lavagnetta Tattica</h2>
            <p class="sub">Disponi la rotazione trascinando i gettoni e disegna schemi, traiettorie e vettori direttamente sul campo.</p></div></div>
        <div class="tactical-wrap">
            <div id="court-area"><canvas id="courtCanvas"></canvas></div>
            <div>
                <div class="card" style="margin-bottom:1rem">
                    <h3 style="margin-bottom:.6rem"><i class="fa-solid fa-pen"></i> Strumenti</h3>
                    <label style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600">Colore</label>
                    <div class="color-picker">
                        <div class="color-btn active" style="background:#22C55E" onclick="setPen('#22C55E',this)"></div>
                        <div class="color-btn" style="background:#F0463C" onclick="setPen('#F0463C',this)"></div>
                        <div class="color-btn" style="background:#5b9dff" onclick="setPen('#5b9dff',this)"></div>
                        <div class="color-btn" style="background:#F5B301" onclick="setPen('#F5B301',this)"></div>
                        <div class="color-btn" style="background:#ffffff" onclick="setPen('#ffffff',this)"></div>
                    </div>
                    <label style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600;display:block;margin-top:14px">Spessore</label>
                    <input id="brush" type="range" min="1" max="10" value="3" style="width:100%;margin-top:6px;accent-color:var(--brand)">
                </div>
                <button class="btn btn-danger" style="width:100%;margin-bottom:10px" onclick="clearDraw()"><i class="fa-solid fa-eraser"></i> Cancella disegno</button>
                <button class="btn btn-ghost" style="width:100%" onclick="resetTokens()"><i class="fa-solid fa-arrows-spin"></i> Reset posizioni</button>
                <p class="hint" style="margin-top:14px;line-height:1.5">Trascina i gettoni per spostarli. Capitano in oro 👑, vice in argento 🥈. Si parte dalla formazione consigliata; usa la panchina per spiegare un cambio senza toccarla.</p>
                <div id="bench-area" style="margin-top:14px;display:none"></div>
            </div>
        </div>
    </section>

    <!-- BACKUP -->
    <section id="backup" class="section">
        <div class="page-head"><div><div class="eyebrow">Configurazione</div><h2><i class="fa-solid fa-gear" style="font-size:1.4rem;color:var(--brand);margin-right:8px"></i>Impostazioni</h2>
            <p class="sub">Squadra, aspetto, aggiornamenti e dati: qui trovi tutti i comandi dell'app. I dati vivono in questo browser — esporta un backup per non perderli e per spostarli su un altro dispositivo.</p></div>
            <button class="ctx-help-btn" onclick="ctxStart('backup')" title="Guida rapida"><i class="fa-solid fa-question"></i></button></div>
        <div class="card" id="ctx-backup-export"><h3><i class="fa-solid fa-file-export"></i> Esporta</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Scarica tutti i dati (rosa, calendario, statistiche, presenze, rotazioni) in un unico file JSON. Salva i dati, non le foto: quelle restano sul dispositivo.</p>
            <button class="btn btn-accent" onclick="exportData()"><i class="fa-solid fa-download"></i> Scarica backup</button></div>
        ${DEMO_BUILD?'':`<div class="card" id="ctx-backup-import"><h3><i class="fa-solid fa-file-import"></i> Importa</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Carica un file di backup. Attenzione: sovrascrive i dati attuali.</p>
            <input type="file" id="import-file" accept="application/json" style="display:none" onchange="importData(event)">
            <button class="btn btn-ghost" onclick="document.getElementById('import-file').click()"><i class="fa-solid fa-upload"></i> Carica backup</button></div>`}
        <div class="card"><h3><i class="fa-solid fa-brain"></i> Statistiche mentali</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Importa il codice che un giocatore ti invia dalla sua app (Mental Gym → "Invia al mister") per aggiornare i suoi valori Riflessi/Percezione sulla card.</p>
            <button class="btn btn-ghost" onclick="openImportMental()"><i class="fa-solid fa-file-import"></i> Importa statistiche mentali</button></div>
        <div class="card"><h3><i class="fa-solid fa-heart-pulse"></i> Check-in benessere</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Importa il codice che un giocatore ti invia dalla sua app (Check-in benessere → "Invia al mister") per vedere sonno, affaticamento, umore e zone segnalate nella sua scheda atleta.</p>
            <button class="btn btn-ghost" onclick="openImportWellness()"><i class="fa-solid fa-file-import"></i> Importa check-in benessere</button></div>
        <div class="card" id="ctx-backup-guide"><h3><i class="fa-solid fa-circle-play"></i> Guida</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Rivedi la guida introduttiva su squadra, giocatori, allenamenti, scout e card.</p>
            <button class="btn btn-ghost" onclick="openOnboarding(true)"><i class="fa-solid fa-graduation-cap"></i> Rivedi tutorial</button></div>
        <div class="card"><h3 style="color:var(--flame)"><i class="fa-solid fa-trash-can" style="color:var(--flame)"></i> Azzera tutto</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Cancella ogni dato e riparte da zero. Operazione irreversibile.</p>
            <button class="btn btn-danger" onclick="resetAll()"><i class="fa-solid fa-bomb"></i> Reset completo</button></div>
        <div class="card"><h3><i class="fa-solid fa-arrows-rotate"></i> Aggiornamenti</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Quando esce una versione nuova compare un avviso: puoi aggiornare subito o più tardi. Qui puoi controllare o applicare un aggiornamento in attesa in qualsiasi momento. I tuoi dati (rosa, statistiche) non vengono toccati.</p>
            <div class="pwa-state" id="pwa-settings-state"></div>
            <button class="btn btn-ghost" onclick="pwaCheckNow()"><i class="fa-solid fa-magnifying-glass"></i> Cerca aggiornamenti</button></div>
        <div class="card"><h3><i class="fa-solid fa-sliders"></i> Motore voto <span class="pill" style="margin-left:6px">admin</span></h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Regola quanto pesa ogni fondamentale per ruolo (ricezione, attacco, muro, ace…), con anteprima live. Le partite già registrate si ricalcolano da sole. Area riservata: richiede password.</p>
            <button class="btn btn-ghost" onclick="openWeightsAdmin()"><i class="fa-solid fa-lock"></i> Apri motore voto</button></div>
        <div class="card"><h3><i class="fa-solid fa-palette"></i> Aspetto</h3>
            <div class="fg" style="margin-bottom:12px"><label>Nome squadra</label>
                <input value="${(DB.teamName||'').replace(/"/g,'&quot;')}" onchange="setTeamName(this.value)" style="width:100%;padding:11px;border-radius:10px;background:var(--surface);color:inherit;border:1px solid var(--line)"></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
                <label style="display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted)">Accento<input type="color" value="${((DB.settings&&DB.settings.theme&&DB.settings.theme.brand)||'#22C55E')}" oninput="setColor('brand',this.value)" style="width:52px;height:36px;border:none;background:none"></label>
                <label style="display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted)">Sfondo<input type="color" value="${((DB.settings&&DB.settings.theme&&DB.settings.theme.bg)||'#060A18')}" oninput="setColor('bg',this.value)" style="width:52px;height:36px;border:none;background:none"></label>
                <label style="display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted)">Testo<input type="color" value="${((DB.settings&&DB.settings.theme&&DB.settings.theme.text)||'#F3F7FC')}" oninput="setColor('text',this.value)" style="width:52px;height:36px;border:none;background:none"></label>
                <label style="display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted)">Testo secondario<input type="color" value="${((DB.settings&&DB.settings.theme&&DB.settings.theme.muted)||'#8395B4')}" oninput="setColor('muted',this.value)" style="width:52px;height:36px;border:none;background:none"></label>
            </div>
            <p class="hint" style="margin-top:8px">Il "Testo secondario" è usato per etichette, sottotitoli e note: se con lo sfondo scelto risulta poco leggibile, personalizzalo qui.</p>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="resetTheme()"><i class="fa-solid fa-rotate-left"></i> Ripristina colori</button></div>
        <div class="card"><h3><i class="fa-solid fa-users-viewfinder"></i> Formazione consigliata</h3>
            <p style="color:var(--muted);margin-bottom:.8rem;font-size:.9rem">Quando condividi il pacchetto con un giocatore, puoi decidere se fargli vedere anche l'overall dei compagni nella formazione consigliata. Nome, numero e ruolo restano sempre visibili.</p>
            ${iosToggle(showLineupOverall(),'setShowLineupOverall(this.checked)','Mostra overall dei compagni nella formazione consigliata')}</div>
        ${MULTITEAM_ENABLED?`<div class="card"><h3><i class="fa-solid fa-people-group"></i> Le mie squadre</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Gestisci più squadre sullo stesso dispositivo (es. calcio, pallavolo, basket), ognuna coi suoi dati e un PIN. Utile per una società polisportiva.</p>
            <button class="btn btn-ghost" onclick="openTeamsMenu()"><i class="fa-solid fa-people-group"></i> Gestisci squadre</button></div>`:''}
        <div class="card"><h3><i class="fa-solid fa-shield-halved"></i> Logo squadra</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Carica il logo della società (PNG, meglio senza sfondo). Comparirà sulle card sopra il numero di maglia; puoi posizionarlo dall'Officina card.</p>
            <button class="btn btn-ghost" onclick="pickTeamLogo()"><i class="fa-solid fa-upload"></i> Carica / cambia logo</button></div>
        ${CARD_STUDIO_ENABLED?`<div class="card"><h3><i class="fa-solid fa-id-badge"></i> Officina card</h3>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Posiziona foto, nome, numero, ruolo e overall su ogni tier (GOAT, Mythic, Diamond, Gold, Silver) con anteprima live. Salvi per il tuo dispositivo, o esporti il JSON per renderlo ufficiale nel deploy.</p>
            <button class="btn btn-ghost" onclick="openCardStudio()"><i class="fa-solid fa-sliders"></i> Apri officina card</button></div>`:''}
    </section>`;
}

/* =========================================================
   TEST FISICI V1 (Prompt8, Moduli A+B) — calibrazione manuale
   pixel→metri + marcatori su frame, nessuna pose detection/AI.
   Il video non viene MAI salvato (solo un object URL per la
   sessione corrente): si registra solo il risultato calcolato.
   NOTA implementativa: lo stepping frame-by-frame usa currentTime
   ± 1/fps (fps inseribile dall'utente, default 30) invece di
   requestVideoFrameCallback — più uniforme fra i browser; i tempi
   salvati vengono comunque letti da video.currentTime al momento
   del tap, quindi la precisione del risultato non dipende dagli fps.
   ========================================================= */
let PHYS=null; // stato del wizard di test in corso
function physCSS(){
    if(document.getElementById('phys-css')) return;
    const st=document.createElement('style'); st.id='phys-css';
    st.textContent=`
    .phys-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.2rem;}
    @media(max-width:720px){.phys-grid{grid-template-columns:1fr;}}
    .phys-video-wrap{position:relative;width:100%;background:#000;border-radius:12px;overflow:hidden;}
    .phys-video-wrap video{width:100%;display:block;max-height:60vh;}
    .phys-video-wrap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;}
    .phys-controls{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;}
    .phys-note{background:rgba(240,70,60,.1);border:1px solid rgba(240,70,60,.3);border-radius:10px;padding:.7rem .9rem;font-size:.82rem;color:var(--text);display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;}
    .phys-note i{color:var(--flame);margin-top:2px;}
    `;
    document.head.appendChild(st);
}
function physDisclaimerHTML(){
    return `<p class="hint" style="margin-top:14px;font-style:italic">Precisione dipende da stabilità della telecamera, qualità del video e precisione dei marcatori inseriti manualmente. Per misurazioni ufficiali/agonistiche usa strumentazione certificata.</p>`;
}
function physCameraNoteHTML(){
    return `<div class="phys-note"><i class="fa-solid fa-triangle-exclamation"></i> La telecamera deve restare ferma per tutta la ripresa dopo la calibrazione. Se la sposti, ricalibra.</div>`;
}
/* ---- rendering sezione + storico ---- */
function renderPhysicalTests(){
    physCSS();
    const opts = DB.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    ['phys-sprint-player','phys-jump-player','phys-hist-player'].forEach(id=>{
        const el=document.getElementById(id); if(!el) return;
        const prev=el.value;
        el.innerHTML = DB.players.length ? opts : '<option value="">Nessun giocatore in rosa</option>';
        if(prev && DB.players.some(p=>String(p.id)===prev)) el.value=prev;
    });
    renderPhysHistory();
}
function physPlayerTests(pid){
    return { sprint:(DB.physicalTests.sprint||[]).filter(t=>t.playerId===pid), jump:(DB.physicalTests.jump||[]).filter(t=>t.playerId===pid) };
}
function renderPhysHistory(){
    const sel=document.getElementById('phys-hist-player'), box=document.getElementById('phys-hist');
    if(!sel||!box) return;
    const pid=parseInt(sel.value);
    if(!pid){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i>Aggiungi un giocatore in rosa per registrare test.</div>'; return; }
    const {sprint,jump}=physPlayerTests(pid);
    const rowsS=sprint.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>
        `<tr><td>${fmtDate(t.date)}</td><td class="num">${t.tempoReazione.toFixed(3)}s</td><td class="num">${t.tempoSprint.toFixed(3)}s</td><td class="num">${t.distanza}m</td><td class="num">${t.velocitaMedia.toFixed(2)} m/s</td><td class="num">${(t.velocitaMedia*3.6).toFixed(1)} km/h</td></tr>`).join('');
    const rowsJ=jump.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>
        `<tr><td>${fmtDate(t.date)}</td><td class="num">${t.altezzaSalto} cm</td><td>${t.puntoRiferimentoUsato}</td></tr>`).join('');
    box.innerHTML=`
        <h4 style="font-size:.8rem;margin-bottom:6px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Sprint &amp; Reazione</h4>
        ${sprint.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Reazione</th><th>Sprint</th><th>Distanza</th><th>Vel. media</th><th>Km/h</th></tr></thead><tbody>${rowsS}</tbody></table></div>`:'<p class="hint">Nessun test sprint registrato.</p>'}
        <h4 style="font-size:.8rem;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Salto Verticale</h4>
        ${jump.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Altezza</th><th>Riferimento</th></tr></thead><tbody>${rowsJ}</tbody></table></div>`:'<p class="hint">Nessun test salto registrato.</p>'}`;
}
/* ---- video + canvas overlay condivisi fra tutti gli step ---- */
function physVideoBlock(){
    return `<div class="phys-video-wrap"><video id="phys-video" playsinline preload="auto"></video><canvas id="phys-canvas"></canvas></div>
    <div class="phys-controls">
        <button type="button" class="btn btn-ghost btn-icon" onclick="physStep(-1)" title="Indietro 1 frame"><i class="fa-solid fa-backward-step"></i></button>
        <button type="button" class="btn btn-ghost btn-icon" id="phys-playbtn" onclick="physTogglePlay()" title="Play/Pausa"><i class="fa-solid fa-play"></i></button>
        <button type="button" class="btn btn-ghost btn-icon" onclick="physStep(1)" title="Avanti 1 frame"><i class="fa-solid fa-forward-step"></i></button>
        <input id="phys-seek" type="range" min="0" max="1000" value="0" step="1" oninput="physSeekFromRange(this.value)" style="flex:1;min-width:120px">
        <span id="phys-time" class="num" style="min-width:66px;text-align:right;font-size:.8rem;color:var(--muted)">0.000s</span>
    </div>
    <div class="fg" style="max-width:170px;margin-top:8px"><label>FPS video (per lo step)</label><input id="phys-fps" type="number" min="1" max="240" value="${PHYS.fps}" onchange="PHYS.fps=parseFloat(this.value)||30"></div>`;
}
function physRedraw(){
    const cv=document.getElementById('phys-canvas'); if(!cv) return;
    const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height);
    if(PHYS && PHYS.overlayDraw) PHYS.overlayDraw(ctx,cv);
}
function physDot(ctx,cv,x,y,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,Math.max(4,cv.width*0.008),0,Math.PI*2); ctx.fill(); }
function physUpdateTimeUI(){
    const v=document.getElementById('phys-video'); if(!v||!PHYS) return;
    const t=document.getElementById('phys-time'); if(t) t.textContent=v.currentTime.toFixed(3)+'s';
    const seek=document.getElementById('phys-seek'); if(seek && document.activeElement!==seek) seek.value=Math.round(v.currentTime*1000);
    PHYS.lastTime=v.currentTime;
}
function physSeekFromRange(ms){ const v=document.getElementById('phys-video'); if(!v) return; v.pause(); v.currentTime=ms/1000; }
function physStep(dir){ const v=document.getElementById('phys-video'); if(!v||!PHYS) return; v.pause(); const dt=1/(PHYS.fps||30); v.currentTime=Math.max(0,Math.min(v.duration||0, v.currentTime+dir*dt)); }
function physTogglePlay(){ const v=document.getElementById('phys-video'); if(!v) return; if(v.paused) v.play(); else v.pause(); }
function physInitVideo(onReady, opts){
    opts=opts||{};
    const v=document.getElementById('phys-video'), cv=document.getElementById('phys-canvas'), seek=document.getElementById('phys-seek');
    v.src=PHYS.videoURL;
    v.addEventListener('loadedmetadata',()=>{
        cv.width=v.videoWidth; cv.height=v.videoHeight;
        if(seek) seek.max=Math.round((v.duration||0)*1000);
        if(PHYS.lastTime) v.currentTime=Math.min(PHYS.lastTime, v.duration||0);
        physRedraw(); physUpdateTimeUI();
        if(onReady) onReady();
    }, {once:true});
    v.addEventListener('seeked',physRedraw);
    v.addEventListener('timeupdate',physUpdateTimeUI);
    v.addEventListener('play',()=>{ const b=document.getElementById('phys-playbtn'); if(b) b.innerHTML='<i class="fa-solid fa-pause"></i>'; });
    v.addEventListener('pause',()=>{ const b=document.getElementById('phys-playbtn'); if(b) b.innerHTML='<i class="fa-solid fa-play"></i>'; });
    cv.onclick = opts.onCanvasClick ? (e)=>{
        const r=cv.getBoundingClientRect();
        const x=(e.clientX-r.left)*(cv.width/r.width), y=(e.clientY-r.top)*(cv.height/r.height);
        opts.onCanvasClick(x,y);
    } : null;
}
/* ---- avvio test ---- */
function openPhysTest(type){
    const sel=document.getElementById('phys-'+type+'-player');
    const pid=parseInt(sel&&sel.value);
    if(!pid){ toast('Scegli un giocatore prima di avviare il test','info'); return; }
    PHYS={type, playerId:pid, fps:30, calib:{pts:[],pxPerMeter:null}, markers:{}, videoURL:null, overlayDraw:null, lastTime:0};
    physStepUpload();
}
function physStepUpload(){
    const label = PHYS.type==='sprint' ? 'Sprint &amp; Reazione' : 'Salto Verticale';
    const p=playerById(PHYS.playerId);
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-video" style="color:var(--brand)"></i> Test Fisici · ${label}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">Giocatore: <b>${p?p.name:'—'}</b></p>
        ${physCameraNoteHTML()}
        <div class="fg"><label>Carica il video del test</label><input type="file" accept="video/*" onchange="physPickVideo(this)"></div>
        <p class="hint" style="margin-top:8px">Da smartphone puoi anche registrarlo al volo scegliendo la fotocamera dal selettore file.</p>
        ${physDisclaimerHTML()}
      </div>`, true);
}
function physPickVideo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    if(PHYS.videoURL) URL.revokeObjectURL(PHYS.videoURL);
    PHYS.videoURL=URL.createObjectURL(f);
    PHYS.calib={pts:[],pxPerMeter:null};
    physStepCalibrate();
}
/* ---- calibrazione (comune ai due moduli) ---- */
function physStepCalibrate(){
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-ruler-combined" style="color:var(--brand)"></i> Calibrazione</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        ${physCameraNoteHTML()}
        <p class="hint" style="margin-bottom:10px">Scorri al frame in cui vedi un riferimento noto e fermo (rete, muro con nastro, linea di campo), poi tocca i suoi due estremi sul video.</p>
        ${physVideoBlock()}
        <div id="phys-calib-form" style="margin-top:12px;display:none">
            <div class="fg"><label>Distanza reale fra i due punti (metri)</label><input id="phys-calib-dist" type="number" min="0.01" step="0.01" placeholder="Es. 1.00"></div>
            <button type="button" class="btn btn-accent" style="width:100%;margin-top:8px" onclick="physCalibCompute()"><i class="fa-solid fa-check"></i> Calcola calibrazione</button>
        </div>
        <div id="phys-calib-result" style="margin-top:12px"></div>
      </div>`, true);
    PHYS.calib.pts=[];
    PHYS.overlayDraw=(ctx,cv)=>{
        const pts=PHYS.calib.pts;
        pts.forEach(pt=>physDot(ctx,cv,pt.x,pt.y,'#22C55E'));
        if(pts.length===2){ ctx.strokeStyle='#22C55E'; ctx.lineWidth=Math.max(2,cv.width*0.004); ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.stroke(); }
    };
    physInitVideo(null, {onCanvasClick:physCalibClick});
}
function physCalibClick(x,y){
    if(PHYS.calib.pts.length>=2) PHYS.calib.pts=[];
    PHYS.calib.pts.push({x,y});
    physRedraw();
    const form=document.getElementById('phys-calib-form');
    if(form) form.style.display = PHYS.calib.pts.length===2 ? 'block' : 'none';
}
function physCalibCompute(){
    const pts=PHYS.calib.pts;
    if(pts.length<2){ toast('Tocca i due punti di riferimento sul video','info'); return; }
    const dist=parseFloat(document.getElementById('phys-calib-dist').value);
    if(!dist||dist<=0){ toast('Inserisci la distanza reale in metri','info'); return; }
    const distPx=Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
    const pxPerMeter=distPx/dist;
    document.getElementById('phys-calib-result').innerHTML=`
        <div class="phys-note" style="border-color:var(--brand);background:rgba(34,197,94,.1)">
            <i class="fa-solid fa-check" style="color:var(--brand)"></i>
            <div><b>${pxPerMeter.toFixed(1)} px/metro</b> — torna giusto?
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button type="button" class="btn btn-accent btn-sm" onclick="physCalibAccept(${pxPerMeter})"><i class="fa-solid fa-check"></i> Sì, continua</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="physCalibRetry()"><i class="fa-solid fa-rotate-left"></i> Ricalibra</button>
                </div>
            </div>
        </div>`;
}
function physCalibRetry(){
    PHYS.calib.pts=[];
    const form=document.getElementById('phys-calib-form'); if(form) form.style.display='none';
    const res=document.getElementById('phys-calib-result'); if(res) res.innerHTML='';
    physRedraw();
}
function physCalibAccept(pxPerMeter){
    PHYS.calib.pxPerMeter=pxPerMeter;
    if(PHYS.type==='sprint') physStepMarkersSprint(0); else physStepJumpRef();
}
/* ---- Modulo A: Sprint + Reazione (3 marcatori) ---- */
const PHYS_SPRINT_STEPS=[
    {key:'viola', label:'Via', color:'#8B5CF6', desc:'Scorri il video fino al frame in cui parte il segnale di via (fischio/voce), poi premi "Segna qui".'},
    {key:'verde', label:'Start movimento', color:'#22C55E', desc:'Scorri fino al frame in cui il giocatore inizia davvero a muoversi, poi premi "Segna qui".'},
    {key:'rosso', label:'Arrivo', color:'#EF4444', desc:'Scorri fino al frame in cui il giocatore raggiunge la linea di arrivo, tocca il punto sul video e poi premi "Segna qui".'}
];
function physStepMarkersSprint(idx){
    const step=PHYS_SPRINT_STEPS[idx];
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-flag-checkered" style="color:${step.color}"></i> Marcatore ${idx+1}/3 — ${step.label}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">${step.desc}</p>
        ${physVideoBlock()}
        <button type="button" class="btn btn-accent" style="width:100%;margin-top:12px" id="phys-mark-btn" onclick="physMarkSprint(${idx})" ${step.key==='rosso'?'disabled':''}><i class="fa-solid fa-map-pin"></i> Segna qui</button>
        ${physDisclaimerHTML()}
      </div>`, true);
    PHYS._pendingPoint=null;
    const needsTap = step.key==='rosso';
    PHYS.overlayDraw = needsTap ? (ctx,cv)=>{ if(PHYS._pendingPoint) physDot(ctx,cv,PHYS._pendingPoint.x,PHYS._pendingPoint.y,step.color); } : null;
    physInitVideo(null, needsTap ? {onCanvasClick:(x,y)=>{ PHYS._pendingPoint={x,y}; physRedraw(); const b=document.getElementById('phys-mark-btn'); if(b) b.disabled=false; }} : {});
}
function physMarkSprint(idx){
    const v=document.getElementById('phys-video'), step=PHYS_SPRINT_STEPS[idx];
    PHYS.markers[step.key]=v.currentTime;
    if(step.key==='rosso') PHYS.markers.arrivoPx=PHYS._pendingPoint;
    if(idx<2) physStepMarkersSprint(idx+1); else physStepSprintDistance();
}
function physStepSprintDistance(){
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-ruler-horizontal" style="color:var(--brand)"></i> Distanza sprint</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">Distanza nota dello sprint (es. 20 metri) — indipendente dalla calibrazione video: la distanza reale la conosce già l'allenatore.</p>
        <div class="fg"><label>Distanza (metri)</label><input id="phys-sprint-dist" type="number" min="0.1" step="0.1" placeholder="Es. 20"></div>
        <button type="button" class="btn btn-accent" style="width:100%;margin-top:10px" onclick="physSaveSprint()"><i class="fa-solid fa-floppy-disk"></i> Calcola e salva</button>
      </div>`, true);
}
function physSaveSprint(){
    const distanza=parseFloat(document.getElementById('phys-sprint-dist').value);
    if(!distanza||distanza<=0){ toast('Inserisci la distanza in metri','info'); return; }
    const m=PHYS.markers;
    const tempoReazione=+(m.verde-m.viola).toFixed(3);
    const tempoSprint=+(m.rosso-m.verde).toFixed(3);
    if(tempoSprint<=0){ toast('Il marcatore Arrivo deve venire dopo Start movimento','danger'); return; }
    const velocitaMedia=+(distanza/tempoSprint).toFixed(2);
    const accelerazioneMedia=+(velocitaMedia/tempoSprint).toFixed(2);
    DB.physicalTests.sprint.push({id:uid(), playerId:PHYS.playerId, date:today().toISOString().slice(0,10),
        tempoReazione, tempoSprint, distanza, velocitaMedia, accelerazioneMedia});
    save();
    if(PHYS.videoURL) URL.revokeObjectURL(PHYS.videoURL);
    PHYS=null; closeModal(); toast('Test sprint salvato'); renderPhysHistory();
}
/* ---- Modulo B: Salto Verticale (calibrazione + 2 marcatori) ---- */
function physStepJumpRef(){
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-crosshairs" style="color:var(--brand)"></i> Punto di riferimento</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">Scegli il punto del corpo che userai per marcare stacco e massima elevazione: userai sempre lo stesso punto su entrambi i frame.</p>
        <div class="fg"><label>Punto di riferimento</label><select id="phys-jump-refpt"><option>Bacino</option><option>Mano</option><option>Testa</option><option>Altro</option></select></div>
        <button type="button" class="btn btn-accent" style="width:100%;margin-top:10px" onclick="physJumpRefConfirm()"><i class="fa-solid fa-arrow-right"></i> Continua</button>
      </div>`, true);
}
function physJumpRefConfirm(){ PHYS.refPoint=document.getElementById('phys-jump-refpt').value; physStepMarkersJump(0); }
const PHYS_JUMP_STEPS=[
    {key:'stacco', label:'Stacco da terra', desc:'Scorri fino al frame di stacco da terra e tocca il punto di riferimento sul corpo del giocatore.'},
    {key:'massimo', label:'Massima elevazione', desc:'Scorri fino al frame di massima elevazione e tocca lo stesso punto di riferimento.'}
];
function physStepMarkersJump(idx){
    const step=PHYS_JUMP_STEPS[idx];
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-arrow-up" style="color:var(--brand)"></i> Marcatore ${idx+1}/2 — ${step.label}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">${step.desc} Punto di riferimento: <b>${PHYS.refPoint}</b>.</p>
        ${physVideoBlock()}
        <button type="button" class="btn btn-accent" style="width:100%;margin-top:12px" id="phys-mark-btn" onclick="physMarkJump(${idx})" disabled><i class="fa-solid fa-map-pin"></i> Conferma marcatore</button>
        ${physDisclaimerHTML()}
      </div>`, true);
    PHYS._pendingPoint=null;
    PHYS.overlayDraw=(ctx,cv)=>{ if(PHYS._pendingPoint) physDot(ctx,cv,PHYS._pendingPoint.x,PHYS._pendingPoint.y,'#22C55E'); };
    physInitVideo(null, {onCanvasClick:(x,y)=>{ PHYS._pendingPoint={x,y}; physRedraw(); const b=document.getElementById('phys-mark-btn'); if(b) b.disabled=false; }});
}
function physMarkJump(idx){
    const step=PHYS_JUMP_STEPS[idx];
    PHYS.markers[step.key]=PHYS._pendingPoint;
    if(idx===0) physStepMarkersJump(1); else physSaveJump();
}
function physSaveJump(){
    const {stacco,massimo}=PHYS.markers;
    const pxDelta=stacco.y-massimo.y; // massima elevazione = y minore (più in alto sullo schermo)
    if(pxDelta<=0){ toast('Il punto di massima elevazione deve essere più in alto dello stacco','danger'); return; }
    const altezzaSalto=+((pxDelta/PHYS.calib.pxPerMeter)*100).toFixed(1); // cm
    DB.physicalTests.jump.push({id:uid(), playerId:PHYS.playerId, date:today().toISOString().slice(0,10),
        altezzaSalto, puntoRiferimentoUsato:PHYS.refPoint});
    save();
    if(PHYS.videoURL) URL.revokeObjectURL(PHYS.videoURL);
    PHYS=null; closeModal(); toast('Test salto salvato'); renderPhysHistory();
}

/* =========================================================
   NAVIGAZIONE
   ========================================================= */
const RENDERERS = {
    dashboard:renderDashboard, roster:renderRoster, calendario:renderCalendar,
    scout:populateScout, presenze:populateAtt, allenamenti:populateTraining, tattica:initBoard, backup:()=>pwaMarkSettings(!!(swReg&&swReg.waiting)),
    formazione:renderFormazione, 'test-fisici':renderPhysicalTests
};
function go(sec){
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.nav button,#bottom-nav button').forEach(b=>b.classList.remove('active'));
    document.getElementById(sec).classList.add('active');
    document.querySelectorAll(`.nav button[data-sec="${sec}"],#bottom-nav button[data-sec="${sec}"]`).forEach(b=>b.classList.add('active'));
    (RENDERERS[sec]||(()=>{}))();
    closeSidebar();
    window.scrollTo({top:0,behavior:'instant'});
    setTimeout(()=>{ if(window.Marquee){ window.Marquee.rescan(); window.Marquee.refresh(); } }, 100);
    updateDemoBadge(); checkDemoLock();
    if(CTX_TOURS[sec]) setTimeout(()=>ctxAutoShow(sec), 200);
}
function toggleSidebar(){const s=document.getElementById('sidebar'),b=document.getElementById('backdrop');const o=!s.classList.contains('open');s.classList.toggle('open',o);b.classList.toggle('show',o);}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('backdrop').classList.remove('show');}

/* ---------- nome squadra ---------- */
function renderTeamName(){
    document.getElementById('team-span').textContent = DB.teamName;
    document.getElementById('foot-team').textContent = DB.teamName==='TEAM'? 'La tua squadra' : DB.teamName;
}
function toggleTeamEdit(){
    const inp=document.getElementById('team-input');
    inp.style.display='block'; inp.value=DB.teamName; inp.focus();
    inp.onblur=saveTeam; inp.onkeydown=e=>{if(e.key==='Enter')saveTeam();};
}
function saveTeam(){
    const inp=document.getElementById('team-input');
    const v=inp.value.trim().toUpperCase();
    if(v){DB.teamName=v;save();renderTeamName();toast('Nome squadra aggiornato');}
    inp.style.display='none';
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function courtSVG(sport){
    if(sport==='pallavolo'){
        return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none">
        <rect x="6" y="6" width="388" height="188" fill="none" stroke="#22C55E" stroke-width="2"/>
        <line x1="200" y1="6" x2="200" y2="194" stroke="#22C55E" stroke-width="2.5"/>
        <line x1="135" y1="6" x2="135" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/>
        <line x1="265" y1="6" x2="265" y2="194" stroke="#22C55E" stroke-width="1" stroke-dasharray="5 5"/></svg>`;
    }
    const c='rgba(255,255,255,.85)';
    if(sport==='calcio'){
        return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none">
        <rect x="6" y="6" width="388" height="188" fill="none" stroke="${c}" stroke-width="2"/>
        <line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2"/>
        <circle cx="200" cy="100" r="34" fill="none" stroke="${c}" stroke-width="2"/>
        <rect x="6" y="55" width="58" height="90" fill="none" stroke="${c}" stroke-width="2"/>
        <rect x="336" y="55" width="58" height="90" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
    }
    return `<svg class="court" viewBox="0 0 400 200" preserveAspectRatio="none">
        <rect x="6" y="6" width="388" height="188" fill="none" stroke="${c}" stroke-width="2"/>
        <line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2"/>
        <circle cx="200" cy="100" r="26" fill="none" stroke="${c}" stroke-width="2"/>
        <rect x="6" y="64" width="74" height="72" fill="none" stroke="${c}" stroke-width="2"/>
        <rect x="320" y="64" width="74" height="72" fill="none" stroke="${c}" stroke-width="2"/>
        <path d="M80 64 A36 36 0 0 1 80 136" fill="none" stroke="${c}" stroke-width="2"/>
        <path d="M320 64 A36 36 0 0 0 320 136" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
}
function renderDashboard(){
    const ne=nextEvent(), rec=teamRecord(), avg=teamAvgVoto(), att=teamAttendancePct();
    const t=today();
    let cd='';
    if(ne){
        const days=Math.round((new Date(ne.date+'T00:00:00')-t)/86400000);
        const isMatch=ne.type==='Partita';
        cd=`<div>
            <div class="hero-label">${isMatch?'Prossima partita':'Prossimo allenamento'}</div>
            <h2>${ne.notes}</h2>
            <div class="meta">${fmtDateLong(ne.date)} · <span class="pill ${isMatch?'match':'train'}">${ne.type}</span></div>
            <div class="countdown"><div class="cd-box"><b class="num">${days}</b><span>${days===1?'giorno':'giorni'}</span></div>
            ${isMatch?`<button class="btn btn-accent" style="align-self:center;margin-left:6px" onclick="go('scout')"><i class="fa-solid fa-clipboard-list"></i> Prepara scout</button>`:''}</div>
        </div>`;
    } else {
        cd=`<div><div class="hero-label">Agenda libera</div><h2>Nessun impegno in programma</h2>
            <div class="meta">Aggiungi una partita o un allenamento dal calendario.</div>
            <div class="countdown"><button class="btn btn-accent" onclick="go('calendario')"><i class="fa-solid fa-calendar-plus"></i> Vai al calendario</button></div></div>`;
    }
    const court=courtSVG(curSport());

    const kpis=`<div class="kpi-grid">
        <div class="kpi"><i class="fa-solid fa-trophy ic"></i><div class="lbl">Bilancio</div>
            <div class="val num">${rec.w}<small>V</small> · ${rec.l}<small>P</small></div>
            <div class="delta ${rec.w>=rec.l?'up':'down'}">${rec.w+rec.l? Math.round(rec.w/(rec.w+rec.l)*100):0}% vittorie</div></div>
        <div class="kpi"><i class="fa-solid fa-star ic"></i><div class="lbl">Media voti squadra</div>
            <div class="val num">${avg?avg.toFixed(2):'—'}</div>
            <div class="delta ${avg>=6?'up':'down'}">${avg?(avg>=6?'sopra la sufficienza':'sotto la sufficienza'):'nessuna gara'}</div></div>
        <div class="kpi"><i class="fa-solid fa-users ic"></i><div class="lbl">Atleti in rosa</div>
            <div class="val num">${DB.players.length}<small>atleti</small></div>
            <div class="delta flat">${DB.players.filter(p=>p.status==='injured').length} infortunati</div></div>
        <div class="kpi"><i class="fa-solid fa-user-check ic"></i><div class="lbl">Presenza media</div>
            <div class="val num">${att!==null?att:'—'}<small>%</small></div>
            <div class="delta ${att>=75?'up':(att!==null?'down':'flat')}">${att!==null?(att>=75?'gruppo costante':'da monitorare'):'nessun dato'}</div></div>
    </div>`;

    // top 3 per media voto (min 1 gara)
    const ranked=DB.players.map(p=>({p,s:getSeasonStats(p.id)})).filter(x=>x.s.avgVoto!==null)
        .sort((a,b)=>b.s.avgVoto-a.s.avgVoto).slice(0,3);
    let top=ranked.length? ranked.map((x,i)=>{
        const f=playerForm(x.p.id);
        return `<div class="leader-row"><div class="leader-rank r${i+1}">${i+1}</div>
            <div class="leader-info"><b>${x.p.name}</b><span>${x.p.role} · #${x.p.number}</span></div>
            <div style="text-align:right"><div class="voto num" style="color:var(--brand);font-size:1.15rem">${x.s.avgVoto.toFixed(1)}</div>
            <span class="delta ${f.dir}" style="font-size:.72rem">${f.txt}</span></div></div>`;
    }).join('') : `<div class="empty-state"><i class="fa-solid fa-chart-line"></i><b>Ancora nessuna statistica</b>Registra uno scout gara per vedere la classifica.</div>`;

    // prossimi 3 eventi
    const up=DB.events.filter(e=>new Date(e.date)>=t).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
    let upcoming=up.length? `<ul class="mini-list">`+up.map(e=>`<li><span><span class="status-dot" style="background:${e.type==='Partita'?'var(--brand)':'var(--muted)'}"></span>${e.notes}</span><span style="color:var(--muted);font-size:.82rem">${fmtDate(e.date)}</span></li>`).join('')+`</ul>`
        : `<div class="empty-state" style="padding:1.5rem"><i class="fa-solid fa-calendar"></i>Nessun evento futuro</div>`;

    brandCSS();
    document.getElementById('dash-content').innerHTML=`
        <div class="page-head dash-head">
            <div class="dash-badge" onclick="pickTeamLogo()" title="Carica / cambia lo stemma">${TEAM_LOGO?`<img src="${TEAM_LOGO}" alt="stemma">`:`<i class="fa-solid fa-shield-halved"></i>`}</div>
            <div><div class="eyebrow">Bentornato, mister</div><h2 style="margin:0">${DB.teamName}</h2>
                <div style="color:var(--muted);font-size:.82rem">${TEAM_LOGO?'Tocca lo stemma per cambiarlo':'Tocca lo scudetto per caricare lo stemma della squadra'}</div></div>
        </div>
        <div class="hero">${court}<div class="hero-inner">${cd}</div></div>
        ${kpis}
        <div class="dash-cols">
            <div class="card"><h3><i class="fa-solid fa-ranking-star"></i> Migliori per rendimento</h3>${top}</div>
            <div class="card"><h3><i class="fa-solid fa-calendar-week"></i> Prossimi impegni</h3>${upcoming}</div>
        </div>`;
}
function brandCSS(){
    if(document.getElementById('brand-css')) return;
    const st=document.createElement('style'); st.id='brand-css';
    st.textContent=`
    .dash-head{display:flex;align-items:center;gap:14px;}
    .dash-badge{width:145px;height:145px;flex:0 0 auto;border-radius:16px;background:var(--surface-2,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.16));display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;transition:border-color .15s;}
    .dash-badge:hover{border-color:var(--brand);}
    .dash-badge img{width:100%;height:100%;object-fit:contain;}
    .dash-badge i{font-size:1.7rem;color:var(--muted);}`;
    document.head.appendChild(st);
}
function applyTeamLogo(){ const bl=document.getElementById('brand-logo'); if(bl) bl.src=TEAM_LOGO||'icons/logo-badge.png'; }

/* =========================================================
   ROSTER
   ========================================================= */
const STATUS_META={active:{c:'var(--ok)',t:'Disponibile'},injured:{c:'var(--bad)',t:'Infortunato'},suspended:{c:'var(--warn)',t:'Squalificato'}};
function renderRoster(){
    const body=document.getElementById('roster-body');
    document.getElementById('roster-count').textContent=`(${DB.players.length} in rosa)`;
    if(!DB.players.length){body.innerHTML=`<tr class="empty-row"><td colspan="8">Nessun atleta. Aggiungi il primo giocatore qui sopra.</td></tr>`;return;}
    body.innerHTML='';
    DB.players.forEach(p=>{
        const s=getSeasonStats(p.id), f=playerForm(p.id), att=playerAttendance(p.id);
        let lead='', jcls='';
        if(p.isCaptain){lead='<span class="lead-tag c">👑 C</span>';jcls='captain';}
        else if(p.isViceCaptain){lead='<span class="lead-tag v">🥈 VC</span>';jcls='vice';}
        const st=STATUS_META[p.status]||STATUS_META.active;
        const tr=document.createElement('tr');
        tr.className='clickable';
        tr.onclick=(ev)=>{ if(ev.target.closest('.no-open'))return; openPlayer(p.id); };
        tr.innerHTML=`
            <td><div class="jersey ${jcls} no-open" onclick="event.stopPropagation();cycleLeadership(${p.id})">${p.number}</div></td>
            <td style="text-align:left;font-weight:700">${p.name}${lead}<div style="font-size:.74rem;color:var(--muted-2);font-weight:500">${p.hand||'Dx'} · ${p.height?p.height+' cm':'—'}</div></td>
            <td><span class="pill role">${p.role}</span></td>
            <td><span class="status-dot" style="background:${st.c}"></span><span style="font-size:.82rem">${st.t}</span></td>
            <td class="voto num" style="color:var(--brand)">${s.avgVoto?s.avgVoto.toFixed(1):'—'}</td>
            <td><span class="delta ${f.dir}" style="font-size:.78rem;font-weight:700">${f.txt}</span></td>
            <td class="num">${att!==null?att+'%':'—'}</td>
            <td><div class="row-actions no-open"><button class="btn btn-ghost btn-icon" onclick="event.stopPropagation();openPlayer(${p.id})" title="Scheda"><i class="fa-solid fa-eye"></i></button>
                <button class="btn btn-accent btn-icon" onclick="event.stopPropagation();sharePlayer(${p.id})" title="Condividi codice col giocatore"><i class="fa-solid fa-share-nodes"></i></button>
                <button class="btn btn-danger btn-icon" onclick="event.stopPropagation();removePlayer(${p.id})" title="Rimuovi"><i class="fa-solid fa-trash-can"></i></button></div></td>`;
        body.appendChild(tr);
    });
}
function addPlayer(e){
    e.preventDefault();
    // nessun limite di rosa: calcio/basket possono avere 20+ atleti
    const number=parseInt(document.getElementById('p-number').value);
    if(DB.players.some(p=>p.number===number)) return toast(`La maglia ${number} è già assegnata`,'warning');
    DB.players.push({id:uid(),name:document.getElementById('p-name').value.trim(),number,
        role:document.getElementById('p-role').value,hand:document.getElementById('p-hand').value,
        height:parseInt(document.getElementById('p-height').value)||0,status:'active',isCaptain:false,isViceCaptain:false});
    save();e.target.reset();renderRoster();toast('Atleta inserito');
}
function removePlayer(id){
    const p=playerById(id);
    confirmAction(`Rimuovere ${p.name} dalla rosa? Lo storico statistiche resterà nei tabellini.`,()=>{
        DB.players=DB.players.filter(x=>x.id!==id);save();renderRoster();toast('Atleta rimosso','info');
    });
}
function cycleLeadership(id){
    const p=playerById(id);if(!p)return;
    const cap=DB.players.find(x=>x.isCaptain), vice=DB.players.find(x=>x.isViceCaptain);
    if(!p.isCaptain&&!p.isViceCaptain){
        if(!cap){p.isCaptain=true;toast(`${p.name} è il Capitano 👑`);}
        else if(!vice){p.isViceCaptain=true;toast(`${p.name} è il Vice Capitano 🥈`);}
        else toast('Ruoli di leadership già assegnati','warning');
    } else if(p.isCaptain){
        p.isCaptain=false;
        if(!vice){p.isViceCaptain=true;toast(`${p.name} ora è Vice 🥈`);}
        else toast(`${p.name} senza gradi`,'info');
    } else { p.isViceCaptain=false;toast(`${p.name} senza gradi`,'info'); }
    save();renderRoster();
}
function setStatus(id,st){ const p=playerById(id);p.status=st;save();renderRoster();openPlayer(id);toast('Stato aggiornato'); }

function openPlayer(id){
    const p=playerById(id), s=getSeasonStats(id), voti=getPlayerVoti(id), f=playerForm(id), att=playerAttendance(id);
    const chart=svgLine(voti.map(v=>v.voto));
    const statCell=(lbl,v,suf='')=>`<div class="stat-cell"><div class="lbl">${lbl}</div><div class="v num">${v}${suf?`<small>${suf}</small>`:''}</div></div>`;
    const stStatus=p.status||'active';
    const ts=playerTrainingStats(id);
    const catBars=Object.keys(ts.byCat).length? `<h3 style="font-size:.95rem;margin:1.2rem 0 .6rem"><i class="fa-solid fa-dumbbell"></i> Rendimento allenamenti per fondamentale</h3>`+
        Object.keys(ts.byCat).sort((a,b)=>ts.byCat[b]-ts.byCat[a]).map(cat=>{
            const v=ts.byCat[cat], pct=Math.round(v/10*100), col=v>=6?'linear-gradient(90deg,var(--brand-deep),var(--brand))':'var(--flame)';
            return `<div style="display:flex;align-items:center;gap:12px;padding:6px 0"><div style="width:110px;font-size:.82rem;font-weight:600">${cat}</div>
                <div style="flex:1"><div class="bar-track" style="height:8px"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></div>
                <div class="num" style="font-weight:800;font-family:'Outfit';width:34px;text-align:right;color:${v>=6?'var(--brand)':'var(--flame)'}">${v.toFixed(1)}</div></div>`;
        }).join('') : '';
    coachMediaCSS();
    openModal(`
      <div class="modal-head"><h3><i class="fa-solid fa-id-card" style="color:var(--brand)"></i> Scheda atleta</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="player-head">
            <div class="player-avatar" id="cph-av" onclick="pickPhotoCoach(${id})"><div class="cph-im" id="cph-im-${id}">${COACH_PHOTOS[id]?`<img src="${COACH_PHOTOS[id]}">`:p.number}</div><div class="cph-cam"><i class="fa-solid fa-camera"></i></div></div>
            <div class="meta"><h4>${p.name} ${p.isCaptain?'👑':p.isViceCaptain?'🥈':''}</h4>
                <p>${p.role} · ${p.hand||'Dx'} · ${p.height?p.height+' cm':'altezza n.d.'} · <span class="delta ${f.dir}" style="font-weight:700">${f.txt}</span></p></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap">
            <button class="btn btn-accent btn-sm" onclick="sharePlayer(${id})"><i class="fa-solid fa-share-nodes"></i> Condividi</button>
            <button class="btn btn-ghost btn-sm" onclick="openPlayerCard(${id})"><i class="fa-solid fa-id-badge"></i> Card giocatore</button>
            <button class="btn btn-ghost btn-sm" onclick="openRadarCompare(${id})"><i class="fa-solid fa-chart-area"></i> Confronta (Radar)</button>
            <button class="btn btn-ghost btn-sm" onclick="exportGrowthCard(${id})"><i class="fa-solid fa-file-pdf"></i> Esporta Scheda Crescita</button>
            <button class="btn btn-ghost btn-sm" onclick="openImportMental()"><i class="fa-solid fa-brain"></i> Importa statistiche mentali</button>
            <button class="btn btn-ghost btn-sm" onclick="openImportWellness()"><i class="fa-solid fa-heart-pulse"></i> Importa check-in benessere</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:1.2rem;flex-wrap:wrap">
            <button class="btn btn-sm ${stStatus==='active'?'btn-accent':'btn-ghost'}" onclick="setStatus(${id},'active')">Disponibile</button>
            <button class="btn btn-sm ${stStatus==='injured'?'btn-danger':'btn-ghost'}" onclick="setStatus(${id},'injured')">Infortunato</button>
            <button class="btn btn-sm ${stStatus==='suspended'?'btn-accent':'btn-ghost'}" style="${stStatus==='suspended'?'background:var(--warn);color:#1a1300':''}" onclick="setStatus(${id},'suspended')">Squalificato</button>
        </div>
        <h3 style="font-size:.95rem;margin-bottom:.6rem"><i class="fa-solid fa-chart-line"></i> Andamento voti (${voti.length} gare)</h3>
        ${chart}
        <h3 style="font-size:.95rem;margin:1.2rem 0 .6rem"><i class="fa-solid fa-table-cells"></i> Statistiche stagione</h3>
        <div class="stat-grid">
            ${statCell('Media voto', s.avgVoto?s.avgVoto.toFixed(1):'—')}
            ${(s.cells||[]).map(c=>statCell(c[0],c[1],c[2])).join('')}
            ${statCell('Presenza all.', att!==null?att:'—', att!==null?'%':'')}
            ${statCell('Media allenamenti', ts.avg!=null?ts.avg.toFixed(1):'—')}
        </div>
        ${catBars}
        ${renderMentalStatsBlock(p, statCell)}
        ${renderWellnessBlock(p, statCell)}
      </div>`, true);
    loadCoachPhoto(id);
}
/* ---------- sezione dedicata "Statistiche mentali" nella scheda atleta (Modulo L: fuori dalla card, numeri grandi) ---------- */
function renderMentalStatsBlock(p, statCell){
    const ms=p.mentalStats;
    if(!ms || (ms.riflessi==null && ms.percezione==null)){
        return `<h3 style="font-size:.95rem;margin:1.2rem 0 .6rem"><i class="fa-solid fa-brain"></i> Statistiche mentali</h3>
            <div class="empty-state" style="padding:1.2rem"><i class="fa-solid fa-brain"></i>Nessuna statistica mentale ricevuta ancora.<br><span style="font-size:.82rem">Il giocatore può inviarla da Mental Gym → "Invia al mister".</span></div>`;
    }
    const upd=ms.aggiornato?fmtDate(ms.aggiornato):null;
    return `<h3 style="font-size:.95rem;margin:1.2rem 0 .6rem"><i class="fa-solid fa-brain"></i> Statistiche mentali ${upd?`<span class="hint" style="font-weight:400;font-size:.72rem">(aggiornato ${upd})</span>`:''}</h3>
        <div class="stat-grid">
            ${ms.riflessi!=null?statCell('Riflessi', ms.riflessi, '/100'):''}
            ${ms.percezione!=null?statCell('Percezione', ms.percezione, '/100'):''}
        </div>`;
}
/* ---------- sezione dedicata "Check-in benessere" nella scheda atleta (Modulo L: ultimo aggiornamento in grande, storico compatto sotto) ---------- */
function wellnessSummaryLine(c){
    const sonno=(+c.sonno).toFixed(1).replace('.0','');
    const n=c.zone?c.zone.length:0;
    return `${sonno}h sonno, affaticamento ${c.affaticamento}/5, umore ${c.umore}/5${n?`, ${n} zona${n===1?'':'e'} segnalat${n===1?'a':'e'}`:''}`;
}
function renderWellnessBlock(p, statCell){
    const list=p.wellness||[];
    if(!list.length) return '';
    const last=list[list.length-1];
    const bigCell=(lbl,v,suf='')=>`<div class="stat-cell" style="padding:1.1rem"><div class="lbl">${lbl}</div><div class="v num" style="font-size:2.1rem">${v}${suf?`<small style="font-size:.9rem">${suf}</small>`:''}</div></div>`;
    const zonesHtml=(last.zone&&last.zone.length)
      ? last.zone.map(z=>`<span class="pill" style="margin:2px 4px 2px 0">${z.zone||'Zona'} · ${z.intensita}/5</span>`).join('')
      : '<span style="color:var(--muted);font-size:.85rem">Nessuna zona segnalata nell\'ultimo check-in.</span>';
    const histRows=list.slice(0,-1).slice(-5).reverse().map(c=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--line-soft);font-size:.74rem;color:var(--muted)"><span>${fmtDate(c.date)}</span><span>${wellnessSummaryLine(c)}</span></div>`).join('');
    return `<h3 style="font-size:.95rem;margin:1.2rem 0 .3rem"><i class="fa-solid fa-heart-pulse"></i> Check-in benessere</h3>
        <div style="background:linear-gradient(135deg,rgba(34,197,94,.08),transparent);border:1px solid rgba(34,197,94,.22);border-radius:14px;padding:1rem;margin-top:.4rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.7rem">
                <b style="font-size:.78rem;color:var(--brand);text-transform:uppercase;letter-spacing:.6px">Ultimo check-in</b>
                <span class="hint" style="font-size:.74rem">${fmtDate(last.date)}</span>
            </div>
            <div class="stat-grid">
                ${bigCell('Ore di sonno', (+last.sonno).toFixed(1).replace('.0',''), 'h')}
                ${bigCell('Affaticamento', last.affaticamento, '/5')}
                ${bigCell('Umore/energia', last.umore, '/5')}
            </div>
            <div style="margin-top:.8rem">${zonesHtml}</div>
        </div>
        ${histRows?`<div style="margin-top:.8rem"><b style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Aggiornamenti precedenti</b>${histRows}</div>`:''}`;
}

/* =========================================================
   RADAR COMPARATIVO (Modulo A, blocco Prompt7)
   Confronto libero fra 2 giocatori qualsiasi (nessun vincolo di ruolo)
   oppure giocatore vs media squadra. Riusa i valori già calcolati da
   radarAttributes()/radarTeamAverage() — nessuna nuova logica statistica.
   ========================================================= */
function radarDatasetFor(sel){
    if(sel==='team') return {label:'Media Squadra', values: radarTeamAverage().map(a=>a.rating)};
    const id=parseInt(sel), p=playerById(id);
    return {label:p?p.name:'—', values: p? radarAttributes(id).map(a=>a.rating) : radarDefs(curSport()).map(()=>0)};
}
function renderRadarCompare(){
    const selA=document.getElementById('radar-a'), selB=document.getElementById('radar-b');
    if(!selA||!selB) return;
    const dsA=radarDatasetFor(selA.value), dsB=radarDatasetFor(selB.value);
    dsA.color='var(--brand)'; dsB.color='var(--gold)';
    const axes=radarDefs(curSport()).map(d=>d[0]);
    const chart=svgRadar(axes,[dsA,dsB]);
    const legend=`<div style="display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:.6rem">
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:.85rem;font-weight:700"><i style="width:12px;height:12px;border-radius:3px;display:inline-block;background:${dsA.color}"></i>${dsA.label}</span>
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:.85rem;font-weight:700"><i style="width:12px;height:12px;border-radius:3px;display:inline-block;background:${dsB.color}"></i>${dsB.label}</span>
    </div>`;
    document.getElementById('radar-chart-wrap').innerHTML=chart+legend;
}
function openRadarCompare(presetA){
    const players=DB.players;
    if(players.length<2){ toast('Servono almeno 2 giocatori in rosa per un confronto','info'); return; }
    presetA = players.some(p=>p.id===presetA) ? presetA : players[0].id;
    const defaultB = (players.find(p=>p.id!==presetA)||players[0]).id;
    const optsA=players.map(p=>`<option value="${p.id}" ${presetA===p.id?'selected':''}>${p.name}</option>`).join('');
    const optsB='<option value="team">Media Squadra</option>'+players.map(p=>`<option value="${p.id}" ${defaultB===p.id?'selected':''}>${p.name}</option>`).join('');
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-chart-area" style="color:var(--brand)"></i> Confronto Radar</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:10px">Confronta due giocatori qualsiasi (o un giocatore con la media squadra) sugli stessi attributi — utile anche per valutare cambi di ruolo.</p>
        <div class="form-row">
            <div class="fg"><label>Giocatore A</label><select id="radar-a" onchange="renderRadarCompare()">${optsA}</select></div>
            <div class="fg"><label>Giocatore B</label><select id="radar-b" onchange="renderRadarCompare()">${optsB}</select></div>
        </div>
        <div id="radar-chart-wrap" style="margin-top:1rem"></div>
      </div>`, true);
    renderRadarCompare();
}

/* =========================================================
   PDF "SCHEDA CRESCITA" (Modulo B, blocco Prompt7)
   Solo lettura/visualizzazione di dati già calcolati altrove
   (season stats, presenze, tier, voti). Nessuna modifica ai motori
   voto/scout esistenti. jsPDF caricato on-demand (stesso schema di
   loadXLSX/loadImgly), non serve al primo avvio offline.
   ========================================================= */
let _jsPDFCtor=null;
async function loadJsPDF(){ if(_jsPDFCtor) return _jsPDFCtor; const m=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'); _jsPDFCtor=m.jsPDF||m.default; return _jsPDFCtor; }
async function exportGrowthCard(id){
    const p=playerById(id); if(!p) return;
    toast('Generazione PDF in corso…','info');
    try{
        const JsPDF=await loadJsPDF();
        const doc=new JsPDF({unit:'mm',format:'a4'});
        const s=getSeasonStats(id), att=playerAttendance(id), tier=playerTier(id), f=playerForm(id);
        const voti=getPlayerVoti(id);
        const oneMonthAgo=new Date(); oneMonthAgo.setDate(oneMonthAgo.getDate()-30);
        const votiMese=voti.filter(v=>new Date(v.date)>=oneMonthAgo);
        const mediaMese = votiMese.length? (votiMese.reduce((a,b)=>a+b.voto,0)/votiMese.length) : null;
        let trendMese='—';
        if(votiMese.length>=2){
            const half=Math.ceil(votiMese.length/2), secondHalf=votiMese.slice(half);
            const primaMeta=votiMese.slice(0,half).reduce((a,b)=>a+b.voto,0)/half;
            const secondaMeta=secondHalf.length? secondHalf.reduce((a,b)=>a+b.voto,0)/secondHalf.length : primaMeta;
            const d=secondaMeta-primaMeta;
            trendMese = d>0.25? 'In crescita' : d<-0.25? 'In calo' : 'Stabile';
        }
        const M=20; let y=M;
        doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(20,30,50);
        doc.text('Scheda Crescita', M, y); y+=6;
        doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(90,100,120);
        doc.text(`${DB.teamName||'Squadra'} · ${fmtDateLong(today().toISOString().slice(0,10))}`, M, y); y+=12;
        const section=(title)=>{ doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(20,30,50); doc.text(title, M, y); y+=2;
            doc.setDrawColor(220,225,235); doc.line(M,y,190,y); y+=7; doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(40,48,64); };
        const row=(label,value)=>{ doc.setFont('helvetica','bold'); doc.text(label+':', M, y); doc.setFont('helvetica','normal'); doc.text(String(value), M+58, y); y+=7; };
        section('Dati giocatore');
        row('Nome', p.name);
        row('Numero maglia', p.number||'—');
        row('Ruolo', p.role||'—');
        row('Altezza', p.height? p.height+' cm':'—');
        y+=4;
        section('Stato di forma attuale');
        row('Livello', TIER_LABEL[tier]||tier);
        row('Media voto stagione', s.avgVoto!=null? s.avgVoto.toFixed(1):'—');
        row('Andamento recente', f.txt.replace(/^[↑↓→]\s*/,''));
        y+=4;
        section('Presenze');
        row('Presenza allenamenti', att!=null? att+'%':'—');
        row('Partite disputate', s.matches||0);
        y+=4;
        section('Evoluzione nel tempo');
        doc.text(`Livello attuale: ${TIER_LABEL[tier]||tier}.`, M, y); y+=6;
        doc.setTextColor(140,148,164); doc.setFontSize(9.5);
        doc.text("Storico dell'evoluzione disponibile da futuri aggiornamenti.", M, y); y+=10;
        doc.setTextColor(40,48,64); doc.setFontSize(11);
        section('Voti scout ultimo mese');
        row('Numero valutazioni', votiMese.length);
        row('Media voto', mediaMese!=null? mediaMese.toFixed(1):'—');
        row('Andamento', trendMese);
        doc.save(`Scheda-Crescita-${(p.name||'giocatore').replace(/\s+/g,'_')}.pdf`);
        toast('PDF generato');
    }catch(err){
        console.error(err);
        toast('Impossibile generare il PDF — serve una connessione internet al primo utilizzo','danger');
    }
}

/* =========================================================
   CALENDARIO
   ========================================================= */
function calendarCSS(){
  if(document.getElementById('calendar-css')) return;
  const st=document.createElement('style'); st.id='calendar-css';
  st.textContent=`
  .cal-top{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .cal-nav{width:36px;height:36px;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.14));background:transparent;color:inherit;cursor:pointer;}
  .cal-nav:hover{background:rgba(255,255,255,.06);}
  .cal-legend{display:flex;gap:16px;font-size:.8rem;color:var(--muted);margin-bottom:12px;}
  .cal-dot{display:inline-block;width:8px;height:8px;border-radius:50%;vertical-align:middle;}
  .cal-dot-match{background:var(--flame,#F97316);} .cal-dot-train{background:var(--brand,#22C55E);}
  .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
  .cal-wd{text-align:center;font-size:.7rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding-bottom:4px;}
  .cal-cell{min-height:56px;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.08));background:var(--surface-2,rgba(255,255,255,.02));padding:5px 6px;cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:border-color .15s,background .15s;}
  .cal-cell:hover{border-color:var(--brand);}
  .cal-cell.out{opacity:.32;}
  .cal-cell.today{box-shadow:inset 0 0 0 1.5px var(--brand);}
  .cal-cell.sel{background:color-mix(in srgb,var(--brand) 18%,transparent);border-color:var(--brand);}
  .cal-cell.has .cal-d{font-weight:800;}
  .cal-d{font-size:.82rem;font-variant-numeric:tabular-nums;}
  .cal-dots{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin-top:auto;}
  .cal-more{font-size:.62rem;color:var(--muted);font-weight:700;}
  .cal-empty{color:var(--muted-2,var(--muted));font-style:italic;font-size:.9rem;}
  .cal-ev{padding:12px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.08));}
  .cal-ev:last-child{border-bottom:none;}
  .cal-ev-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
  .cal-ev-actions{display:flex;gap:6px;flex-wrap:wrap;}
  @media(max-width:560px){.cal-cell{min-height:48px;padding:4px;}.cal-d{font-size:.75rem;}}
  `;
  document.head.appendChild(st);
}
let CAL_Y=null, CAL_M=null, CAL_SEL=null;
const MONTHS_IT=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const WD_IT=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
function isoOf(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function eventsOn(iso){ return DB.events.filter(e=>e.date===iso); }
function renderCalendar(){
    calendarCSS();
    const grid=document.getElementById('cal-grid'); if(!grid) return;
    const t=today();
    if(CAL_Y===null){ CAL_Y=t.getFullYear(); CAL_M=t.getMonth(); }
    if(!CAL_SEL){ CAL_SEL=isoOf(t.getFullYear(),t.getMonth(),t.getDate()); }
    const title=document.getElementById('cal-title'); if(title) title.textContent=`${MONTHS_IT[CAL_M]} ${CAL_Y}`;
    const first=new Date(CAL_Y,CAL_M,1);
    const startWd=(first.getDay()+6)%7;                 // lunedì = 0
    const daysInMonth=new Date(CAL_Y,CAL_M+1,0).getDate();
    const prevDays=new Date(CAL_Y,CAL_M,0).getDate();
    const todayIso=isoOf(t.getFullYear(),t.getMonth(),t.getDate());
    let html=WD_IT.map(w=>`<div class="cal-wd">${w}</div>`).join('');
    for(let i=0;i<42;i++){
        let dayNum,y=CAL_Y,m=CAL_M,out=false;
        if(i<startWd){ dayNum=prevDays-startWd+1+i; m=CAL_M-1; out=true; if(m<0){m=11;y--;} }
        else if(i>=startWd+daysInMonth){ dayNum=i-(startWd+daysInMonth)+1; m=CAL_M+1; out=true; if(m>11){m=0;y++;} }
        else { dayNum=i-startWd+1; }
        const iso=isoOf(y,m,dayNum), evs=eventsOn(iso);
        const dots=evs.slice(0,4).map(e=>`<i class="cal-dot ${e.type==='Partita'?'cal-dot-match':'cal-dot-train'}"></i>`).join('');
        const cls=['cal-cell']; if(out)cls.push('out'); if(iso===todayIso)cls.push('today'); if(iso===CAL_SEL)cls.push('sel'); if(evs.length)cls.push('has');
        html+=`<div class="${cls.join(' ')}" onclick="calSelect('${iso}')"><span class="cal-d">${dayNum}</span><div class="cal-dots">${dots}${evs.length>4?`<span class="cal-more">+${evs.length-4}</span>`:''}</div></div>`;
    }
    grid.innerHTML=html;
    renderCalDay();
}
function calSelect(iso){ CAL_SEL=iso; const d=new Date(iso); if(d.getMonth()!==CAL_M||d.getFullYear()!==CAL_Y){ CAL_Y=d.getFullYear(); CAL_M=d.getMonth(); } renderCalendar(); }
function calShift(delta){ CAL_M+=delta; if(CAL_M<0){CAL_M=11;CAL_Y--;} if(CAL_M>11){CAL_M=0;CAL_Y++;} renderCalendar(); }
function calToday(){ const t=today(); CAL_Y=t.getFullYear(); CAL_M=t.getMonth(); CAL_SEL=isoOf(t.getFullYear(),t.getMonth(),t.getDate()); renderCalendar(); }
function renderCalDay(){
    const box=document.getElementById('cal-day'); if(!box) return;
    const title=document.getElementById('cal-day-title'); if(title) title.innerHTML=`<i class="fa-solid fa-calendar-day"></i> ${fmtDateLong(CAL_SEL)}`;
    const evs=eventsOn(CAL_SEL).slice().sort((a,b)=>a.type.localeCompare(b.type));
    if(!evs.length){ box.innerHTML=`<p class="cal-empty">Nessun evento in questo giorno. Aggiungine uno qui sopra, o tocca un altro giorno del calendario.</p>`; return; }
    box.innerHTML=evs.map(ev=>{
        const isMatch=ev.type==='Partita';
        let res='';
        if(isMatch) res = ev.result?`<span class="pill ${ev.result.w>ev.result.l?'win':'loss'}">${ev.result.w}-${ev.result.l}</span>`:`<span class="pill" style="opacity:.6">da giocare</span>`;
        const actions = isMatch
          ? `<button class="btn btn-accent btn-sm" onclick="calOpenScout(${ev.id})"><i class="fa-solid fa-clipboard-list"></i> Scout</button>
             <button class="btn btn-ghost btn-sm" onclick="editResult(${ev.id})"><i class="fa-solid fa-pen"></i> Risultato</button>`
          : `<button class="btn btn-accent btn-sm" onclick="calOpenTraining(${ev.id})"><i class="fa-solid fa-dumbbell"></i> Allenamento</button>
             <button class="btn btn-ghost btn-sm" onclick="calOpenAttendance(${ev.id})"><i class="fa-solid fa-clipboard-user"></i> Presenze</button>`;
        return `<div class="cal-ev">
            <div class="cal-ev-head"><span class="pill ${isMatch?'match':'train'}">${ev.type}</span> <b>${ev.notes||''}</b> ${res}</div>
            <div class="cal-ev-actions">${actions}
                <button class="btn btn-danger btn-icon btn-sm" onclick="removeEvent(${ev.id})" title="Elimina"><i class="fa-solid fa-trash-can"></i></button></div>
        </div>`;
    }).join('');
}
function calOpenScout(id){ go('scout'); const s=document.getElementById('scout-select'); if(s){ s.value=id; setupScout(); } }
function calOpenTraining(id){ go('allenamenti'); const s=document.getElementById('tr-select'); if(s){ s.value=id; renderTraining(); } }
function calOpenAttendance(id){ go('presenze'); const s=document.getElementById('att-select'); if(s){ s.value=id; renderAttendance(); } }
/* ---- Serie di allenamenti ricorrenti ---- */
let REC=null;
function genRecurringDates(startISO,endISO,weekdays){
  const out=[]; const s=new Date(startISO+'T00:00:00'), e=new Date(endISO+'T00:00:00');
  if(isNaN(s.getTime())||isNaN(e.getTime())||e<s) return out;
  let d=new Date(s), guard=0;
  while(d<=e && guard++<4000){ const wd=(d.getDay()+6)%7; if(weekdays.includes(wd)) out.push(isoOf(d.getFullYear(),d.getMonth(),d.getDate())); d.setDate(d.getDate()+1); }
  return out;
}
function openRecurring(){
  recurringCSS();
  const t=today(); const s=isoOf(t.getFullYear(),t.getMonth(),t.getDate());
  REC={days:[], start:s, end:s, title:'Allenamento'};
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-calendar-week" style="color:var(--brand)"></i> Serie di allenamenti</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:12px">Scegli i giorni fissi e il periodo: l'app crea tutte le sedute nel calendario, poi le articoli una a una.</p>
      <label class="rec-lb">Giorni della settimana</label>
      <div class="rec-days">${WD_IT.map((w,i)=>`<button id="rec-day-${i}" class="rec-day" onclick="recToggleDay(${i})">${w}</button>`).join('')}</div>
      <div class="form-row" style="margin-top:12px">
        <div class="fg"><label>Da</label><input type="date" value="${REC.start}" onchange="recSet('start',this.value)"></div>
        <div class="fg"><label>Fino al</label><input type="date" value="${REC.end}" onchange="recSet('end',this.value)"></div>
      </div>
      <div class="fg"><label>Titolo / focus (opzionale)</label><input value="Allenamento" onchange="recSet('title',this.value)"></div>
      <div class="rec-count" id="rec-count"></div>
      <button class="btn btn-accent" id="rec-go" style="width:100%;margin-top:12px" onclick="createRecurring()"><i class="fa-solid fa-wand-magic-sparkles"></i> Crea gli allenamenti</button>
    </div>`, true);
  recRefresh();
}
function recToggleDay(i){ const k=REC.days.indexOf(i); if(k>=0) REC.days.splice(k,1); else REC.days.push(i);
  const b=document.getElementById('rec-day-'+i); if(b) b.classList.toggle('on'); recRefresh(); }
function recSet(f,v){ REC[f]=v; recRefresh(); }
function recDates(){ return REC.days.length? genRecurringDates(REC.start,REC.end,REC.days):[]; }
function recRefresh(){ const n=recDates().length;
  const el=document.getElementById('rec-count'); if(el) el.textContent = n? `${n} allenament${n===1?'o':'i'} verranno creati` : 'Scegli almeno un giorno e il periodo.';
  const btn=document.getElementById('rec-go'); if(btn) btn.disabled=!n; }
function createRecurring(){
  const dates=recDates(); if(!dates.length) return;
  dates.forEach(dt=>{ DB.events.push({id:uid(),type:'Allenamento',date:dt,notes:(REC.title||'Allenamento').trim(),result:null}); });
  save(); closeModal();
  const d=new Date(REC.start+'T00:00:00'); if(!isNaN(d.getTime())){ CAL_Y=d.getFullYear(); CAL_M=d.getMonth(); CAL_SEL=REC.start; }
  renderCalendar(); toast(dates.length+' allenamenti creati');
}
function recurringCSS(){
  if(document.getElementById('rec-css')) return;
  const st=document.createElement('style'); st.id='rec-css';
  st.textContent=`
  .rec-lb{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;margin-bottom:8px;}
  .rec-days{display:flex;gap:6px;flex-wrap:wrap;}
  .rec-day{width:44px;height:44px;border-radius:50%;border:1px solid var(--line,rgba(255,255,255,.16));background:transparent;color:var(--muted);font-weight:800;font-size:.8rem;cursor:pointer;font-family:'Outfit',sans-serif;}
  .rec-day.on{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 22%,transparent);color:#fff;}
  .rec-count{margin-top:14px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--brand);font-weight:700;font-size:.9rem;text-align:center;}
  .imp-ta{width:100%;height:120px;border-radius:12px;padding:10px;background:var(--surface,rgba(0,0,0,.2));color:inherit;border:1px solid var(--line,rgba(255,255,255,.16));font-family:monospace;font-size:.82rem;resize:vertical;}
  .imp-prev{margin-top:12px;max-height:34vh;overflow:auto;} .imp-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line,rgba(255,255,255,.08));font-size:.88rem;}
  .imp-row .d{color:var(--brand);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}`;
  document.head.appendChild(st);
}
/* ---- Import partite da CSV/Excel/incolla ---- */
function splitCSVLine(line,sep){ const out=[]; let cur='',q=false;
  for(let i=0;i<line.length;i++){ const ch=line[i];
    if(ch==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
    else if(ch===sep&&!q){ out.push(cur); cur=''; } else cur+=ch; }
  out.push(cur); return out.map(c=>c.trim()); }
function parseCSVText(text){
  const lines=(text||'').replace(/\r/g,'').split('\n').filter(l=>l.trim().length);
  if(!lines.length) return [];
  const h=lines[0]; const cnt={',':(h.match(/,/g)||[]).length,';':(h.match(/;/g)||[]).length,'\t':(h.match(/\t/g)||[]).length};
  const sep=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  return lines.map(l=>splitCSVLine(l,sep));
}
function impIso(y,mo,d){ y=+y;mo=+mo;d=+d; if(!y||mo<1||mo>12||d<1||d>31) return null; if(y<100)y+=2000; return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function parseFlexDate(s){ s=(s||'').trim(); if(!s) return null; let m;
  if(m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)) return impIso(m[1],m[2],m[3]);
  if(m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)) return impIso(m[3],m[2],m[1]);
  return null; }
function detectMatches(rows){
  rows=(rows||[]).filter(r=>r.some(c=>(c||'').trim())); if(!rows.length) return [];
  const first=rows[0].map(c=>(c||'').toLowerCase());
  let dateCol=first.findIndex(c=>/data|date|giorno/.test(c));
  let oppCol=first.findIndex(c=>/avvers|squadra|contro|oppon|rivale/.test(c));
  const hasHeader=dateCol>=0||oppCol>=0;
  const body=hasHeader?rows.slice(1):rows;
  const cols=Math.max(...body.map(r=>r.length),0);
  if(dateCol<0){ let best=-1,bn=0; for(let c=0;c<cols;c++){ const n=body.filter(r=>parseFlexDate(r[c])).length; if(n>bn){bn=n;best=c;} } dateCol=best; }
  if(oppCol<0){ for(let c=0;c<cols;c++){ if(c===dateCol)continue; if(body.filter(r=>(r[c]||'').trim()&&!parseFlexDate(r[c])).length){ oppCol=c; break; } } }
  const out=[]; body.forEach(r=>{ const d=parseFlexDate(r[dateCol]); if(d){ const opp=(r[oppCol]||'').trim(); out.push({date:d,opponent:opp||'Avversario'}); } });
  return out;
}
async function loadXLSX(){ const m=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'); return m.default||m; }
function openImportMatches(){
  recurringCSS(); window.__imp={matches:[]};
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-file-import" style="color:var(--brand)"></i> Importa partite</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:10px">Una partita per riga: <b>Data, Avversario</b> (es. <code>12/10/2026, San Pio X</code>). Vanno bene le date tipo gg/mm/aaaa o aaaa-mm-gg. Puoi incollare direttamente da Excel/Fogli, oppure caricare un file CSV/XLSX.</p>
      <textarea class="imp-ta" id="imp-text" placeholder="12/10/2026, San Pio X&#10;19/10/2026, Ferrini&#10;26/10/2026, Volley Ozieri"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-ghost btn-sm" onclick="impAnalyzeText()"><i class="fa-solid fa-wand-magic-sparkles"></i> Analizza testo</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer"><i class="fa-solid fa-folder-open"></i> Carica file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style="display:none" onchange="impFile(this)"></label>
      </div>
      <div class="imp-prev" id="imp-preview"></div>
      <button class="btn btn-accent" id="imp-go" style="width:100%;margin-top:12px" disabled onclick="impConfirm()"><i class="fa-solid fa-check"></i> Importa le partite</button>
    </div>`, true);
}
function impShow(matches){
  window.__imp.matches=matches;
  const box=document.getElementById('imp-preview'), go=document.getElementById('imp-go');
  if(!matches.length){ if(box) box.innerHTML='<p class="hint" style="margin-top:12px">Nessuna partita riconosciuta. Controlla che ci siano una data e un avversario per riga.</p>'; if(go) go.disabled=true; return; }
  if(box) box.innerHTML=`<div style="font-size:.75rem;color:var(--muted);margin:12px 0 4px;font-weight:700">${matches.length} partite riconosciute</div>`+matches.map(m=>`<div class="imp-row"><span class="d">${fmtDate(m.date)}</span> <span>${m.opponent}</span></div>`).join('');
  if(go) go.disabled=false;
}
function impAnalyzeText(){ const t=document.getElementById('imp-text'); impShow(detectMatches(parseCSVText(t?t.value:''))); }
function impFile(input){
  const f=input.files[0]; if(!f) return; const name=(f.name||'').toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    const box=document.getElementById('imp-preview'); if(box) box.innerHTML='<p class="hint" style="margin-top:12px">Leggo il file Excel…</p>';
    const rd=new FileReader(); rd.onload=async()=>{ try{ const XLSX=await loadXLSX(); const wb=XLSX.read(new Uint8Array(rd.result),{type:'array'}); const csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]); impShow(detectMatches(parseCSVText(csv))); }catch(e){ if(box) box.innerHTML='<p class="hint" style="margin-top:12px">Non riesco a leggere il file Excel offline. Salvalo come CSV, oppure incolla il testo qui sopra.</p>'; } };
    rd.readAsArrayBuffer(f);
  } else { const rd=new FileReader(); rd.onload=()=>{ const t=document.getElementById('imp-text'); if(t) t.value=rd.result; impShow(detectMatches(parseCSVText(rd.result))); }; rd.readAsText(f); }
}
function impConfirm(){
  const list=(window.__imp&&window.__imp.matches)||[]; if(!list.length) return;
  list.forEach(m=>DB.events.push({id:uid(),type:'Partita',date:m.date,notes:m.opponent,result:null}));
  save(); closeModal();
  const d=new Date(list[0].date+'T00:00:00'); if(!isNaN(d.getTime())){ CAL_Y=d.getFullYear(); CAL_M=d.getMonth(); CAL_SEL=list[0].date; }
  renderCalendar(); toast(list.length+' partite importate');
}
/* ================= EDITOR ESERCIZI SUL CAMPO ================= */
let FE=null;
function feSideGet(){ try{ return localStorage.getItem('fe_side')==='right'?'right':'left'; }catch(e){ return 'left'; } }
function feSideSet(v){ try{ localStorage.setItem('fe_side',v); }catch(e){} }
function feToggleSide(){
  const o=document.getElementById('fe-overlay'); if(!o) return;
  const next = o.classList.contains('fe-side-right') ? 'left' : 'right';
  o.classList.toggle('fe-side-right', next==='right');
  feSideSet(next);
}
function openFieldEditor(exKey, exLabel){
  fieldEditorCSS();
  const sport=curSport();
  const saveIcon = exKey ? '<i class="fa-solid fa-floppy-disk"></i>' : '<i class="fa-solid fa-download"></i>';
  const saveLabel = exKey ? 'Salva' : 'Scarica';
  const side=feSideGet();
  const host=document.createElement('div'); host.id='fe-overlay'; host.className='fe-overlay'+(side==='right'?' fe-side-right':'');
  host.innerHTML=`
    <div class="fe-sidebar fe-sidebar-tools" id="fe-sidebar">
      <div class="fe-sidebar-inner">
        <button class="fe-side-toggle" onclick="feToggleSide()" title="Sposta le barre dall'altro lato"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>
        <div class="fe-vgroup">
          <button class="fe-vbtn" onclick="feAdd('player')" title="Nostro giocatore"><span class="fe-dot" style="background:#22C55E"></span><span class="fe-vlabel">Giocatore</span></button>
          <button class="fe-vbtn" onclick="feAdd('opp')" title="Avversario"><span class="fe-dot" style="background:#EF4444"></span><span class="fe-vlabel">Avversario</span></button>
          <button class="fe-vbtn" onclick="feAdd('ball')" title="Pallone"><i class="fa-solid fa-futbol"></i><span class="fe-vlabel">Pallone</span></button>
          <button class="fe-vbtn" onclick="feAdd('cone')" title="Cono"><span style="font-weight:900;color:#F97316">▲</span><span class="fe-vlabel">Cono</span></button>
        </div>
        <div class="fe-vgroup">
          <button class="fe-vbtn on" id="fe-move" onclick="feTool('move')" title="Sposta"><i class="fa-solid fa-up-down-left-right"></i><span class="fe-vlabel">Sposta</span></button>
          <button class="fe-vbtn" id="fe-arrow" onclick="feTool('arrow')" title="Freccia movimento"><i class="fa-solid fa-arrow-right-long"></i><span class="fe-vlabel">Freccia</span></button>
          <button class="fe-vbtn" id="fe-arrowd" onclick="feTool('arrowd')" title="Freccia passaggio (tratteggiata)"><i class="fa-solid fa-ellipsis"></i><span class="fe-vlabel">Passaggio</span></button>
          <button class="fe-vbtn" id="fe-zone" onclick="feTool('zone')" title="Zona colorata"><i class="fa-solid fa-vector-square"></i><span class="fe-vlabel">Zona</span></button>
          <button class="fe-vbtn" id="fe-erase" onclick="feTool('erase')" title="Elimina"><i class="fa-solid fa-eraser"></i><span class="fe-vlabel">Elimina</span></button>
        </div>
        <div class="fe-vgroup">
          <button class="fe-vbtn" onclick="feClear()" title="Pulisci fase corrente"><i class="fa-solid fa-trash-can"></i><span class="fe-vlabel">Pulisci</span></button>
          <button class="fe-vbtn fe-vbtn-accent" onclick="feSave()">${saveIcon}<span class="fe-vlabel">${saveLabel}</span></button>
          <button class="fe-vbtn" onclick="closeFieldEditor()" title="Chiudi"><i class="fa-solid fa-xmark"></i><span class="fe-vlabel">Chiudi</span></button>
        </div>
      </div>
    </div>
    <div class="fe-main">
      <div class="fe-canvas-wrap"><canvas id="fe-canvas"></canvas></div>
      <div class="fe-frames-bar">
        <button class="fe-fbtn" id="fe-fprev" onclick="feFramePrev()" title="Fase precedente"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="fe-flabel" id="fe-fdots">Fase 1/1</span>
        <button class="fe-fbtn" id="fe-fnext" onclick="feFrameNext()" title="Fase successiva"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="fe-fbtn" onclick="feMoveFrame(-1)" title="Sposta fase indietro"><i class="fa-solid fa-arrow-left-long"></i></button>
        <button class="fe-fbtn" onclick="feMoveFrame(1)" title="Sposta fase avanti"><i class="fa-solid fa-arrow-right-long"></i></button>
        <button class="fe-fbtn" id="fe-fadd" onclick="feAddFrame()" title="Aggiungi fase (copia quella corrente)"><i class="fa-solid fa-clone"></i></button>
        <button class="fe-fbtn" id="fe-fdel" onclick="feDeleteFrameCur()" title="Elimina questa fase"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      <input class="fe-cap-input" id="fe-frame-cap" placeholder="Didascalia di questa fase (facoltativa)" oninput="feSetCaption(this.value)">
      <div class="fe-hint">${exLabel?('Illustri: <b>'+exLabel+'</b> · '):''}Tocca un elemento per aggiungerlo · trascina per spostare · la freccia disegna i movimenti</div>
    </div>
    <div class="fe-sidebar fe-sidebar-colors">
      <div class="fe-sidebar-inner">
        <span class="fe-vlabel" style="opacity:.6">Colore</span>
        <div class="fe-cswatches">
          <button class="fe-csw auto on" data-c="" onclick="feSetColor(null)" title="Predefinito">Auto</button>
          ${Object.entries(ZONE_COLORS).map(([k,hex])=>`<button class="fe-csw" data-c="${hex}" style="background:${hex}${hex==='#FFFFFF'?';border-color:rgba(0,0,0,.35)':''}" onclick="feSetColor('${hex}')" title="${k}"></button>`).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);
  const cv=document.getElementById('fe-canvas'), wrap=host.querySelector('.fe-canvas-wrap');
  const rect=wrap.getBoundingClientRect();
  const W=Math.max(220,Math.min(rect.width-20, 520)), H=Math.max(300,Math.min(rect.height-20, W*1.5));
  const dpr=window.devicePixelRatio||1;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px';
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  FE={sport,tool:'move',elements:[],arrows:[],zones:[],seq:{player:0,opp:0},cv,ctx,W,H,drag:null,dragZone:null,resizeZone:null,arrowStart:null,exKey:exKey||null,color:null,
      frames:[{elements:[],arrows:[],zones:[],cap:''}],curFrame:0};
  feBindPointer(); feRedraw(); feRenderFramesBar();
  if(exKey){ cIdbGet('exdraw:'+exKey).then(raw=>{ if(!FE)return;
    if(raw){
      try{
        const m=JSON.parse(raw);
        if(m.frames||m.E){ feLoadExerciseObj(m); }
        else { FE.elements=m.elements||[]; FE.arrows=m.arrows||[]; FE.zones=[]; FE.frames=[{elements:FE.elements,arrows:FE.arrows,zones:FE.zones,cap:''}]; FE.curFrame=0; FE.seq=feRecomputeSeq(FE.elements); feRedraw(); feRenderFramesBar(); }
      }catch(e){}
    } else {
      const nm=exKey.split('|').slice(2).join('|'); const s=((window.EX_SCHEMES&&window.EX_SCHEMES[FE.sport])||[]).find(x=>x.name.toLowerCase()===nm);
      if(s) feApplyModelObj(s);
    }
  }); }
}
function closeFieldEditor(){ const o=document.getElementById('fe-overlay'); if(o) o.remove(); FE=null; }
function feTool(t){ FE.tool=t; ['move','arrow','arrowd','erase','zone'].forEach(x=>{const b=document.getElementById('fe-'+x); if(b) b.classList.toggle('on',x===t);}); }
function feAdd(type){ const n=(type==='player'||type==='opp')?(++FE.seq[type]):0; const el={type,x:FE.W/2,y:FE.H/2,n}; if(FE.color) el.c=FE.color; FE.elements.push(el); feRedraw(); }
function feSetColor(c){ FE.color=c||null; document.querySelectorAll('.fe-csw').forEach(b=>b.classList.toggle('on',(b.dataset.c||null)===FE.color)); }
function feClear(){ FE.elements=[]; FE.arrows=[]; FE.zones=[]; FE.seq={player:0,opp:0}; feRedraw(); }
function feField(ctx,W,H,sport){
  ctx.fillStyle = sport==='basket' ? '#b5763b' : '#1f7a43'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=2;
  if(sport==='basket'){
    // riusa courtRect() (stesse proporzioni reali 28x15 della Lavagnetta Tattica), non il vecchio rettangolo storpiato
    const R=courtRect(W,H,'basket'), rx=R.x, ry=R.y, rw=R.w, rh=R.h, cx=rx+rw/2, cy=ry+rh/2;
    ctx.strokeRect(rx,ry,rw,rh);
    ctx.beginPath();ctx.moveTo(rx,cy);ctx.lineTo(rx+rw,cy);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,rw*0.13,0,Math.PI*2);ctx.stroke();
    const kw=rw*0.36,kx=cx-kw/2,kh=rh*0.19;
    ctx.strokeRect(kx,ry,kw,kh); ctx.strokeRect(kx,ry+rh-kh,kw,kh);
    ctx.beginPath();ctx.arc(cx,ry+kh,kw*0.5,0,Math.PI);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,ry+rh-kh,kw*0.5,Math.PI,Math.PI*2);ctx.stroke();
    return;
  }
  const m=10, rx=m, ry=m, rw=W-2*m, rh=H-2*m, cx=rx+rw/2, cy=ry+rh/2;
  ctx.strokeRect(rx,ry,rw,rh);
  ctx.beginPath();ctx.moveTo(rx,cy);ctx.lineTo(rx+rw,cy);ctx.stroke();
  if(sport==='pallavolo'){
    ctx.setLineDash([6,6]);ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(rx,ry+rh/3);ctx.lineTo(rx+rw,ry+rh/3);ctx.stroke();
    ctx.beginPath();ctx.moveTo(rx,ry+rh*2/3);ctx.lineTo(rx+rw,ry+rh*2/3);ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const bw=rw*0.5,bx=cx-bw/2,bh=rh*0.16; ctx.beginPath();ctx.arc(cx,cy,rw*0.13,0,Math.PI*2);ctx.stroke();
    ctx.strokeRect(bx,ry,bw,bh); ctx.strokeRect(bx,ry+rh-bh,bw,bh);
  }
}
function feDrawEl(ctx,el){
  ctx.save();
  if(el.type==='cone'){ ctx.fillStyle=el.c||'#F97316'; ctx.beginPath(); ctx.moveTo(el.x,el.y-13); ctx.lineTo(el.x-11,el.y+10); ctx.lineTo(el.x+11,el.y+10); ctx.closePath(); ctx.fill(); ctx.restore(); return; }
  if(el.type==='ball'){ ctx.fillStyle=el.c||'#fff'; ctx.strokeStyle='#111'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(el.x,el.y,8,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore(); return; }
  ctx.fillStyle = el.c || (el.type==='opp' ? '#EF4444' : '#22C55E');
  ctx.beginPath(); ctx.arc(el.x,el.y,16,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 15px Outfit,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(el.n),el.x,el.y);
  ctx.restore();
}
function feDrawArrow(ctx,a){
  const x1=a.from[0],y1=a.from[1],x2=a.to[0],y2=a.to[1], col=a.c||'#FACC15';
  ctx.save(); ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=3;
  if(a.dashed) ctx.setLineDash([8,6]);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([]);
  const ang=Math.atan2(y2-y1,x2-x1), hl=13;
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-hl*Math.cos(ang-0.4),y2-hl*Math.sin(ang-0.4)); ctx.lineTo(x2-hl*Math.cos(ang+0.4),y2-hl*Math.sin(ang+0.4)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const ZONE_COLORS={red:'#EF4444',green:'#22C55E',yellow:'#FACC15',blue:'#3B82F6',white:'#FFFFFF',black:'#111111'};
function feDrawZone(ctx,z){
  ctx.save();
  ctx.fillStyle=hexA(ZONE_COLORS[z.c]||ZONE_COLORS.green,.28);
  ctx.fillRect(z.x,z.y,z.w,z.h);
  ctx.strokeStyle=ZONE_COLORS[z.c]||ZONE_COLORS.green; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
  ctx.strokeRect(z.x,z.y,z.w,z.h); ctx.setLineDash([]);
  ctx.restore();
}
function feDrawZoneHandle(ctx,z){
  ctx.save(); ctx.fillStyle=ZONE_COLORS[z.c]||ZONE_COLORS.green;
  ctx.beginPath(); ctx.arc(z.x+z.w,z.y+z.h,6,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function feRedraw(){
  const {ctx,W,H,sport}=FE; ctx.clearRect(0,0,W,H); feField(ctx,W,H,sport);
  FE.zones.forEach(z=>feDrawZone(ctx,z));
  FE.arrows.forEach(a=>feDrawArrow(ctx,a));
  FE.elements.forEach(el=>feDrawEl(ctx,el));
  if(FE.tool==='move'||FE.tool==='zone') FE.zones.forEach(z=>feDrawZoneHandle(ctx,z));
}
function feHit(x,y){ for(let i=FE.elements.length-1;i>=0;i--){ const e=FE.elements[i]; if(Math.hypot(e.x-x,e.y-y)<=18) return i; } return -1; }
function feHitZone(x,y){ for(let i=FE.zones.length-1;i>=0;i--){ const z=FE.zones[i]; if(x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h) return i; } return -1; }
function feHitZoneHandle(x,y){ for(let i=FE.zones.length-1;i>=0;i--){ const z=FE.zones[i]; if(Math.hypot(x-(z.x+z.w),y-(z.y+z.h))<=14) return i; } return -1; }
function feDistToSeg(px,py,a,b){ const x1=a[0],y1=a[1],x2=b[0],y2=b[1],dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1; let t=((px-x1)*dx+(py-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); return Math.hypot(px-(x1+t*dx),py-(y1+t*dy)); }
function feHitArrow(x,y){ let best=-1,bd=14; FE.arrows.forEach((a,i)=>{ const d=feDistToSeg(x,y,a.from,a.to); if(d<bd){bd=d;best=i;} }); return best; }
function feEraseArrow(x,y){ let best=-1,bd=16; FE.arrows.forEach((a,i)=>{ const d=feDistToSeg(x,y,a.from,a.to); if(d<bd){bd=d;best=i;} }); if(best>=0){ FE.arrows.splice(best,1); feRedraw(); } }
function feBindPointer(){
  const cv=FE.cv;
  const pos=e=>{ const r=cv.getBoundingClientRect(); return [ (e.clientX-r.left)*(FE.W/r.width), (e.clientY-r.top)*(FE.H/r.height) ]; };
  let downPos=null, tapEl=null, tapArrow=null;
  cv.addEventListener('pointerdown',e=>{ const p=pos(e),x=p[0],y=p[1]; downPos=[x,y]; tapEl=null; tapArrow=null;
    if(FE.tool==='move'){
      const zh=feHitZoneHandle(x,y);
      if(zh>=0){ FE.resizeZone={i:zh}; }
      else{ const i=feHit(x,y); if(i>=0){ FE.drag={i,dx:FE.elements[i].x-x,dy:FE.elements[i].y-y}; tapEl=i; }
        else { const zi=feHitZone(x,y); if(zi>=0) FE.dragZone={i:zi,dx:FE.zones[zi].x-x,dy:FE.zones[zi].y-y};
          else { const ai=feHitArrow(x,y); if(ai>=0) tapArrow=ai; } } }
    }
    else if(FE.tool==='erase'){ const i=feHit(x,y); if(i>=0){ FE.elements.splice(i,1); feRedraw(); } else { const zi=feHitZone(x,y); if(zi>=0){ FE.zones.splice(zi,1); feRedraw(); } else feEraseArrow(x,y); } }
    else if(FE.tool==='zone'){
      const zi=feHitZone(x,y);
      if(zi>=0) openZoneEdit(zi);
      else { const zc=Object.keys(ZONE_COLORS).find(k=>ZONE_COLORS[k]===FE.color)||'green'; FE.zones.push({x:x-50,y:y-75,w:100,h:150,c:zc}); feRedraw(); openZoneEdit(FE.zones.length-1); }
    }
    else FE.arrowStart=[x,y];
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  cv.addEventListener('pointermove',e=>{ const p=pos(e),x=p[0],y=p[1];
    if(FE.tool==='move'&&FE.drag){ const el=FE.elements[FE.drag.i]; el.x=x+FE.drag.dx; el.y=y+FE.drag.dy; feRedraw(); }
    else if(FE.tool==='move'&&FE.dragZone){ const z=FE.zones[FE.dragZone.i]; z.x=x+FE.dragZone.dx; z.y=y+FE.dragZone.dy; feRedraw(); }
    else if(FE.tool==='move'&&FE.resizeZone){ const z=FE.zones[FE.resizeZone.i]; z.w=Math.max(20,x-z.x); z.h=Math.max(20,y-z.y); feRedraw(); }
    else if((FE.tool==='arrow'||FE.tool==='arrowd')&&FE.arrowStart){ feRedraw(); feDrawArrow(FE.ctx,{from:FE.arrowStart,to:[x,y],dashed:FE.tool==='arrowd',c:FE.color}); }
  });
  cv.addEventListener('pointerup',e=>{ const p=pos(e),x=p[0],y=p[1];
    if(FE.tool==='move'){
      const moved = !downPos || Math.hypot(x-downPos[0],y-downPos[1])>6;
      FE.drag=null; FE.dragZone=null; FE.resizeZone=null;
      if(!moved){ if(tapEl!=null) openElColor(tapEl); else if(tapArrow!=null) openArrowColor(tapArrow); }
    }
    else if((FE.tool==='arrow'||FE.tool==='arrowd')&&FE.arrowStart){ if(Math.hypot(x-FE.arrowStart[0],y-FE.arrowStart[1])>10){ const a={from:FE.arrowStart,to:[x,y],dashed:FE.tool==='arrowd'}; if(FE.color) a.c=FE.color; FE.arrows.push(a); } FE.arrowStart=null; feRedraw(); }
  });
}
function feRecomputeSeq(els){ const s={player:0,opp:0}; (els||[]).forEach(e=>{ if((e.type==='player'||e.type==='opp')&&e.n>s[e.type]) s[e.type]=e.n; }); return s; }
function hexA(hex,a){ hex=(hex||'').replace('#',''); if(hex.length===3)hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); if(isNaN(n))return hex; return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }
function schemeExists(sport,name){ name=(name||'').toLowerCase(); return !!((window.EX_SCHEMES&&window.EX_SCHEMES[sport])||[]).find(x=>x.name.toLowerCase()===name); }
/* ---- Selettore colore condiviso (elementi/frecce) ---- */
function feColorSwatches(activeHex,fnName,idx){
  const auto=`<button onclick="${fnName}(${idx},null)" title="Predefinito" style="width:44px;height:44px;border-radius:10px;cursor:pointer;border:2px solid ${!activeHex?'#fff':'transparent'};background:repeating-conic-gradient(#8888 0% 25%,transparent 0% 50%) 0/12px 12px"></button>`;
  const swatches=Object.values(ZONE_COLORS).map(hex=>`<button onclick="${fnName}(${idx},'${hex}')" title="${hex}" style="width:44px;height:44px;border-radius:10px;cursor:pointer;border:2px solid ${activeHex===hex?'#fff':'transparent'};background:${hex}"></button>`).join('');
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${auto}${swatches}</div>`;
}
/* ---- Zone: modifica colore / elimina ---- */
function openZoneEdit(i){
  const z=FE.zones[i]; if(!z) return;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-vector-square" style="color:var(--brand)"></i> Zona campo</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:10px">Scegli il colore della zona. Trascina il centro per spostarla, il pallino in basso a destra per ridimensionarla.</p>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        ${Object.keys(ZONE_COLORS).map(c=>`<button onclick="feZoneColor(${i},'${c}')" title="${c}" style="width:44px;height:44px;border-radius:10px;cursor:pointer;border:2px solid ${z.c===c?'#fff':'transparent'};background:${ZONE_COLORS[c]}"></button>`).join('')}
      </div>
      <button class="btn btn-danger" style="width:100%" onclick="feZoneDelete(${i})"><i class="fa-solid fa-trash-can"></i> Elimina zona</button>
    </div>`);
}
function feZoneColor(i,c){ if(FE.zones[i]) FE.zones[i].c=c; feRedraw(); closeModal(); }
function feZoneDelete(i){ FE.zones.splice(i,1); feRedraw(); closeModal(); }
/* ---- Elemento (giocatore/avversario/birillo/palla): modifica colore ---- */
function openElColor(i){
  const el=FE.elements[i]; if(!el) return;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-palette" style="color:var(--brand)"></i> Colore elemento</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:10px">Scegli il colore di questo elemento, oppure torna al predefinito.</p>
      ${feColorSwatches(el.c||null,'feElColor',i)}
    </div>`);
}
function feElColor(i,c){ const el=FE.elements[i]; if(el){ if(c) el.c=c; else delete el.c; } feRedraw(); closeModal(); }
/* ---- Freccia: modifica colore ---- */
function openArrowColor(i){
  const a=FE.arrows[i]; if(!a) return;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-palette" style="color:var(--brand)"></i> Colore freccia</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:10px">Scegli il colore di questa freccia, oppure torna al predefinito.</p>
      ${feColorSwatches(a.c||null,'feArrowColor',i)}
    </div>`);
}
function feArrowColor(i,c){ const a=FE.arrows[i]; if(a){ if(c) a.c=c; else delete a.c; } feRedraw(); closeModal(); }
/* ---- FASI (storyboard): conversione normalizzata 400x600 <-> spazio canvas corrente ---- */
const FE_MAX_FRAMES=6;
function feToNormFrame(elements,arrows,zones,W,H,cap){
  const sx=400/W, sy=600/H, E=[];
  (zones||[]).forEach(z=>E.push({t:'zone',x:+(z.x*sx).toFixed(1),y:+(z.y*sy).toFixed(1),w:+(z.w*sx).toFixed(1),h:+(z.h*sy).toFixed(1),c:z.c}));
  (elements||[]).forEach(e=>E.push({t:e.type,x:+(e.x*sx).toFixed(1),y:+(e.y*sy).toFixed(1),n:e.n,c:e.c}));
  const A=(arrows||[]).map(a=>({f:[+(a.from[0]*sx).toFixed(1),+(a.from[1]*sy).toFixed(1)],p:[+(a.to[0]*sx).toFixed(1),+(a.to[1]*sy).toFixed(1)],d:a.dashed?1:0,c:a.c}));
  return {E,A,cap:cap||''};
}
function feFromNormFrame(fr,W,H){
  const sx=W/400, sy=H/600, elements=[], zones=[];
  (fr.E||[]).forEach(e=>{ if(e.t==='zone') zones.push({x:e.x*sx,y:e.y*sy,w:e.w*sx,h:e.h*sy,c:e.c||'green'}); else { const el={type:e.t,x:e.x*sx,y:e.y*sy,n:e.n}; if(e.c) el.c=e.c; elements.push(el); } });
  const arrows=(fr.A||[]).map(a=>{ const ar={from:[a.f[0]*sx,a.f[1]*sy],to:[a.p[0]*sx,a.p[1]*sy],dashed:!!a.d}; if(a.c) ar.c=a.c; return ar; });
  return {elements,arrows,zones,cap:fr.cap||''};
}
function feFramesFromObj(obj,W,H){
  const list=(obj&&obj.frames&&obj.frames.length)?obj.frames:[{E:(obj&&obj.E)||[],A:(obj&&obj.A)||[],cap:(obj&&obj.cap)||''}];
  return list.map(fr=>feFromNormFrame(fr,W,H));
}
function feLoadExerciseObj(obj){ if(!FE) return; FE.frames=feFramesFromObj(obj,FE.W,FE.H); feApplyFrame(0); }
function feApplyFrame(i){
  if(!FE||!FE.frames||!FE.frames.length) return;
  i=Math.max(0,Math.min(FE.frames.length-1,i)); FE.curFrame=i;
  const fr=FE.frames[i];
  FE.elements=(fr.elements||[]).map(e=>({...e}));
  FE.arrows=(fr.arrows||[]).map(a=>({from:a.from.slice(),to:a.to.slice(),dashed:a.dashed,c:a.c}));
  FE.zones=(fr.zones||[]).map(z=>({...z}));
  FE.seq=feRecomputeSeq(FE.elements);
  feRedraw(); feRenderFramesBar();
}
function feSyncCurFrame(){
  if(!FE||!FE.frames||!FE.frames.length) return;
  const cap=(FE.frames[FE.curFrame]&&FE.frames[FE.curFrame].cap)||'';
  FE.frames[FE.curFrame]={
    elements:FE.elements.map(e=>({...e})),
    arrows:FE.arrows.map(a=>({from:a.from.slice(),to:a.to.slice(),dashed:a.dashed,c:a.c})),
    zones:FE.zones.map(z=>({...z})), cap
  };
}
function feGotoFrame(i){ if(!FE||!FE.frames||i<0||i>=FE.frames.length) return; feSyncCurFrame(); feApplyFrame(i); }
function feFramePrev(){ feGotoFrame(FE.curFrame-1); }
function feFrameNext(){ feGotoFrame(FE.curFrame+1); }
function feAddFrame(){
  if(!FE) return;
  if(FE.frames.length>=FE_MAX_FRAMES){ toast('Massimo '+FE_MAX_FRAMES+' fasi','info'); return; }
  feSyncCurFrame();
  const cur=FE.frames[FE.curFrame];
  const clone={elements:cur.elements.map(e=>({...e})),arrows:cur.arrows.map(a=>({from:a.from.slice(),to:a.to.slice(),dashed:a.dashed,c:a.c})),zones:cur.zones.map(z=>({...z})),cap:''};
  FE.frames.splice(FE.curFrame+1,0,clone);
  feApplyFrame(FE.curFrame+1);
}
function feDeleteFrameCur(){
  if(!FE||FE.frames.length<=1){ toast('Deve restare almeno una fase','info'); return; }
  confirmAction('Eliminare questa fase?',()=>{ FE.frames.splice(FE.curFrame,1); feApplyFrame(Math.min(FE.curFrame,FE.frames.length-1)); });
}
function feMoveFrame(dir){
  if(!FE) return;
  const i=FE.curFrame, j=i+dir; if(j<0||j>=FE.frames.length) return;
  feSyncCurFrame();
  const tmp=FE.frames[i]; FE.frames[i]=FE.frames[j]; FE.frames[j]=tmp;
  FE.curFrame=j; feRenderFramesBar();
}
function feSetCaption(v){ if(FE&&FE.frames&&FE.frames[FE.curFrame]) FE.frames[FE.curFrame].cap=v; }
function feRenderFramesBar(){
  if(!FE) return;
  const lbl=document.getElementById('fe-fdots'), cap=document.getElementById('fe-frame-cap'); if(!lbl) return;
  const n=FE.frames.length;
  lbl.textContent='Fase '+(FE.curFrame+1)+'/'+n;
  if(cap) cap.value=(FE.frames[FE.curFrame]&&FE.frames[FE.curFrame].cap)||'';
  const prevBtn=document.getElementById('fe-fprev'); if(prevBtn) prevBtn.disabled=FE.curFrame<=0;
  const nextBtn=document.getElementById('fe-fnext'); if(nextBtn) nextBtn.disabled=FE.curFrame>=n-1;
  const delBtn=document.getElementById('fe-fdel'); if(delBtn) delBtn.disabled=n<=1;
  const addBtn=document.getElementById('fe-fadd'); if(addBtn) addBtn.disabled=n>=FE_MAX_FRAMES;
}
function feApplyModelObj(s){ if(!s||!FE)return; feLoadExerciseObj(s); }
function initSchemes(){ const S=window.EX_SCHEMES; if(!S)return; ['calcio','pallavolo','basket'].forEach(sp=>{ const list=S[sp]||[]; if(!list.length)return; if(SPORT_CATS[sp]&&SPORT_CATS[sp].indexOf('Schemi pronti')<0) SPORT_CATS[sp].push('Schemi pronti'); EXERCISE_LIB[sp]=EXERCISE_LIB[sp]||{}; EXERCISE_LIB[sp]['Schemi pronti']=list.map(x=>x.name); }); CAT_COLOR['Schemi pronti']='#5b9dff'; }
function feOpenPresets(){
  const list=(window.EX_SCHEMES&&window.EX_SCHEMES[FE.sport])||[];
  if(!list.length){ toast('Nessuno schema per questo sport','info'); return; }
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-book" style="color:var(--brand)"></i> Schemi pronti</h3><button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body"><p class="hint" style="margin-bottom:10px">Scegli uno schema: si carica sul campo, poi lo modifichi e salvi come vuoi.</p>
    <div class="sub-list">${list.map((s,i)=>`<button class="sub-opt" style="flex-direction:column;align-items:flex-start;gap:2px" onclick="feApplyModel(${i});closeModal()"><b>${s.name}</b>${s.desc?`<span style="color:var(--muted);font-weight:400;font-size:.82rem">${s.desc}</span>`:''}</button>`).join('')}</div></div>`, true);
}
function feApplyModel(i){
  const s=((window.EX_SCHEMES&&window.EX_SCHEMES[FE.sport])||[])[i]; if(!s||!FE) return;
  feLoadExerciseObj(s);
}
function exKeyOf(sport,cat,name){ return (sport+'|'+cat+'|'+name).toLowerCase(); }
function openExerciseDraw(name,cat){ openFieldEditor(exKeyOf(curSport(),cat,name), name); }
async function feSave(){
  if(FE.exKey){
    try{ const png=FE.cv.toDataURL('image/png');
      feSyncCurFrame();
      const framesNorm=FE.frames.map(fr=>feToNormFrame(fr.elements,fr.arrows,fr.zones,FE.W,FE.H,fr.cap));
      const first=framesNorm[0]||{E:[],A:[]};
      const payload={sport:FE.sport,E:first.E,A:first.A,png};
      if(framesNorm.length>1) payload.frames=framesNorm;
      await cIdbSet('exdraw:'+FE.exKey, JSON.stringify(payload));
      DB.settings=DB.settings||{}; DB.settings.exDrawn=DB.settings.exDrawn||[];
      if(!DB.settings.exDrawn.includes(FE.exKey)) DB.settings.exDrawn.push(FE.exKey);
      save(); toast("Disegno salvato nell'esercizio"); closeFieldEditor();
      if(document.getElementById('exlib-list')) renderExLibList();
    }catch(e){ toast('Non riesco a salvare qui','info'); }
  } else {
    try{ const url=FE.cv.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download='esercizio.png'; document.body.appendChild(a); a.click(); a.remove(); toast('Schema salvato come immagine'); }
    catch(e){ toast('Non riesco a salvare qui','info'); }
  }
}
function fieldEditorCSS(){
  if(document.getElementById('fe-css')) return;
  const st=document.createElement('style'); st.id='fe-css';
  st.textContent=`
  .fe-overlay{position:fixed;inset:0;z-index:9999;background:#0b0f1a;display:flex;flex-direction:row;}
  .fe-sidebar{flex:0 0 auto;width:78px;background:#0a1020;display:flex;flex-direction:column;padding:8px 6px;overflow-y:auto;}
  .fe-sidebar-tools{order:1;border-right:1px solid rgba(255,255,255,.1);}
  .fe-sidebar-colors{order:3;border-left:1px solid rgba(255,255,255,.1);}
  .fe-overlay.fe-side-right .fe-sidebar-tools{order:3;border-right:none;border-left:1px solid rgba(255,255,255,.1);}
  .fe-overlay.fe-side-right .fe-sidebar-colors{order:1;border-left:none;border-right:1px solid rgba(255,255,255,.1);}
  .fe-sidebar-inner{display:flex;flex-direction:column;gap:10px;width:100%;margin:auto 0;flex:0 0 auto;}
  .fe-side-toggle{flex:0 0 auto;min-height:40px;width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.95rem;}
  .fe-vgroup{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);}
  .fe-vgroup:first-of-type{border-top:none;padding-top:0;}
  .fe-vbtn{min-height:52px;width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:1rem;padding:6px 2px;}
  .fe-vbtn.on{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 24%,transparent);}
  .fe-vbtn-accent{border-color:var(--brand);background:var(--brand);color:#04140a;font-weight:800;}
  .fe-vlabel{font-size:.56rem;font-weight:700;line-height:1;text-align:center;white-space:nowrap;}
  .fe-cswatches{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;}
  .fe-csw{width:100%;aspect-ratio:1;border-radius:7px;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0;color:#fff;font-size:.5rem;font-weight:800;}
  .fe-csw.on{border-color:#fff;box-shadow:0 0 0 2px var(--brand);}
  .fe-csw.auto{background:repeating-conic-gradient(rgba(255,255,255,.25) 0% 25%,transparent 0% 50%) 0/10px 10px;}
  .fe-dot{width:16px;height:16px;border-radius:50%;display:inline-block;border:2px solid #fff;}
  .fe-main{order:2;flex:1;min-width:0;display:flex;flex-direction:column;}
  .fe-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden;}
  #fe-canvas{border-radius:12px;touch-action:none;box-shadow:0 10px 40px rgba(0,0,0,.5);}
  .fe-hint{text-align:center;color:rgba(255,255,255,.5);font-size:.76rem;padding:8px 12px 12px;}
  .fe-frames-bar{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;padding:6px 12px 0;}
  .fe-fbtn{width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.85rem;}
  .fe-fbtn:disabled{opacity:.3;cursor:default;}
  .fe-flabel{color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:.85rem;min-width:80px;text-align:center;}
  .fe-cap-input{display:block;width:calc(100% - 24px);margin:8px 12px 0;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#fff;font-size:.85rem;}`;
  document.head.appendChild(st);
}
function addEvent(e){
    e.preventDefault();
    const date=document.getElementById('e-date').value;
    DB.events.push({id:uid(),type:document.getElementById('e-type').value,date,
        notes:document.getElementById('e-notes').value.trim(),result:null});
    save();e.target.reset();
    const d=new Date(date); if(!isNaN(d.getTime())){ CAL_Y=d.getFullYear(); CAL_M=d.getMonth(); CAL_SEL=date; }
    renderCalendar();toast('Evento aggiunto');
}
function removeEvent(id){
    confirmAction('Eliminare questo evento dal calendario?',()=>{DB.events=DB.events.filter(e=>e.id!==id);save();renderCalendar();toast('Evento rimosso','info');});
}
function editResult(id){
    const ev=DB.events.find(e=>e.id===id);const r=ev.result||{w:0,l:0};
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-flag-checkered" style="color:var(--brand)"></i> Risultato</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><p style="color:var(--muted);margin-bottom:1rem">${ev.notes} · ${fmtDateLong(ev.date)}</p>
        <div class="result-box"><div class="set-score">
            <div style="text-align:center"><label style="font-size:.7rem;color:var(--muted);text-transform:uppercase">Noi</label><br><input id="r-w" type="number" min="0" max="3" value="${r.w}"></div>
            <span style="font-size:1.4rem;color:var(--muted)">–</span>
            <div style="text-align:center"><label style="font-size:.7rem;color:var(--muted);text-transform:uppercase">Loro</label><br><input id="r-l" type="number" min="0" max="3" value="${r.l}"></div>
        </div></div>
        <div class="modal-buttons"><button class="btn btn-ghost" onclick="closeModal()">Annulla</button>
        <button class="btn btn-accent" onclick="saveResult(${id})">Salva risultato</button></div></div>`);
}
function saveResult(id){
    const ev=DB.events.find(e=>e.id===id);
    ev.result={w:parseInt(document.getElementById('r-w').value)||0,l:parseInt(document.getElementById('r-l').value)||0};
    save();closeModal();renderCalendar();toast('Risultato salvato');
}

/* =========================================================
   SCOUT GARA
   ========================================================= */
function matchOptions(selId){
    const sel=document.getElementById(selId);
    const cur=sel.value;
    sel.innerHTML='<option value="">Scegli una partita…</option>';
    DB.events.filter(e=>e.type==='Partita').sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(m=>{
        const o=document.createElement('option');o.value=m.id;o.textContent=`${fmtDate(m.date)} · ${m.notes}`;sel.appendChild(o);
    });
    sel.value=cur;
}
function populateScout(){
    matchOptions('scout-select');
    const summaryEl=document.getElementById('scout-rot-summary'), rotEl=document.getElementById('scout-rot');
    if(rotEl) rotEl.style.display='none';
    if(curSport()==='pallavolo'){ renderRotAggregate(); if(summaryEl)summaryEl.style.display='block'; }
    else if(summaryEl){ summaryEl.style.display='none'; }
}
function buildScoutHead(sport){
    const gs=SCOUT[sport].groups, head=document.getElementById('scout-head');
    let r1='<tr><th rowspan="2" style="text-align:left">Giocatore</th>';
    let r2='<tr>';
    gs.forEach(g=>{
        if(g.label){ r1+=`<th colspan="${g.fields.length}">${g.label}</th>`; g.fields.forEach(f=>r2+=`<th>${f[1]}</th>`); }
        else { g.fields.forEach(f=>{ r1+=`<th rowspan="2">${f[1]}</th>`; }); }
    });
    r1+='<th rowspan="2">Voto</th></tr>'; r2+='</tr>';
    head.innerHTML=r1+r2;
}
const SCOUT_ABBR={
  Ace:'Ace (servizio punto)',Err:'Errore',Tot:'Totale',Pos:'Positiva',Prf:'Perfetta',Pt:'Punto',
  Ass:'Assist','In porta':'Tiri in porta',Amm:'Ammonizione',Esp:'Espulsione',Subiti:'Gol subiti',Min:'Minuti',
  Off:'Rimbalzi offensivi',Dif:'Rimbalzi difensivi',Rub:'Palle rubate',Perse:'Palle perse',Stop:'Stoppate',
  Fatti:'Realizzati',Tent:'Tentati',
  'Tiro P.':'Tiro in porta (anche senza segnare)',Drib:'Dribbling riuscito',Contr:'Contrasto vinto',
  Interc:'Intercetto',Chius:'Chiusura efficace',Falli:'Fallo','P.Persa':'Palla persa',
  Parate:'Parata',Uscite:'Uscita vinta',Resp:'Respinta',Sub:'Gol subito'
};
function renderScoutLegend(sport){
  const el=document.getElementById('scout-legend'); if(!el) return;
  let items='';
  if(sport==='pallavolo'){
    const sym=[['#','Perfetto'],['+','Positivo'],['!','Ok'],['−','Negativo'],['=','Errore']];
    items=`<div class="legend-item" style="grid-column:1/-1"><strong>SIMBOLI</strong> `+
      sym.map(s=>`<b>${s[0]}</b> ${s[1]}`).join(' · ')+`</div>`;
  } else {
    const groups=(SCOUT[sport].groups||[]).map(g=>{
      const fs=g.fields.map(f=>SCOUT_ABBR[f[1]]?`<b>${f[1]}</b>=${SCOUT_ABBR[f[1]]}`:`<b>${f[1]}</b>`)
        .filter(Boolean).join(' · ');
      return g.label?`<div class="legend-item"><strong>${g.label}</strong>${fs}</div>`:`<div class="legend-item">${fs}</div>`;
    }).join('');
    items=groups;
  }
  el.innerHTML=items+`<div class="legend-item" style="grid-column:1/-1"><strong>NOTA</strong>${SCOUT[sport].note||''}</div>`;
}
function setupScout(){
    const id=parseInt(document.getElementById('scout-select').value);
    const panel=document.getElementById('scout-panel'), body=document.getElementById('scout-body');
    const sport=curSport();
    const summaryEl=document.getElementById('scout-rot-summary'), rotEl=document.getElementById('scout-rot');
    if(!id){
        panel.style.display='none';
        renderSubsPanel(null);
        if(sport==='pallavolo'){ renderRotAggregate(); if(summaryEl)summaryEl.style.display='block'; }
        else if(summaryEl){ summaryEl.style.display='none'; }
        return;
    }
    if(summaryEl) summaryEl.style.display='none';   /* partita aperta → nascondi il riepilogo di squadra */
    const match=DB.events.find(e=>e.id===id);
    const existing=DB.scoutHistory.find(s=>s.matchId===id);
    document.getElementById('scout-title').innerHTML=`<i class="fa-solid fa-clipboard-list"></i> ${match.notes} · ${fmtDate(match.date)}${existing?' <span class="pill" style="margin-left:8px">già registrato — modifica</span>':''}`;
    panel.style.display='block';
    renderSubsPanel(id);
    const numEl=document.getElementById('scout-numeric'), tapEl=document.getElementById('scout-tap');
    /* PALLAVOLO → scout a tocchi (versione A) + rotazioni di gara. BASKET → scout a tocchi
       (stepper). Calcio → tabella numerica (per ora). */
    if(sport==='pallavolo'){
        numEl.style.display='none'; tapEl.style.display='block';
        buildScoutTap(id, existing);
        if(rotEl){ rotEl.style.display='block'; renderRotGrid(id); }
        renderScoutLegend(sport);
        return;
    }
    if(sport==='basket'){
        numEl.style.display='none'; tapEl.style.display='block';
        buildScoutTapBasket(id, existing);
        if(rotEl) rotEl.style.display='none';
        renderScoutLegend(sport);
        return;
    }
    if(sport==='calcio'){
        numEl.style.display='none'; tapEl.style.display='block';
        buildScoutTapCalcio(id, existing);
        if(rotEl) rotEl.style.display='none';
        renderScoutLegend(sport);
        return;
    }
    numEl.style.display='block'; tapEl.style.display='none';
    if(rotEl) rotEl.style.display='none';
    buildScoutHead(sport);
    const fields=scoutFields(sport), colspan=fields.length+2;
    body.innerHTML='';
    const roster=activePlayers();
    if(!roster.length){body.innerHTML=`<tr class="empty-row"><td colspan="${colspan}">Nessun atleta disponibile in rosa.</td></tr>`;return;}
    roster.forEach(p=>{
        const ex=existing? existing.rows.find(r=>r.pId===p.id):null;
        const g=ex||blankStat(sport);
        const pre=p.isCaptain?'👑 ':p.isViceCaptain?'🥈 ':'';
        const cells=fields.map(k=>`<td><input data-k="${k}" type="number" min="0" value="${g[k]||0}" oninput="calcRow(${p.id})"></td>`).join('');
        const tr=document.createElement('tr');tr.dataset.pid=p.id;
        tr.innerHTML=`<td style="text-align:left;font-weight:600">#${p.number} ${pre}${p.name}</td>${cells}<td class="voto num" id="voto-${p.id}" style="color:var(--brand)">${ex?rowVoto(ex,sport).toFixed(1):"6.0"}</td>`;
        body.appendChild(tr);
    });
    renderScoutLegend(sport);
}
function readRow(id){
    const r=document.querySelector(`tr[data-pid="${id}"]`);
    const o={}; r.querySelectorAll('input[data-k]').forEach(inp=>o[inp.dataset.k]=parseInt(inp.value)||0);
    return o;
}
function calcRow(id){ document.getElementById('voto-'+id).textContent=computeVoto(readRow(id),null,(playerById(id)||{}).role).toFixed(1); }
function saveScout(){
    const id=parseInt(document.getElementById('scout-select').value);
    const match=DB.events.find(e=>e.id===id);
    const rows=[];
    document.querySelectorAll('#scout-body tr[data-pid]').forEach(tr=>{
        const pId=parseInt(tr.dataset.pid);const s=readRow(pId);
        rows.push({pId,...s,voto:+computeVoto(s,null,(playerById(pId)||{}).role).toFixed(1)});
    });
    DB.scoutHistory=DB.scoutHistory.filter(s=>s.matchId!==id);
    DB.scoutHistory.push({matchId:id,date:match.date,opponent:match.notes,sport:curSport(),rows});
    save();toast('Statistiche registrate nelle schede atleti');
    go('roster');
}

/* =========================================================
   SCOUT PALLAVOLO — versione A (tap giocatore → tap grado)
   I gradi Data Volley (# + ! − =) alimentano contatori precisi
   (Pos% ricezione, Eff% attacco) che passano allo STESSO voto
   pesato per ruolo (volleyVoto) e allo stesso DB.scoutHistory.
   ========================================================= */
const TAP_FUNDS = [
  ['R','Ricezione','fa-hands-catching'],
  ['A','Attacco','fa-volleyball'],
  ['B','Battuta','fa-bullseye'],
  ['M','Muro','fa-hand']
];
const TAP_GRADES = [
  ['#','Perfetto','g-perf'],
  ['+','Positivo','g-pos'],
  ['!','Ok','g-ok'],
  ['-','Negativo','g-neg'],
  ['=','Errore','g-err']
];
/* stato di sessione dello scout a tocchi */
let TAP = null;

/* mappa un tocco (fondamentale + grado) sui contatori del modello pallavolo */
function tapApply(o, fund, grade){
  if(fund==='R'){ o.rTot++; if(grade==='#')o.rPrf++; else if(grade==='+'||grade==='!')o.rPos++; }
  else if(fund==='A'){ o.aTot++; if(grade==='#')o.aPt++; else if(grade==='=')o.aErr++; }
  else if(fund==='B'){ if(grade==='#')o.bAce++; else if(grade==='=')o.bErr++; }
  else if(fund==='M'){ if(grade==='#'||grade==='+')o.mPt++; }
}
/* riga statistica derivata dai tocchi (base salvata + eventi di sessione) */
function tapDeriveRow(pId){
  const o=Object.assign(blankStat('pallavolo'), TAP.base[pId]||{});
  TAP.events.forEach(e=>{ if(e.pId===pId) tapApply(o,e.fund,e.grade); });
  return o;
}
function tapPct(row){
  const rec = row.rTot>0 ? Math.round((row.rPos+row.rPrf)/row.rTot*100) : null;
  const eff = row.aTot>0 ? Math.round((row.aPt-row.aErr)/row.aTot*100) : null;
  return {rec, eff};
}
function buildScoutTap(matchId, existing){
  scoutTapCSS();
  const base={}, override={};
  if(existing){ existing.rows.forEach(r=>{ const b=blankStat('pallavolo'); scoutFields('pallavolo').forEach(k=>b[k]=r[k]||0); base[r.pId]=b; if(typeof r.votoOverride==='number') override[r.pId]=r.votoOverride; }); }
  TAP={ matchId, base, override, events:[], sel:null, fund:'R', seq:1 };
  const el=document.getElementById('scout-tap');
  el.innerHTML=`
    <div class="stap-wrap">
      <div class="stap-left">
        <div class="stap-hint"><i class="fa-solid fa-hand-pointer"></i> Tocca un giocatore, poi tocca il grado del suo tocco.</div>
        <div class="stap-players" id="stap-players"></div>
      </div>
      <div class="stap-pad">
        <div class="stap-sel" id="stap-sel"></div>
        <div class="stap-funds" id="stap-funds"></div>
        <div class="stap-grades" id="stap-grades"></div>
        <div class="stap-detail" id="stap-detail"></div>
        <div class="stap-last" id="stap-last"></div>
        <button class="stap-undo" id="stap-undo" onclick="tapUndo()"><i class="fa-solid fa-rotate-left"></i> Annulla ultimo</button>
        <button class="btn btn-accent stap-save" onclick="saveScoutTap()"><i class="fa-solid fa-floppy-disk"></i> Registra statistiche</button>
        <div class="stap-legend">
          ${TAP_GRADES.map(g=>`<span class="stap-lg ${g[2]}"><b>${g[0]}</b> ${g[1]}</span>`).join('')}
        </div>
      </div>
    </div>`;
  document.getElementById('stap-funds').innerHTML=TAP_FUNDS.map(f=>
    `<button class="stap-fund${f[0]===TAP.fund?' on':''}" data-f="${f[0]}" onclick="tapFund('${f[0]}')"><i class="fa-solid ${f[2]}"></i> ${f[1]}</button>`).join('');
  document.getElementById('stap-grades').innerHTML=TAP_GRADES.map(g=>
    `<button class="stap-grade ${g[2]}" onclick="tapGrade('${g[0]}')"><b>${g[0]}</b><span>${g[1]}</span></button>`).join('');
  tapRenderPlayers();
  tapRenderSel();
}
function tapRenderPlayers(){
  const box=document.getElementById('stap-players'); if(!box) return;
  const roster=activePlayers().filter(p=>curSport()!=='pallavolo' || true);
  if(!roster.length){ box.innerHTML='<div class="empty-row" style="padding:1rem">Nessun atleta in rosa.</div>'; return; }
  box.innerHTML=roster.map(p=>{
    const row=tapDeriveRow(p.id), {rec,eff}=tapPct(row);
    const ov=TAP.override[p.id];
    const v=(typeof ov==='number')?ov:computeVoto(row,'pallavolo',p.role);
    const pre=p.isCaptain?'👑 ':p.isViceCaptain?'🥈 ':'';
    const vClass=v>=7?'hi':v>=5.5?'md':'lo';
    return `<button class="stap-player${TAP.sel===p.id?' sel':''}" onclick="tapSelect(${p.id})">
      <div class="stap-p-main"><span class="stap-num">#${p.number}</span><span class="stap-name">${pre}${p.name}</span><span class="stap-role">${p.role}</span></div>
      <div class="stap-p-stat"><span>Ric ${rec==null?'—':rec+'%'}</span><span>Att ${eff==null?'—':eff+'%'}</span><span class="stap-voto ${vClass}">${v.toFixed(1)}${typeof ov==='number'?'<i class="stap-ovm" title="voto manuale">M</i>':''}</span></div>
    </button>`;
  }).join('');
}
function tapRenderSel(){
  const sel=document.getElementById('stap-sel'); if(!sel) return;
  const p=TAP.sel?playerById(TAP.sel):null;
  sel.innerHTML = p
    ? `<span class="stap-sel-num">#${p.number}</span> <b>${p.name}</b> <span class="stap-sel-role">${p.role}</span>`
    : `<span class="stap-sel-empty">Seleziona un giocatore ↖</span>`;
  const on=!!p;
  document.querySelectorAll('.stap-grade').forEach(b=>b.disabled=!on);
  const undo=document.getElementById('stap-undo'); if(undo) undo.disabled=!TAP.events.length;
  const last=document.getElementById('stap-last');
  if(last){
    if(TAP.events.length){ const e=TAP.events[TAP.events.length-1]; const pl=playerById(e.pId); const fn=(TAP_FUNDS.find(f=>f[0]===e.fund)||[])[1]||e.fund;
      last.innerHTML=`Ultimo: <b>#${pl?pl.number:'?'}</b> · ${fn} · <b class="stap-lg-sym">${e.grade}</b>`; }
    else last.textContent='';
  }
  tapRenderDetail();
}
/* Dettaglio del giocatore selezionato: ogni tocco è una chip rimovibile singolarmente */
function tapRenderDetail(){
  const box=document.getElementById('stap-detail'); if(!box) return;
  if(!TAP.sel){ box.innerHTML=''; return; }
  const p=playerById(TAP.sel);
  const evs=TAP.events.filter(e=>e.pId===TAP.sel);
  const gClass=g=>(TAP_GRADES.find(x=>x[0]===g)||[])[2]||'';
  const fShort={R:'Ric',A:'Att',B:'Batt',M:'Muro'};
  const baseRow=TAP.base[TAP.sel];
  const baseInfo = baseRow ? (()=>{ const {rec,eff}=tapPct(baseRow); const bits=[];
      if(rec!=null)bits.push('Ric '+rec+'%'); if(eff!=null)bits.push('Att '+eff+'%');
      if(baseRow.mPt)bits.push(baseRow.mPt+' muri'); if(baseRow.bAce)bits.push(baseRow.bAce+' ace');
      return bits.length?`<div class="stap-base">Già registrato: ${bits.join(' · ')} <span class="stap-base-note">(aggregato, non rimovibile a tocco)</span></div>`:''; })() : '';
  const chips = evs.length
    ? evs.map(e=>`<button class="stap-chip ${gClass(e.grade)}" onclick="tapRemoveEvent(${e.id})" title="Rimuovi questo tocco">
         <span class="stap-chip-f">${fShort[e.fund]||e.fund}</span><b>${e.grade}</b><i class="fa-solid fa-xmark"></i></button>`).join('')
    : `<div class="stap-detail-empty">Nessun tocco registrato in questa sessione${baseRow?' (oltre a quelli già salvati)':''}.</div>`;
  box.innerHTML=`<div class="stap-detail-h">Tocchi di <b>#${p.number} ${p.name}</b> <span class="stap-detail-n">${evs.length}</span></div>${baseInfo}<div class="stap-chips">${chips}</div>`;
  /* PERCHÉ (scomposizione) + OVERRIDE manuale del mister */
  const row=tapDeriveRow(TAP.sel);
  const calc=computeVoto(row,'pallavolo',p.role);
  const why=computeWhy(row,'pallavolo',p.role);
  const ov=TAP.override[TAP.sel];
  const whyHtml = why && why.length
    ? `<div class="stap-why"><div class="stap-why-h">Perché <b>${calc.toFixed(1)}</b></div>`+
      why.map(w=>`<span class="stap-why-b">${w}</span>`).join('')+`</div>`
    : `<div class="stap-why"><div class="stap-why-h">Voto calcolato <b>${calc.toFixed(1)}</b></div></div>`;
  const ovHtml=`<div class="stap-ov">
      <label>Voto manuale del mister</label>
      <div class="stap-ov-row">
        <input type="number" min="1" max="10" step="0.1" id="stap-ov-in" placeholder="auto ${calc.toFixed(1)}" value="${typeof ov==='number'?ov:''}">
        <button class="btn btn-accent" onclick="tapApplyOverride()">Imposta</button>
        ${typeof ov==='number'?`<button class="btn btn-ghost" onclick="tapClearOverride()">Auto</button>`:''}
      </div>
      ${typeof ov==='number'?`<div class="stap-ov-note">Ora vale <b>${(+ov).toFixed(1)}</b> (manuale). "Auto" ripristina ${calc.toFixed(1)}.</div>`:`<div class="stap-ov-note">Lascia vuoto per usare il voto automatico.</div>`}
    </div>`;
  box.innerHTML += whyHtml + ovHtml;
}
function tapApplyOverride(){
  if(!TAP||!TAP.sel) return;
  const inp=document.getElementById('stap-ov-in'); if(!inp) return;
  const raw=inp.value.trim();
  if(raw===''){ delete TAP.override[TAP.sel]; }
  else { let v=Math.max(1,Math.min(10,parseFloat(raw))); if(isNaN(v)){ toast('Voto non valido','info'); return; } TAP.override[TAP.sel]=v; }
  tapRenderPlayers(); tapRenderSel();
}
function tapClearOverride(){
  if(!TAP||!TAP.sel) return;
  delete TAP.override[TAP.sel];
  tapRenderPlayers(); tapRenderSel();
}
function tapRemoveEvent(id){
  if(!TAP) return;
  const i=TAP.events.findIndex(e=>e.id===id); if(i<0) return;
  TAP.events.splice(i,1);
  tapRenderPlayers(); tapRenderSel();
}
function tapFund(f){ if(!TAP) return; TAP.fund=f; document.querySelectorAll('.stap-fund').forEach(b=>b.classList.toggle('on',b.dataset.f===f)); }
function tapSelect(pId){ if(!TAP) return; TAP.sel=pId; tapRenderPlayers(); tapRenderSel(); }
function tapGrade(g){
  if(!TAP||!TAP.sel) return;
  TAP.events.push({id:TAP.seq++, pId:TAP.sel, fund:TAP.fund, grade:g});
  tapRenderPlayers(); tapRenderSel();
}
function tapUndo(){
  if(!TAP||!TAP.events.length) return;
  const e=TAP.events.pop();
  TAP.sel=e.pId; TAP.fund=e.fund;
  document.querySelectorAll('.stap-fund').forEach(b=>b.classList.toggle('on',b.dataset.f===e.fund));
  tapRenderPlayers(); tapRenderSel();
}
function saveScoutTap(){
  if(!TAP) return;
  const match=DB.events.find(e=>e.id===TAP.matchId);
  const rows=[];
  activePlayers().forEach(p=>{
    const s=tapDeriveRow(p.id);
    const ov=TAP.override[p.id];
    const row={pId:p.id, ...s, voto:+rowVoto({pId:p.id,...s,votoOverride:ov},'pallavolo').toFixed(1)};
    if(typeof ov==='number') row.votoOverride=ov;
    rows.push(row);
  });
  DB.scoutHistory=DB.scoutHistory.filter(s=>s.matchId!==TAP.matchId);
  DB.scoutHistory.push({matchId:TAP.matchId, date:match.date, opponent:match.notes, sport:'pallavolo', rows});
  save(); toast('Statistiche registrate nelle schede atleti');
  go('roster');
}
function scoutTapCSS(){
  if(document.getElementById('scout-tap-css')) return;
  const st=document.createElement('style'); st.id='scout-tap-css';
  st.textContent=`
  #scout-tap .stap-wrap{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start;}
  .stap-hint{font-size:.85rem;color:var(--muted);margin-bottom:.6rem;}
  .stap-players{display:flex;flex-direction:column;gap:8px;}
  .stap-player{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;padding:10px 12px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;background:var(--surface-2,rgba(255,255,255,.03));color:inherit;cursor:pointer;transition:border-color .15s,transform .05s;}
  .stap-player:active{transform:scale(.996);}
  .stap-player.sel{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 40%,transparent) inset;}
  .stap-p-main{display:flex;align-items:center;gap:8px;}
  .stap-num{font-weight:800;color:var(--brand);min-width:34px;}
  .stap-name{font-weight:700;flex:1;}
  .stap-role{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;}
  .stap-p-stat{display:flex;align-items:center;gap:10px;font-size:.8rem;color:var(--muted);}
  .stap-p-stat .stap-voto{margin-left:auto;font-family:'Outfit',sans-serif;font-weight:900;font-size:1.15rem;padding:1px 10px;border-radius:9px;}
  .stap-voto.hi{color:#0b1220;background:#8fe388;} .stap-voto.md{color:#0b1220;background:#ffd166;} .stap-voto.lo{color:#fff;background:#ef6461;}
  .stap-pad{position:sticky;top:12px;display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:18px;background:var(--surface-2,rgba(255,255,255,.03));}
  .stap-sel{min-height:26px;font-size:.95rem;} .stap-sel-num{color:var(--brand);font-weight:800;} .stap-sel-role{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;} .stap-sel-empty{color:var(--muted);}
  .stap-funds{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .stap-fund{padding:10px 8px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--muted);font-weight:700;font-size:.85rem;cursor:pointer;}
  .stap-fund.on{border-color:var(--brand);color:var(--text,#fff);background:color-mix(in srgb,var(--brand) 16%,transparent);}
  .stap-grades{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
  .stap-grade{display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 4px;border-radius:14px;border:none;cursor:pointer;color:#0b1220;font-weight:800;line-height:1;}
  .stap-grade b{font-size:1.6rem;font-family:'Outfit',sans-serif;} .stap-grade span{font-size:.6rem;text-transform:uppercase;letter-spacing:.3px;opacity:.85;}
  .stap-grade:disabled{opacity:.32;cursor:not-allowed;}
  .stap-grade.g-perf{background:#5fd06f;} .stap-grade.g-pos{background:#8fe388;} .stap-grade.g-ok{background:#ffd166;} .stap-grade.g-neg{background:#f4a259;} .stap-grade.g-err{background:#ef6461;color:#fff;}
  .stap-detail{display:flex;flex-direction:column;gap:6px;}
  .stap-ovm{font-style:normal;font-size:.6rem;font-weight:800;background:#0b1220;color:#ffd166;border-radius:4px;padding:0 3px;margin-left:3px;vertical-align:top;}
  .stap-why{margin-top:.6rem;padding-top:.5rem;border-top:1px dashed var(--border,rgba(255,255,255,.14));display:flex;flex-wrap:wrap;gap:5px;align-items:center;}
  .stap-why-h{width:100%;font-size:.78rem;color:var(--muted);} .stap-why-h b{color:var(--text,#fff);}
  .stap-why-b{font-size:.72rem;background:var(--surface,rgba(255,255,255,.05));border:1px solid var(--border,rgba(255,255,255,.12));border-radius:8px;padding:2px 7px;color:var(--muted);}
  .stap-ov{margin-top:.7rem;padding-top:.6rem;border-top:1px dashed var(--border,rgba(255,255,255,.14));}
  .stap-ov label{font-size:.78rem;color:var(--muted);display:block;margin-bottom:.35rem;}
  .stap-ov-row{display:flex;gap:8px;align-items:center;} .stap-ov-row input{width:92px;padding:8px 10px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--surface,rgba(0,0,0,.2));color:inherit;font-size:1rem;}
  .stap-ov-row .btn{padding:8px 12px;} .stap-ov-note{font-size:.72rem;color:var(--muted);margin-top:.4rem;}
  .stap-detail-h{font-size:.8rem;color:var(--muted);display:flex;align-items:center;gap:6px;}
  .stap-detail-h .stap-detail-n{margin-left:auto;background:var(--brand);color:#04140A;border-radius:20px;padding:0 8px;font-weight:800;font-size:.72rem;}
  .stap-base{font-size:.72rem;color:var(--muted);} .stap-base-note{opacity:.7;}
  .stap-detail-empty{font-size:.76rem;color:var(--muted);font-style:italic;}
  .stap-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:150px;overflow:auto;}
  .stap-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:none;border-radius:10px;cursor:pointer;color:#0b1220;font-weight:700;font-size:.78rem;line-height:1;}
  .stap-chip b{font-family:'Outfit',sans-serif;font-size:1rem;} .stap-chip .stap-chip-f{font-size:.66rem;text-transform:uppercase;letter-spacing:.3px;opacity:.85;} .stap-chip i{opacity:.55;font-size:.7rem;}
  .stap-chip:hover i{opacity:1;} .stap-chip:active{transform:scale(.95);}
  .stap-chip.g-perf{background:#5fd06f;} .stap-chip.g-pos{background:#8fe388;} .stap-chip.g-ok{background:#ffd166;} .stap-chip.g-neg{background:#f4a259;} .stap-chip.g-err{background:#ef6461;color:#fff;}
  .stap-last{min-height:18px;font-size:.8rem;color:var(--muted);text-align:center;} .stap-last .stap-lg-sym{font-family:'Outfit';}
  .stap-undo{padding:12px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.18));background:transparent;color:var(--text,#fff);font-weight:700;cursor:pointer;}
  .stap-undo:disabled{opacity:.35;cursor:not-allowed;} .stap-save{margin-top:2px;}
  .stap-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
  .stap-lg{font-size:.68rem;color:var(--muted);display:inline-flex;gap:4px;align-items:center;} .stap-lg b{width:16px;height:16px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;}
  .stap-lg.g-perf b{background:#5fd06f;} .stap-lg.g-pos b{background:#8fe388;} .stap-lg.g-ok b{background:#ffd166;} .stap-lg.g-neg b{background:#f4a259;} .stap-lg.g-err b{background:#ef6461;color:#fff;}
  @media(max-width:820px){ #scout-tap .stap-wrap{grid-template-columns:1fr;} .stap-pad{position:static;} }
  `;
  document.head.appendChild(st);
}

/* =========================================================
   SCOUT BASKET — tap a tocchi (stesso pattern del pallavolo)
   Tocco giocatore → tocco categoria → tocco esito (Fatto/Sbagliato,
   Offensivo/Difensivo) oppure, per le categorie a evento singolo
   (Assist, Palla rubata, Palla persa, Stoppata, Fallo), il tocco
   sulla categoria stessa registra l'evento. Il PT si ricava sempre
   da 2/3 punti e liberi fatti: non è mai un campo digitabile.
   ========================================================= */
const BASK_CATS = [
  {k:'fg2', label:'Tiro da 2', icon:'fa-basketball', made:'fg2m', att:'fg2a', outcomes:[['made','Fatto'],['miss','Sbagliato']]},
  {k:'fg3', label:'Tiro da 3', icon:'fa-basketball', made:'fg3m', att:'fg3a', outcomes:[['made','Fatto'],['miss','Sbagliato']]},
  {k:'ft',  label:'Tiro libero', icon:'fa-basketball', made:'ftm', att:'fta', outcomes:[['made','Fatto'],['miss','Sbagliato']]},
  {k:'reb', label:'Rimbalzo', icon:'fa-arrows-up-down', outcomes:[['off','Offensivo'],['def','Difensivo']]},
  {k:'assist', label:'Assist', icon:'fa-hands-clapping'},
  {k:'steal', label:'Palla rubata', icon:'fa-hand'},
  {k:'turnover', label:'Palla persa', icon:'fa-triangle-exclamation'},
  {k:'block', label:'Stoppata', icon:'fa-hand-back-fist'},
  {k:'foul', label:'Fallo', icon:'fa-flag'}
];
const BASK_SINGLE_FIELD={assist:'assist',steal:'rubate',turnover:'perse',block:'stoppate',foul:'falli'};
let BTAP = null;
function bTapApply(o, cat, out){
  const c=BASK_CATS.find(x=>x.k===cat); if(!c) return;
  if(BASK_SINGLE_FIELD[cat]){ const f=BASK_SINGLE_FIELD[cat]; o[f]=(o[f]||0)+1; return; }
  if(cat==='reb'){ if(out==='off') o.roff=(o.roff||0)+1; else o.rdif=(o.rdif||0)+1; return; }
  o[c.att]=(o[c.att]||0)+1;
  if(out==='made') o[c.made]=(o[c.made]||0)+1;
}
function bTapDeriveRow(pId){
  const o=Object.assign(blankStat('basket'), BTAP.base[pId]||{});
  BTAP.events.forEach(e=>{ if(e.pId===pId) bTapApply(o,e.cat,e.out); });
  o.punti=(o.fg2m||0)*2+(o.fg3m||0)*3+(o.ftm||0)*1;
  return o;
}
function bTapMinValue(pId){ return (BTAP.min[pId]!=null) ? BTAP.min[pId] : 0; }
function bTapSetMin(pId, val){ if(!BTAP) return; BTAP.min[pId]=Math.max(0,parseInt(val)||0); }
function buildScoutTapBasket(matchId, existing){
  scoutTapCSS(); bScoutTapCSS();
  const base={}, override={}, min={};
  if(existing){ existing.rows.forEach(r=>{ const b=blankStat('basket'); scoutFields('basket').forEach(k=>b[k]=r[k]||0); base[r.pId]=b;
    if(typeof r.votoOverride==='number') override[r.pId]=r.votoOverride;
    if(typeof r.min==='number') min[r.pId]=r.min; }); }
  const subMin=computeMinutesFromSubs(matchId,'basket');
  if(subMin) activePlayers().forEach(p=>{ min[p.id]=subMin[p.id]||0; });
  BTAP={ matchId, base, override, min, minAuto:!!subMin, events:[], sel:null, cat:'fg2', seq:1 };
  const el=document.getElementById('scout-tap');
  el.innerHTML=`
    <div class="stap-wrap">
      <div class="stap-left">
        <div class="stap-hint"><i class="fa-solid fa-hand-pointer"></i> Tocca un giocatore, poi la categoria, poi l'esito. Assist/Palla rubata/Palla persa/Stoppata/Fallo si registrano con un tocco solo sulla categoria.</div>
        <div class="stap-players" id="stap-players"></div>
      </div>
      <div class="stap-pad">
        <div class="stap-sel" id="stap-sel"></div>
        <div class="btap-cats" id="btap-cats"></div>
        <div class="btap-outcomes" id="btap-outcomes"></div>
        <div class="stap-detail" id="stap-detail"></div>
        <div class="stap-last" id="stap-last"></div>
        <button class="stap-undo" id="stap-undo" onclick="bTapUndo()"><i class="fa-solid fa-rotate-left"></i> Annulla ultimo</button>
        <button class="btn btn-accent stap-save" onclick="saveScoutTapBasket()"><i class="fa-solid fa-floppy-disk"></i> Registra statistiche</button>
      </div>
    </div>`;
  document.getElementById('btap-cats').innerHTML=BASK_CATS.map(c=>
    `<button class="btap-cat${c.k===BTAP.cat?' on':''}" data-k="${c.k}" onclick="bTapCategory('${c.k}')"><i class="fa-solid ${c.icon}"></i> ${c.label}</button>`).join('');
  bTapRenderPlayers();
  bTapRenderSel();
  bTapRenderOutcomes();
}
function bTapRenderPlayers(){
  const box=document.getElementById('stap-players'); if(!box) return;
  const roster=activePlayers();
  if(!roster.length){ box.innerHTML='<div class="empty-row" style="padding:1rem">Nessun atleta in rosa.</div>'; return; }
  box.innerHTML=roster.map(p=>{
    const row=bTapDeriveRow(p.id);
    const ov=BTAP.override[p.id];
    const v=(typeof ov==='number')?ov:computeVoto(row,'basket',p.role);
    const pre=p.isCaptain?'👑 ':p.isViceCaptain?'🥈 ':'';
    const vClass=v>=7?'hi':v>=5.5?'md':'lo';
    const minVal=bTapMinValue(p.id);
    return `<div class="stap-player${BTAP.sel===p.id?' sel':''}" data-pid="${p.id}">
      <button class="stap-p-btn" onclick="bTapSelect(${p.id})">
        <div class="stap-p-main"><span class="stap-num">#${p.number}</span><span class="stap-name">${pre}${p.name}</span><span class="stap-role">${p.role}</span></div>
        <div class="stap-p-stat"><span>PT ${row.punti}</span><span>Rim ${(row.roff||0)+(row.rdif||0)}</span><span class="stap-voto ${vClass}">${v.toFixed(1)}${typeof ov==='number'?'<i class="stap-ovm" title="voto manuale">M</i>':''}</span></div>
      </button>
      ${BTAP.minAuto
        ? `<div class="btap-min-auto" title="Calcolato dal registro cambi"><i class="fa-solid fa-lock"></i> Min ${minVal||0}</div>`
        : `<label class="btap-min"><span>Min</span><input type="number" min="0" max="200" value="${minVal||0}" oninput="bTapSetMin(${p.id}, this.value)"></label>`}
    </div>`;
  }).join('');
}
function bTapRenderSel(){
  const sel=document.getElementById('stap-sel'); if(!sel) return;
  const p=BTAP.sel?playerById(BTAP.sel):null;
  sel.innerHTML = p
    ? `<span class="stap-sel-num">#${p.number}</span> <b>${p.name}</b> <span class="stap-sel-role">${p.role}</span>`
    : `<span class="stap-sel-empty">Seleziona un giocatore ↖</span>`;
  const on=!!p;
  document.querySelectorAll('.btap-cat').forEach(b=>b.disabled=!on);
  document.querySelectorAll('.btap-outcome').forEach(b=>b.disabled=!on);
  const undo=document.getElementById('stap-undo'); if(undo) undo.disabled=!BTAP.events.length;
  const last=document.getElementById('stap-last');
  if(last){
    if(BTAP.events.length){ const e=BTAP.events[BTAP.events.length-1]; const pl=playerById(e.pId); const c=BASK_CATS.find(x=>x.k===e.cat);
      const outLbl = e.out ? ' · '+(((c&&c.outcomes)||[]).find(o=>o[0]===e.out)||[])[1] : '';
      last.innerHTML=`Ultimo: <b>#${pl?pl.number:'?'}</b> · ${c?c.label:e.cat}${outLbl||''}`; }
    else last.textContent='';
  }
  bTapRenderDetail();
}
function bTapRenderOutcomes(){
  const box=document.getElementById('btap-outcomes'); if(!box) return;
  const c=BASK_CATS.find(x=>x.k===(BTAP&&BTAP.cat));
  if(!c || !c.outcomes){ box.innerHTML=`<div class="btap-single-hint">Tocco singolo: ritocca "${c?c.label:''}" per aggiungere un altro evento.</div>`; return; }
  const on=!!(BTAP&&BTAP.sel);
  box.innerHTML=c.outcomes.map(o=>`<button class="btap-outcome" ${on?'':'disabled'} onclick="bTapOutcome('${o[0]}')">${o[1]}</button>`).join('');
}
function bTapCategory(k){
  if(!BTAP) return;
  const c=BASK_CATS.find(x=>x.k===k); if(!c) return;
  BTAP.cat=k;
  document.querySelectorAll('.btap-cat').forEach(b=>b.classList.toggle('on', b.dataset.k===k));
  bTapRenderOutcomes();
  if(!c.outcomes){
    if(BTAP.sel){ BTAP.events.push({id:BTAP.seq++, pId:BTAP.sel, cat:k}); bTapRenderPlayers(); bTapRenderSel(); }
  }
}
function bTapOutcome(out){
  if(!BTAP||!BTAP.sel) return;
  const c=BASK_CATS.find(x=>x.k===BTAP.cat); if(!c||!c.outcomes) return;
  BTAP.events.push({id:BTAP.seq++, pId:BTAP.sel, cat:c.k, out});
  bTapRenderPlayers(); bTapRenderSel();
}
function bTapSelect(pId){ if(!BTAP) return; BTAP.sel=pId; bTapRenderPlayers(); bTapRenderSel(); }
function bTapUndo(){
  if(!BTAP||!BTAP.events.length) return;
  const e=BTAP.events.pop();
  BTAP.sel=e.pId; BTAP.cat=e.cat;
  document.querySelectorAll('.btap-cat').forEach(b=>b.classList.toggle('on', b.dataset.k===e.cat));
  bTapRenderOutcomes(); bTapRenderPlayers(); bTapRenderSel();
}
function bTapRemoveEvent(id){
  if(!BTAP) return;
  const i=BTAP.events.findIndex(e=>e.id===id); if(i<0) return;
  BTAP.events.splice(i,1);
  bTapRenderPlayers(); bTapRenderSel();
}
function bTapRenderDetail(){
  const box=document.getElementById('stap-detail'); if(!box) return;
  if(!BTAP.sel){ box.innerHTML=''; return; }
  const p=playerById(BTAP.sel);
  const evs=BTAP.events.filter(e=>e.pId===BTAP.sel);
  const chips = evs.length
    ? evs.map(e=>{ const c=BASK_CATS.find(x=>x.k===e.cat); const outLbl=e.out?(((c&&c.outcomes)||[]).find(o=>o[0]===e.out)||[])[1]:'';
        return `<button class="stap-chip btap-chip" onclick="bTapRemoveEvent(${e.id})" title="Rimuovi questo tocco">
          <span class="stap-chip-f">${c?c.label:e.cat}</span>${outLbl?`<b>${outLbl}</b>`:''}<i class="fa-solid fa-xmark"></i></button>`; }).join('')
    : `<div class="stap-detail-empty">Nessun tocco registrato in questa sessione.</div>`;
  box.innerHTML=`<div class="stap-detail-h">Tocchi di <b>#${p.number} ${p.name}</b> <span class="stap-detail-n">${evs.length}</span></div><div class="stap-chips">${chips}</div>`;
  const row=bTapDeriveRow(BTAP.sel);
  const calc=computeVoto(row,'basket',p.role);
  const ov=BTAP.override[BTAP.sel];
  box.innerHTML += `<div class="stap-why"><div class="stap-why-h">PT auto <b>${row.punti}</b> · Voto calcolato <b>${calc.toFixed(1)}</b></div></div>`;
  box.innerHTML += `<div class="stap-ov">
      <label>Voto manuale del mister</label>
      <div class="stap-ov-row">
        <input type="number" min="1" max="10" step="0.1" id="btap-ov-in" placeholder="auto ${calc.toFixed(1)}" value="${typeof ov==='number'?ov:''}">
        <button class="btn btn-accent" onclick="bTapApplyOverride()">Imposta</button>
        ${typeof ov==='number'?`<button class="btn btn-ghost" onclick="bTapClearOverride()">Auto</button>`:''}
      </div>
      ${typeof ov==='number'?`<div class="stap-ov-note">Ora vale <b>${(+ov).toFixed(1)}</b> (manuale). "Auto" ripristina ${calc.toFixed(1)}.</div>`:`<div class="stap-ov-note">Lascia vuoto per usare il voto automatico.</div>`}
    </div>`;
}
function bTapApplyOverride(){
  if(!BTAP||!BTAP.sel) return;
  const inp=document.getElementById('btap-ov-in'); if(!inp) return;
  const raw=inp.value.trim();
  if(raw===''){ delete BTAP.override[BTAP.sel]; }
  else { let v=Math.max(1,Math.min(10,parseFloat(raw))); if(isNaN(v)){ toast('Voto non valido','info'); return; } BTAP.override[BTAP.sel]=v; }
  bTapRenderPlayers(); bTapRenderSel();
}
function bTapClearOverride(){
  if(!BTAP||!BTAP.sel) return;
  delete BTAP.override[BTAP.sel];
  bTapRenderPlayers(); bTapRenderSel();
}
function saveScoutTapBasket(){
  if(!BTAP) return;
  const match=DB.events.find(e=>e.id===BTAP.matchId);
  const rows=[];
  activePlayers().forEach(p=>{
    const s=bTapDeriveRow(p.id);
    const ov=BTAP.override[p.id];
    const min=bTapMinValue(p.id);
    const row={pId:p.id, ...s, min, voto:+rowVoto({pId:p.id,...s,votoOverride:ov},'basket').toFixed(1)};
    if(typeof ov==='number') row.votoOverride=ov;
    rows.push(row);
  });
  DB.scoutHistory=DB.scoutHistory.filter(s=>s.matchId!==BTAP.matchId);
  DB.scoutHistory.push({matchId:BTAP.matchId, date:match.date, opponent:match.notes, sport:'basket', rows});
  save(); toast('Statistiche registrate nelle schede atleti');
  go('roster');
}
function bScoutTapCSS(){
  if(document.getElementById('btap-css')) return;
  const st=document.createElement('style'); st.id='btap-css';
  st.textContent=`
  #scout-tap .stap-player{display:flex;flex-direction:column;gap:0;padding:0;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;background:var(--surface-2,rgba(255,255,255,.03));overflow:hidden;}
  #scout-tap .stap-player.sel{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 40%,transparent) inset;}
  #scout-tap .stap-p-btn{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;padding:10px 12px;border:none;background:transparent;color:inherit;cursor:pointer;}
  #scout-tap .stap-p-btn:active{transform:scale(.997);}
  .btap-min{display:flex;align-items:center;gap:8px;padding:6px 12px 10px;font-size:.74rem;color:var(--muted);border-top:1px dashed var(--border,rgba(255,255,255,.1));}
  .btap-min input{width:60px;padding:5px 8px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--surface,rgba(0,0,0,.2));color:inherit;font-size:.85rem;}
  .btap-cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .btap-cat{padding:10px 8px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--muted);font-weight:700;font-size:.8rem;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;}
  .btap-cat.on{border-color:var(--brand);color:var(--text,#fff);background:color-mix(in srgb,var(--brand) 16%,transparent);}
  .btap-cat:disabled{opacity:.4;cursor:not-allowed;}
  .btap-outcomes{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-height:44px;}
  .btap-outcome{padding:12px 8px;border-radius:12px;border:none;cursor:pointer;color:#0b1220;font-weight:800;font-size:.85rem;background:#8fe388;}
  .btap-outcome:last-child{background:#ef6461;color:#fff;}
  .btap-outcome:disabled{opacity:.35;cursor:not-allowed;}
  .btap-single-hint{font-size:.76rem;color:var(--muted);font-style:italic;padding:8px 2px;}
  .btap-chip{background:var(--surface,rgba(255,255,255,.08));color:var(--text,#fff);border:1px solid var(--border,rgba(255,255,255,.14));}
  @media(max-width:820px){ .btap-cats{grid-template-columns:1fr 1fr;} }
  `;
  document.head.appendChild(st);
}

/* =========================================================
   SCOUT CALCIO — tap a tocchi, tassonomia equilibrata per ruolo
   Tocco giocatore → tocco categoria (Offensivo/Difensivo/Disciplina/
   Portiere) → tocco azione: ogni tocco su un'azione registra subito
   l'evento (non serve un ulteriore esito Fatto/Sbagliato: le azioni
   difensive e di portiere qui hanno lo stesso peso di gol/assist,
   vedi SCOUT.calcio.voto). "Palla persa" non si applica al portiere;
   la categoria "Portiere" compare solo quando il giocatore selezionato
   ha ruolo Portiere.
   ========================================================= */
const CALC_CATS = [
  {g:'off',  label:'Offensivo',  icon:'fa-futbol', actions:[
    ['gol','Gol'],['assist','Assist'],['tiroPorta','Tiro in porta'],['dribbling','Dribbling riuscito']
  ]},
  {g:'dif',  label:'Difensivo',  icon:'fa-shield-halved', actions:[
    ['contrasto','Contrasto vinto'],['intercetto','Intercetto'],['chiusura','Chiusura efficace']
  ]},
  {g:'disc', label:'Disciplina', icon:'fa-flag', actions:[
    ['fallo','Fallo'],['ammonizione','Ammonizione'],['espulsione','Espulsione'],['pallaPersa','Palla persa']
  ]},
  {g:'gk',   label:'Portiere',   icon:'fa-hand', actions:[
    ['parata','Parata'],['uscita','Uscita vinta'],['respinta','Respinta'],['golSubito','Gol subito']
  ]}
];
let CTAP = null;
function cTapCatsForRole(role){
  const isGK = role==='Portiere';
  return CALC_CATS.filter(c=>c.g!=='gk' || isGK).map(c=>
    (c.g==='disc' && isGK) ? {g:c.g,label:c.label,icon:c.icon,actions:c.actions.filter(a=>a[0]!=='pallaPersa')} : c);
}
function cTapActionLabel(field){
  for(const c of CALC_CATS){ const a=c.actions.find(x=>x[0]===field); if(a) return a[1]; }
  return field;
}
function cTapCatOf(field){ const c=CALC_CATS.find(c=>c.actions.some(a=>a[0]===field)); return c?c.g:'off'; }
function cTapDeriveRow(pId){
  const o=Object.assign(blankStat('calcio'), CTAP.base[pId]||{});
  CTAP.events.forEach(e=>{ if(e.pId===pId) o[e.field]=(o[e.field]||0)+1; });
  return o;
}
function cTapMinValue(pId){ return (CTAP.min[pId]!=null) ? CTAP.min[pId] : 0; }
function cTapSetMin(pId, val){ if(!CTAP) return; CTAP.min[pId]=Math.max(0,parseInt(val)||0); }
function buildScoutTapCalcio(matchId, existing){
  scoutTapCSS(); bScoutTapCSS(); cScoutTapCSS();
  const base={}, override={}, min={};
  if(existing){ existing.rows.forEach(r=>{ const b=blankStat('calcio'); scoutFields('calcio').forEach(k=>b[k]=r[k]||0); base[r.pId]=b;
    if(typeof r.votoOverride==='number') override[r.pId]=r.votoOverride;
    if(typeof r.min==='number') min[r.pId]=r.min; }); }
  const subMin=computeMinutesFromSubs(matchId,'calcio');
  if(subMin) activePlayers().forEach(p=>{ min[p.id]=subMin[p.id]||0; });
  CTAP={ matchId, base, override, min, minAuto:!!subMin, events:[], sel:null, cat:'off', seq:1 };
  const el=document.getElementById('scout-tap');
  el.innerHTML=`
    <div class="stap-wrap">
      <div class="stap-left">
        <div class="stap-hint"><i class="fa-solid fa-hand-pointer"></i> Tocca un giocatore, poi la categoria, poi l'azione: ogni tocco registra subito l'evento.</div>
        <div class="stap-players" id="stap-players"></div>
      </div>
      <div class="stap-pad">
        <div class="stap-sel" id="stap-sel"></div>
        <div class="ctap-cats" id="ctap-cats"></div>
        <div class="ctap-actions" id="ctap-actions"></div>
        <div class="stap-detail" id="stap-detail"></div>
        <div class="stap-last" id="stap-last"></div>
        <button class="stap-undo" id="stap-undo" onclick="cTapUndo()"><i class="fa-solid fa-rotate-left"></i> Annulla ultimo</button>
        <button class="btn btn-accent stap-save" onclick="saveScoutTapCalcio()"><i class="fa-solid fa-floppy-disk"></i> Registra statistiche</button>
      </div>
    </div>`;
  cTapRenderPlayers();
  cTapRenderSel();
  cTapRenderCats();
}
function cTapRenderPlayers(){
  const box=document.getElementById('stap-players'); if(!box) return;
  const roster=activePlayers();
  if(!roster.length){ box.innerHTML='<div class="empty-row" style="padding:1rem">Nessun atleta in rosa.</div>'; return; }
  const POS_FIELDS=['gol','assist','tiroPorta','dribbling','contrasto','intercetto','chiusura','parata','uscita','respinta'];
  const NEG_FIELDS=['fallo','ammonizione','espulsione','pallaPersa','golSubito'];
  box.innerHTML=roster.map(p=>{
    const row=cTapDeriveRow(p.id);
    const ov=CTAP.override[p.id];
    const v=(typeof ov==='number')?ov:computeVoto(row,'calcio',p.role);
    const pre=p.isCaptain?'👑 ':p.isViceCaptain?'🥈 ':'';
    const vClass=v>=7?'hi':v>=5.5?'md':'lo';
    const pos=POS_FIELDS.reduce((s,k)=>s+(row[k]||0),0), neg=NEG_FIELDS.reduce((s,k)=>s+(row[k]||0),0);
    const minVal=cTapMinValue(p.id);
    return `<div class="stap-player${CTAP.sel===p.id?' sel':''}" data-pid="${p.id}">
      <button class="stap-p-btn" onclick="cTapSelect(${p.id})">
        <div class="stap-p-main"><span class="stap-num">#${p.number}</span><span class="stap-name">${pre}${p.name}</span><span class="stap-role">${p.role}</span></div>
        <div class="stap-p-stat"><span>+${pos}</span><span>−${neg}</span><span class="stap-voto ${vClass}">${v.toFixed(1)}${typeof ov==='number'?'<i class="stap-ovm" title="voto manuale">M</i>':''}</span></div>
      </button>
      ${CTAP.minAuto
        ? `<div class="btap-min-auto" title="Calcolato dal registro cambi"><i class="fa-solid fa-lock"></i> Min ${minVal||0}</div>`
        : `<label class="btap-min"><span>Min</span><input type="number" min="0" max="200" value="${minVal||0}" oninput="cTapSetMin(${p.id}, this.value)"></label>`}
    </div>`;
  }).join('');
}
function cTapRenderSel(){
  const sel=document.getElementById('stap-sel'); if(!sel) return;
  const p=CTAP.sel?playerById(CTAP.sel):null;
  sel.innerHTML = p
    ? `<span class="stap-sel-num">#${p.number}</span> <b>${p.name}</b> <span class="stap-sel-role">${p.role}</span>`
    : `<span class="stap-sel-empty">Seleziona un giocatore ↖</span>`;
  const on=!!p;
  document.querySelectorAll('.ctap-cat').forEach(b=>b.disabled=!on);
  document.querySelectorAll('.ctap-action').forEach(b=>b.disabled=!on);
  const undo=document.getElementById('stap-undo'); if(undo) undo.disabled=!CTAP.events.length;
  const last=document.getElementById('stap-last');
  if(last){
    if(CTAP.events.length){ const e=CTAP.events[CTAP.events.length-1]; const pl=playerById(e.pId);
      last.innerHTML=`Ultimo: <b>#${pl?pl.number:'?'}</b> · ${cTapActionLabel(e.field)}`; }
    else last.textContent='';
  }
  cTapRenderDetail();
}
function cTapRenderCats(){
  const catsBox=document.getElementById('ctap-cats'); if(!catsBox) return;
  const p=CTAP.sel?playerById(CTAP.sel):null;
  const cats=cTapCatsForRole(p?p.role:null);
  if(!cats.find(c=>c.g===CTAP.cat)) CTAP.cat=cats[0].g;
  catsBox.innerHTML=cats.map(c=>`<button class="ctap-cat${c.g===CTAP.cat?' on':''}" ${p?'':'disabled'} data-g="${c.g}" onclick="cTapCategory('${c.g}')"><i class="fa-solid ${c.icon}"></i> ${c.label}</button>`).join('');
  cTapRenderActions(cats);
}
function cTapRenderActions(cats){
  const box=document.getElementById('ctap-actions'); if(!box) return;
  const p=CTAP.sel?playerById(CTAP.sel):null;
  cats = cats || cTapCatsForRole(p?p.role:null);
  const cat=cats.find(c=>c.g===CTAP.cat);
  const on=!!p;
  box.innerHTML=(cat?cat.actions:[]).map(a=>`<button class="ctap-action" ${on?'':'disabled'} onclick="cTapAction('${a[0]}')">${a[1]}</button>`).join('');
}
function cTapCategory(g){
  if(!CTAP) return;
  CTAP.cat=g;
  document.querySelectorAll('.ctap-cat').forEach(b=>b.classList.toggle('on', b.dataset.g===g));
  cTapRenderActions();
}
function cTapAction(field){
  if(!CTAP||!CTAP.sel) return;
  CTAP.events.push({id:CTAP.seq++, pId:CTAP.sel, field});
  cTapRenderPlayers(); cTapRenderSel();
}
function cTapSelect(pId){ if(!CTAP) return; CTAP.sel=pId; cTapRenderPlayers(); cTapRenderSel(); cTapRenderCats(); }
function cTapUndo(){
  if(!CTAP||!CTAP.events.length) return;
  const e=CTAP.events.pop();
  CTAP.sel=e.pId; CTAP.cat=cTapCatOf(e.field);
  cTapRenderCats(); cTapRenderPlayers(); cTapRenderSel();
}
function cTapRemoveEvent(id){
  if(!CTAP) return;
  const i=CTAP.events.findIndex(e=>e.id===id); if(i<0) return;
  CTAP.events.splice(i,1);
  cTapRenderPlayers(); cTapRenderSel();
}
function cTapRenderDetail(){
  const box=document.getElementById('stap-detail'); if(!box) return;
  if(!CTAP.sel){ box.innerHTML=''; return; }
  const p=playerById(CTAP.sel);
  const evs=CTAP.events.filter(e=>e.pId===CTAP.sel);
  const chips = evs.length
    ? evs.map(e=>`<button class="stap-chip btap-chip" onclick="cTapRemoveEvent(${e.id})" title="Rimuovi questo tocco">
         <span class="stap-chip-f">${cTapActionLabel(e.field)}</span><i class="fa-solid fa-xmark"></i></button>`).join('')
    : `<div class="stap-detail-empty">Nessun tocco registrato in questa sessione.</div>`;
  box.innerHTML=`<div class="stap-detail-h">Tocchi di <b>#${p.number} ${p.name}</b> <span class="stap-detail-n">${evs.length}</span></div><div class="stap-chips">${chips}</div>`;
  const row=cTapDeriveRow(CTAP.sel);
  const calc=computeVoto(row,'calcio',p.role);
  const ov=CTAP.override[CTAP.sel];
  box.innerHTML += `<div class="stap-why"><div class="stap-why-h">Voto calcolato <b>${calc.toFixed(1)}</b></div></div>`;
  box.innerHTML += `<div class="stap-ov">
      <label>Voto manuale del mister</label>
      <div class="stap-ov-row">
        <input type="number" min="1" max="10" step="0.1" id="ctap-ov-in" placeholder="auto ${calc.toFixed(1)}" value="${typeof ov==='number'?ov:''}">
        <button class="btn btn-accent" onclick="cTapApplyOverride()">Imposta</button>
        ${typeof ov==='number'?`<button class="btn btn-ghost" onclick="cTapClearOverride()">Auto</button>`:''}
      </div>
      ${typeof ov==='number'?`<div class="stap-ov-note">Ora vale <b>${(+ov).toFixed(1)}</b> (manuale). "Auto" ripristina ${calc.toFixed(1)}.</div>`:`<div class="stap-ov-note">Lascia vuoto per usare il voto automatico.</div>`}
    </div>`;
}
function cTapApplyOverride(){
  if(!CTAP||!CTAP.sel) return;
  const inp=document.getElementById('ctap-ov-in'); if(!inp) return;
  const raw=inp.value.trim();
  if(raw===''){ delete CTAP.override[CTAP.sel]; }
  else { let v=Math.max(1,Math.min(10,parseFloat(raw))); if(isNaN(v)){ toast('Voto non valido','info'); return; } CTAP.override[CTAP.sel]=v; }
  cTapRenderPlayers(); cTapRenderSel();
}
function cTapClearOverride(){
  if(!CTAP||!CTAP.sel) return;
  delete CTAP.override[CTAP.sel];
  cTapRenderPlayers(); cTapRenderSel();
}
function saveScoutTapCalcio(){
  if(!CTAP) return;
  const match=DB.events.find(e=>e.id===CTAP.matchId);
  const rows=[];
  activePlayers().forEach(p=>{
    const s=cTapDeriveRow(p.id);
    const ov=CTAP.override[p.id];
    const min=cTapMinValue(p.id);
    const row={pId:p.id, ...s, min, voto:+rowVoto({pId:p.id,...s,votoOverride:ov},'calcio').toFixed(1)};
    if(typeof ov==='number') row.votoOverride=ov;
    rows.push(row);
  });
  DB.scoutHistory=DB.scoutHistory.filter(s=>s.matchId!==CTAP.matchId);
  DB.scoutHistory.push({matchId:CTAP.matchId, date:match.date, opponent:match.notes, sport:'calcio', rows});
  save(); toast('Statistiche registrate nelle schede atleti');
  go('roster');
}
function cScoutTapCSS(){
  if(document.getElementById('ctap-css')) return;
  const st=document.createElement('style'); st.id='ctap-css';
  st.textContent=`
  .ctap-cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .ctap-cat{padding:10px 8px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--muted);font-weight:700;font-size:.8rem;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:center;}
  .ctap-cat.on{border-color:var(--brand);color:var(--text,#fff);background:color-mix(in srgb,var(--brand) 16%,transparent);}
  .ctap-cat:disabled{opacity:.4;cursor:not-allowed;}
  .ctap-actions{display:flex;flex-direction:column;gap:8px;min-height:44px;}
  .ctap-action{padding:12px 10px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.14));cursor:pointer;color:var(--text,#fff);font-weight:700;font-size:.85rem;background:var(--surface,rgba(255,255,255,.04));text-align:left;}
  .ctap-action:disabled{opacity:.35;cursor:not-allowed;}
  .ctap-action:active{transform:scale(.98);}
  `;
  document.head.appendChild(st);
}

/* =========================================================
   ROTAZIONI
   ========================================================= */
const ROT_POS={P1:'Zona 1 · battuta',P2:'Zona 2',P3:'Zona 3 · centro',P4:'Zona 4',P5:'Zona 5',P6:'Zona 6'};
function rotData(id){ if(!DB.rotationStats[id]) DB.rotationStats[id]={P1:{f:0,s:0},P2:{f:0,s:0},P3:{f:0,s:0},P4:{f:0,s:0},P5:{f:0,s:0},P6:{f:0,s:0}}; return DB.rotationStats[id]; }
/* Griglia rotazioni della singola gara, dentro lo scout pallavolo */
function renderRotGrid(id){
    const box=document.getElementById('scout-rot'); if(!box) return;
    const data=rotData(id);
    const cells=Object.keys(data).map(k=>{const d=data[k],diff=d.f-d.s;
        return `<div class="rot-cell"><h4>${k}</h4><div class="pos">${ROT_POS[k]}</div>
            <div class="rot-counters">
                <div class="rot-c"><div class="n fatti num">${d.f}</div><div class="k">Fatti</div>
                    <div class="stepper"><button onclick="rotStep(${id},'${k}','f',-1)">−</button><button onclick="rotStep(${id},'${k}','f',1)">+</button></div></div>
                <div class="rot-c"><div class="n subiti num">${d.s}</div><div class="k">Subiti</div>
                    <div class="stepper"><button onclick="rotStep(${id},'${k}','s',-1)">−</button><button onclick="rotStep(${id},'${k}','s',1)">+</button></div></div>
            </div>
            <div class="rot-diff" style="color:${diff>0?'var(--ok)':diff<0?'var(--bad)':'var(--muted)'}">${diff>0?'+':''}${diff}</div></div>`;}).join('');
    const items=Object.keys(data).map(k=>{const diff=data[k].f-data[k].s;return{label:k,value:diff,display:(diff>0?'+':'')+diff,color:diff>=0?'var(--brand)':'var(--flame)'};});
    const totF=Object.values(data).reduce((a,d)=>a+d.f,0), totS=Object.values(data).reduce((a,d)=>a+d.s,0);
    const worst=Object.keys(data).reduce((w,k)=>(data[k].f-data[k].s)<(data[w].f-data[w].s)?k:w,'P1');
    const best=Object.keys(data).reduce((b,k)=>(data[k].f-data[k].s)>(data[b].f-data[b].s)?k:b,'P1');
    box.innerHTML=`<div class="card"><h3><i class="fa-solid fa-arrows-spin"></i> Rotazioni · questa gara</h3>
            <div class="rot-grid">${cells}</div></div>
        <div class="card"><h3><i class="fa-solid fa-chart-simple"></i> Differenziale per rotazione</h3>${svgBars(items)}
            <p class="hint">${totF+totS===0?'Tocca + e − per registrare punti fatti e subiti in ogni rotazione durante la gara.':`Rotazione più forte: <b style="color:var(--ok)">${best}</b> · rotazione critica: <b style="color:var(--flame)">${worst}</b>. Lavora sul cambio-palla in ${worst}.`}</p></div>`;
}
function rotStep(id,k,key,delta){ const d=rotData(id)[k]; d[key]=Math.max(0,d[key]+delta); save(); renderRotGrid(id); }
/* Riepilogo aggregato su TUTTE le gare, mostrato all'ingresso dello scout */
function renderRotAggregate(){
    const box=document.getElementById('scout-rot-summary'); if(!box) return;
    const zones=['P1','P2','P3','P4','P5','P6'], agg={}; zones.forEach(z=>agg[z]={f:0,s:0});
    let any=false, nMatch=0;
    Object.values(DB.rotationStats||{}).forEach(m=>{ let used=false; zones.forEach(z=>{ if(m[z]){ agg[z].f+=m[z].f; agg[z].s+=m[z].s; if(m[z].f||m[z].s){any=true;used=true;} } }); if(used)nMatch++; });
    if(!any){ box.innerHTML=`<div class="card"><h3><i class="fa-solid fa-arrows-spin"></i> Rotazioni · media squadra</h3>
        <p class="hint">Ancora nessuna rotazione registrata. Seleziona una partita qui sopra e segna i punti fatti/subiti per zona: qui comparirà il quadro complessivo con la rotazione più critica della squadra.</p></div>`; return; }
    const items=zones.map(z=>{const diff=agg[z].f-agg[z].s;return{label:z,value:diff,display:(diff>0?'+':'')+diff,color:diff>=0?'var(--brand)':'var(--flame)'};});
    const worst=zones.reduce((w,z)=>(agg[z].f-agg[z].s)<(agg[w].f-agg[w].s)?z:w,'P1');
    const best=zones.reduce((b,z)=>(agg[z].f-agg[z].s)>(agg[b].f-agg[b].s)?z:b,'P1');
    box.innerHTML=`<div class="card"><h3><i class="fa-solid fa-arrows-spin"></i> Rotazioni · media squadra <span class="pill" style="margin-left:6px">${nMatch} ${nMatch===1?'gara':'gare'}</span></h3>
        ${svgBars(items)}
        <p class="hint">Su tutte le gare, la rotazione più critica è <b style="color:var(--flame)">${worst}</b> (${ROT_POS[worst]}); la più forte è <b style="color:var(--ok)">${best}</b>. Scegli una partita qui sopra per registrare o correggere le rotazioni.</p></div>`;
}

/* =========================================================
   REGISTRO CAMBI/SOSTITUZIONI (Modulo U) — versione semplice.
   Un elenco cronologico "esce/entra/minuto" per partita, per tutti e
   3 gli sport. Da questi eventi si ricava il MIN di ogni giocatore
   in quella gara (calcio/basket, che hanno un campo MIN — la
   pallavolo non ha un concetto di minutaggio nei suoi dati di scout,
   quindi qui il registro resta solo cronologico anche per lei).
   Nessuna attribuzione automatica di statistiche per segmento: resta
   fuori scope, come richiesto.

   Titolari di partenza (baseline) = la STESSA formazione consigliata
   già calcolata altrove (soccerLineup/pickLineupPallavolo/
   pickLineupBasket, riuso — non un nuovo calcolo). È una
   semplificazione dichiarata: se in quella gara il mister ha davvero
   schierato una formazione diversa da quella oggi "consigliata", il
   calcolo del MIN può risultare impreciso — in tal caso resta la via
   manuale (bastano zero cambi registrati per quella gara).
   ========================================================= */
const MATCH_FULL_MIN={calcio:90, basket:40};
function subsList(matchId){ return (DB.substitutions&&DB.substitutions[matchId])||[]; }
function subsSorted(matchId){ return subsList(matchId).slice().sort((a,b)=>a.min-b.min); }
function matchBaselineStarters(sport){
  if(sport==='calcio'){ const {slots}=soccerLineup(); return slots.filter(s=>s.player).map(s=>s.player); }
  if(sport==='basket'){ return pickLineupBasket().filter(r=>r.player).map(r=>r.player); }
  if(sport==='pallavolo'){ return pickLineupPallavolo().filter(r=>r.player).map(r=>r.player); }
  return [];
}
/* {pId: minuti giocati} se ci sono cambi registrati per la gara, altrimenti null (MIN resta manuale) */
function computeMinutesFromSubs(matchId, sport){
  const evs=subsSorted(matchId), full=MATCH_FULL_MIN[sport];
  if(!evs.length || !full) return null;
  const baseline=new Set(matchBaselineStarters(sport).map(p=>p.id));
  const onFieldSince={}, totals={};
  activePlayers().forEach(p=>{ totals[p.id]=0; if(baseline.has(p.id)) onFieldSince[p.id]=0; });
  evs.forEach(e=>{
    if(onFieldSince[e.out]!=null){ totals[e.out]=(totals[e.out]||0)+(e.min-onFieldSince[e.out]); delete onFieldSince[e.out]; }
    onFieldSince[e.in]=e.min;
  });
  Object.keys(onFieldSince).forEach(pid=>{ totals[pid]=(totals[pid]||0)+(full-onFieldSince[pid]); });
  return totals;
}
/* Chi è "in campo"/"in panchina" ADESSO per quella gara, applicando tutti i cambi già registrati */
function matchOnFieldNow(matchId, sport){
  const onField=new Map(matchBaselineStarters(sport).map(p=>[p.id,p]));
  subsSorted(matchId).forEach(e=>{ onField.delete(e.out); const p=playerById(e.in); if(p) onField.set(e.in,p); });
  return onField;
}
function subsCSS(){
  if(document.getElementById('subs-css')) return;
  const st=document.createElement('style'); st.id='subs-css';
  st.textContent=`
  .subs-list{display:flex;flex-direction:column;gap:6px;margin-top:10px;}
  .subs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.86rem;background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:8px 10px;}
  .subs-min{font-family:'Outfit',sans-serif;font-weight:800;color:var(--brand);min-width:34px;}
  .subs-del{margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;}
  .subs-del:hover{color:var(--flame,#F0463C);}
  .btap-min-auto{display:inline-flex;align-items:center;gap:5px;font-size:.74rem;color:var(--muted);padding:6px 12px 10px;}
  .btap-min-auto i{font-size:.7rem;}
  `;
  document.head.appendChild(st);
}
function renderSubsPanel(matchId){
  const host=document.getElementById('subs-panel'); if(!host) return;
  if(!matchId){ host.style.display='none'; host.innerHTML=''; return; }
  subsCSS(); host.style.display='block';
  const sport=curSport();
  const evs=subsSorted(matchId);
  const rows=evs.map(e=>{ const po=playerById(e.out), pi=playerById(e.in);
    return `<div class="subs-row"><span class="subs-min">${e.min}'</span> Esce <b>#${po?po.number:'?'} ${po?po.name:'?'}</b>, entra <b>#${pi?pi.number:'?'} ${pi?pi.name:'?'}</b>
      <button class="subs-del" onclick="removeSub(${matchId},${e.id})" title="Rimuovi cambio"><i class="fa-solid fa-xmark"></i></button></div>`; }).join('');
  const autoMin = !!(MATCH_FULL_MIN[sport] && evs.length);
  host.innerHTML=`<div class="card">
      <h3><i class="fa-solid fa-right-left"></i> Cambi</h3>
      <button class="btn btn-ghost btn-sm" onclick="openAddSub(${matchId})"><i class="fa-solid fa-plus"></i> Registra cambio</button>
      <div class="subs-list">${rows||'<p class="hint" style="margin-top:8px;margin-bottom:0">Nessun cambio registrato: il MIN resta modificabile a mano.</p>'}</div>
      ${autoMin?`<p class="hint" style="margin-top:8px;margin-bottom:0"><i class="fa-solid fa-circle-info"></i> Il MIN di questa gara è calcolato dai cambi qui sopra (titolari = formazione consigliata).</p>`:''}
    </div>`;
}
function openAddSub(matchId){
  const sport=curSport();
  const onField=[...matchOnFieldNow(matchId,sport).values()];
  const onFieldIds=new Set(onField.map(p=>p.id));
  const bench=activePlayers().filter(p=>!onFieldIds.has(p.id));
  const outOpts=onField.map(p=>`<option value="${p.id}">#${p.number} ${p.name}</option>`).join('');
  const inOpts=bench.map(p=>`<option value="${p.id}">#${p.number} ${p.name}</option>`).join('');
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-right-left" style="color:var(--brand)"></i> Registra cambio</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="fg"><label>Chi esce</label><select id="sub-out">${outOpts||'<option value="">Nessuno in campo</option>'}</select></div>
      <div class="fg"><label>Chi entra</label><select id="sub-in">${inOpts||'<option value="">Nessuno in panchina</option>'}</select></div>
      <div class="fg"><label>Minuto</label><input id="sub-min" type="number" min="0" max="200" placeholder="Es. 62"></div>
      <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="saveSub(${matchId})"><i class="fa-solid fa-check"></i> Registra cambio</button>
    </div>`);
}
function saveSub(matchId){
  const outSel=document.getElementById('sub-out'), inSel=document.getElementById('sub-in'), minInp=document.getElementById('sub-min');
  const outId=parseInt(outSel&&outSel.value), inId=parseInt(inSel&&inSel.value), min=parseInt(minInp&&minInp.value);
  if(!outId||!inId||isNaN(min)){ toast('Compila chi esce, chi entra e il minuto','info'); return; }
  if(outId===inId){ toast('Chi esce e chi entra non possono coincidere','info'); return; }
  if(!DB.substitutions) DB.substitutions={};
  if(!DB.substitutions[matchId]) DB.substitutions[matchId]=[];
  const seq=DB.substitutions[matchId].reduce((m,e)=>Math.max(m,e.id||0),0)+1;
  DB.substitutions[matchId].push({id:seq,min,out:outId,in:inId});
  save(); closeModal(); toast('Cambio registrato');
  renderSubsPanel(matchId); refreshTapMinFromSubs(matchId);
}
function removeSub(matchId,id){
  if(!DB.substitutions||!DB.substitutions[matchId]) return;
  DB.substitutions[matchId]=DB.substitutions[matchId].filter(e=>e.id!==id);
  save(); renderSubsPanel(matchId); refreshTapMinFromSubs(matchId);
}
/* Rispecchia il MIN auto-calcolato (se ci sono cambi) nella tap UI di basket/calcio già aperta */
function refreshTapMinFromSubs(matchId){
  const sport=curSport();
  const subMin=computeMinutesFromSubs(matchId, sport);
  if(sport==='basket' && typeof BTAP!=='undefined' && BTAP && BTAP.matchId===matchId){
    BTAP.minAuto=!!subMin;
    if(subMin) activePlayers().forEach(p=>{ BTAP.min[p.id]=subMin[p.id]||0; });
    bTapRenderPlayers();
  } else if(sport==='calcio' && typeof CTAP!=='undefined' && CTAP && CTAP.matchId===matchId){
    CTAP.minAuto=!!subMin;
    if(subMin) activePlayers().forEach(p=>{ CTAP.min[p.id]=subMin[p.id]||0; });
    cTapRenderPlayers();
  }
}

/* =========================================================
   PRESENZE
   ========================================================= */
function populateAtt(){
    const sel=document.getElementById('att-select');const cur=sel.value;
    sel.innerHTML='<option value="">Scegli una seduta…</option>';
    DB.events.filter(e=>e.type==='Allenamento').sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(e=>{
        const o=document.createElement('option');o.value=e.id;o.textContent=`${fmtDate(e.date)} · ${e.notes}`;sel.appendChild(o);
    });
    sel.value=cur;
    renderAttendance(); renderAttSeason();
}
const ATT_STATES=['present','absent','excused'];
const ATT_LABEL={present:'Presente',absent:'Assente',excused:'Giust.'};
function renderAttendance(){
    const id=parseInt(document.getElementById('att-select').value);
    const panel=document.getElementById('att-panel'), list=document.getElementById('att-list');
    if(!id){panel.style.display='none';return;}
    panel.style.display='block';
    if(!DB.attendance[id]) DB.attendance[id]={};
    const map=DB.attendance[id];
    list.innerHTML='';
    DB.players.forEach(p=>{
        const cur=map[p.id]||'';
        const row=document.createElement('div');row.className='att-row';
        row.innerHTML=`<div class="jersey" style="width:32px;height:32px;font-size:.85rem;cursor:default">${p.number}</div>
            <div class="att-name">${p.name}<div style="font-size:.74rem;color:var(--muted-2);font-weight:500">${p.role}</div></div>
            <div class="att-toggle">${ATT_STATES.map(st=>`<button class="${st} ${cur===st?'on':''}" onclick="setAtt(${id},${p.id},'${st}')">${ATT_LABEL[st]}</button>`).join('')}</div>`;
        list.appendChild(row);
    });
    updateAttBar(id);
}
function setAtt(eventId,pId,st){
    const map=DB.attendance[eventId];
    map[pId]=map[pId]===st? '' : st;
    if(!map[pId]) delete map[pId];
    save();renderAttendance();renderAttSeason();
}
function updateAttBar(id){
    const map=DB.attendance[id];let pres=0,tot=0;
    DB.players.forEach(p=>{const v=map[p.id];if(v&&v!=='excused'){tot++;if(v==='present')pres++;}});
    const pct=tot?Math.round(pres/tot*100):0;
    document.getElementById('att-bar').style.width=pct+'%';
    document.getElementById('att-pct').textContent=tot?`${pct}% (${pres}/${tot})`:'Nessun appello registrato';
}
function renderAttSeason(){
    const box=document.getElementById('att-season');
    const rows=DB.players.map(p=>({p,pct:playerAttendance(p.id)})).filter(x=>x.pct!==null).sort((a,b)=>b.pct-a.pct);
    if(!rows.length){box.innerHTML=`<div class="empty-state"><i class="fa-solid fa-user-clock"></i>Nessuna presenza registrata ancora.</div>`;return;}
    box.innerHTML=rows.map(x=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line-soft)">
        <div style="width:130px;font-weight:600;font-size:.9rem">${x.p.name}</div>
        <div style="flex:1"><div class="bar-track"><div class="bar-fill" style="width:${x.pct}%;background:${x.pct>=75?'linear-gradient(90deg,var(--brand-deep),var(--brand))':x.pct>=50?'var(--warn)':'var(--flame)'}"></div></div></div>
        <div class="num" style="font-weight:800;font-family:'Outfit';width:42px;text-align:right">${x.pct}%</div></div>`).join('');
}

/* =========================================================
   LAVAGNETTA TATTICA
   ========================================================= */
let canvas,ctx,drawing=false,penColor='#22C55E',tokensInit=false;
function initBoard(){
    canvas=document.getElementById('courtCanvas');
    const area=document.getElementById('court-area');
    const dpr=window.devicePixelRatio||1;
    const r=area.getBoundingClientRect();
    canvas.width=r.width*dpr;canvas.height=r.height*dpr;
    ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    drawCourt(r.width,r.height);
    if(!tokensInit){placeTokens();tokensInit=true;}
    bindDraw(r.width,r.height);
}
function courtRect(w,h,sport){
    // rapporto d'aspetto reale (verticale = altezza/larghezza): calcio 105x68, basket 28x15
    const ratio = sport==='pallavolo' ? 2 : sport==='basket' ? 28/15 : 105/68;
    const pad=12, aw=w-pad*2, ah=h-pad*2;
    let pw,ph;
    if(aw*ratio<=ah){ pw=aw; ph=aw*ratio; } else { ph=ah; pw=ah/ratio; }
    return { x:(w-pw)/2, y:(h-ph)/2, w:pw, h:ph };
}
function drawCourt(w,h){
    ctx.clearRect(0,0,w,h);
    const sp=(typeof DB!=='undefined'&&DB&&DB.sport)||'pallavolo';
    const R=courtRect(w,h,sp), rx=R.x, ry=R.y, rw=R.w, rh=R.h, cx=rx+rw/2, cy=ry+rh/2;
    if(sp==='pallavolo'){
        ctx.strokeStyle='rgba(34,197,94,.55)';ctx.lineWidth=2;
        ctx.strokeRect(rx,ry,rw,rh);
        ctx.beginPath();ctx.moveTo(rx,cy);ctx.lineTo(rx+rw,cy);ctx.stroke(); // rete
        ctx.setLineDash([6,6]);ctx.lineWidth=1;ctx.strokeStyle='rgba(34,197,94,.3)';
        ctx.beginPath();ctx.moveTo(rx,ry+rh*0.333);ctx.lineTo(rx+rw,ry+rh*0.333);ctx.stroke();
        ctx.beginPath();ctx.moveTo(rx,ry+rh*0.667);ctx.lineTo(rx+rw,ry+rh*0.667);ctx.stroke();
        ctx.setLineDash([]);
        return;
    }
    // calcio / basket — campo a proporzioni fisse (non si deforma)
    ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;
    ctx.strokeRect(rx,ry,rw,rh);
    ctx.beginPath();ctx.moveTo(rx,cy);ctx.lineTo(rx+rw,cy);ctx.stroke();            // mezzo campo
    ctx.beginPath();ctx.arc(cx,cy,rw*0.13,0,Math.PI*2);ctx.stroke();               // cerchio centrale
    if(sp==='calcio'){
        const bw=rw*0.5,bx=cx-bw/2,bh=rh*0.16;                                     // aree di rigore
        ctx.strokeRect(bx,ry,bw,bh);
        ctx.strokeRect(bx,ry+rh-bh,bw,bh);
        const gw=rw*0.24,gx=cx-gw/2,gh=rh*0.06;                                    // aree di porta
        ctx.strokeRect(gx,ry,gw,gh);
        ctx.strokeRect(gx,ry+rh-gh,gw,gh);
    }else{ // basket
        const kw=rw*0.36,kx=cx-kw/2,kh=rh*0.19;                                    // aree (pitturato)
        ctx.strokeRect(kx,ry,kw,kh);
        ctx.strokeRect(kx,ry+rh-kh,kw,kh);
        ctx.beginPath();ctx.arc(cx,ry+kh,kw*0.5,0,Math.PI);ctx.stroke();           // arco tiri liberi
        ctx.beginPath();ctx.arc(cx,ry+rh-kh,kw*0.5,Math.PI,Math.PI*2);ctx.stroke();
    }
}
/* Formazione della lavagnetta (Modulo T): SOLO uno specchietto di lavoro in memoria,
   precaricato dalla stessa formazione/rotazione già calcolata per "Formazione consigliata"
   (soccerLineup/pickLineupPallavolo/pickLineupBasket — nessun ricalcolo). Le sostituzioni
   fatte qui (trascinamento gettoni, cambi da panchina) restano locali a questa schermata:
   non toccano mai DB.settings.lineup, quindi la formazione "ufficiale" non si altera mai. */
let BOARD_LINEUP=null;
function boardBuildLineup(sport){
    if(sport==='calcio'){
        const {slots}=soccerLineup();
        return slots.map(s=>({x:s.x,y:s.y,role:s.role,player:s.player}));
    }
    const rows = sport==='pallavolo' ? pickLineupPallavolo() : pickLineupBasket();
    return rows.map(r=>({x:r.x,y:r.y,role:r.role,player:r.player}));
}
function placeTokens(){
    const area=document.getElementById('court-area');
    area.querySelectorAll('.token').forEach(t=>t.remove());
    const r=area.getBoundingClientRect();
    const sp=(typeof DB!=='undefined'&&DB&&DB.sport)||'pallavolo';
    const base=courtRect(r.width,r.height,sp);
    BOARD_LINEUP=boardBuildLineup(sp);
    BOARD_LINEUP.forEach((slot,i)=>{
        if(!slot.player) return; const p=slot.player;
        const t=document.createElement('div');
        t.className='token'+(p.isCaptain?' captain':p.isViceCaptain?' vice':'');
        t.textContent=p.number; t.title=p.name; t.dataset.slot=i;
        t.style.left=(base.x+slot.x*base.w-23)+'px'; t.style.top=(base.y+slot.y*base.h-23)+'px';
        makeDraggable(t); area.appendChild(t);
    });
    renderBench();
}
function renderBench(){
    const host=document.getElementById('bench-area'); if(!host) return;
    if(!BOARD_LINEUP){ host.style.display='none'; host.innerHTML=''; return; }
    soccerFieldCSS(); injectFmzCSS(); host.style.display='block';
    const usedIds=new Set(BOARD_LINEUP.filter(s=>s.player).map(s=>s.player.id));
    const bench=activePlayers().filter(p=>!usedIds.has(p.id))
      .map(p=>({p,v:getSeasonStats(p.id).avgVoto}))
      .sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
    host.innerHTML=`<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:700;margin-bottom:8px"><i class="fa-solid fa-chair"></i> Panchina</div>`+
      (bench.length ? `<div class="bench-chips">`+bench.map(b=>`<button class="bench-chip" onclick="benchSubstitute(${b.p.id})"><span class="bench-num">${b.p.number}</span> ${(b.p.name||'').split(' ').slice(-1)[0]}</button>`).join('')+`</div>`
                    : '<p class="hint" style="margin:0">Tutti in campo.</p>');
}
function benchSubstitute(pid){
    if(!BOARD_LINEUP) return;
    const inField=BOARD_LINEUP.map((s,i)=>({i,s})).filter(x=>x.s.player);
    const opts=inField.map(({i,s})=>`<button class="sub-opt" onclick="boardApplySub(${i},${pid});closeModal()"><span class="fmz-num">#${s.player.number}</span> ${s.player.name} <span class="fmz-role-tag">${s.role}</span></button>`).join('');
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-right-left" style="color:var(--brand)"></i> Chi fai uscire?</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><p class="hint" style="margin-bottom:10px">Solo per spiegare la tattica: non cambia la formazione ufficiale di "Formazione consigliata".</p>
        <div class="sub-list">${opts||'<p class="hint">Nessun titolare in campo.</p>'}</div></div>`, true);
}
function boardApplySub(slotIdx,pid){
    if(!BOARD_LINEUP||!BOARD_LINEUP[slotIdx]) return;
    const p=playerById(pid); if(!p) return;
    BOARD_LINEUP[slotIdx].player=p;
    const area=document.getElementById('court-area');
    const old=area.querySelector(`.token[data-slot="${slotIdx}"]`);
    const t=document.createElement('div');
    t.className='token'+(p.isCaptain?' captain':p.isViceCaptain?' vice':'');
    t.textContent=p.number; t.title=p.name; t.dataset.slot=slotIdx;
    if(old){ t.style.left=old.style.left; t.style.top=old.style.top; old.remove(); }
    else {
        const r=area.getBoundingClientRect(), base=courtRect(r.width,r.height,curSport()), slot=BOARD_LINEUP[slotIdx];
        t.style.left=(base.x+slot.x*base.w-23)+'px'; t.style.top=(base.y+slot.y*base.h-23)+'px';
    }
    makeDraggable(t); area.appendChild(t);
    renderBench();
}
function makeDraggable(token){
    token.addEventListener('pointerdown',e=>{
        e.stopPropagation();token.setPointerCapture(e.pointerId);token.style.cursor='grabbing';
        let sx=e.clientX,sy=e.clientY;
        const move=ev=>{
            const dx=ev.clientX-sx,dy=ev.clientY-sy;sx=ev.clientX;sy=ev.clientY;
            const par=token.parentElement.getBoundingClientRect();
            let nx=Math.max(0,Math.min(par.width-token.offsetWidth,token.offsetLeft+dx));
            let ny=Math.max(0,Math.min(par.height-token.offsetHeight,token.offsetTop+dy));
            token.style.left=nx+'px';token.style.top=ny+'px';
        };
        const up=()=>{token.onpointermove=null;token.onpointerup=null;token.style.cursor='grab';try{token.releasePointerCapture(e.pointerId);}catch(_){}}; 
        token.onpointermove=move;token.onpointerup=up;token.onpointercancel=up;
    });
}
function bindDraw(w,h){
    const pos=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left),y:(e.clientY-r.top)};};
    canvas.onpointerdown=e=>{drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);};
    canvas.onpointermove=e=>{if(!drawing)return;const p=pos(e);ctx.strokeStyle=penColor;ctx.lineWidth=+document.getElementById('brush').value;ctx.lineCap='round';ctx.lineTo(p.x,p.y);ctx.stroke();};
    canvas.onpointerup=()=>drawing=false;canvas.onpointerleave=()=>drawing=false;
    canvas._w=w;canvas._h=h;
}
function setPen(c,el){penColor=c;document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');}
function clearDraw(){const r=document.getElementById('court-area').getBoundingClientRect();drawCourt(r.width,r.height);}
function resetTokens(){
    /* Ricarica la formazione ufficiale (Modulo T): scarta solo le sostituzioni/spostamenti
       fatti qui in lavagnetta, non tocca mai DB.settings.lineup. */
    tokensInit=false;placeTokens();tokensInit=true;toast('Posizioni ripristinate','info');
}

/* =========================================================
   BACKUP
   ========================================================= */
function exportData(){
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    const d=new Date().toISOString().slice(0,10);
    const teamSlug=(DB.teamName||'TEAM').trim().replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'-')||'TEAM';
    a.href=url;a.download=`${teamSlug}-Airim-backup-${d}.json`;a.click();URL.revokeObjectURL(url);
    toast('Backup scaricato');
}
function importData(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
        try{
            const data=JSON.parse(reader.result);
            if(!data.players||!data.events) throw new Error('formato');
            confirmAction('Importare questo backup? I dati attuali verranno sovrascritti.',()=>{
                DB=data;if(!DB.nextId)DB.nextId=Date.now();save();renderTeamName();go('dashboard');toast('Backup importato con successo');
            });
        }catch(err){toast('File non valido o danneggiato','danger');}
        e.target.value='';
    };
    reader.readAsText(file);
}
function resetAll(){
    confirmAction('Cancellare TUTTI i dati e ripartire da zero? Non si può annullare.',()=>{
        localStorage.removeItem(dbKey());DB=emptyDB();save();
        localStorage.removeItem('vt_tutorial_done');
        renderTeamName();go('dashboard');toast('App azzerata','info');
        openOnboarding(true);
    });
}

/* =========================================================
   PROMEMORIA BACKUP GIORNALIERO (Modulo Q)
   Non invasivo, una volta al giorno. Non durante l'onboarding di un
   installazione nuova (nessun dato ancora da perdere) né mentre gira
   l'animazione di apertura: viene richiamato con un ritardo che la supera.
   ========================================================= */
function checkBackupReminder(){
  try{
    if(!localStorage.getItem('vt_tutorial_done')) return;   /* prima apertura: niente da salvare ancora */
    const today=new Date().toDateString();
    if(localStorage.getItem('vt_last_backup_reminder')===today) return;
    showBackupReminder();
  }catch(e){}
}
function showBackupReminder(){
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-cloud-arrow-down" style="color:var(--brand)"></i> Ricordati di fare il backup</h3>
      <button class="modal-close" onclick="dismissBackupReminder()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint">Se cancelli i dati del telefono o disinstalli l'app, perderai tutto ciò che non hai salvato.</p>
      <div style="display:flex;gap:8px;margin-top:1.2rem;flex-wrap:wrap">
        <button class="btn btn-accent" style="flex:1" onclick="backupReminderNow()"><i class="fa-solid fa-download"></i> Fai backup ora</button>
        <button class="btn btn-ghost" style="flex:1" onclick="dismissBackupReminder()">Non oggi</button>
      </div>
    </div>`);
}
function dismissBackupReminder(){ localStorage.setItem('vt_last_backup_reminder', new Date().toDateString()); closeModal(); }
function backupReminderNow(){ exportData(); dismissBackupReminder(); }


/* =========================================================
   AUTO-UPDATE PWA — banner di avviso + pannello in Impostazioni.
   Il nuovo codice si scarica in background e resta in attesa;
   l'utente decide QUANDO applicarlo. I dati (localStorage) restano intatti.
   ========================================================= */
const APP_VERSION='volleyteam-v55';   /* combacia col CACHE_VERSION di sw.js */
let swReg=null, pwaRefreshing=false;
function pwaCSS(){
  if(document.getElementById('pwa-css')) return;
  const st=document.createElement('style'); st.id='pwa-css';
  st.textContent=`
  #pwa-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 74px);z-index:9999;
    display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:14px;max-width:calc(100% - 24px);
    background:var(--surface-2,#161a22);color:var(--text,#fff);border:1px solid var(--brand);box-shadow:0 8px 30px rgba(0,0,0,.45);animation:pwaUp .25s ease;}
  @keyframes pwaUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
  #pwa-banner .pwa-msg{font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:8px;}
  #pwa-banner .pwa-msg i{color:var(--brand);}
  #pwa-banner .pwa-acts{display:flex;gap:8px;margin-left:auto;}
  #pwa-banner button{border:none;border-radius:9px;padding:8px 12px;font-weight:700;cursor:pointer;font-size:.82rem;}
  #pwa-banner .pwa-later{background:transparent;color:var(--muted);border:1px solid var(--border,rgba(255,255,255,.18));}
  #pwa-banner .pwa-now{background:var(--brand);color:#04140a;}
  @media(min-width:900px){#pwa-banner{bottom:24px;}}
  .pwa-state{margin-bottom:1rem;font-size:.9rem;} .pwa-ok{color:var(--muted);}
  .pwa-badge-new{display:inline-block;background:var(--brand);color:#04140a;font-weight:800;border-radius:20px;padding:2px 10px;font-size:.78rem;margin-right:8px;}
  `;
  document.head.appendChild(st);
}
function pwaShowBanner(){
  pwaCSS();
  if(document.getElementById('pwa-banner')) return;
  const b=document.createElement('div'); b.id='pwa-banner';
  b.innerHTML=`<span class="pwa-msg"><i class="fa-solid fa-arrows-rotate"></i> Nuova versione disponibile</span>
    <div class="pwa-acts">
      <button class="pwa-later" onclick="pwaDismissBanner()">Più tardi</button>
      <button class="pwa-now" onclick="pwaApplyUpdate()">Aggiorna ora</button>
    </div>`;
  document.body.appendChild(b);
  pwaMarkSettings(true);
}
function pwaDismissBanner(){ const b=document.getElementById('pwa-banner'); if(b)b.remove(); }
function pwaApplyUpdate(){
  const w = swReg && swReg.waiting;
  if(w){ w.postMessage({type:'SKIP_WAITING'}); }   /* controllerchange → reload */
  else { location.reload(); }
}
function pwaMarkSettings(available){
  const el=document.getElementById('pwa-settings-state'); if(!el) return;
  el.innerHTML = available
    ? `<span class="pwa-badge-new">Aggiornamento pronto</span><button class="btn btn-accent" onclick="pwaApplyUpdate()"><i class="fa-solid fa-arrows-rotate"></i> Aggiorna adesso</button>`
    : `<span class="pwa-ok">Sei alla versione più recente (${APP_VERSION}).</span>`;
}
function pwaCheckNow(){
  if(!swReg){ toast('Aggiornamenti non disponibili in questa modalità','info'); return; }
  toast('Controllo aggiornamenti…');
  swReg.update().then(()=>setTimeout(()=>{
    if(swReg.waiting){ pwaShowBanner(); pwaMarkSettings(true); toast('Aggiornamento trovato'); }
    else { pwaMarkSettings(false); toast('Sei già aggiornato'); }
  },900)).catch(()=>toast('Controllo non riuscito','info'));
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(pwaRefreshing) return; pwaRefreshing=true; location.reload();
  });
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      swReg=reg;
      if(reg.waiting) pwaShowBanner();                 /* update già pronto all'avvio */
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing; if(!nw) return;
        nw.addEventListener('statechange',()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller) pwaShowBanner();
        });
      });
      pwaMarkSettings(!!reg.waiting);
    }).catch(err=>console.warn('SW non registrato',err));
  });
}

/* =========================================================
   CONDIVISIONE COL GIOCATORE (pacchetto offline)
   ========================================================= */
/* =========================================================
   LINEUP CONSIGLIATA per il pacchetto sync (tutti gli sport)
   Coordinate normalizzate 0..1 per ciascuno sport (indipendenti tra loro).
   Calcio: riusa l'engine gia' esistente soccerLineup() (modulo/posizioni/sostituzioni del coach).
   Pallavolo: nuovo — 6 zone di rotazione P1..P6 (P4-P3-P2 avanti, P5-P6-P1 dietro); un giocatore per
   ruolo (palleggiatore, opposto, 2 centrali, 2 schiacciatori, libero). Il libero prende la zona P6
   (il centrale che ruoterebbe dietro), come da regolamento pallavolo.
   Basket: nuovo — 5 posizioni base su mezzo campo (nessun motore per il basket esisteva in Formazione).
   ========================================================= */
const VOLLEY_ZONES=[['P4',.2,.22],['P3',.5,.18],['P2',.8,.22],['P5',.2,.78],['P6',.5,.82],['P1',.8,.78]];
/* Ordine di ruolo lungo il giro di rotazione P1→P2→P3→P4→P5→P6 quando il palleggiatore
   parte da P1 (rotazione 1): Palleggiatore, Schiacciatore, Centrale, Opposto (sempre
   opposto al palleggiatore, 3 zone dopo), Schiacciatore, Libero (sostituisce il centrale
   che tornerebbe dietro). Per far partire il palleggiatore da un'altra zona (rotazione N)
   basta scorrere questo stesso ciclo di quante zone lo separano da P1. */
const VOLLEY_ROLE_CYCLE=[['Palleggiatore',0],['Schiacciatore',0],['Centrale',0],['Opposto',0],['Schiacciatore',1],['Libero',0]];
function volleyZoneRoleMap(startRot){
  const off=(((startRot||1)-1)%6+6)%6;
  const zones=['P1','P2','P3','P4','P5','P6'], map={};
  zones.forEach((z,i)=>{ map[z]=VOLLEY_ROLE_CYCLE[(i-off+6)%6]; });
  return map;
}
function getLineupPallavolo(){ DB.settings=DB.settings||{}; DB.settings.lineup=DB.settings.lineup||{}; DB.settings.lineup.pallavolo=DB.settings.lineup.pallavolo||{rotation:1}; if(!DB.settings.lineup.pallavolo.rotation) DB.settings.lineup.pallavolo.rotation=1; return DB.settings.lineup.pallavolo; }
function setLineupRotation(r){ const L=getLineupPallavolo(); L.rotation=r; save(); renderFormazione(); }
const BASKET_POS={Playmaker:[.5,.85],Guardia:[.82,.55],'Ala piccola':[.18,.55],'Ala grande':[.7,.25],Centro:[.5,.1]};
function lineupSlot(zr,p,v,x,y){ return {ruolo_o_zona:zr,playerName:p.name,number:p.number,overall:cphOverall(v),tier:playerTier(p.id),x:+x.toFixed(3),y:+y.toFixed(3)}; }
function computeLineupCalcio(){
  const {slots}=soccerLineup();
  return slots.filter(s=>s.player).map(s=>lineupSlot(s.role,s.player,getSeasonStats(s.player.id).avgVoto,s.x,s.y));
}
function computeLineupPallavolo(){
  const roleMap=volleyZoneRoleMap(getLineupPallavolo().rotation);
  const players=activePlayers().map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const byRole=r=>players.filter(x=>x.p.role===r).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  const out=[];
  VOLLEY_ZONES.forEach(([z,x,y])=>{
    const [role,idx]=roleMap[z]; const pick=byRole(role)[idx];
    if(pick) out.push(lineupSlot(z,pick.p,pick.v,x,y));
  });
  return out;
}
function computeLineupBasket(){
  const players=activePlayers().map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const byRole=r=>players.filter(x=>x.p.role===r).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  const out=[];
  Object.keys(BASKET_POS).forEach(role=>{
    const pick=byRole(role)[0]; if(!pick) return;
    const [x,y]=BASKET_POS[role]; out.push(lineupSlot(role,pick.p,pick.v,x,y));
  });
  return out;
}
function computeLineup(sport){
  sport=sport||curSport();
  if(sport==='calcio') return computeLineupCalcio();
  if(sport==='pallavolo') return computeLineupPallavolo();
  if(sport==='basket') return computeLineupBasket();
  return [];
}
function showLineupOverall(){ return !(DB.settings&&DB.settings.showLineupOverall===false); }
function setShowLineupOverall(v){ DB.settings=DB.settings||{}; DB.settings.showLineupOverall=!!v; save(); toast(v?'Overall visibile ai giocatori':'Overall nascosto ai giocatori','info'); }
function buildLineupPackage(sport){
  sport=sport||curSport();
  let slots; try{ slots=computeLineup(sport); }catch(e){ slots=[]; }
  if(!slots||!slots.length) return null;
  const showOverall=showLineupOverall();
  const clean=slots.map(s=>{ const o={ruolo_o_zona:s.ruolo_o_zona,playerName:s.playerName,number:s.number,tier:s.tier,x:s.x,y:s.y}; if(showOverall) o.overall=s.overall; return o; });
  return {sport,showOverall,slots:clean};
}
function buildPlayerPackage(id, photo){
    const sport=curSport();
    const p=playerById(id), s=getSeasonStats(id), voti=getPlayerVoti(id);
    const matches=DB.scoutHistory.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(m=>{
        const r=m.rows.find(x=>x.pId===id); if(!r) return null;
        const ev=DB.events.find(e=>e.id===m.matchId);
        return {d:m.date,o:m.opponent,res:(ev&&ev.result)||null,voto:+rowVoto(r,m.sport).toFixed(1),cells:SCOUT[sport].season(r).slice(0,3)};
    }).filter(Boolean);
    const att=DB.events.filter(e=>e.type==='Allenamento').sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>{
        const a=DB.attendance[e.id]; const st=a&&a[id]?a[id]:null; if(!st) return null;
        return {d:e.date,n:e.notes,s:st};
    }).filter(Boolean);
    const cal=DB.events.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>({t:e.type,d:e.date,n:e.notes,res:e.result||null}));
    const ex=DB.events.filter(e=>e.type==='Allenamento').sort((a,b)=>new Date(a.date)-new Date(b.date)).map(ev=>{
        const tr=DB.trainings[ev.id]; if(!tr) return null;
        const g=tr.grades[id]||{};
        const items=(tr.exercises||[]).map(x=>(g[x.id]!=null?{name:x.name,cat:x.cat,grade:g[x.id]}:null)).filter(Boolean);
        const note=(tr.notes&&tr.notes[id])||'';
        if(!items.length && !note) return null;
        return {d:ev.date,n:ev.notes,note,items};
    }).filter(Boolean);
    const tstat=playerTrainingStats(id);
    const pkg={v:2,k:'vtm-player',photo:photo||null,sport,team:DB.teamName,gen:new Date().toISOString(),
        p:{name:p.name,number:p.number,role:p.role,hand:p.hand||'Dx',height:p.height||0,cap:!!p.isCaptain,vice:!!p.isViceCaptain,status:p.status||'active',goal:p.goal||''},
        voti:voti.map(v=>({d:v.date,v:v.voto,o:v.opp})),
        season:{matches:s.matches,avgVoto:s.avgVoto,cells:s.cells},
        training:{avg:tstat.avg,count:tstat.count,byCat:tstat.byCat},
        matches, cal, att, attPct:playerAttendance(id), ex};
    const lineup=buildLineupPackage(sport);
    if(lineup) pkg.lineup=lineup;
    return pkg;
}
function encodePkg(o){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function slug(s){ return s.toLowerCase().normalize('NFD').replace(/[^\w]+/g,'-').replace(/^-|-$/g,''); }
async function sharePlayer(id){
    const photo=await cIdbGet('p'+id); const p=playerById(id); const pkg=buildPlayerPackage(id,photo); const code=encodePkg(pkg);
    openModal(`
      <div class="modal-head"><h3><i class="fa-solid fa-share-nodes" style="color:var(--brand)"></i> Condividi · ${p.name}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Manda al giocatore <b>il file</b> (consigliato, via WhatsApp/email) oppure <b>il codice</b> da incollare nella sua app. Aggiorna e riinvia dopo ogni partita o allenamento.</p>
        <button class="btn btn-accent" style="width:100%;margin-bottom:14px" onclick="downloadPlayerPkg(${id})"><i class="fa-solid fa-download"></i> Scarica file profilo</button>
        <label style="font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600">Oppure codice da copiare</label>
        <textarea id="share-code" readonly style="width:100%;height:90px;margin-top:6px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted);border-radius:10px;padding:10px;font-size:.72rem;resize:none;font-family:monospace">${code}</textarea>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="copyShare()"><i class="fa-solid fa-copy"></i> Copia codice</button>
        ${DEMO_BUILD?`
        <p class="hint" style="margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);line-height:1.5"><i class="fa-solid fa-circle-info"></i> La ricezione dei dati nell'app Player (statistiche, card, formazione consigliata) è disponibile solo con la versione completa. In prova puoi generare il codice di esempio, ma serve l'app Player per riceverlo.</p>`:''}
      </div>`);
}
function copyShare(){
    const ta=document.getElementById('share-code'); ta.select();
    navigator.clipboard?.writeText(ta.value).then(()=>toast('Codice copiato')).catch(()=>{document.execCommand('copy');toast('Codice copiato');});
}
async function downloadPlayerPkg(id){
    const photo=await cIdbGet('p'+id); const p=playerById(id); const pkg=buildPlayerPackage(id,photo);
    const blob=new Blob([JSON.stringify(pkg)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`profilo-${slug(p.name)}.vtm.json`; a.click(); URL.revokeObjectURL(url);
    toast('File profilo scaricato');
}

/* ---------- sync inverso: importa il codice "statistiche mentali" inviato dal giocatore (Mental Gym) ---------- */
function decodeMentalPkg(code){ return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
function openImportMental(){
    openModal(`
      <div class="modal-head"><h3><i class="fa-solid fa-brain" style="color:var(--brand)"></i> Importa statistiche mentali</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Incolla qui il codice che il giocatore ti ha inviato dall'app Player (Mental Gym → "Invia al mister"). Aggiorna i suoi valori Riflessi/Percezione sulla card, trovando il giocatore per numero di maglia (o nome).</p>
        <textarea id="mental-code" style="width:100%;height:100px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font-size:.72rem;resize:none;font-family:monospace" placeholder="Incolla qui il codice…"></textarea>
        <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="importMentalCode()"><i class="fa-solid fa-check"></i> Importa</button>
      </div>`);
}
function importMentalCode(){
    const ta=document.getElementById('mental-code'); const raw=ta?ta.value:'';
    let pkg;
    try{ pkg=decodeMentalPkg(raw); }catch(e){ toast('Codice non valido','danger'); return; }
    if(!pkg||pkg.k!=='vtm-mental'||!pkg.mentalStats){ toast('Codice non valido','danger'); return; }
    let p=null;
    if(pkg.number!=null) p=DB.players.find(x=>x.number===pkg.number);
    if(!p && pkg.playerName) p=DB.players.find(x=>x.name && x.name.trim().toLowerCase()===String(pkg.playerName).trim().toLowerCase());
    if(!p){ toast('Giocatore non trovato, verifica numero/nome','danger'); return; }
    p.mentalStats={
        riflessi: pkg.mentalStats.riflessi!=null?pkg.mentalStats.riflessi:null,
        percezione: pkg.mentalStats.percezione!=null?pkg.mentalStats.percezione:null,
        aggiornato: pkg.mentalStats.aggiornato||new Date().toISOString()
    };
    save();
    closeModal();
    toast(`Statistiche mentali aggiornate per ${p.name}`);
}

/* ---------- sync inverso: importa lo storico "check-in benessere" inviato dal giocatore ---------- */
function decodeWellnessPkg(code){ return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
function openImportWellness(){
    openModal(`
      <div class="modal-head"><h3><i class="fa-solid fa-heart-pulse" style="color:var(--brand)"></i> Importa check-in benessere</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <p style="color:var(--muted);margin-bottom:1rem;font-size:.9rem">Incolla qui il codice che il giocatore ti ha inviato dall'app Player (Check-in benessere → "Invia al mister"). Aggiorna sonno, affaticamento, umore e zone segnalate nella sua scheda atleta, trovando il giocatore per numero di maglia (o nome).</p>
        <textarea id="wellness-code" style="width:100%;height:100px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font-size:.72rem;resize:none;font-family:monospace" placeholder="Incolla qui il codice…"></textarea>
        <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="importWellnessCode()"><i class="fa-solid fa-check"></i> Importa</button>
      </div>`);
}
function importWellnessCode(){
    const ta=document.getElementById('wellness-code'); const raw=ta?ta.value:'';
    let pkg;
    try{ pkg=decodeWellnessPkg(raw); }catch(e){ toast('Codice non valido','danger'); return; }
    if(!pkg||pkg.k!=='vtm-wellness'||!Array.isArray(pkg.checkins)){ toast('Codice non valido','danger'); return; }
    let p=null;
    if(pkg.number!=null) p=DB.players.find(x=>x.number===pkg.number);
    if(!p && pkg.playerName) p=DB.players.find(x=>x.name && x.name.trim().toLowerCase()===String(pkg.playerName).trim().toLowerCase());
    if(!p){ toast('Giocatore non trovato, verifica numero/nome','danger'); return; }
    p.wellness=p.wellness||[];
    const known=new Set(p.wellness.map(c=>c.date));
    pkg.checkins.forEach(c=>{ if(c&&c.date&&!known.has(c.date)){ p.wellness.push(c); known.add(c.date); } });
    p.wellness.sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(p.wellness.length>30) p.wellness=p.wellness.slice(-30);
    save();
    closeModal();
    toast(`Check-in benessere aggiornato per ${p.name}`);
}

/* =========================================================
   ALLENAMENTI & VOTI
   ========================================================= */
const CAT_COLOR={Riscaldamento:'#8395B4',Battuta:'#F0463C',Ricezione:'#22C55E',Palleggio:'#5b9dff',Attacco:'#F5B301',Muro:'#a78bfa',Difesa:'#2dd4bf',Fisico:'#fb923c',Tattica:'#e879f9',
  Tecnica:'#5b9dff',Possesso:'#34d399',Finalizzazione:'#F5B301',Transizioni:'#f472b6','Palle inattive':'#c084fc',Portieri:'#38bdf8','Partite a tema':'#fb7185',
  Tiro:'#F5B301',Passaggio:'#5b9dff','1 contro 1':'#f472b6',Transizione:'#f472b6',Rimbalzo:'#2dd4bf'};
/* Categorie di allenamento per sport (la prima è il default del menu) */
const SPORT_CATS={
  pallavolo:['Riscaldamento','Battuta','Ricezione','Palleggio','Attacco','Muro','Difesa','Fisico','Tattica'],
  calcio:['Riscaldamento','Tecnica','Possesso','Finalizzazione','Difesa','Transizioni','Palle inattive','Portieri','Fisico','Partite a tema'],
  basket:['Riscaldamento','Palleggio','Tiro','Passaggio','1 contro 1','Difesa','Transizione','Rimbalzo','Tattica','Fisico']
};
const SPORT_LABEL={pallavolo:'Pallavolo',calcio:'Calcio',basket:'Basket'};
/* Libreria esercizi curata per sport → categoria (senza gif, in italiano). Espandibile con quelli custom del mister. */
const EXERCISE_LIB={
  pallavolo:{
    Riscaldamento:['Corsa e mobilità articolare','Andature coordinative','Attivazione con palla a coppie','Spostamenti e scivolamenti','Salti e atterraggi controllati','Reattività e cambi di direzione'],
    Battuta:['Battuta float da fondo','Battuta in salto (spin)','Battuta mirata a zone','Battuta sotto punteggio','Serie di precisione','Battuta e transizione in difesa'],
    Ricezione:['Ricezione in bagher zona 5','Ricezione float a coppie','Ricezione e appoggio al palleggiatore','Ricezione con spostamento','Ricezione 3 zone a rotazione','Ricezione sotto battuta in salto'],
    Palleggio:['Palleggio in salto','Palleggio dietro la testa','Alzata di seconda linea','Precisione a bersaglio','Palleggio in sospensione a coppie','Alzata in transizione veloce'],
    Attacco:['Attacco da posto 4','Attacco da posto 2','Primo tempo al centro','Pipe da seconda linea','Attacco su palla staccata','Colpi di controllo e pallonetto'],
    Muro:['Muro di reparto a due','Spostamento e muro a uno','Muro su primo tempo','Lettura e timing a muro','Muro-difesa combinato','Muro sull\'ala esterna'],
    Difesa:['Difesa in tuffo','Copertura dell\'attacco','Difesa su pallonetto','Bagher di controllo in movimento','Difesa a rombo','Rimessa dopo muro avversario'],
    Fisico:['Forza esplosiva arti inferiori','Pliometria e salti','Core stability','Rapidità e cambi di direzione','Resistenza specifica','Mobilità e prevenzione spalle'],
    Tattica:['Cambio-palla completo','Fase break point','Ricezione-attacco per rotazione','Situazioni di punteggio','Sistema muro-difesa','Gestione del set punto a punto']
  },
  calcio:{
    Riscaldamento:['Attivazione tecnica con palla','Corsa e mobilità articolare','Torello 4 contro 2','Andature coordinative','Attivazione neuromuscolare','Rondo di riscaldamento'],
    Tecnica:['Controllo orientato','Conduzione tra i coni','Passaggio e ricezione a coppie','Trasmissione a un tocco','Guida della palla in slalom','Colpo di testa a coppie'],
    Possesso:['Possesso palla 4 contro 4','Rondo 5 contro 2','Mantenimento sotto pressione','Possesso a tema con sponde','Gioco di posizione a 3 linee','Cambio gioco e ampiezza'],
    Finalizzazione:['Tiro in porta dopo controllo','Conclusione da fuori area','Uno contro uno col portiere','Cross e finalizzazione','Combinazione e tiro','Finalizzazione in transizione'],
    Difesa:['Marcatura 1 contro 1','Contrasto e recupero palla','Movimento della linea difensiva','Pressing organizzato','Chiusure e coperture','Difesa 2 contro 2'],
    Transizioni:['Transizione dopo recupero','Ripartenza in contropiede','Riaggressione immediata','Situazione 3 contro 2','Cambio fase su palla persa','Contropiede a campo aperto'],
    'Palle inattive':['Calcio d\'angolo offensivo','Punizione dalla trequarti','Rimessa laterale organizzata','Difesa sui calci piazzati','Schema su punizione','Rigori sotto pressione'],
    Portieri:['Presa alta e bassa','Tuffi e respinte','Uscite sui cross','Gioco coi piedi','Rinvio e costruzione','Uno contro uno in uscita'],
    Fisico:['Forza e potenza','Rapidità e agilità','Resistenza aerobica','Cambi di direzione','Navette a intensità','Core e prevenzione'],
    'Partite a tema':['Partitella a due tocchi','Small sided game 5 contro 5','Gioco a tema pressing','Partita con jolly','Superiorità numerica','Partita a campo ridotto']
  },
  basket:{
    Riscaldamento:['Palleggio in movimento','Andature e scivolamenti','Attivazione a coppie','Ball handling stazionario','Corsa e mobilità','Riscaldamento ai tiri liberi'],
    Palleggio:['Palleggio a due palle','Partenze in palleggio','Cambi di mano e direzione','Palleggio-arresto-tiro','Palleggio in traffico','Coordinazione mano debole'],
    Tiro:['Tiro in corsa (terzo tempo)','Arresto e tiro','Tiro da tre posizioni','Tiro dopo palleggio','Catch and shoot','Serie di tiri liberi'],
    Passaggio:['Passaggio a due mani','Passaggio in transizione','Smistamento e taglio','Passaggio no-look controllato','Ricezione e apertura','Passaggio dal post'],
    '1 contro 1':['1 contro 1 dalla punta','1 contro 1 in post basso','Lettura del difensore','Finte e cambi di ritmo','1 contro 1 dal palleggio','Attacco del recupero'],
    Difesa:['Scivolamenti difensivi','Difesa sull\'uomo con palla','Aiuti e recuperi','Difesa 1 contro 1','Chiusure a canestro','Contestazione del tiro'],
    Transizione:['Contropiede 2 contro 1','Transizione 3 contro 2','Difesa in transizione','Correre il campo','Cambio canestro rapido','Ripartenza dopo rimbalzo'],
    Rimbalzo:['Tagliafuori a coppie','Rimbalzo offensivo e tap-in','Rimbalzo difensivo e apertura','Lotta a rimbalzo 3 contro 3','Timing di salto','Rimbalzo e contropiede'],
    Tattica:['Dai e vai (give and go)','Penetra e scarica','Blocco sulla palla','Tagli e smarcamenti','Gioco in post','Situazioni 5 contro 5'],
    Fisico:['Forza esplosiva','Rapidità e agilità','Salto e pliometria','Resistenza specifica','Cambi di direzione','Core stability']
  }
};
function catsFor(sport){ return SPORT_CATS[sport||curSport()] || SPORT_CATS.pallavolo; }
/* Libreria dello sport corrente = built-in + esercizi custom del mister, come array {name,cat,custom} */
function exLibFor(sport){
  sport=sport||curSport();
  const out=[]; const seen=new Set();
  const push=(name,cat,custom)=>{ const key=(cat+'|'+name).toLowerCase(); if(seen.has(key))return; seen.add(key); out.push(Object.assign({name,cat,custom:!!custom},getExMeta(sport,cat,name))); };
  const lib=EXERCISE_LIB[sport]||{};
  Object.keys(lib).forEach(cat=>lib[cat].forEach(n=>push(n,cat,false)));
  const custom=((DB.settings||{}).customExercises||{})[sport]||{};
  Object.keys(custom).forEach(cat=>(custom[cat]||[]).forEach(n=>push(n,cat,true)));
  return out;
}
function rememberCustomExercise(sport,name,cat){
  const lib=EXERCISE_LIB[sport]||{};
  if((lib[cat]||[]).some(n=>n.toLowerCase()===name.toLowerCase())) return; // già built-in
  DB.settings=DB.settings||{}; DB.settings.customExercises=DB.settings.customExercises||{};
  const cs=DB.settings.customExercises; cs[sport]=cs[sport]||{}; cs[sport][cat]=cs[sport][cat]||[];
  if(!cs[sport][cat].some(n=>n.toLowerCase()===name.toLowerCase())) cs[sport][cat].push(name);
}
function exerciseKnown(sport,name,cat){
  const lib=EXERCISE_LIB[sport]||{}, custom=((DB.settings||{}).customExercises||{})[sport]||{};
  const has=arr=>(arr||[]).some(n=>n.toLowerCase()===name.toLowerCase());
  return has(lib[cat])||has(custom[cat]);
}
/* --- Campi ricchi esercizio: dur (min), focus (obiettivo), intensity (bassa|media|alta), desc ---
   Salvati in un overlay separato (DB.settings.exMeta) cosi' funzionano sia sugli esercizi
   custom sia su quelli built-in/libreria, senza toccare le liste esistenti. */
function exSchemeDesc(sport,name){
  const list=(window.EX_SCHEMES&&window.EX_SCHEMES[sport])||[];
  const s=list.find(x=>x.name.toLowerCase()===(name||'').toLowerCase());
  return (s&&s.desc)||'';
}
function getExMeta(sport,cat,name){
  const k=exKeyOf(sport,cat,name);
  const m=((DB.settings||{}).exMeta||{})[k]||{};
  return {
    dur:m.dur||null,
    focus:m.focus||'',
    intensity:m.intensity||'',
    desc:m.desc||exSchemeDesc(sport,name)||''
  };
}
function setExMeta(sport,cat,name,meta){
  DB.settings=DB.settings||{}; DB.settings.exMeta=DB.settings.exMeta||{};
  const k=exKeyOf(sport,cat,name); const clean={};
  if(meta&&meta.dur) clean.dur=meta.dur;
  if(meta&&meta.focus) clean.focus=(meta.focus+'').trim();
  if(meta&&meta.intensity) clean.intensity=meta.intensity;
  if(meta&&meta.desc) clean.desc=(meta.desc+'').trim();
  if(Object.keys(clean).length) DB.settings.exMeta[k]=clean; else delete DB.settings.exMeta[k];
  save();
}
function intensityColor(v){ return v==='alta'?'#EF4444':v==='media'?'#F5B301':v==='bassa'?'#22C55E':''; }
function intensityLabel(v){ return v==='alta'?'Alta':v==='media'?'Media':v==='bassa'?'Bassa':''; }
function isCustomExercise(sport,cat,name){
  const cs=((DB.settings||{}).customExercises||{})[sport]||{};
  return (cs[cat]||[]).some(n=>n.toLowerCase()===(name||'').toLowerCase());
}
function deleteCustomExercise(sport,cat,name){
  DB.settings=DB.settings||{}; const cs=(DB.settings.customExercises||{})[sport]||{};
  if(cs[cat]) cs[cat]=cs[cat].filter(n=>n.toLowerCase()!==name.toLowerCase());
  if(DB.settings.exMeta) delete DB.settings.exMeta[exKeyOf(sport,cat,name)];
  save();
}
/* --- Modale libreria esercizi --- */
let EXLIB_FILTER={cat:'',q:''};
function openExLibrary(){
  if(!currentTraining()){ toast('Scegli prima una seduta','info'); return; }
  exLibCSS(); EXLIB_FILTER={cat:'',q:''};
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-book-open" style="color:var(--brand)"></i> Libreria esercizi · ${SPORT_LABEL[curSport()]||''}</h3>
      <button class="icon-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="exlib">
      <input class="exlib-search" id="exlib-q" placeholder="Cerca un esercizio…" oninput="exLibSet('q',this.value)">
      <div class="exlib-cats" id="exlib-cats"></div>
      <div class="exlib-list" id="exlib-list"></div>
      <div class="exlib-new">
        <p class="exlib-hint" style="margin-bottom:6px">Non c'è l'esercizio che ti serve? Crealo e resterà nella tua libreria.</p>
        <input class="exlib-search" id="exlib-newname" placeholder="Es. Attacco primo tempo per centrali…">
        <div style="display:flex;gap:8px;margin-top:8px">
          <select class="exlib-search" id="exlib-newcat" style="flex:1"></select>
          <input class="exlib-search" type="number" min="0" id="exlib-newdur" placeholder="Min" style="max-width:84px">
        </div>
        <input class="exlib-search" id="exlib-newfocus" placeholder="Obiettivo (facoltativo)" style="margin-top:8px">
        <div class="seg" id="exlib-newint-seg" style="margin-top:8px">
          ${['bassa','media','alta'].map(v=>`<button type="button" class="exlib-chip seg-btn" data-v="${v}" style="--c:${intensityColor(v)}" onclick="exlibNewSetIntensity('${v}')">${intensityLabel(v)}</button>`).join('')}
        </div>
        <textarea class="exlib-search" id="exlib-newdesc" rows="2" placeholder="Descrizione (facoltativa)" style="margin-top:8px;resize:vertical"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn btn-accent" style="white-space:nowrap" onclick="createLibExercise()"><i class="fa-solid fa-plus"></i> Salva</button>
        </div>
      </div>
      <p class="exlib-hint">Tocca <b>+</b> per aggiungere alla seduta, <b><i class="fa-solid fa-circle-info"></i></b> per i dettagli. Gli esercizi che scrivi a mano nella seduta finiscono qui in automatico.</p>
    </div>`, true);
  renderExLibCats(); renderExLibList();
  const nc=document.getElementById('exlib-newcat'); if(nc) nc.innerHTML=catsFor(curSport()).map(c=>`<option>${c}</option>`).join('');
  window.__exlibNewInt='';
}
function exlibNewSetIntensity(v){ window.__exlibNewInt=v; document.querySelectorAll('#exlib-newint-seg .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.v===v)); }
function createLibExercise(){
  const name=(document.getElementById('exlib-newname').value||'').trim();
  const cat=document.getElementById('exlib-newcat').value;
  if(!name){ toast('Scrivi il nome dell\'esercizio','info'); return; }
  if(exerciseKnown(curSport(),name,cat)){ toast('Esercizio già in libreria','info'); return; }
  rememberCustomExercise(curSport(),name,cat);
  const dur=parseInt(document.getElementById('exlib-newdur').value,10)||null;
  const focus=(document.getElementById('exlib-newfocus').value||'').trim();
  const desc=(document.getElementById('exlib-newdesc').value||'').trim();
  setExMeta(curSport(),cat,name,{dur,focus,intensity:window.__exlibNewInt||'',desc});
  document.getElementById('exlib-newname').value='';
  document.getElementById('exlib-newdur').value='';
  document.getElementById('exlib-newfocus').value='';
  document.getElementById('exlib-newdesc').value='';
  window.__exlibNewInt=''; document.querySelectorAll('#exlib-newint-seg .seg-btn').forEach(b=>b.classList.remove('on'));
  EXLIB_FILTER.cat=cat; EXLIB_FILTER.q=''; const qEl=document.getElementById('exlib-q'); if(qEl) qEl.value='';
  renderExLibCats(); renderExLibList();
  toast('Salvato in libreria: '+name);
}
function exLibSet(k,v){ EXLIB_FILTER[k]=v; if(k==='cat') renderExLibCats(); renderExLibList(); }
function renderExLibCats(){
  const box=document.getElementById('exlib-cats'); if(!box) return;
  const cats=catsFor(curSport());
  box.innerHTML=`<button class="exlib-chip${EXLIB_FILTER.cat===''?' on':''}" onclick="exLibSet('cat','')">Tutte</button>`+
    cats.map(c=>`<button class="exlib-chip${EXLIB_FILTER.cat===c?' on':''}" style="--c:${CAT_COLOR[c]||'#8395B4'}" onclick="exLibSet('cat','${c.replace(/'/g,"\\'")}')">${c}</button>`).join('');
}
function renderExLibList(){
  const box=document.getElementById('exlib-list'); if(!box) return;
  const q=(EXLIB_FILTER.q||'').toLowerCase().trim();
  const items=exLibFor(curSport()).filter(e=>(!EXLIB_FILTER.cat||e.cat===EXLIB_FILTER.cat) && (!q||e.name.toLowerCase().includes(q)||e.cat.toLowerCase().includes(q)));
  if(!items.length){ box.innerHTML='<p class="exlib-empty">Nessun esercizio trovato. Puoi comunque aggiungerne uno tuo dal modulo qui sotto.</p>'; return; }
  box.innerHTML=items.map(e=>{ const dk=exKeyOf(curSport(),e.cat,e.name); const drawn=(DB.settings&&DB.settings.exDrawn&&DB.settings.exDrawn.includes(dk))||schemeExists(curSport(),e.name);
    const ic=intensityColor(e.intensity);
    const badges=(e.dur||e.intensity)?`<div class="exlib-meta">${e.dur?`<span class="exlib-badge"><i class="fa-solid fa-clock"></i> ${e.dur}'</span>`:''}${e.intensity?`<span class="exlib-badge" style="color:${ic};border-color:${ic}66"><i class="fa-solid fa-bolt"></i> ${intensityLabel(e.intensity)}</span>`:''}</div>`:'';
    return `<div class="exlib-row">
      <span class="exlib-dot" style="background:${CAT_COLOR[e.cat]||'#8395B4'}"></span>
      <div class="exlib-main">
        <span class="exlib-name">${e.name}${e.custom?' <i class="exlib-custom">tuo</i>':''}</span>
        ${badges}
      </div>
      <span class="exlib-cat">${e.cat}</span>
      <button class="exlib-draw" title="Dettagli esercizio" onclick="openExDetail('${curSport()}','${e.cat.replace(/'/g,"\\'")}','${e.name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-circle-info"></i></button>
      <button class="exlib-draw${drawn?' has':''}" title="Disegna schema" onclick="openExerciseDraw('${e.name.replace(/'/g,"\\'")}','${e.cat.replace(/'/g,"\\'")}')"><i class="fa-solid fa-pen-ruler"></i></button>
      <button class="exlib-add" onclick="addExFromLib('${e.name.replace(/'/g,"\\'")}','${e.cat.replace(/'/g,"\\'")}')"><i class="fa-solid fa-plus"></i></button>
    </div>`; }).join('');
}
function openExDetail(sport,cat,name){
  exLibCSS();
  const meta=getExMeta(sport,cat,name), custom=isCustomExercise(sport,cat,name), ic=intensityColor(meta.intensity);
  const esc=s=>(s||'').replace(/"/g,'&quot;');
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-circle-info" style="color:var(--brand)"></i> ${name}</h3>
      <button class="modal-close" onclick="openExLibrary()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="pill" style="background:${CAT_COLOR[cat]||'#8395B4'}22;color:${CAT_COLOR[cat]||'#8395B4'};border:1px solid ${CAT_COLOR[cat]||'#8395B4'}55">${cat}</span>
        ${custom?'<span class="pill" style="background:var(--brand)22;color:var(--brand);border:1px solid var(--brand)55">Tuo</span>':''}
        ${meta.dur?`<span class="pill"><i class="fa-solid fa-clock"></i> ${meta.dur} min</span>`:''}
        ${meta.intensity?`<span class="pill" style="background:${ic}22;color:${ic};border:1px solid ${ic}55"><i class="fa-solid fa-bolt"></i> ${intensityLabel(meta.intensity)}</span>`:''}
      </div>
      ${meta.focus?`<p class="hint" style="margin-bottom:8px"><b>Obiettivo:</b> ${meta.focus}</p>`:''}
      ${meta.desc?`<p style="margin-bottom:16px;line-height:1.5">${meta.desc}</p>`:'<p class="hint" style="margin-bottom:16px">Nessuna descrizione. Aggiungine una qui sotto.</p>'}
      <h4 style="margin:0 0 8px;font-size:.8rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Modifica dettagli</h4>
      <div class="form-row">
        <div class="fg" style="max-width:140px"><label>Durata (min)</label><input type="number" min="0" id="exd-dur" value="${meta.dur||''}"></div>
        <div class="fg"><label>Obiettivo</label><input id="exd-focus" placeholder="Es. Controllo orientato" value="${esc(meta.focus)}"></div>
      </div>
      <div class="fg"><label>Intensità</label>
        <div class="seg" id="exd-int-seg">
          ${['bassa','media','alta'].map(v=>`<button type="button" class="exlib-chip seg-btn${meta.intensity===v?' on':''}" data-v="${v}" style="--c:${intensityColor(v)}" onclick="exdSetIntensity('${v}')">${intensityLabel(v)}</button>`).join('')}
        </div>
      </div>
      <div class="fg"><label>Descrizione</label><textarea id="exd-desc" rows="3" placeholder="Descrizione dell'esercizio…">${meta.desc||''}</textarea></div>
      <div class="modal-buttons">
        <button class="btn btn-ghost" onclick="openExLibrary()">‹ Torna alla libreria</button>
        ${custom?`<button class="btn btn-ghost" style="color:#EF4444" onclick="confirmDeleteExercise('${sport}','${cat.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash-can"></i> Elimina</button>`:''}
        <button class="btn btn-accent" onclick="saveExDetail('${sport}','${cat.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-check"></i> Salva</button>
      </div>
    </div>`, true);
  window.__exdInt=meta.intensity||'';
}
function exdSetIntensity(v){ window.__exdInt=v; document.querySelectorAll('#exd-int-seg .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.v===v)); }
function saveExDetail(sport,cat,name){
  const dur=parseInt(document.getElementById('exd-dur').value,10)||null;
  const focus=(document.getElementById('exd-focus').value||'').trim();
  const desc=(document.getElementById('exd-desc').value||'').trim();
  setExMeta(sport,cat,name,{dur,focus,intensity:window.__exdInt||'',desc});
  toast('Dettagli salvati'); openExLibrary();
}
function confirmDeleteExercise(sport,cat,name){
  confirmAction('Eliminare questo esercizio dalla libreria?',()=>{ deleteCustomExercise(sport,cat,name); toast('Esercizio eliminato','info'); openExLibrary(); });
}
function addExFromLib(name,cat){
  const c=currentTraining(); if(!c) return;
  if(c.tr.exercises.some(x=>x.name.toLowerCase()===name.toLowerCase())){ toast('Già presente nella seduta','info'); return; }
  const id=(c.tr.exercises.reduce((m,x)=>Math.max(m,x.id),0)||0)+1;
  const meta=getExMeta(curSport(),cat,name);
  const item={id,name,cat};
  if(meta.dur) item.dur=meta.dur;
  if(meta.focus) item.focus=meta.focus;
  if(meta.intensity) item.intensity=meta.intensity;
  if(meta.desc) item.desc=meta.desc;
  c.tr.exercises.push(item); save(); renderTraining(); toast('Aggiunto: '+name);
}
function refreshExCats(){
  const sel=document.getElementById('ex-cat'); if(!sel) return;
  const cur=sel.value, cats=catsFor(curSport());
  sel.innerHTML=cats.map(c=>`<option${c===cur?' selected':''}>${c}</option>`).join('');
}
function exLibCSS(){
  if(document.getElementById('exlib-css')) return;
  const st=document.createElement('style'); st.id='exlib-css';
  st.textContent=`
  .exlib{max-height:70vh;display:flex;flex-direction:column;gap:10px;}
  .exlib-search{width:100%;padding:11px 14px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.18));background:var(--surface,rgba(0,0,0,.2));color:inherit;font-size:1rem;}
  .exlib-cats{display:flex;flex-wrap:wrap;gap:6px;}
  .exlib-chip{border:1px solid var(--border,rgba(255,255,255,.16));background:transparent;color:var(--muted);border-radius:20px;padding:5px 11px;font-size:.78rem;font-weight:600;cursor:pointer;}
  .exlib-chip.on{border-color:var(--c,var(--brand));color:#fff;background:color-mix(in srgb,var(--c,var(--brand)) 22%,transparent);}
  .exlib-list{overflow:auto;display:flex;flex-direction:column;gap:6px;padding-right:2px;}
  .exlib-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:11px;background:var(--surface-2,rgba(255,255,255,.03));}
  .exlib-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}
  .exlib-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
  .exlib-name{font-weight:600;font-size:.9rem;} .exlib-custom{font-style:normal;font-size:.62rem;background:var(--brand);color:#04140a;border-radius:5px;padding:0 5px;vertical-align:middle;}
  .exlib-cat{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;}
  .exlib-add{flex:0 0 auto;width:34px;height:34px;border-radius:9px;border:none;background:var(--brand);color:#04140a;font-weight:800;cursor:pointer;}
  .exlib-draw{flex:0 0 auto;width:34px;height:34px;border-radius:9px;border:1px solid var(--line,rgba(255,255,255,.18));background:transparent;color:var(--muted);cursor:pointer;}
  .exlib-draw.has{border-color:var(--brand);color:var(--brand);}
  .exlib-hint{font-size:.76rem;color:var(--muted);margin:0;} .exlib-empty{color:var(--muted);font-style:italic;font-size:.86rem;}
  .exlib-new{border-top:1px solid var(--border,rgba(255,255,255,.12));padding-top:12px;margin-top:2px;}
  .exlib-meta{display:flex;gap:6px;flex-wrap:wrap;}
  .exlib-badge{font-size:.68rem;border:1px solid var(--border,rgba(255,255,255,.18));border-radius:8px;padding:1px 6px;color:var(--muted);display:inline-flex;align-items:center;gap:3px;}
  .seg{display:flex;gap:6px;flex-wrap:wrap;}
  .seg .seg-btn{border-radius:20px;}`;
  document.head.appendChild(st);
}
function currentTraining(){
    const eid=parseInt(document.getElementById('tr-select').value);
    if(!eid) return null;
    if(!DB.trainings[eid]) DB.trainings[eid]={exercises:[],grades:{},notes:{}};
    return {eid,tr:DB.trainings[eid],ev:DB.events.find(e=>e.id===eid)};
}
function populateTraining(){
    const sel=document.getElementById('tr-select'); const cur=sel.value;
    sel.innerHTML='<option value="">Scegli una seduta…</option>';
    DB.events.filter(e=>e.type==='Allenamento').sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(e=>{
        const o=document.createElement('option');o.value=e.id;o.textContent=`${fmtDate(e.date)} · ${e.notes}`;sel.appendChild(o);
    });
    sel.value=cur; renderTraining();
}
function renderTraining(){
    const c=currentTraining(); const panel=document.getElementById('tr-panel');
    if(!c){panel.style.display='none';return;}
    panel.style.display='block';
    refreshExCats();
    // chips esercizi
    const chips=document.getElementById('ex-chips');
    if(!c.tr.exercises.length){chips.innerHTML='<p style="color:var(--muted-2);font-style:italic;font-size:.88rem">Nessun esercizio ancora. Aggiungine uno qui sopra.</p>';}
    else chips.innerHTML=c.tr.exercises.map(x=>{
        const ic=intensityColor(x.intensity);
        const tip=[x.dur?x.dur+' min':'',x.intensity?'Intensità '+intensityLabel(x.intensity):'',x.desc||''].filter(Boolean).join(' · ');
        return `<span class="pill" title="${tip.replace(/"/g,'&quot;')}" style="background:${CAT_COLOR[x.cat]||'var(--surface-3)'}22;color:${CAT_COLOR[x.cat]||'var(--silver)'};border:1px solid ${CAT_COLOR[x.cat]||'var(--line)'}55;margin:0 6px 6px 0;padding:6px 10px;font-size:.8rem">
        <b>${x.name}</b> · ${x.cat}${x.dur?` · ${x.dur}'`:''}${x.intensity?` <i class="fa-solid fa-bolt" style="color:${ic}"></i>`:''} <i class="fa-solid fa-xmark" style="margin-left:6px;cursor:pointer;opacity:.7" onclick="removeExercise(${x.id})"></i></span>`;
    }).join('');
    renderGradeTable(c);
}
function renderGradeTable(c){
    const tbl=document.getElementById('grade-table');
    if(!c.tr.exercises.length){tbl.innerHTML=`<tbody><tr><td style="padding:1.4rem;color:var(--muted-2);font-style:italic">Aggiungi almeno un esercizio per iniziare a votare.</td></tr></tbody>`;return;}
    const roster=activePlayers();
    if(!roster.length){tbl.innerHTML=`<tbody><tr><td style="padding:1.4rem;color:var(--muted-2)">Nessun atleta disponibile.</td></tr></tbody>`;return;}
    const head=`<thead><tr><th style="text-align:left">Giocatore</th>${c.tr.exercises.map(x=>`<th title="${x.cat}" style="max-width:120px"><span class="marquee">${x.name}</span></th>`).join('')}<th>Media</th><th>Nota</th></tr></thead>`;
    const body=roster.map(p=>{
        const g=c.tr.grades[p.id]||{};
        const cells=c.tr.exercises.map(x=>`<td><input class="grade-inp" data-p="${p.id}" data-x="${x.id}" type="number" min="1" max="10" step="0.5" inputmode="decimal" value="${g[x.id]!=null?g[x.id]:''}" oninput="setGrade(${p.id},${x.id},this)"></td>`).join('');
        const avg=sessionAvg(c.tr,p.id);
        const hasNote=!!(c.tr.notes[p.id]);
        const pre=p.isCaptain?'👑 ':p.isViceCaptain?'🥈 ':'';
        return `<tr data-row="${p.id}"><td style="text-align:left;font-weight:600">#${p.number} ${pre}${p.name}</td>${cells}
            <td class="voto num" id="tmedia-${p.id}" style="color:var(--brand)">${avg!=null?avg.toFixed(1):'—'}</td>
            <td><button class="btn ${hasNote?'btn-accent':'btn-ghost'} btn-icon" onclick="sessionNote(${p.id})" title="${hasNote?'Modifica nota':'Aggiungi nota'}"><i class="fa-solid fa-comment${hasNote?'':'-dots'}"></i></button></td></tr>`;
    }).join('');
    tbl.innerHTML=head+'<tbody>'+body+'</tbody>';
    if(window.Marquee){ window.Marquee.rescan(); window.Marquee.refresh(); }
}
function addExercise(e){
    e.preventDefault(); const c=currentTraining(); if(!c)return;
    const name=document.getElementById('ex-name').value.trim(); if(!name)return;
    const id=(c.tr.exercises.reduce((m,x)=>Math.max(m,x.id),0)||0)+1;
    const cat=document.getElementById('ex-cat').value;
    const known=exerciseKnown(curSport(),name,cat);
    const meta=getExMeta(curSport(),cat,name);
    const item={id,name,cat};
    if(meta.dur) item.dur=meta.dur;
    if(meta.focus) item.focus=meta.focus;
    if(meta.intensity) item.intensity=meta.intensity;
    if(meta.desc) item.desc=meta.desc;
    c.tr.exercises.push(item);
    rememberCustomExercise(curSport(),name,cat);
    save(); e.target.reset(); refreshExCats(); renderTraining();
    toast(known?'Esercizio aggiunto':'Aggiunto e salvato in libreria ✓');
}
function removeExercise(exId){
    const c=currentTraining(); if(!c)return;
    confirmAction('Rimuovere questo esercizio e i relativi voti?',()=>{
        c.tr.exercises=c.tr.exercises.filter(x=>x.id!==exId);
        Object.keys(c.tr.grades).forEach(pid=>{ if(c.tr.grades[pid]) delete c.tr.grades[pid][exId]; });
        save(); renderTraining(); toast('Esercizio rimosso','info');
    });
}
function setGrade(pId,exId,el){
    const c=currentTraining(); if(!c)return;
    let v=parseFloat(el.value);
    if(!c.tr.grades[pId]) c.tr.grades[pId]={};
    if(isNaN(v)||el.value===''){ delete c.tr.grades[pId][exId]; }
    else { v=Math.max(1,Math.min(10,v)); c.tr.grades[pId][exId]=v; }
    const avg=sessionAvg(c.tr,pId);
    const cell=document.getElementById('tmedia-'+pId); if(cell) cell.textContent=avg!=null?avg.toFixed(1):'—';
    save();
}
function sessionNote(pId){
    const c=currentTraining(); if(!c)return; const p=playerById(pId);
    openModal(`<div class="modal-head"><h3><i class="fa-solid fa-comment" style="color:var(--brand)"></i> Nota · ${p.name}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><p style="color:var(--muted);font-size:.85rem;margin-bottom:.8rem">Commento sulla seduta "${c.ev.notes}". Lo vedrà il giocatore nella sua app.</p>
        <textarea id="snote" style="width:100%;height:100px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font-size:.9rem">${c.tr.notes[pId]||''}</textarea>
        <div class="modal-buttons"><button class="btn btn-ghost" onclick="closeModal()">Annulla</button>
        <button class="btn btn-accent" onclick="saveSessionNote(${pId})"><i class="fa-solid fa-check"></i> Salva nota</button></div></div>`);
}
function saveSessionNote(pId){
    const c=currentTraining(); if(!c)return;
    const v=document.getElementById('snote').value.trim();
    if(v) c.tr.notes[pId]=v; else delete c.tr.notes[pId];
    save(); closeModal(); renderTraining(); toast('Nota salvata');
}
/* ---- statistiche allenamento per giocatore ---- */
function sessionAvg(tr,pId){
    const g=tr.grades[pId]; if(!g) return null;
    const vals=Object.values(g).filter(v=>typeof v==='number');
    return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function playerTrainingStats(pId){
    const sessions=[]; const catSum={}, catCnt={}; let all=[];
    Object.keys(DB.trainings).forEach(eid=>{
        const tr=DB.trainings[eid]; const ev=DB.events.find(e=>e.id==eid); if(!ev) return;
        const g=tr.grades[pId]; if(!g) return;
        const vals=[];
        (tr.exercises||[]).forEach(x=>{ const v=g[x.id]; if(typeof v==='number'){vals.push(v);all.push(v);
            catSum[x.cat]=(catSum[x.cat]||0)+v; catCnt[x.cat]=(catCnt[x.cat]||0)+1; }});
        if(vals.length) sessions.push({d:ev.date,n:ev.notes,avg:vals.reduce((a,b)=>a+b,0)/vals.length});
    });
    sessions.sort((a,b)=>new Date(a.d)-new Date(b.d));
    const byCat={}; Object.keys(catSum).forEach(c=>byCat[c]=catSum[c]/catCnt[c]);
    return {avg: all.length? all.reduce((a,b)=>a+b,0)/all.length : null, count:sessions.length, sessions, byCat};
}


/* =========================================================
   INIT
   ========================================================= */
document.getElementById('confirm-yes').addEventListener('click',()=>{
    if(_confirmCb)_confirmCb();document.getElementById('confirm-overlay').classList.remove('show');_confirmCb=null;
});
document.getElementById('confirm-no').addEventListener('click',()=>{document.getElementById('confirm-overlay').classList.remove('show');_confirmCb=null;});
document.getElementById('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay')closeModal();});
window.addEventListener('resize',()=>{if(document.getElementById('tattica').classList.contains('active')){const a=document.getElementById('court-area').getBoundingClientRect();initBoard();}});

/* =========================================================
   INTRO — animazione di apertura sport-aware (Modulo M+Bis+Ter), identica al Player.
   Il campo si disegna da solo, zoom verso il centro, alone che pulsa 2-3 volte con
   intensità crescente, esplosione (whoosh) e logo (chime). ~1.65s totali, saltabile
   con un tap, una sola volta per apertura. Il contenitore #pl-intro è già nel markup
   statico di index.html (appare subito); qui costruiamo solo il contenuto sport-aware.
   ========================================================= */
function ciIntroSport(){
  /* a differenza di curSport() (che ha un fallback silenzioso a 'pallavolo' per il
     rendering normale), qui vogliamo sapere se lo sport è stato DAVVERO impostato:
     se DB.sport non c'è ancora (primissima squadra non ancora creata) → campo neutro. */
  try{ if(DB && DB.sport && ['pallavolo','calcio','basket'].includes(DB.sport)) return DB.sport; }catch(e){}
  return null;
}
function ciIntroCourtHTML(sport){
  const STAG=35; // ms tra un tratto e il successivo
  const c='rgba(255,255,255,.85)';
  let shapes;
  if(sport==='pallavolo'){
    shapes=[
      `<rect x="6" y="6" width="388" height="188" stroke="#22C55E" stroke-width="2.5" pathLength="1"/>`,
      `<line x1="200" y1="6" x2="200" y2="194" stroke="#22C55E" stroke-width="3" pathLength="1"/>`,
      `<line x1="135" y1="6" x2="135" y2="194" stroke="#22C55E" stroke-width="1.4" pathLength="1"/>`,
      `<line x1="265" y1="6" x2="265" y2="194" stroke="#22C55E" stroke-width="1.4" pathLength="1"/>`
    ];
  } else if(sport==='calcio'){
    shapes=[
      `<rect x="6" y="6" width="388" height="188" stroke="${c}" stroke-width="2.5" pathLength="1"/>`,
      `<line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<circle cx="200" cy="100" r="34" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<rect x="6" y="55" width="58" height="90" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<rect x="336" y="55" width="58" height="90" stroke="${c}" stroke-width="2" pathLength="1"/>`
    ];
  } else if(sport==='basket'){
    shapes=[
      `<rect x="6" y="6" width="388" height="188" stroke="${c}" stroke-width="2.5" pathLength="1"/>`,
      `<line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<circle cx="200" cy="100" r="26" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<rect x="6" y="64" width="74" height="72" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<rect x="320" y="64" width="74" height="72" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<path d="M80 64 A36 36 0 0 1 80 136" stroke="${c}" stroke-width="2" pathLength="1"/>`,
      `<path d="M320 64 A36 36 0 0 0 320 136" stroke="${c}" stroke-width="2" pathLength="1"/>`
    ];
  } else {
    /* fallback primo avvio: nessuna squadra/sport ancora creato — rettangolo + linea
       centrale, l'elemento comune a tutti i campi, con lo stesso identico effetto di disegno */
    shapes=[
      `<rect x="6" y="6" width="388" height="188" stroke="${c}" stroke-width="2.5" pathLength="1"/>`,
      `<line x1="200" y1="6" x2="200" y2="194" stroke="${c}" stroke-width="2" pathLength="1"/>`
    ];
  }
  const withDelay=shapes.map((s,i)=>s.replace('/>',` style="transition-delay:${(i*STAG/1000).toFixed(3)}s"/>`));
  return `<svg class="pi-court" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet">${withDelay.join('')}</svg>`;
}
function ciIntroRun(){
  const stageEl=document.getElementById('pl-intro-stage'), rootEl=document.getElementById('pl-intro');
  if(!stageEl||!rootEl) return;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sport = ciIntroSport();
  stageEl.innerHTML = ciIntroCourtHTML(sport)+
    `<div class="pi-halo"></div><div class="pi-burst"></div>`+
    `<img class="pi-logo" src="icons/logo-badge.png" alt="">`;

  const timers=[]; let hidden=false;
  const at=(ms,fn)=>timers.push(setTimeout(fn,ms));
  function hide(){
    if(hidden) return; hidden=true;
    timers.forEach(clearTimeout);
    rootEl.classList.add('pi-hide');
    setTimeout(()=>{ if(rootEl&&rootEl.parentNode) rootEl.parentNode.removeChild(rootEl); },380);
  }
  rootEl.addEventListener('click',()=>{ if(window.SoundKit) SoundKit.unlock(); hide(); },{once:true});

  if(reduced){
    stageEl.querySelectorAll('.pi-court>*').forEach(el=>{ el.style.transitionDelay='0s'; });
    stageEl.classList.add('pi-draw','pi-logo-in');
    at(550,hide);
    return;
  }
  at(10, ()=>stageEl.classList.add('pi-draw'));
  at(650, ()=>stageEl.classList.add('pi-zoom'));
  at(850, ()=>stageEl.classList.add('pi-pulse'));
  at(1230, ()=>{ stageEl.classList.add('pi-explode','pi-logo-in'); if(window.SoundKit) SoundKit.playWhoosh(); });
  at(1380, ()=>{ if(window.SoundKit) SoundKit.playChime(); });
  at(1650, hide);
}
ciIntroRun();
document.addEventListener('pointerdown',function unlockAudioOnce(){ if(window.SoundKit) SoundKit.unlock(); document.removeEventListener('pointerdown',unlockAudioOnce); },{once:true});

buildLayout();
initSchemes();
renderTeamName();
applyTheme();
renderDashboard();
checkOnboardingAndDemo();
setTimeout(()=>{ if(window.Marquee){ window.Marquee.rescan(); window.Marquee.refresh(); } }, 150);
ensureTeamLogo(()=>{ applyTeamLogo(); if(document.getElementById('dashboard').classList.contains('active')) renderDashboard(); });
setTimeout(checkBackupReminder, 2000);   /* dopo l'animazione di apertura, mai durante */

/* =========================================================
   FOTO GIOCATORE (IndexedDB) + CARD stile FC  (lato coach)
   ========================================================= */
var COACH_PHOTOS={};
function cIdb(){ return new Promise((res,rej)=>{const r=indexedDB.open('pm-media',1);
  r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('img')) r.result.createObjectStore('img'); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }
async function cIdbGet(k){ try{const db=await cIdb(); return await new Promise(res=>{const t=db.transaction('img').objectStore('img').get(k); t.onsuccess=()=>res(t.result||null); t.onerror=()=>res(null);});}catch(e){return null;} }
async function cIdbSet(k,v){ try{const db=await cIdb(); return await new Promise(res=>{const t=db.transaction('img','readwrite').objectStore('img').put(v,k); t.onsuccess=()=>res(true); t.onerror=()=>res(false);});}catch(e){return false;} }
async function cIdbDel(k){ try{const db=await cIdb(); db.transaction('img','readwrite').objectStore('img').delete(k);}catch(e){} }
/* ---- LOGO SQUADRA (PNG con alfa, sulla card sopra il numero + posizionabile nell'officina) ---- */
var TEAM_LOGO=null, _logoLoaded=false;
function ensureTeamLogo(cb){ if(_logoLoaded){ cb&&cb(); return; } cIdbGet('teamlogo').then(d=>{ TEAM_LOGO=d||null; _logoLoaded=true; cb&&cb(); }); }
function pickTeamLogo(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=e=>{ const f=e.target.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ const im=new Image(); im.onload=()=>{
      const max=512, sc=Math.min(1,max/Math.max(im.width,im.height));
      const cv=document.createElement('canvas'); cv.width=Math.round(im.width*sc); cv.height=Math.round(im.height*sc);
      cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      logoModal(cv.toDataURL('image/png'));
    }; im.src=rd.result; };
    rd.readAsDataURL(f); };
  inp.click();
}
function logoModal(dataURL){
  coachMediaCSS();
  window.__logo={original:dataURL, current:dataURL};
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-shield-halved" style="color:var(--brand)"></i> Logo squadra</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body" style="text-align:center">
      <div class="rp-checker" style="width:180px;height:180px;margin:0 auto;border-radius:16px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid var(--brand)">
        <img id="logo-prev" src="${dataURL}" style="max-width:100%;max-height:100%;object-fit:contain"></div>
      <button class="btn btn-ghost" style="width:100%;margin-top:14px" id="logo-bgbtn" onclick="logoRemoveBg()"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--brand)"></i> Rimuovi sfondo</button>
      <div id="logo-status" style="display:none;font-size:.78rem;color:var(--muted);margin-top:8px"></div>
      <p style="color:var(--muted);font-size:.78rem;margin-top:8px">Meglio un PNG già senza sfondo. Comparirà sulla card sopra il numero.</p>
      <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="saveTeamLogo()"><i class="fa-solid fa-check"></i> Salva logo</button>
    </div>`, true);
}
async function logoRemoveBg(){
  const L=window.__logo; if(!L) return;
  const st=document.getElementById('logo-status'), btn=document.getElementById('logo-bgbtn'), prev=document.getElementById('logo-prev');
  if(btn) btn.disabled=true; if(st){ st.style.display='block'; st.textContent='Elaboro…'; }
  try{ const out=await aiRemoveBg(L.original, p=>{ if(st) st.textContent=p<1?`Elaboro… ${Math.round(p*100)}%`:'Quasi fatto…'; });
    L.current=out; if(prev) prev.src=out; if(st) st.textContent='Sfondo rimosso ✓'; }
  catch(e){ try{ const out=await chromaKeyDataURL(L.original,72); L.current=out; if(prev) prev.src=out; if(st) st.textContent='Sfondo rimosso (metodo veloce) ✓'; }
    catch(_){ if(st) st.textContent='Non riesco a rimuovere lo sfondo qui.'; } }
  if(btn) btn.disabled=false;
}
async function saveTeamLogo(){
  const L=window.__logo; if(!L) return;
  await cIdbSet('teamlogo', L.current); TEAM_LOGO=L.current; _logoLoaded=true;
  closeModal(); toast('Logo salvato');
  applyTeamLogo(); if(document.getElementById('dashboard').classList.contains('active')) renderDashboard();
  if(CARD_STUDIO) renderCardStudioPreview();
}
async function removeTeamLogo(){ await cIdbDel('teamlogo'); TEAM_LOGO=null; _logoLoaded=true; toast('Logo rimosso'); applyTeamLogo(); if(document.getElementById('dashboard').classList.contains('active')) renderDashboard(); if(CARD_STUDIO) renderCardStudioPreview(); }
function cphAbbr(r){ return (r||'').replace(/[^A-Za-zÀ-ÿ]/g,'').slice(0,3).toUpperCase()||'—'; }
function cphInitials(n){ return (n||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'?'; }
function cphOverall(a){ return a? Math.max(1,Math.min(100,Math.round(a*10))):null; }
function coachMediaCSS(){
  if(document.getElementById('coach-media-css'))return;
  const st=document.createElement('style'); st.id='coach-media-css';
  st.textContent=`
  .rp-checker{background:conic-gradient(#3a3f47 25%,#262a30 0 50%,#3a3f47 0 75%,#262a30 0) 0 0/22px 22px;}
  #cph-av{overflow:visible!important;position:relative;cursor:pointer;}
  #cph-av .cph-im{width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;}
  #cph-av .cph-im img{width:100%;height:100%;object-fit:cover;}
  #cph-av .cph-cam{position:absolute;bottom:-3px;right:-3px;width:24px;height:24px;border-radius:50%;background:var(--brand);color:#04140A;display:flex;align-items:center;justify-content:center;border:2px solid var(--surface);font-size:.62rem;}
  .fc-wrap{display:flex;flex-direction:column;align-items:center;}
  .fc{position:relative;width:300px;max-width:100%;border-radius:24px;overflow:hidden;background:linear-gradient(160deg,var(--fc-a),var(--fc-b));padding:18px 18px 20px;color:#0b1220;box-shadow:0 30px 70px -24px rgba(0,0,0,.75);}
  .fc::before{content:"";position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.4),transparent 38%,transparent 60%,rgba(255,255,255,.22));mix-blend-mode:overlay;pointer-events:none;}
  .fc .top{display:flex;justify-content:space-between;align-items:flex-start;position:relative;}
  .fc .ovr{text-align:center;line-height:.95;} .fc .ovr b{font-family:'Outfit',sans-serif;font-size:2.5rem;font-weight:900;display:block;}
  .fc .ovr span{font-size:.72rem;font-weight:800;letter-spacing:1px;}
  .fc .sporticon{font-size:1.7rem;}
  .fc .photo{width:176px;height:234px;margin:4px auto 8px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;}
  .fc .photo img{width:100%;height:100%;object-fit:cover;} .fc .photo .ini{font-family:'Outfit';font-weight:900;font-size:3rem;color:rgba(0,0,0,.32);}
  .fc .nm{text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:1.35rem;text-transform:uppercase;letter-spacing:.4px;line-height:1;}
  .fc .tm{text-align:center;font-weight:700;font-size:.82rem;opacity:.82;margin-top:3px;}
  .fc .stats{display:grid;grid-template-columns:1fr 1fr;gap:7px 16px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,.2);position:relative;}
  .fc .st{display:flex;justify-content:space-between;font-weight:800;font-size:.85rem;} .fc .st span{opacity:.68;font-weight:700;}
  `;
  document.head.appendChild(st);
}
function loadCoachPhoto(id){
  if(COACH_PHOTOS[id]!==undefined) return;
  cIdbGet('p'+id).then(d=>{ COACH_PHOTOS[id]=d||null; const el=document.getElementById('cph-im-'+id); if(el&&d) el.innerHTML=`<img src="${d}">`; });
}
function pickPhotoCoach(id){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f)return;
    const rd=new FileReader(); rd.onload=()=>{ const im=new Image(); im.onload=()=>{
      const MAX=1000, r=Math.min(MAX/im.width,MAX/im.height,1), w=Math.round(im.width*r), h=Math.round(im.height*r);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(im,0,0,w,h);
      repositionCoach(cv.toDataURL('image/png'), async data=>{ await cIdbSet('p'+id,data); COACH_PHOTOS[id]=data; closeModal(); openPlayerCard(id); toast('Foto aggiornata'); });
    }; im.src=rd.result; };
    rd.readAsDataURL(f);
  };
  inp.click();
}
async function removePhotoCoach(id){ await cIdbDel('p'+id); COACH_PHOTOS[id]=null; closeModal(); openPlayerCard(id); toast('Foto rimossa'); }
function repositionCoach(srcDataURL, onConfirm){
  coachMediaCSS(); const Fw=246, Fh=328;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-crop-simple" style="color:var(--brand)"></i> Posiziona la foto</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body" style="text-align:center">
      <div id="rp-frame" class="rp-checker" style="width:${Fw}px;height:${Fh}px;margin:0 auto;border-radius:16px;overflow:hidden;position:relative;touch-action:none;border:2px solid var(--brand)">
        <img id="rp-img" src="${srcDataURL}" style="position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;pointer-events:none;max-width:none"></div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:14px"><i class="fa-solid fa-magnifying-glass-minus" style="color:var(--muted)"></i>
        <input id="rp-zoom" type="range" min="100" max="300" value="100" style="flex:1"><i class="fa-solid fa-magnifying-glass-plus" style="color:var(--muted)"></i></div>
      <div style="margin-top:12px">
        <button class="btn btn-ghost" id="rp-bgbtn" style="width:100%" onclick="rpcAiRemove()"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--brand)"></i> Rimuovi sfondo</button>
        <div id="rp-bgstatus" style="display:none;font-size:.78rem;color:var(--muted);margin-top:8px"></div>
        <button class="btn btn-ghost btn-sm" id="rp-bgreset" style="display:none;margin-top:6px" onclick="rpcReset()"><i class="fa-solid fa-rotate-left"></i> Ripristina originale</button>
      </div>
      <p style="color:var(--muted);font-size:.78rem;margin-top:8px">Trascina per spostare, slider per lo zoom. Se la foto ha già lo sfondo trasparente, lasciala così.</p>
      <button class="btn btn-accent" style="width:100%;margin-top:12px" onclick="confirmCoachPhoto()"><i class="fa-solid fa-check"></i> Conferma</button>
    </div>`, true);
  const frame=document.getElementById('rp-frame'), img=document.getElementById('rp-img');
  const st={imgW:0,imgH:0,cover:1,zoom:1,tx:0,ty:0};
  const dW=()=>st.imgW*st.cover*st.zoom, dH=()=>st.imgH*st.cover*st.zoom;
  const clamp=()=>{ st.tx=Math.min(0,Math.max(Fw-dW(),st.tx)); st.ty=Math.min(0,Math.max(Fh-dH(),st.ty)); };
  const apply=()=>{ img.style.transform=`translate(${st.tx}px,${st.ty}px) scale(${st.cover*st.zoom})`; };
  const init=()=>{ st.imgW=img.naturalWidth; st.imgH=img.naturalHeight; st.cover=Math.max(Fw/st.imgW,Fh/st.imgH); st.zoom=1; st.tx=(Fw-dW())/2; st.ty=(Fh-dH())/2; clamp(); apply(); };
  let firstInit=true;
  img.onload=()=>{ if(firstInit){ init(); firstInit=false; } else { clamp(); apply(); } };
  if(img.complete && img.naturalWidth){ init(); firstInit=false; }
  document.getElementById('rp-zoom').oninput=e=>{ const z=e.target.value/100, cx=Fw/2-st.tx, cy=Fh/2-st.ty, ratio=z/st.zoom; st.zoom=z; st.tx=Fw/2-cx*ratio; st.ty=Fh/2-cy*ratio; clamp(); apply(); };
  let px,py,drag=false;
  frame.addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;try{frame.setPointerCapture(e.pointerId);}catch(_){}});
  frame.addEventListener('pointermove',e=>{ if(!drag)return; st.tx+=e.clientX-px; st.ty+=e.clientY-py; px=e.clientX; py=e.clientY; clamp(); apply(); });
  frame.addEventListener('pointerup',()=>drag=false); frame.addEventListener('pointercancel',()=>drag=false);
  window.__rpc={st,Fw,Fh,img,onConfirm,original:srcDataURL,bg:false,tol:72};
}
/* rimuovi-sfondo: AI (segmentazione soggetto, @imgly in-browser) con fallback chroma-key */
let _imglyRemove=null;
async function loadImgly(){ if(_imglyRemove) return _imglyRemove; const m=await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm'); _imglyRemove=m.removeBackground||m.default; return _imglyRemove; }
function blobToDataURL(b){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); }); }
async function aiRemoveBg(src,onProgress){
  const rem=await loadImgly();
  const blob=await rem(src,{ output:{format:'image/png'}, progress:(k,c,t)=>{ try{ if(onProgress&&t) onProgress(c/t); }catch(_){} } });
  return await blobToDataURL(blob);
}
async function rpcAiRemove(){
  const R=window.__rpc; if(!R) return;
  const btn=document.getElementById('rp-bgbtn'), status=document.getElementById('rp-bgstatus'), reset=document.getElementById('rp-bgreset');
  if(btn) btn.disabled=true; if(status){ status.style.display='block'; status.textContent='Preparo il ritaglio…'; }
  try{
    const out=await aiRemoveBg(R.original, p=>{ if(status) status.textContent = p<1?`Elaboro… ${Math.round(p*100)}%`:'Quasi fatto…'; });
    R.img.src=out; if(status) status.textContent='Sfondo rimosso ✓'; if(reset) reset.style.display='block';
  }catch(e){
    if(status) status.textContent='AI non disponibile, uso il metodo veloce…';
    try{ const out=await chromaKeyDataURL(R.original,72); R.img.src=out; if(status) status.textContent='Sfondo rimosso (metodo veloce) ✓'; if(reset) reset.style.display='block'; }
    catch(_){ if(status) status.textContent='Non riesco a rimuovere lo sfondo qui. Prova con connessione attiva.'; }
  }
  if(btn) btn.disabled=false;
}
function rpcReset(){ const R=window.__rpc; if(!R)return; R.img.src=R.original; const s=document.getElementById('rp-bgstatus'); if(s) s.style.display='none'; const b=document.getElementById('rp-bgreset'); if(b) b.style.display='none'; }
function confirmCoachPhoto(){
  const R=window.__rpc; if(!R){closeModal();return;}
  const {st,Fw,Fh,img,onConfirm}=R, Tw=480,Th=640, s=st.cover*st.zoom;
  const c=document.createElement('canvas'); c.width=Tw; c.height=Th;
  c.getContext('2d').drawImage(img,(-st.tx)/s,(-st.ty)/s,Fw/s,Fh/s,0,0,Tw,Th);
  onConfirm(c.toDataURL('image/png'));
}
/* rimozione sfondo (chroma-key sui 4 angoli) — leggero, offline, per sfondi uniformi */
function chromaApply(p,w,h,tol){
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  let br=0,bg=0,bb=0; corners.forEach(([x,y])=>{const i=(y*w+x)*4; br+=p[i];bg+=p[i+1];bb+=p[i+2];}); br/=4;bg/=4;bb/=4;
  const T=tol*tol;
  for(let i=0;i<p.length;i+=4){ const dr=p[i]-br,dg=p[i+1]-bg,db=p[i+2]-bb, dist=dr*dr+dg*dg+db*db;
    if(dist<T) p[i+3]=0; else if(dist<T*2.2) p[i+3]=Math.round(p[i+3]*Math.min(1,(dist-T)/(T*1.2))); }
  return p;
}
function chromaKeyDataURL(srcDataURL,tol){ return new Promise(res=>{ const im=new Image(); im.onload=()=>{
  const c=document.createElement('canvas'); c.width=im.naturalWidth||im.width; c.height=im.naturalHeight||im.height;
  const ctx=c.getContext('2d'); ctx.drawImage(im,0,0); const d=ctx.getImageData(0,0,c.width,c.height);
  chromaApply(d.data,c.width,c.height,tol); ctx.putImageData(d,0,0); res(c.toDataURL('image/png')); }; im.src=srcDataURL; }); }
/* =========================================================
   CARD A TIER + OFFICINA (studio layout)
   5 frame (cards/<tier>.png), overall stile FIFA (voto ×10).
   Layout posizionabile dall'officina → salvato in DB.settings.cardLayouts
   e/o incollato nel deploy come DEPLOY_CARD_LAYOUTS (export JSON).
   ========================================================= */
const TIER_ORDER=['goat','mythic','diamond','gold','silver'];
const TIER_LABEL={goat:'GOAT',mythic:'MYTHIC',diamond:'DIAMOND',gold:'GOLD',silver:'SILVER'};
const CARD_ELEMENTS=[['photo','Foto'],['logo','Logo squadra'],['overall','Overall'],['name','Nome'],['number','Numero'],['role','Ruolo'],['attrs','Statistiche'],['tierName','Nome tier']];
/* layout base (percentuali). Gem lo rifinisce per tier dall'officina. */
const BASE_CARD_LAYOUT={
  photo:{show:1,x:50,y:40,w:66,h:44},
  logo:{show:1,x:72,y:9,w:15},
  overall:{show:1,x:22,y:15,size:12,color:'#ffffff',align:'center'},
  role:{show:1,x:22,y:24,size:4.6,color:'#ffffff',align:'center'},
  number:{show:1,x:78,y:15,size:9,color:'#ffffff',align:'center'},
  name:{show:1,x:50,y:66,size:7.4,color:'#ffffff',align:'center'},
  attrs:{show:1,x:50,y:82,size:5,color:'#ffffff'},
  tierName:{show:0,x:50,y:94,size:4,color:'#ffffff',align:'center'}
};
/* Incolla qui il JSON esportato dall'officina per renderlo ufficiale per tutti. */
const DEPLOY_CARD_LAYOUTS={
  "goat": {
    "photo": { "show": 1, "x": 50, "y": 23.5, "w": 86, "h": 47 },
    "logo": { "show": 1, "x": 78, "y": 20.5, "w": 22.5 },
    "overall": { "show": 1, "x": 18.5, "y": 20, "size": 11, "color": "#fff1b3", "align": "center" },
    "role": { "show": 1, "x": 18.5, "y": 29, "size": 4.6, "color": "#ffcc02", "align": "center" },
    "number": { "show": 1, "x": 77.5, "y": 28.5, "size": 6.2, "color": "#ffcc02", "align": "center" },
    "name": { "show": 1, "x": 50, "y": 56.5, "size": 6.4, "color": "#fff7bd", "align": "center" },
    "attrs": { "show": 1, "x": 50, "y": 67.5, "size": 6.4, "color": "#fff2d0" },
    "tierName": { "show": 1, "x": 50, "y": 85, "size": 5.2, "color": "#ff6a00", "align": "center" }
  },
  "mythic": {
    "photo": { "show": 1, "x": 50, "y": 31, "w": 66, "h": 42.5 },
    "logo": { "show": 1, "x": 79.5, "y": 19, "w": 22 },
    "overall": { "show": 1, "x": 19, "y": 18, "size": 12, "color": "#fcdbff", "align": "center" },
    "role": { "show": 1, "x": 19, "y": 24.5, "size": 4.6, "color": "#ffffff", "align": "center" },
    "number": { "show": 1, "x": 79, "y": 26.5, "size": 6.8, "color": "#ffedfe", "align": "center" },
    "name": { "show": 1, "x": 50, "y": 57, "size": 7.2, "color": "#ffd7ff", "align": "center" },
    "attrs": { "show": 1, "x": 50, "y": 72, "size": 6.6, "color": "#ffffff" },
    "tierName": { "show": 1, "x": 50, "y": 88.5, "size": 4.2, "color": "#efcaff", "align": "center" }
  },
  "diamond": {
    "photo": { "show": 1, "x": 50, "y": 30, "w": 66, "h": 44 },
    "logo": { "show": 1, "x": 81.5, "y": 22, "w": 22.5 },
    "overall": { "show": 1, "x": 17, "y": 21, "size": 12, "color": "#12fffe", "align": "center" },
    "role": { "show": 1, "x": 17.5, "y": 29.5, "size": 5.4, "color": "#ffffff", "align": "center" },
    "number": { "show": 1, "x": 81.5, "y": 30, "size": 6.2, "color": "#ffffff", "align": "center" },
    "name": { "show": 1, "x": 50, "y": 57.5, "size": 7.4, "color": "#7bf7ff", "align": "center" },
    "attrs": { "show": 1, "x": 50, "y": 73, "size": 7.8, "color": "#ffffff" },
    "tierName": { "show": 1, "x": 50, "y": 88.5, "size": 4.2, "color": "#93e3fd", "align": "center" }
  },
  "gold": {
    "photo": { "show": 1, "x": 50, "y": 26.5, "w": 66, "h": 49 },
    "logo": { "show": 1, "x": 82.5, "y": 19.5, "w": 22 },
    "overall": { "show": 1, "x": 17.5, "y": 18.5, "size": 11, "color": "#ffffff", "align": "center" },
    "role": { "show": 1, "x": 17, "y": 28, "size": 6.2, "color": "#fcfcff", "align": "center" },
    "number": { "show": 1, "x": 81.5, "y": 27.5, "size": 6.8, "color": "#ffffff", "align": "center" },
    "name": { "show": 1, "x": 50, "y": 59.5, "size": 7, "color": "#ffffff", "align": "center" },
    "attrs": { "show": 1, "x": 50, "y": 74.5, "size": 7.8, "color": "#ffffff" },
    "tierName": { "show": 1, "x": 50, "y": 91, "size": 4.6, "color": "#c49e00", "align": "center" }
  },
  "silver": {
    "photo": { "show": 1, "x": 50, "y": 29.5, "w": 72, "h": 44 },
    "logo": { "show": 1, "x": 82.5, "y": 19.5, "w": 22 },
    "overall": { "show": 1, "x": 17.5, "y": 18.5, "size": 13.6, "color": "#ffffff", "align": "center" },
    "role": { "show": 1, "x": 17, "y": 28, "size": 5.2, "color": "#ffffff", "align": "center" },
    "number": { "show": 1, "x": 82, "y": 28, "size": 6.4, "color": "#ffffff", "align": "center" },
    "name": { "show": 1, "x": 50, "y": 58.5, "size": 7, "color": "#ffffff", "align": "center" },
    "attrs": { "show": 1, "x": 50, "y": 73.5, "size": 7.8, "color": "#ffffff" },
    "tierName": { "show": 1, "x": 50, "y": 90, "size": 4, "color": "#d6d6d6", "align": "center" }
  }
};
function deepMerge(base,over){ const o=JSON.parse(JSON.stringify(base)); if(over) Object.keys(over).forEach(k=>{ o[k]=(typeof over[k]==='object'&&!Array.isArray(over[k]))?deepMerge(o[k]||{},over[k]):over[k]; }); return o; }
function getCardLayout(tier){
  let l=deepMerge(BASE_CARD_LAYOUT, DEPLOY_CARD_LAYOUTS[tier]);
  const dev=((DB.settings||{}).cardLayouts||{})[tier];
  if(CARD_STUDIO && CARD_STUDIO.tier===tier) return deepMerge(l, CARD_STUDIO.draft); // anteprima live officina
  return deepMerge(l, dev);
}
/* assegnazione tier per ranking (voto medio); Silver ≥ Gold nei dispari */
function playerTierMap(){
  const ranked=activePlayers().map(p=>({id:p.id,v:getSeasonStats(p.id).avgVoto}))
    .sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  const n=ranked.length, map={};
  ranked.forEach((r,i)=>{
    let tier;
    if(i===0)tier='goat'; else if(i===1)tier='mythic'; else if(i===2)tier='diamond';
    else { const rest=n-3, gold=Math.floor(rest/2); tier=(i-3)<gold?'gold':'silver'; }
    map[r.id]=tier;
  });
  return map;
}
function playerTier(id){ return playerTierMap()[id]||'silver'; }
const CARD_SILHOUETTE="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><g fill="rgba(255,255,255,.22)"><circle cx="50" cy="42" r="24"/><path d="M12 130c0-24 17-42 38-42s38 18 38 42z"/></g></svg>');
/* candidati nome-file del frame: copre varie convenzioni (goat.png, Goat_.png, Goat.png, goat_.png) */
function frameCandidates(tier){ const C=tier.charAt(0).toUpperCase()+tier.slice(1);
  return [`cards/${tier}.png`,`cards/${C}_.png`,`cards/${C}.png`,`cards/${tier}_.png`]; }
function tcFrameFallback(img){ const fb=(img.getAttribute('data-fb')||'').split('|').filter(Boolean);
  if(fb.length){ img.src=fb[0]; img.setAttribute('data-fb',fb.slice(1).join('|')); } else { img.style.opacity=0; } }
/* ---- ATTRIBUTI stile FIFA, calcolati dai voti allenamento per categoria ×10 ---- */
/* [labelLunga, sigla, [categorie sorgente]] — categorie = nomi esatti di SPORT_CATS */
const ATTR_MAP={
  pallavolo:[['Attacco','ATT',['Attacco']],['Battuta','BAT',['Battuta']],['Ricezione','RIC',['Ricezione']],['Muro','MUR',['Muro']],['Difesa','DIF',['Difesa']],['Atletismo','ATL',['Fisico','Riscaldamento']]],
  calcio:[['Finalizzazione','FIN',['Finalizzazione']],['Difesa','DIF',['Difesa']],['Tecnica','TEC',['Tecnica']],['Velocità','VEL',['Riscaldamento','Fisico']],['Possesso','POS',['Possesso']],['Transizioni','TRA',['Transizioni','Partite a tema']]],
  calcio_gk:[['Portiere','POR',['Portieri']],['Difesa','DIF',['Difesa']],['Tecnica','TEC',['Tecnica']],['Velocità','VEL',['Riscaldamento','Fisico']],['Possesso','POS',['Possesso']],['Finalizzazione','FIN',['Finalizzazione']]],
  basket:[['Tiro','TIR',['Tiro']],['Palleggio','PAL',['Palleggio']],['Difesa','DIF',['Difesa']],['Velocità','VEL',['Riscaldamento','Fisico']],['Rimbalzo','RIM',['Rimbalzo']],['Tattica','TAT',['Tattica','Transizione']]]
};
/* media dei voti allenamento del giocatore, per categoria di esercizio */
function playerCatRatings(id){
  const acc={};
  Object.values(DB.trainings||{}).forEach(tr=>{
    const g=(tr.grades||{})[id]; if(!g) return;
    (tr.exercises||[]).forEach(x=>{ const v=g[x.id]; if(v!=null){ const c=x.cat||'?'; (acc[c]=acc[c]||{s:0,n:0}); acc[c].s+=v; acc[c].n++; } });
  });
  const out={}; Object.keys(acc).forEach(c=>out[c]=acc[c].s/acc[c].n); return out;
}
/* attributi della card: valore = media categorie ×10; se nessun voto → stima dall'overall */
function playerAttributes(id, sport){
  sport=sport||curSport();
  const cats=playerCatRatings(id);
  const p=playerById(id);
  const ovr=cphOverall(getSeasonStats(id).avgVoto)||60;
  let defs=ATTR_MAP[sport]||ATTR_MAP.pallavolo;
  if(sport==='calcio'){ const gk=/portier|^\s*p\s*$|^por/i.test((p&&p.role)||''); defs = gk?ATTR_MAP.calcio_gk:ATTR_MAP.calcio; }
  const attrs = defs.map(([label,short,src])=>{
    const vals=src.map(c=>cats[c]).filter(v=>v!=null);
    let rating, est=false;
    if(vals.length){ rating=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10); }
    else { rating=ovr; est=true; }
    return {label,short,rating:Math.max(1,Math.min(100,rating)),est};
  });
  if(p && p.mentalStats){
    if(p.mentalStats.riflessi!=null) attrs.push({label:'Riflessi',short:'RIFL',rating:p.mentalStats.riflessi,est:false});
    if(p.mentalStats.percezione!=null) attrs.push({label:'Percezione',short:'PERC',rating:p.mentalStats.percezione,est:false});
  }
  return attrs;
}
/* ---- Radar comparativo (Modulo A, blocco Prompt7): stesso set di assi per TUTTI i ruoli,
   nessuno switch portiere/movimento come nella card — un ruolo "debole" su un asse è
   informazione valida e va mostrata, non nascosta. Riusa playerCatRatings/cphOverall,
   nessuna nuova logica di calcolo. */
function radarDefs(sport){ sport=sport||curSport(); return ATTR_MAP[sport]||ATTR_MAP.pallavolo; }
function radarAttributes(id){
  const cats=playerCatRatings(id);
  const ovr=cphOverall(getSeasonStats(id).avgVoto)||60;
  return radarDefs(curSport()).map(([label,short,src])=>{
    const vals=src.map(c=>cats[c]).filter(v=>v!=null);
    const rating = vals.length? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10) : ovr;
    return {label,short,rating:Math.max(1,Math.min(100,rating))};
  });
}
function radarTeamAverage(){
  const defs=radarDefs(curSport());
  const players=activePlayers();
  if(!players.length) return defs.map(([label])=>({label,rating:0}));
  const allAttrs=players.map(p=>radarAttributes(p.id));
  return defs.map((d,i)=>{
    const vals=allAttrs.map(a=>a[i].rating);
    return {label:d[0], rating:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)};
  });
}
function renderCardAttrs(id, sport, el, width){
  if(!el||!el.show) return '';
  const cells=playerAttributes(id,sport).map(a=>`<div class="tc-attr"><b>${a.rating}</b><span>${a.short}</span></div>`).join('');
  return `<div class="tc-attrs" style="left:${el.x}%;top:${el.y}%;transform:translate(-50%,-50%);font-size:${(el.size/100*width).toFixed(1)}px;color:${el.color}"><div class="tc-attr-grid">${cells}</div></div>`;
}
/* Render di una card a tier. width in px (default 300). */
function renderTierCard(id, width){
  width=width||300; const H=width*1.4;
  const p=playerById(id); if(!p) return '';
  const tier=(CARD_STUDIO&&CARD_STUDIO.forceId===id)?CARD_STUDIO.tier:playerTier(id);
  const L=getCardLayout(tier);
  const s=getSeasonStats(id); const ovr=cphOverall(s.avgVoto);
  const photoSrc=(typeof COACH_PHOTOS!=='undefined'&&COACH_PHOTOS[id])?COACH_PHOTOS[id]:CARD_SILHOUETTE;
  const alignT=a=>a==='left'?'0':a==='right'?'-100%':'-50%';
  const txt=(key,val)=>{ const e=L[key]; if(!e||!e.show||val==null||val==='')return '';
    return `<div class="tc-el" style="left:${e.x}%;top:${e.y}%;transform:translate(${alignT(e.align)},-50%);font-size:${(e.size/100*width).toFixed(1)}px;color:${e.color};text-align:${e.align}">${val}</div>`; };
  const ph=L.photo; const photoEl = ph&&ph.show ? `<div class="tc-photo" style="left:${ph.x}%;top:${ph.y}%;width:${ph.w}%;height:${(ph.h/100*H/width*100).toFixed(2)}%"><img src="${photoSrc}"></div>`:'';
  const lg=L.logo; const logoEl = (lg&&lg.show&&TEAM_LOGO) ? `<div class="tc-logo" style="left:${lg.x}%;top:${lg.y}%;width:${lg.w}%"><img src="${TEAM_LOGO}"></div>`:'';
  const cands=frameCandidates(tier);
  return `<div class="tiercard tier-${tier}" style="width:${width}px;height:${H}px">
    <img class="tc-frame" src="${cands[0]}" data-fb="${cands.slice(1).join('|')}" onerror="tcFrameFallback(this)" alt="">
    ${photoEl}
    ${logoEl}
    ${txt('overall',ovr!=null?ovr:'—')}
    ${txt('role',cphAbbr(p.role))}
    ${txt('number','#'+(p.number||''))}
    ${txt('name',(p.name||'').toUpperCase())}
    ${renderCardAttrs(id, curSport(), L.attrs, width)}
    ${txt('tierName',TIER_LABEL[tier])}
  </div>`;
}
/* ---- OFFICINA CARD (studio) ---- */
let CARD_STUDIO=null;
function shade(hex,amt){ hex=(hex||'').replace('#',''); if(hex.length===3)hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); if(isNaN(n))return '#'+hex; let r=Math.min(255,(n>>16)+amt),g=Math.min(255,((n>>8)&255)+amt),b=Math.min(255,(n&255)+amt); return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }
function applyTheme(){ const t=(DB.settings&&DB.settings.theme)||{}, r=document.documentElement.style;
  if(t.brand){ r.setProperty('--brand',t.brand); r.setProperty('--brand-deep',shade(t.brand,-20)); r.setProperty('--ok',t.brand); }
  if(t.bg){ r.setProperty('--ink',t.bg); r.setProperty('--surface',shade(t.bg,12)); r.setProperty('--surface-2',shade(t.bg,22)); r.setProperty('--surface-3',shade(t.bg,34)); r.setProperty('--line',shade(t.bg,30)); r.setProperty('--line-soft',shade(t.bg,20)); }
  if(t.text){ r.setProperty('--text',t.text); }
  if(t.muted){ r.setProperty('--muted',t.muted); r.setProperty('--muted-2',hexA(t.muted,.72)); }
  else if(t.text){ r.setProperty('--muted',hexA(t.text,.62)); r.setProperty('--muted-2',hexA(t.text,.42)); }
}
function setColor(field,val){ DB.settings=DB.settings||{}; DB.settings.theme=DB.settings.theme||{}; DB.settings.theme[field]=val; save(); applyTheme(); }
function resetTheme(){ if(DB.settings) DB.settings.theme={}; save(); location.reload(); }
function setTeamName(v){ v=(v||'').trim(); if(!v) return; DB.teamName=v; save(); renderTeamName(); if(document.getElementById('dashboard').classList.contains('active')) renderDashboard(); }
function openTeamsMenu(){
  let profs=getProfiles();
  if(!profs.length){ profs=[{id:'',name:(DB.teamName||'Squadra 1'),pin:''}]; setProfiles(profs); }
  const act=activeProfile();
  const rows=profs.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.12));margin-bottom:6px;${p.id===act?'border-color:var(--brand);background:color-mix(in srgb,var(--brand) 12%,transparent);':''}">
      <span style="font-weight:600">${p.name}${p.pin?' <i class="fa-solid fa-lock" style="opacity:.5;font-size:.75em"></i>':''}</span>
      ${p.id===act?'<span class="pill">attiva</span>':`<button class="btn btn-ghost btn-sm" onclick="switchTeam('${p.id}')">Entra</button>`}
    </div>`).join('');
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-people-group" style="color:var(--brand)"></i> Le mie squadre</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:10px">Ogni squadra ha i suoi dati separati. Passa dall'una all'altra col PIN, senza resettare nulla.</p>
      ${rows}
      <div style="border-top:1px solid var(--line,rgba(255,255,255,.12));margin-top:12px;padding-top:12px">
        <label class="rec-lb">Nuova squadra</label>
        <input id="tm-name" placeholder="Nome squadra (es. Under 15 Calcio)" style="width:100%;padding:11px;border-radius:10px;background:var(--surface,rgba(0,0,0,.2));color:inherit;border:1px solid var(--line,rgba(255,255,255,.16))">
        <input id="tm-pin" placeholder="PIN (opzionale)" inputmode="numeric" style="width:100%;padding:11px;border-radius:10px;background:var(--surface,rgba(0,0,0,.2));color:inherit;border:1px solid var(--line,rgba(255,255,255,.16));margin-top:8px">
        <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="createTeam()"><i class="fa-solid fa-plus"></i> Crea e passa alla nuova squadra</button>
      </div>
    </div>`, true);
}
function createTeam(){
  const name=(document.getElementById('tm-name').value||'').trim(); if(!name){ toast('Scrivi il nome squadra','info'); return; }
  const pin=(document.getElementById('tm-pin').value||'').trim();
  const profs=getProfiles(); profs.push({id:'t'+Date.now().toString(36),name,pin}); setProfiles(profs);
  localStorage.setItem(ACTIVE_KEY, profs[profs.length-1].id); location.reload();
}
function switchTeam(id){
  const p=getProfiles().find(x=>x.id===id); if(!p) return;
  if(p.pin){ const e=prompt('PIN per '+p.name); if(e===null) return; if((e||'').trim()!==p.pin){ toast('PIN errato','info'); return; } }
  localStorage.setItem(ACTIVE_KEY,id); location.reload();
}
function openCardStudio(){
  cardStudioCSS(); ensureTeamLogo(()=>{ if(CARD_STUDIO) renderCardStudioPreview(); });
  const sample=activePlayers()[0]||DB.players[0];
  CARD_STUDIO={tier:'goat', el:'photo', draft:{}, forceId:sample?sample.id:null};
  // carica nel draft il layout attuale (device o base) del tier iniziale
  cardStudioLoadDraft();
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-id-badge" style="color:var(--brand)"></i> Officina card</h3>
      <button class="icon-btn" onclick="closeCardStudio()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="cs-wrap">
      <div class="cs-preview" id="cs-preview"></div>
      <div class="cs-ctrl">
        <label class="cs-lb">Tier</label><div class="cs-chips" id="cs-tiers"></div>
        <label class="cs-lb">Elemento</label><div class="cs-chips" id="cs-els"></div>
        <div id="cs-props"></div>
        <div class="cs-actions">
          <button class="btn btn-ghost" onclick="cardStudioResetTier()"><i class="fa-solid fa-rotate-left"></i> Reset tier</button>
          <button class="btn btn-ghost" onclick="cardStudioExport()"><i class="fa-solid fa-file-export"></i> Esporta JSON</button>
          <button class="btn btn-accent" onclick="cardStudioSave()"><i class="fa-solid fa-floppy-disk"></i> Salva</button>
        </div>
        <p class="cs-hint">Salva = applica su questo dispositivo. Esporta JSON = per renderlo ufficiale nel deploy (te lo spiego lì).</p>
      </div>
    </div>`, true);
  renderCardStudio();
}
function closeCardStudio(){ CARD_STUDIO=null; closeModal(); }
function cardStudioLoadDraft(){ // draft = layout corrente del tier (device merge), da editare
  const dev=((DB.settings||{}).cardLayouts||{})[CARD_STUDIO.tier];
  CARD_STUDIO.draft=deepMerge(deepMerge(BASE_CARD_LAYOUT,DEPLOY_CARD_LAYOUTS[CARD_STUDIO.tier]), dev);
}
function renderCardStudio(){
  const t=document.getElementById('cs-tiers'); if(t) t.innerHTML=TIER_ORDER.map(tr=>`<button class="cs-chip${CARD_STUDIO.tier===tr?' on':''}" onclick="cardStudioTier('${tr}')">${TIER_LABEL[tr]}</button>`).join('');
  const e=document.getElementById('cs-els'); if(e) e.innerHTML=CARD_ELEMENTS.map(([k,lb])=>`<button class="cs-chip${CARD_STUDIO.el===k?' on':''}" onclick="cardStudioEl('${k}')">${lb}</button>`).join('');
  renderCardStudioProps();
  renderCardStudioPreview();
}
function renderCardStudioPreview(){ const box=document.getElementById('cs-preview'); if(box) box.innerHTML=renderTierCard(CARD_STUDIO.forceId, 260); }
function renderCardStudioProps(){
  const box=document.getElementById('cs-props'); if(!box) return;
  const el=CARD_STUDIO.draft[CARD_STUDIO.el]; if(!el){ box.innerHTML=''; return; }
  const row=(lb,key,min,max,step)=>`<div class="cs-row"><span>${lb}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${el[key]}" oninput="cardStudioSet('${key}',this.value)"><span class="cs-v">${(+el[key]).toFixed(key==='color'?0:1)}</span></div>`;
  let h=`<div style="margin:.8rem 0 .6rem">${iosToggle(!!el.show,"cardStudioSet('show',this.checked?1:0)",'Mostra elemento')}</div>`;
  if(CARD_STUDIO.el==='photo'){
    h+=row('X','x',0,100,0.5)+row('Y','y',0,100,0.5)+row('Larghezza','w',10,100,0.5)+row('Altezza','h',10,100,0.5);
  } else if(CARD_STUDIO.el==='logo'){
    h+=row('X','x',0,100,0.5)+row('Y','y',0,100,0.5)+row('Larghezza','w',4,60,0.5);
    h+=`<button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="pickTeamLogo()"><i class="fa-solid fa-upload"></i> ${TEAM_LOGO?'Cambia logo':'Carica logo'}</button>`;
    if(TEAM_LOGO) h+=`<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="removeTeamLogo()"><i class="fa-solid fa-trash"></i> Rimuovi logo</button>`;
  } else {
    h+=row('X','x',0,100,0.5)+row('Y','y',0,100,0.5)+row('Dimensione','size',2,20,0.2);
    if(el.align!==undefined) h+=`<div class="cs-row"><span>Allineamento</span><select onchange="cardStudioSet('align',this.value)">${['left','center','right'].map(a=>`<option value="${a}" ${el.align===a?'selected':''}>${a}</option>`).join('')}</select><span></span></div>`;
    h+=`<div class="cs-row"><span>Colore</span><input type="color" value="${el.color}" oninput="cardStudioSet('color',this.value)"><span></span></div>`;
  }
  box.innerHTML=h;
}
function cardStudioTier(tr){ CARD_STUDIO.tier=tr; cardStudioLoadDraft(); renderCardStudio(); }
function cardStudioEl(k){ CARD_STUDIO.el=k; renderCardStudioProps(); }
function cardStudioSet(key,val){ const el=CARD_STUDIO.draft[CARD_STUDIO.el]; if(!el)return; el[key]=(key==='color'||key==='align')?val:(key==='show'?val:parseFloat(val)); if(key==='show')el[key]=val; renderCardStudioProps(); renderCardStudioPreview(); }
function cardStudioResetTier(){ CARD_STUDIO.draft=deepMerge(BASE_CARD_LAYOUT,DEPLOY_CARD_LAYOUTS[CARD_STUDIO.tier]); renderCardStudio(); }
function cardStudioSave(){ DB.settings=DB.settings||{}; DB.settings.cardLayouts=DB.settings.cardLayouts||{}; DB.settings.cardLayouts[CARD_STUDIO.tier]=JSON.parse(JSON.stringify(CARD_STUDIO.draft)); save(); toast('Layout '+TIER_LABEL[CARD_STUDIO.tier]+' salvato'); }
function cardStudioExport(){
  // salva prima il tier corrente nel device, poi esporta TUTTI i layout salvati
  cardStudioSave();
  const all=JSON.parse(JSON.stringify((DB.settings||{}).cardLayouts||{}));
  const json=JSON.stringify(all,null,2);
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-file-export" style="color:var(--brand)"></i> Layout card · JSON</h3>
      <button class="icon-btn" onclick="openCardStudio()"><i class="fa-solid fa-arrow-left"></i></button></div>
    <div style="padding:4px 2px">
      <p style="color:var(--muted);font-size:.88rem">Per rendere questo layout ufficiale per <b>tutti</b>: copia il testo qui sotto e incollalo nel deploy dentro <code>const DEPLOY_CARD_LAYOUTS = …</code> (in app.js del coach e del player). Poi bumpa la versione del <code>sw.js</code>. Sul tuo dispositivo è già attivo col Salva.</p>
      <textarea readonly onclick="this.select()" style="width:100%;height:230px;border-radius:12px;padding:12px;background:var(--surface,rgba(0,0,0,.25));color:inherit;border:1px solid var(--border,rgba(255,255,255,.18));font-family:monospace;font-size:.8rem">${json.replace(/</g,'&lt;')}</textarea>
      <button class="btn btn-accent" style="width:100%;margin-top:10px" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.previousElementSibling.value);toast('Copiato negli appunti')"><i class="fa-solid fa-copy"></i> Copia negli appunti</button>
    </div>`, true);
}
function cardStudioCSS(){
  if(document.getElementById('card-studio-css')) return;
  const st=document.createElement('style'); st.id='card-studio-css';
  st.textContent=`
  .tiercard{position:relative;border-radius:12px;font-family:'Outfit',sans-serif;font-weight:900;flex:0 0 auto;overflow:hidden;}
  .tiercard .tc-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;pointer-events:none;}
  .tiercard .tc-photo{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:1;}
  .tiercard .tc-logo{position:absolute;transform:translate(-50%,-50%);z-index:3;pointer-events:none;}
  .tiercard .tc-logo img{width:100%;height:auto;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));}
  .tiercard .tc-photo img{width:100%;height:100%;object-fit:contain;object-position:bottom;}
  .tiercard .tc-el{position:absolute;white-space:nowrap;line-height:1;text-shadow:0 2px 6px rgba(0,0,0,.5);letter-spacing:.5px;z-index:2;}
  .tiercard .tc-attrs{position:absolute;z-index:2;text-shadow:0 2px 6px rgba(0,0,0,.55);font-family:'Outfit',sans-serif;}
  .tc-attr-grid{display:grid;grid-template-columns:auto auto;gap:.15em 1.1em;}
  .tc-attr{display:flex;align-items:baseline;gap:.3em;line-height:1;}
  .tc-attr b{font-weight:900;font-variant-numeric:tabular-nums;} .tc-attr span{font-weight:800;opacity:.72;font-size:.7em;letter-spacing:.5px;}
  .cs-wrap{display:grid;grid-template-columns:260px 1fr;gap:18px;align-items:start;}
  .cs-preview{display:flex;justify-content:center;padding:6px;background:repeating-conic-gradient(#0000 0% 25%,rgba(255,255,255,.04) 0% 50%) 0/22px 22px;border-radius:14px;position:sticky;top:10px;}
  .cs-lb{display:block;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:.6rem 0 .35rem;}
  .cs-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .cs-chip{border:1px solid var(--border,rgba(255,255,255,.16));background:transparent;color:var(--muted);border-radius:9px;padding:5px 10px;font-size:.78rem;font-weight:700;cursor:pointer;}
  .cs-chip.on{border-color:var(--brand);color:#fff;background:color-mix(in srgb,var(--brand) 20%,transparent);}
  .cs-row{display:grid;grid-template-columns:92px 1fr 42px;align-items:center;gap:8px;margin:.3rem 0;font-size:.8rem;}
  .cs-row input[type=range]{width:100%;} .cs-row input[type=color]{width:44px;height:28px;border:none;background:none;} .cs-row select{padding:5px;border-radius:8px;background:var(--surface,rgba(0,0,0,.2));color:inherit;border:1px solid var(--border,rgba(255,255,255,.18));}
  .cs-v{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;}
  .cs-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:1rem;} .cs-hint{font-size:.74rem;color:var(--muted);margin-top:.6rem;}
  @media(max-width:760px){.cs-wrap{grid-template-columns:1fr;}.cs-preview{position:static;}}
  `;
  document.head.appendChild(st);
}

function openPlayerCard(id){
  coachMediaCSS(); cardStudioCSS(); ensureTeamLogo();
  const p=playerById(id), s=getSeasonStats(id), sport=curSport();
  const tier=playerTier(id);
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-id-badge" style="color:var(--brand)"></i> Card · ${p.name} <span class="pill" style="margin-left:6px">${TIER_LABEL[tier]}</span></h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body fc-wrap">
      ${renderTierCard(id, 300)}
      <button class="btn btn-accent" style="width:100%;margin-top:16px" onclick="pickPhotoCoach(${id})"><i class="fa-solid fa-camera"></i> ${COACH_PHOTOS[id]?'Cambia foto':'Aggiungi foto'}</button>
      ${COACH_PHOTOS[id]?`<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="removePhotoCoach(${id})"><i class="fa-solid fa-trash"></i> Rimuovi foto</button>`:''}
    </div>`, true);
}
function _openPlayerCardOld(id){
  coachMediaCSS();
  const p=playerById(id), s=getSeasonStats(id), sport=curSport();
  const ovr=cphOverall(s.avgVoto);
  const pal={pallavolo:['#F6D365','#E2A13C'],calcio:['#7BE0A3','#34A853'],basket:['#FDBA74','#F97316']}[sport]||['#F6D365','#E2A13C'];
  const ic={pallavolo:'🏐',calcio:'⚽',basket:'🏀'}[sport]||'🏅';
  const cells=(s.cells||[]).slice(0,4);
  const photo=COACH_PHOTOS[id]?`<img src="${COACH_PHOTOS[id]}">`:`<div class="ini">${cphInitials(p.name)}</div>`;
  const stats=cells.length?cells.map(c=>`<div class="st"><span>${c[0]}</span> ${c[1]}${c[2]||''}</div>`).join(''):`<div class="st"><span>Media voto</span> ${s.avgVoto?s.avgVoto.toFixed(1):'—'}</div>`;
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-id-badge" style="color:var(--brand)"></i> Card · ${p.name}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body fc-wrap">
      <div class="fc" style="--fc-a:${pal[0]};--fc-b:${pal[1]}">
        <div class="top"><div class="ovr"><b>${ovr||'—'}</b><span>${cphAbbr(p.role)}</span></div><div class="sporticon">${ic}</div></div>
        <div class="photo">${photo}</div>
        <div class="nm">${p.name} <span style="opacity:.55">#${p.number||''}</span></div>
        <div class="tm">${DB.teamName||''}</div>
        <div class="stats">${stats}</div>
      </div>
      <button class="btn btn-accent" style="width:100%;margin-top:16px" onclick="pickPhotoCoach(${id})"><i class="fa-solid fa-camera"></i> ${COACH_PHOTOS[id]?'Cambia foto':'Aggiungi foto'}</button>
      ${COACH_PHOTOS[id]?`<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="removePhotoCoach(${id})"><i class="fa-solid fa-trash"></i> Rimuovi foto</button>`:''}
    </div>`, true);
}

/* =========================================================
   FORMAZIONE CONSIGLIATA (meritocrazia) — tutti gli sport
   ========================================================= */
/* ---- Formazione CALCIO visuale: moduli, campo, drag, panchina, sostituzioni ---- */
/* slot: [ruolo, x(0-1 sx→dx), y(0 alto/attacco → 1 basso/porta propria)] */
const SOCCER_MODULES={
  '4-4-2':[['Portiere',.5,.93],['Difensore',.15,.73],['Difensore',.38,.76],['Difensore',.62,.76],['Difensore',.85,.73],['Centrocampista',.15,.48],['Centrocampista',.38,.5],['Centrocampista',.62,.5],['Centrocampista',.85,.48],['Attaccante',.38,.22],['Attaccante',.62,.22]],
  '4-3-3':[['Portiere',.5,.93],['Difensore',.15,.73],['Difensore',.38,.76],['Difensore',.62,.76],['Difensore',.85,.73],['Centrocampista',.3,.52],['Centrocampista',.5,.56],['Centrocampista',.7,.52],['Attaccante',.2,.24],['Attaccante',.5,.2],['Attaccante',.8,.24]],
  '3-5-2':[['Portiere',.5,.93],['Difensore',.28,.75],['Difensore',.5,.77],['Difensore',.72,.75],['Centrocampista',.1,.53],['Centrocampista',.33,.53],['Centrocampista',.5,.57],['Centrocampista',.67,.53],['Centrocampista',.9,.53],['Attaccante',.38,.24],['Attaccante',.62,.24]],
  '4-2-3-1':[['Portiere',.5,.93],['Difensore',.15,.73],['Difensore',.38,.76],['Difensore',.62,.76],['Difensore',.85,.73],['Centrocampista',.35,.6],['Centrocampista',.65,.6],['Centrocampista',.22,.38],['Centrocampista',.5,.4],['Centrocampista',.78,.38],['Attaccante',.5,.2]]
};
function getLineupCalcio(){ DB.settings=DB.settings||{}; DB.settings.lineup=DB.settings.lineup||{}; DB.settings.lineup.calcio=DB.settings.lineup.calcio||{module:'4-3-3',pos:{},subs:{}}; const L=DB.settings.lineup.calcio; L.pos=L.pos||{}; L.subs=L.subs||{}; if(!L.module)L.module='4-3-3'; return L; }
function soccerLineup(){
  const L=getLineupCalcio(), mod=SOCCER_MODULES[L.module]||SOCCER_MODULES['4-3-3'];
  const players=DB.players.map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const byRole=r=>players.filter(x=>x.p.role===r).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  const used=new Set(); Object.values(L.subs).forEach(pid=>{ if(pid!=null) used.add(pid); });
  const pools={};
  const slots=mod.map((s,i)=>{
    const role=s[0]; let player=null;
    if(L.subs[i]!=null){ const f=players.find(z=>z.p.id===L.subs[i]); player=f?f.p:null; }
    else { pools[role]=pools[role]||byRole(role).filter(z=>!used.has(z.p.id)); const pick=pools[role].shift(); if(pick){ used.add(pick.p.id); player=pick.p; } }
    const pos=L.pos[i]||[s[1],s[2]];
    return {i,role,x:pos[0],y:pos[1],player};
  });
  const bench=players.filter(x=>!used.has(x.p.id)).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v))).map(x=>({p:x.p,v:x.v}));
  return {slots,bench,module:L.module};
}
function setLineupModule(key){ const L=getLineupCalcio(); L.module=key; L.pos={}; L.subs={}; save(); renderFormazione(); }
function setLineupPos(i,x,y){ const L=getLineupCalcio(); L.pos[i]=[Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))]; save(); }
function setLineupSub(i,pid){ const L=getLineupCalcio(); if(pid==null) delete L.subs[i]; else L.subs[i]=pid; save(); renderFormazione(); }
function resetLineup(){ const L=getLineupCalcio(); L.pos={}; L.subs={}; save(); renderFormazione(); toast('Formazione ripristinata','info'); }
function fmzBadge(v){ return v==null?'<span class="voto-badge nd">—</span>':`<span class="voto-badge ${v>=7?'hi':v>=5.5?'md':'lo'}">${v.toFixed(1)}</span>`; }
function renderSoccerFormation(){
  injectFmzCSS(); soccerFieldCSS();
  const {slots,bench,module}=soccerLineup();
  const mods=Object.keys(SOCCER_MODULES).map(m=>`<button class="mod-chip${m===module?' on':''}" onclick="setLineupModule('${m}')">${m}</button>`).join('');
  const tokens=slots.map(s=>{
    const p=s.player;
    const inner = p ? `<span class="ftk-num">${p.number}</span><span class="ftk-name">${(p.name||'').split(' ').slice(-1)[0]}</span>`
                    : `<span class="ftk-num">+</span>`;
    return `<div class="ftk${p?'':' empty'}" style="left:${(s.x*100).toFixed(1)}%;top:${(s.y*100).toFixed(1)}%" data-i="${s.i}" onclick="soccerSlotTap(${s.i})">${inner}</div>`;
  }).join('');
  const benchHtml = bench.length ? bench.map(b=>`<div class="fbench-chip"><span class="fmz-num">#${b.p.number}</span> ${b.p.name} <span class="fmz-role-tag">${b.p.role}</span> ${fmzBadge(b.v)}</div>`).join('') : '<p class="hint">Nessuna riserva.</p>';
  document.getElementById('formazione-content').innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <h3 style="margin:0"><i class="fa-solid fa-futbol" style="color:var(--brand)"></i> Modulo</h3>
        <div class="mod-chips">${mods}</div>
      </div>
      <div class="fpitch-wrap"><div class="fpitch" id="fpitch">
        <svg viewBox="0 0 100 150" preserveAspectRatio="none" class="fpitch-svg">
          <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
          <line x1="1" y1="75" x2="99" y2="75" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
          <circle cx="50" cy="75" r="11" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
          <rect x="26" y="1" width="48" height="20" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
          <rect x="26" y="129" width="48" height="20" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
          <rect x="38" y="1" width="24" height="8" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
          <rect x="38" y="141" width="24" height="8" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
        </svg>
        ${tokens}
      </div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-ghost btn-sm" onclick="resetLineup()"><i class="fa-solid fa-rotate-left"></i> Ripristina</button>
        <span class="hint" style="align-self:center">Trascina i giocatori per spostarli · tocca un giocatore per sostituirlo.</span>
      </div>
    </div>
    <div class="card"><h3><i class="fa-solid fa-users" style="color:var(--muted)"></i> Panchina (per rendimento)</h3>
      <div class="fbench">${benchHtml}</div>
    </div>`;
  bindSoccerDrag();
}
function bindSoccerDrag(){
  const pitch=document.getElementById('fpitch'); if(!pitch) return;
  pitch.querySelectorAll('.ftk').forEach(tk=>{
    let moved=false,px,py;
    tk.addEventListener('pointerdown',e=>{
      e.stopPropagation(); moved=false; px=e.clientX; py=e.clientY; try{tk.setPointerCapture(e.pointerId);}catch(_){}
      const r=pitch.getBoundingClientRect();
      const mv=ev=>{ if(Math.abs(ev.clientX-px)+Math.abs(ev.clientY-py)>4) moved=true;
        const x=(ev.clientX-r.left)/r.width, y=(ev.clientY-r.top)/r.height;
        tk.style.left=(Math.max(0,Math.min(1,x))*100)+'%'; tk.style.top=(Math.max(0,Math.min(1,y))*100)+'%'; };
      const up=ev=>{ tk.onpointermove=null;tk.onpointerup=null;tk.onpointercancel=null; try{tk.releasePointerCapture(e.pointerId);}catch(_){}
        if(moved){ const x=(ev.clientX-r.left)/r.width, y=(ev.clientY-r.top)/r.height; setLineupPos(+tk.dataset.i,x,y); tk._moved=true; setTimeout(()=>tk._moved=false,50); } };
      tk.onpointermove=mv; tk.onpointerup=up; tk.onpointercancel=up;
    });
  });
}
function soccerSlotTap(i){
  const tk=document.querySelector('.ftk[data-i="'+i+'"]'); if(tk&&tk._moved) return; // era un drag, non un tap
  const {slots,bench}=soccerLineup(); const slot=slots.find(s=>s.i===i); if(!slot) return;
  const cur=slot.player;
  const opts=bench.map(b=>`<button class="sub-opt" onclick="setLineupSub(${i},${b.p.id});closeModal()"><span class="fmz-num">#${b.p.number}</span> ${b.p.name} <span class="fmz-role-tag">${b.p.role}</span> ${fmzBadge(b.v)}</button>`).join('');
  openModal(`<div class="modal-head"><h3><i class="fa-solid fa-right-left" style="color:var(--brand)"></i> Sostituisci ${cur?cur.name:'slot vuoto'}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body"><p class="hint" style="margin-bottom:10px">Scegli chi mettere in questo slot (${slot.role}).</p>
      <div class="sub-list">${opts||'<p class="hint">Nessuna riserva disponibile.</p>'}</div>
      ${cur?`<button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="setLineupSub(${i},null);closeModal()"><i class="fa-solid fa-wand-magic-sparkles"></i> Torna al titolare automatico</button>`:''}
    </div>`, true);
}
function soccerFieldCSS(){
  if(document.getElementById('fpitch-css')) return;
  const st=document.createElement('style'); st.id='fpitch-css';
  st.textContent=`
  .mod-chips{display:flex;gap:6px;flex-wrap:wrap;} .mod-chip{border:1px solid var(--line,rgba(255,255,255,.16));background:transparent;color:var(--muted);border-radius:9px;padding:6px 12px;font-weight:800;font-family:'Outfit',sans-serif;font-size:.82rem;cursor:pointer;}
  .mod-chip.on{border-color:var(--brand);color:#fff;background:color-mix(in srgb,var(--brand) 20%,transparent);}
  .fpitch-wrap{display:flex;justify-content:center;}
  .fpitch{position:relative;width:100%;max-width:360px;aspect-ratio:100/150;background:linear-gradient(180deg,#1f7a43,#176135);border-radius:14px;overflow:hidden;touch-action:none;}
  .fpitch.fpitch-basket{background:linear-gradient(180deg,#b5763b,#95602c);}
  .fpitch.readonly .ftk{cursor:default;}
  .fpitch-svg{position:absolute;inset:0;width:100%;height:100%;}
  .ftk{position:absolute;transform:translate(-50%,-50%);width:13%;aspect-ratio:1;border-radius:50%;background:var(--brand);color:#04140a;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,.4);user-select:none;border:2px solid rgba(255,255,255,.85);}
  .ftk.empty{background:rgba(255,255,255,.18);color:#fff;border-style:dashed;}
  .ftk-num{font-family:'Outfit',sans-serif;font-weight:900;font-size:.9rem;line-height:1;} .ftk-name{font-size:.5rem;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px;}
  .ftk-ov{font-size:.44rem;font-weight:800;opacity:.85;line-height:1;}
  .fbench{display:flex;flex-wrap:wrap;gap:8px;} .fbench-chip{display:flex;align-items:center;gap:6px;background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:7px 11px;font-size:.85rem;font-weight:600;}
  .sub-list{display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto;} .sub-opt{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--line,rgba(255,255,255,.12));border-radius:10px;padding:10px 12px;color:inherit;font-size:.9rem;font-weight:600;cursor:pointer;}
  .sub-opt:hover{border-color:var(--brand);}
  .bench-chips{display:flex;flex-wrap:wrap;gap:6px;} .bench-chip{display:flex;align-items:center;gap:6px;background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.14));border-radius:20px;padding:5px 11px 5px 5px;color:inherit;font-size:.82rem;font-weight:600;cursor:pointer;}
  .bench-chip:hover{border-color:var(--brand);} .bench-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--brand);color:#04140a;font-weight:900;font-size:.72rem;font-family:'Outfit',sans-serif;}`;
  document.head.appendChild(st);
}
function injectFmzCSS(){
  if(document.getElementById('fmz-css'))return;
  const st=document.createElement('style'); st.id='fmz-css';
  st.textContent=`
  .fmz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
  .fmz-role{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;}
  .fmz-role-h{font-weight:800;font-family:'Outfit',sans-serif;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;}
  .fmz-n{color:var(--muted);font-size:.8rem;font-weight:600;}
  .fmz-slot{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);}
  .fmz-slot:last-child{border-bottom:0;}
  .fmz-slot.empty{color:var(--muted);font-style:italic;font-size:.85rem;justify-content:center;padding:10px 0;}
  .fmz-num{font-family:'Outfit',sans-serif;font-weight:800;color:var(--brand);min-width:36px;}
  .fmz-name{flex:1;font-weight:600;}
  .fmz-role-tag{color:var(--muted);font-size:.78rem;}
  .voto-badge{font-family:'Outfit',sans-serif;font-weight:800;border-radius:8px;padding:3px 9px;font-size:.85rem;}
  .voto-badge.hi{background:rgba(34,197,94,.18);color:#22C55E;} .voto-badge.md{background:rgba(245,179,1,.16);color:#f5b301;}
  .voto-badge.lo{background:rgba(240,70,60,.16);color:#F0463C;} .voto-badge.nd{background:var(--surface);color:var(--muted);}
  .fmz-bench .fmz-slot{border-bottom:1px solid var(--line);}
  `;
  document.head.appendChild(st);
}
/* ---- Formazione PALLAVOLO/BASKET visuale: campo disegnato (stesso stile del campo calcio) ---- */
function pickLineupPallavolo(){
  const roleMap=volleyZoneRoleMap(getLineupPallavolo().rotation);
  const players=DB.players.map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const byRole=r=>players.filter(x=>x.p.role===r).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  return VOLLEY_ZONES.map(([z,x,y])=>{
    const [role,idx]=roleMap[z]; const pick=byRole(role)[idx];
    return {zone:z,role,x,y,player:pick?pick.p:null,v:pick?pick.v:null};
  });
}
function pickLineupBasket(){
  const players=DB.players.map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const byRole=r=>players.filter(x=>x.p.role===r).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  return Object.keys(BASKET_POS).map(role=>{
    const pick=byRole(role)[0]; const [x,y]=BASKET_POS[role];
    return {zone:role,role,x,y,player:pick?pick.p:null,v:pick?pick.v:null};
  });
}
/* Riquadro basket inscritto nel viewBox 100x150 con le stesse proporzioni reali (28x15)
   usate da courtRect() nella Lavagnetta Tattica, cosi' il campo non appare piu' storpiato.
   Le x dei token pallacanestro vanno rimappate su questo riquadro (vedi renderCourtFormation). */
const BASKET_VB=(()=>{ const ratio=28/15, aw=98, ah=148, pw=ah/ratio, rx=1+(aw-pw)/2, ry=1, rw=pw, rh=ah; return {rx,ry,rw,rh,cx:rx+rw/2,cy:ry+rh/2}; })();
function courtZoneSVG(sport){
  if(sport==='pallavolo'){
    return `<svg viewBox="0 0 100 150" preserveAspectRatio="none" class="fpitch-svg">
      <rect x="1" y="1" width="98" height="148" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
      <line x1="1" y1="1" x2="99" y2="1" stroke="rgba(255,255,255,.9)" stroke-width="2"/>
      <line x1="1" y1="50" x2="99" y2="50" stroke="rgba(255,255,255,.45)" stroke-width="0.6" stroke-dasharray="4 4"/>
      <line x1="34" y1="1" x2="34" y2="149" stroke="rgba(255,255,255,.3)" stroke-width="0.5" stroke-dasharray="4 4"/>
      <line x1="66" y1="1" x2="66" y2="149" stroke="rgba(255,255,255,.3)" stroke-width="0.5" stroke-dasharray="4 4"/>
    </svg>`;
  }
  const {rx,ry,rw,rh,cx,cy}=BASKET_VB, kw=rw*0.36, kh=rh*0.19, r=kw*0.5;
  return `<svg viewBox="0 0 100 150" preserveAspectRatio="none" class="fpitch-svg">
    <rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="0.5"/>
    <line x1="${rx.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(rx+rw).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
    <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(rw*0.13).toFixed(2)}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="0.5"/>
    <rect x="${(cx-kw/2).toFixed(2)}" y="${ry.toFixed(2)}" width="${kw.toFixed(2)}" height="${kh.toFixed(2)}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
    <rect x="${(cx-kw/2).toFixed(2)}" y="${(ry+rh-kh).toFixed(2)}" width="${kw.toFixed(2)}" height="${kh.toFixed(2)}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.5"/>
    <path d="M ${(cx-r).toFixed(2)} ${(ry+kh).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(cx+r).toFixed(2)} ${(ry+kh).toFixed(2)}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
    <path d="M ${(cx-r).toFixed(2)} ${(ry+rh-kh).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${(cx+r).toFixed(2)} ${(ry+rh-kh).toFixed(2)}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="0.5"/>
  </svg>`;
}
function renderCourtFormation(sport){
  injectFmzCSS(); soccerFieldCSS();
  const rows = sport==='pallavolo' ? pickLineupPallavolo() : pickLineupBasket();
  const showOv=showLineupOverall();
  const tokens=rows.map(r=>{
    const p=r.player;
    const inner = p
      ? `<span class="ftk-num">${p.number}</span><span class="ftk-name">${(p.name||'').split(' ').slice(-1)[0]}</span>${showOv?`<span class="ftk-ov">${cphOverall(r.v)}</span>`:''}`
      : `<span class="ftk-num">${r.zone}</span>`;
    const leftPct = sport==='basket' ? (BASKET_VB.rx+r.x*BASKET_VB.rw) : (r.x*100);
    return `<div class="ftk${p?'':' empty'}" style="left:${leftPct.toFixed(1)}%;top:${(r.y*100).toFixed(1)}%" title="${r.role}">${inner}</div>`;
  }).join('');
  const usedIds=new Set(rows.filter(r=>r.player).map(r=>r.player.id));
  const players=DB.players.map(p=>({p,v:getSeasonStats(p.id).avgVoto}));
  const bench=players.filter(x=>!usedIds.has(x.p.id)).sort((a,b)=>((b.v==null?-1:b.v)-(a.v==null?-1:a.v)));
  const benchHtml = bench.length ? bench.map(b=>`<div class="fbench-chip"><span class="fmz-num">#${b.p.number}</span> ${b.p.name} <span class="fmz-role-tag">${b.p.role}</span> ${fmzBadge(b.v)}</div>`).join('') : '<p class="hint">Nessuna riserva.</p>';
  const rotHeader = sport==='pallavolo' ? (()=>{
    const rot=getLineupPallavolo().rotation;
    const chips=[1,2,3,4,5,6].map(n=>`<button class="mod-chip${n===rot?' on':''}" onclick="setLineupRotation(${n})">P${n}</button>`).join('');
    return `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <h3 style="margin:0"><i class="fa-solid fa-volleyball" style="color:var(--brand)"></i> Formazione in campo</h3>
        <div class="mod-chips">${chips}</div>
      </div>
      <p class="hint" style="margin:-4px 0 12px">Rotazione di partenza: da che zona parte il palleggiatore.</p>`;
  })() : `<h3 style="margin:0 0 12px"><i class="fa-solid fa-basketball" style="color:var(--brand)"></i> Formazione in campo</h3>`;
  document.getElementById('formazione-content').innerHTML=`
    <div class="card">
      ${rotHeader}
      <div class="fpitch-wrap"><div class="fpitch readonly${sport==='basket'?' fpitch-basket':''}">
        ${courtZoneSVG(sport)}
        ${tokens}
      </div></div>
      <p class="hint" style="margin-top:1rem">Scelti per media voto. Più registri partite nello Scout, più la formazione diventa precisa.</p>
    </div>
    <div class="card"><h3><i class="fa-solid fa-users" style="color:var(--muted)"></i> Panchina (per rendimento)</h3>
      <div class="fbench">${benchHtml}</div>
    </div>`;
}
function renderFormazione(){
  const sport=curSport();
  if(sport==='calcio'){ renderSoccerFormation(); return; }
  renderCourtFormation(sport);
}
