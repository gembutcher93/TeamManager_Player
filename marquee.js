/* =========================================================
   marquee.js — testo a scorrimento riutilizzabile
   Uso:  <div class="marquee">Testo lungo che straborda…</div>
   Include:  <script src="marquee.js"></script>
   Quando il testo è più largo del contenitore, scorre da solo:
   pausa all'inizio → scorre fino alla fine → pausa → torna → loop.
   Se ci sta tutto, resta fermo. Si auto-aggiorna su resize e sui
   cambi di contenuto (MutationObserver). Nessuna dipendenza.
   ========================================================= */
(function () {
  'use strict';
  if (window.__marqueeInit) return;
  window.__marqueeInit = true;

  function css() {
    if (document.getElementById('marquee-css')) return;
    var st = document.createElement('style');
    st.id = 'marquee-css';
    st.textContent =
      '.marquee{display:block;overflow:hidden;white-space:nowrap;max-width:100%;}' +
      '.marquee>.mq-inner{display:inline-block;will-change:transform;}' +
      '.marquee.mq-on>.mq-inner{animation:mq-scroll var(--mq-dur,8s) ease-in-out infinite;}' +
      '@keyframes mq-scroll{0%,12%{transform:translateX(0)}44%,56%{transform:translateX(var(--mq-shift,0))}88%,100%{transform:translateX(0)}}';
    document.head.appendChild(st);
  }

  function measure(el) {
    var inner = el.querySelector(':scope > .mq-inner');
    if (!inner) return;
    // reset per misurare
    el.classList.remove('mq-on');
    inner.style.setProperty('--mq-shift', '0px');
    var over = inner.scrollWidth - el.clientWidth;
    if (over > 2) {
      var dur = Math.max(4, Math.min(24, over / 45 + 4)); // velocità in base alla lunghezza
      el.style.setProperty('--mq-dur', dur.toFixed(1) + 's');
      inner.style.setProperty('--mq-shift', '-' + over + 'px');
      el.classList.add('mq-on');
    }
  }

  function wrap(el) {
    if (el.__mq) { measure(el); return; }
    el.__mq = true;
    var inner = document.createElement('span');
    inner.className = 'mq-inner';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    measure(el);
  }

  function scan(root) {
    (root || document).querySelectorAll('.marquee').forEach(wrap);
  }

  var raf = null;
  function scheduleRescan() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { scan(document); });
  }

  function boot() {
    css();
    scan(document);
    // ri-misura su resize
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { document.querySelectorAll('.marquee').forEach(measure); }, 150);
    });
    // ri-scansiona quando cambia il contenuto della pagina (render dinamici)
    try {
      new MutationObserver(scheduleRescan).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Marquee = { rescan: function () { scan(document); }, refresh: function () { document.querySelectorAll('.marquee').forEach(measure); } };
})();
