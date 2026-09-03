/* =========================================================
   AiRIM TeamManager — SUPABASE (Player)
   Layer separato: si carica DOPO app.js e si limita al trasporto dati
   verso Supabase (client init, ricezione pacchetto per team_code+PIN,
   invio referti). Nessuna logica di calcolo/business qui dentro: quella
   resta in app.js, che chiama le funzioni esposte da window.AiRIMSync.
      <script src="app.js"></script>
      <script src="supabase.js"></script>
   ========================================================= */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://dvyrfoaeqtcdvgxnkswu.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_tghtDcorJoNBRd95gOkqYQ_R6pbASbm';

  let _clientPromise = null;
  function getClient() {
    if (_clientPromise) return _clientPromise;
    _clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(m => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    return _clientPromise;
  }

  /* ---- pacchetto profilo: lettura via team_code + PIN ---- */
  async function getPlayerPackage(teamCode, pin) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('get_player_package', { p_team_code: teamCode, p_pin: String(pin) });
    if (error) throw error;
    return (data && data[0]) || null; // {team_id, player_id, player_name, package, updated_at}
  }

  /* ---- invio referto al coach (team_id/player_id noti dal pacchetto ricevuto) ---- */
  async function submitPlayerReport(teamId, playerId, report) {
    const sb = await getClient();
    const { error } = await sb.rpc('submit_player_report', { p_team_id: teamId, p_player_id: String(playerId), p_report: report });
    if (error) throw error;
    return true;
  }

  window.AiRIMSync = { getClient, getPlayerPackage, submitPlayerReport };
})();
