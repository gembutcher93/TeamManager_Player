/* =========================================================
   SoundKit — suoni sintetizzati via Web Audio API (nessun file audio esterno).
   Bonus, mai un requisito: se AudioContext non esiste o è bloccato dalla policy
   autoplay del browser, le funzioni non fanno nulla e non generano errori.
   ========================================================= */
(function(){
  'use strict';
  var ctx=null;
  function getCtx(){
    if(ctx) return ctx;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return null;
      ctx=new AC();
    }catch(e){ return null; }
    return ctx;
  }
  function envGain(ac,t0,peak,attack,decay){
    var g=ac.createGain();
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.linearRampToValueAtTime(peak,t0+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+attack+decay);
    return g;
  }
  /* whoosh: breve sweep in salita di frequenza — per il reveal/esplosione */
  function playWhoosh(){
    var ac=getCtx(); if(!ac) return;
    try{
      if(ac.state==='suspended') ac.resume().catch(function(){});
      var t0=ac.currentTime;
      var osc=ac.createOscillator(); osc.type='sine';
      osc.frequency.setValueAtTime(170,t0);
      osc.frequency.exponentialRampToValueAtTime(820,t0+0.26);
      var g=envGain(ac,t0,0.15,0.025,0.28);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t0); osc.stop(t0+0.34);
    }catch(e){}
  }
  /* chime: accordo morbido a 3 armoniche — riutilizzabile per conferme/completamenti */
  function playChime(){
    var ac=getCtx(); if(!ac) return;
    try{
      if(ac.state==='suspended') ac.resume().catch(function(){});
      var t0=ac.currentTime;
      var freqs=[880,1108.73,1318.51]; // A5, C#6, E6
      freqs.forEach(function(f,i){
        var start=t0+i*0.03;
        var osc=ac.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(f,start);
        var g=envGain(ac,start,0.085,0.02,0.5);
        osc.connect(g); g.connect(ac.destination);
        osc.start(start); osc.stop(start+0.6);
      });
    }catch(e){}
  }
  /* da chiamare al primo gesto dell'utente per "sbloccare" l'audio dove la policy lo richiede */
  function unlock(){ var ac=getCtx(); if(ac && ac.state==='suspended'){ ac.resume().catch(function(){}); } }
  window.SoundKit={playWhoosh:playWhoosh,playChime:playChime,unlock:unlock};
})();
