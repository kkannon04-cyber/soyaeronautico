// ============================================================
// CONEXIÓN A SUPABASE — Panel del Estudiante (SoyAeronautico)
// Reemplaza los dos valores de abajo por los de tu proyecto:
// Supabase Dashboard > Settings > API > Project URL / anon public key.
// La "anon key" es pública por diseño: el acceso real a los datos
// lo controla Row Level Security (ver supabase-schema.sql).
// Mientras estos valores queden sin reemplazar, el sitio sigue
// funcionando en modo invitado (localStorage), sin romper nada.
// ============================================================

const SUPABASE_URL = 'https://yszcglcnbpnyteytpfyc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H3VUEgXfNLR9htE7QFHeAw_VxUIOC9W';

const sbClient = (function crearClienteSupabase() {
  const configurado = !SUPABASE_URL.startsWith('TU_') && !SUPABASE_ANON_KEY.startsWith('TU_');
  if (!configurado || typeof supabase === 'undefined') return null;
  try {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('No se pudo inicializar Supabase:', e.message);
    return null;
  }
})();
