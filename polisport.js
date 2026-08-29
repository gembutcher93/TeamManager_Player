/* =========================================================
   POLISPORT — layer aggiuntivo (fondazione multi-sport)
   Non riscrive app.js: si aggancia sopra.
   Carica DOPO app.js:  <script src="polisport.js"></script>
   Milestone 1: config sport · setup iniziale · colori · ruoli da config.
   (Lo scout per-sport arriva nella milestone 2, con modifiche in app.js.)
   ========================================================= */
(function () {
  'use strict';
  const LS = 'volleyteam_db';

  /* ---- LA FONTE DI VERITÀ: aggiungere uno sport = aggiungere un blocco ---- */
  const SPORTS = {
    pallavolo: { label: 'Pallavolo', icon: '🏐', players: 6,
      roles: ['Palleggiatore', 'Schiacciatore', 'Centrale', 'Opposto', 'Libero'] },
    calcio: { label: 'Calcio', icon: '⚽', players: 11,
      roles: ['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'] },
    basket: { label: 'Basket', icon: '🏀', players: 5,
      roles: ['Playmaker', 'Guardia', 'Ala piccola', 'Ala grande', 'Centro'] }
  };

  /* ---- colori squadra (ricolorano l'app da --brand) ---- */
  const ACCENTS = {
    verde: { v: '#22C55E', deep: '#15803D', glow: 'rgba(34,197,94,.30)' },
    blu:   { v: '#2E7BFF', deep: '#1D4ED8', glow: 'rgba(46,123,255,.30)' },
    rosso: { v: '#F0463C', deep: '#B91C1C', glow: 'rgba(240,70,60,.30)' },
    oro:   { v: '#F5B301', deep: '#B45309', glow: 'rgba(245,179,1,.30)' },
    viola: { v: '#A855F7', deep: '#7E22CE', glow: 'rgba(168,85,247,.30)' }
  };

  function gDB(){ try { return (typeof DB !== 'undefined' && DB) ? DB : null; } catch (e) { return null; } }
  function readDB(){ const g = gDB(); if (g) return g; try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
  function persist(){ if (typeof window.save === 'function') window.save(); else { const g = gDB(); if (g) localStorage.setItem(LS, JSON.stringify(g)); } }

  function applyAccent(key) {
    const a = ACCENTS[key] || ACCENTS.verde, r = document.documentElement.style;
    r.setProperty('--brand', a.v);
    r.setProperty('--brand-deep', a.deep);
    r.setProperty('--brand-glow', a.glow);
  }

  /* popola la tendina ruoli dal config invece che dall'HTML fisso */
  function patchRoles(sportKey) {
    const sel = document.getElementById('p-role');
    if (!sel) return false;
    const roles = (SPORTS[sportKey] || SPORTS.pallavolo).roles;
    sel.innerHTML = '<option value="">Scegli…</option>' + roles.map(r => `<option>${r}</option>`).join('');
    return true;
  }
  function ensureRoles(sportKey) {
    let n = 0;
    const t = setInterval(() => { if (patchRoles(sportKey) || ++n > 25) clearInterval(t); }, 80);
  }

  /* piccolo pulsante "Cambia sport/colore" nella sidebar */
  function injectSportButton(d) {
    const foot = document.querySelector('.side-foot');
    if (!foot) return;
    const s = SPORTS[d.sport] || SPORTS.pallavolo;
    let b = document.getElementById('ps-open');
    if (!b) {
      b = document.createElement('button');
      b.id = 'ps-open';
      b.className = 'btn btn-ghost btn-sm';
      b.style.cssText = 'width:100%;margin-top:10px;justify-content:center;';
      foot.appendChild(b);
    }
    b.innerHTML = `${s.icon} ${s.label} · Cambia`;
    b.onclick = () => showSetup(readDB());
  }

  /* ---- SCHERMATA DI SETUP ---- */
  function showSetup(existing) {
    const d = existing || {};
    const curSport = d.sport || 'pallavolo';
    const curAccent = d.accent || 'verde';
    const wrap = document.createElement('div');
    wrap.id = 'ps-setup';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:200;overflow-y:auto;padding:28px 20px;' +
      'background:radial-gradient(1000px 600px at 80% -10%,rgba(34,197,94,.10),transparent 60%),linear-gradient(170deg,#0A1020,#060A18 60%);';
    wrap.innerHTML = `
      <div style="max-width:460px;margin:0 auto;color:#F3F7FC;font-family:'Urbanist',system-ui,sans-serif;">
        <div style="font-size:.7rem;letter-spacing:3px;text-transform:uppercase;color:var(--brand);font-weight:700;margin-top:6px;">
          ${existing && existing.sport ? 'Impostazioni squadra' : 'Benvenuto, coach'}</div>
        <h2 style="font-family:'Outfit',sans-serif;font-size:1.8rem;font-weight:800;margin:4px 0 6px;">Configura la squadra</h2>
        <p style="color:#8395B4;font-size:.92rem;line-height:1.5;">Scegli lo sport: l'app imposterà ruoli e struttura di conseguenza.</p>

        <label style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:#8395B4;font-weight:700;margin:20px 0 8px;">Sport</label>
        <div id="ps-sports" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          ${Object.entries(SPORTS).map(([k, s]) => `
            <div class="ps-sport" data-k="${k}" style="cursor:pointer;text-align:center;padding:16px 6px;border-radius:14px;
              border:1px solid ${k === curSport ? 'var(--brand)' : '#22304E'};background:${k === curSport ? 'rgba(34,197,94,.10)' : '#141D31'};">
              <div style="font-size:30px;">${s.icon}</div>
              <div style="font-size:.82rem;font-weight:700;margin-top:5px;">${s.label}</div>
              <div style="font-size:.66rem;color:#8395B4;margin-top:2px;">${s.players} in campo</div>
            </div>`).join('')}
        </div>

        <label style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:#8395B4;font-weight:700;margin:20px 0 8px;">Nome squadra</label>
        <input id="ps-team" maxlength="20" value="${(d.teamName && d.teamName !== 'TEAM') ? d.teamName : ''}" placeholder="Es. Podere 173"
          style="width:100%;background:#141D31;border:1px solid #22304E;color:#fff;padding:13px 14px;border-radius:12px;font-size:1rem;font-weight:600;">

        <label style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:#8395B4;font-weight:700;margin:16px 0 8px;">Nome allenatore</label>
        <input id="ps-coach" maxlength="24" value="${d.coachName || ''}" placeholder="Es. Gem"
          style="width:100%;background:#141D31;border:1px solid #22304E;color:#fff;padding:13px 14px;border-radius:12px;font-size:1rem;font-weight:600;">

        <label style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:#8395B4;font-weight:700;margin:20px 0 8px;">Colore squadra</label>
        <div id="ps-accents" style="display:flex;gap:12px;">
          ${Object.entries(ACCENTS).map(([k, a]) => `
            <div class="ps-accent" data-k="${k}" title="${k}" style="width:42px;height:42px;border-radius:12px;cursor:pointer;
              background:${a.v};border:3px solid ${k === curAccent ? '#fff' : 'transparent'};"></div>`).join('')}
        </div>

        <button id="ps-go" style="width:100%;margin-top:26px;border:0;cursor:pointer;border-radius:13px;padding:15px;
          font-family:'Outfit',sans-serif;font-weight:800;font-size:1.05rem;background:var(--brand);color:#04140A;">
          ${existing && existing.sport ? 'Salva' : 'Entra nell\'app'}</button>
        ${existing && existing.sport ? `<button id="ps-cancel" style="width:100%;margin-top:10px;background:none;border:0;color:#8395B4;cursor:pointer;font-size:.9rem;">Annulla</button>` : ''}
      </div>`;
    document.body.appendChild(wrap);

    let pick = { sport: curSport, accent: curAccent };
    wrap.querySelectorAll('.ps-sport').forEach(el => el.onclick = () => {
      pick.sport = el.dataset.k;
      wrap.querySelectorAll('.ps-sport').forEach(x => {
        const on = x.dataset.k === pick.sport;
        x.style.borderColor = on ? 'var(--brand)' : '#22304E';
        x.style.background = on ? 'rgba(34,197,94,.10)' : '#141D31';
      });
    });
    wrap.querySelectorAll('.ps-accent').forEach(el => el.onclick = () => {
      pick.accent = el.dataset.k;
      applyAccent(pick.accent);
      wrap.querySelectorAll('.ps-accent').forEach(x => x.style.borderColor = x.dataset.k === pick.accent ? '#fff' : 'transparent');
    });
    const cancel = wrap.querySelector('#ps-cancel');
    if (cancel) cancel.onclick = () => { applyAccent(d.accent || 'verde'); wrap.remove(); };

    wrap.querySelector('#ps-go').onclick = () => {
      const cur = readDB(); if (!cur) return;
      cur.sport = pick.sport;
      cur.accent = pick.accent;
      const team = (wrap.querySelector('#ps-team').value || '').trim();
      const coach = (wrap.querySelector('#ps-coach').value || '').trim();
      if (team) cur.teamName = team;
      if (coach) cur.coachName = coach;
      persist();                    // scrive col save() di app.js
      applyAccent(pick.accent);
      patchRoles(pick.sport);
      if (typeof window.renderTeamName === 'function') window.renderTeamName();
      wrap.remove();
      if (typeof window.go === 'function') window.go('dashboard');
    };
  }

  /* ---- NAV IN BASSO (solo mobile; su desktop resta la sidebar) ---- */
  const NAV_ORDER = ['dashboard', 'roster', 'calendario', 'allenamenti', 'scout', 'rotazioni', 'presenze', 'tattica', 'backup'];
  const NAV_SHORT = { dashboard: 'Dash', roster: 'Roster', calendario: 'Calend.', allenamenti: 'Allen.', scout: 'Scout', rotazioni: 'Rotaz.', presenze: 'Presenze', tattica: 'Lavagn.', backup: 'Backup' };
  function bnActive(sec) {
    document.querySelectorAll('#ps-bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
    const on = document.querySelector('#ps-bottomnav button.active');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function buildBottomNav() {
    if (document.getElementById('ps-bottomnav')) return;
    const src = Array.from(document.querySelectorAll('aside .nav button'));
    if (!src.length) return;
    const st = document.createElement('style');
    st.textContent =
      '#ps-bottomnav{position:fixed;left:0;right:0;bottom:0;z-index:80;display:none;background:rgba(6,10,24,.94);' +
      'backdrop-filter:blur(10px);border-top:1px solid var(--line);overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;' +
      'padding:6px 8px calc(6px + env(safe-area-inset-bottom));}' +
      '#ps-bottomnav::-webkit-scrollbar{height:0;}' +
      '#ps-bottomnav .row{display:flex;gap:4px;min-width:max-content;}' +
      '#ps-bottomnav button{flex:0 0 auto;min-width:66px;background:none;border:0;color:var(--muted);' +
      "font-family:'Urbanist',sans-serif;font-weight:600;font-size:.64rem;cursor:pointer;display:flex;flex-direction:column;" +
      'align-items:center;gap:3px;padding:7px 6px;border-radius:12px;white-space:nowrap;transition:.15s;}' +
      '#ps-bottomnav button i{font-size:1.12rem;}' +
      '#ps-bottomnav button.active{color:var(--brand);background:rgba(255,255,255,.06);}' +
      '@media(max-width:960px){#ps-bottomnav{display:block;} main{height:calc(100vh - 4.4rem - env(safe-area-inset-bottom))!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch;padding-bottom:1.4rem!important;}}';
    document.head.appendChild(st);
    const map = {}; src.forEach(b => { if (b.dataset.sec) map[b.dataset.sec] = b; });
    const order = NAV_ORDER.filter(s => map[s]).concat(Object.keys(map).filter(s => !NAV_ORDER.includes(s)));
    const bar = document.createElement('nav'); bar.id = 'ps-bottomnav';
    const row = document.createElement('div'); row.className = 'row';
    order.forEach(sec => {
      const orig = map[sec];
      const icon = (orig.querySelector('i') || {}).outerHTML || '';
      const btn = document.createElement('button'); btn.dataset.sec = sec;
      btn.innerHTML = `${icon}<span>${NAV_SHORT[sec] || orig.textContent.trim()}</span>`;
      btn.onclick = () => { if (typeof window.go === 'function') window.go(sec); bnActive(sec); };
      row.appendChild(btn);
    });
    bar.appendChild(row); document.body.appendChild(bar);
    src.forEach(b => { const sec = b.dataset.sec; if (sec) b.addEventListener('click', () => bnActive(sec)); });
    const cur = document.querySelector('.section.active'); bnActive(cur ? cur.id : 'dashboard');
  }

  /* ---- BOOT ---- */
  function boot() {
    buildBottomNav();
    let tries = 0;
    const t = setInterval(() => {
      const d = readDB();
      tries++;
      if (d) {
        clearInterval(t);
        if (!d.sport) { showSetup(d); }        // prima volta → scegli sport
        else {
          applyAccent(d.accent || 'verde');
          ensureRoles(d.sport);
        }
      } else if (tries > 30) { clearInterval(t); }
    }, 80);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('load', boot);

  // Reset (Azzera tutto) -> ripropone la scelta sport, invece di uno switch fisso
  function installReset(){
    if (typeof window.resetAll !== 'function' || window.__psReset) return;
    window.__psReset = true;
    window.resetAll = function(){
      confirmAction('Cancellare TUTTI i dati e ripartire da zero? Non si può annullare.', function(){
        try { localStorage.removeItem(LS_KEY); } catch(e){}
        DB = emptyDB(); save(); renderTeamName(); go('dashboard');
        showSetup(readDB());
        toast('App azzerata — scegli lo sport', 'info');
      });
    };
  }
  installReset();
  window.addEventListener('load', installReset);

  window.POLISPORT = { SPORTS, ACCENTS, showSetup };
})();
