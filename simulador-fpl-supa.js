// Cliente mínimo de Supabase con fetch: sesión (la misma del sitio), Storage privado y la tabla de respuestas.
// En pruebas, window.__SUPA_MOCK(url, opciones) reemplaza a fetch.
import { CONFIG } from './simulador-fpl-config.js';

const COLA = 'fpl-cola';
const pedir = (url, op) => (window.__SUPA_MOCK || fetch)(url, op);
const base = (extra = {}) => ({ apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...extra });

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CONFIG.CLAVE_SESION) || 'null'); } catch { return null; }
}
function guardarSesion(s) {
  try { localStorage.setItem(CONFIG.CLAVE_SESION, JSON.stringify(s)); } catch { /* sin almacenamiento */ }
}
const conVencimiento = (s) => ({ ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });

export async function entrar(correo, clave) {
  const r = await pedir(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: base(), body: JSON.stringify({ email: correo, password: clave }) });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error_description || datos.msg || 'El correo o la contraseña no coinciden.');
  const s = conVencimiento(datos);
  guardarSesion(s);
  return s;
}

export async function renovar(s) {
  const r = await pedir(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: base(), body: JSON.stringify({ refresh_token: s.refresh_token }) });
  if (!r.ok) throw new Error('La sesión venció. Vuelve a entrar.');
  const nueva = conVencimiento(await r.json());
  guardarSesion(nueva);
  return nueva;
}

// Sesión vigente (renovada si vence en menos de un minuto) o null.
export async function sesion() {
  const s = leerSesion();
  if (!s?.access_token) return null;
  if ((s.expires_at || 0) * 1000 - Date.now() > 60000) return s;
  try { return await renovar(s); } catch { return null; }
}

export function salir() {
  try { localStorage.removeItem(CONFIG.CLAVE_SESION); } catch { /* nada */ }
}

async function autorizado() {
  const s = await sesion();
  if (!s) { const e = new Error('Sin sesión'); e.sinSesion = true; throw e; }
  return { s, h: base({ Authorization: `Bearer ${s.access_token}` }) };
}

export async function bajarJSON(nombre) {
  const { h } = await autorizado();
  const r = await pedir(`${CONFIG.SUPABASE_URL}/storage/v1/object/authenticated/${CONFIG.BUCKET}/${nombre}`, { headers: h });
  if (r.status === 400 || r.status === 403 || r.status === 404) { const e = new Error('privado'); e.privado = true; throw e; }
  if (!r.ok) throw new Error(`No se pudo bajar ${nombre} (${r.status}).`);
  return r.json();
}

export async function leerRespuestas() {
  const { h } = await autorizado();
  const r = await pedir(`${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLA}?select=*&order=creado.asc`, { headers: h });
  if (!r.ok) throw new Error(`No se pudo leer el avance (${r.status}).`);
  return r.json();
}

const leerCola = () => { try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch { return []; } };
const escribirCola = (c) => { try { localStorage.setItem(COLA, JSON.stringify(c)); } catch { /* nada */ } };
export const pendientes = () => leerCola().length;
export const colaLocal = () => leerCola();

async function enviar(filas) {
  const { s, h } = await autorizado();
  const cuerpo = filas.map((f) => ({ ...f, usuario: s.user?.id }));
  const r = await pedir(`${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLA}?on_conflict=usuario,plan_id,intento,modo`, {
    method: 'POST', headers: { ...h, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`No se guardó (${r.status}).`);
}

// Guarda una respuesta; si no hay red o falla, queda en la cola y se reintenta en el siguiente envío.
export async function guardarRespuesta(fila) {
  const cola = [...leerCola(), fila];
  try {
    await enviar(cola);
    escribirCola([]);
    return true;
  } catch {
    escribirCola(cola);
    return false;
  }
}

export async function vaciarCola() {
  const cola = leerCola();
  if (!cola.length) return true;
  try { await enviar(cola); escribirCola([]); return true; } catch { return false; }
}
