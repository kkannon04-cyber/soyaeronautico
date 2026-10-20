// Proyecto de Supabase de SoyAeronáutico. La llave publicable puede estar en el navegador:
// el acceso real lo controla Row Level Security (supabase/esquema.sql): planes para usuarios con sesión, avance de cada uno.
export const CONFIG = {
  SUPABASE_URL: 'https://yszcglcnbpnyteytpfyc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_H3VUEgXfNLR9htE7QFHeAw_VxUIOC9W',
  // Misma clave de sesión que usa supabase-js en el resto del sitio: si ya entraste a SoyAeronáutico, aquí también.
  CLAVE_SESION: 'sb-yszcglcnbpnyteytpfyc-auth-token',
  BUCKET: 'simulador-fpl',
  TABLA: 'fpl_respuestas',
};
