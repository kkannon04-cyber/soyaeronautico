// netlify/functions/metar.js
// Función serverless: el navegador del estudiante llama a ESTA función
// (en tu propio dominio, así que no hay problema de CORS), y ella es la
// que le pregunta a aviationweather.gov desde el servidor de Netlify.
// Sirve tanto METAR como TAF según el parámetro "type".

// ---------- CACHÉ EN MEMORIA (a nivel de módulo) ----------
// Netlify reutiliza la misma instancia de la función mientras siga "caliente"
// entre invocaciones seguidas, así que esta variable sobrevive entre llamadas.
// Un METAR nuevo sale como mucho una vez por hora y un TAF cada 6 horas,
// así que cachear 60-300 segundos no arriesga mostrar un dato viejo.
const cache = new Map();
const TTL_MS = {
  metar: 60 * 1000,       // 60 segundos
  taf: 5 * 60 * 1000       // 5 minutos
};

function limpiarCacheVencido(){
  const ahora = Date.now();
  for(const [key, entry] of cache){
    if(entry.expira <= ahora) cache.delete(key);
  }
}

// ---------- RATE LIMIT BÁSICO (en memoria, por IP) ----------
// Mismo patrón que taf-historial.js, pero con un intervalo más corto: esta
// función solo dispara UNA petición saliente por llamada (no un abanico de
// hasta 40 como taf-historial.js), y el Simulador NALA la llama cada vez que
// se abre el popup de un aeródromo distinto — un intervalo de 3s ahí
// bloquearía a un controlador revisando varios aeródromos seguidos. No es
// robusto entre instancias frías de Netlify, pero frena ráfagas de un mismo
// cliente variando "icao"/"hours" para saltarse sistemáticamente la caché.
const ultimaLlamadaPorIp = new Map();
const MIN_INTERVALO_MS = 1000; // máx. 1 solicitud por segundo por IP

function obtenerIp(event){
  const headers = event.headers || {};
  return headers['x-nf-client-connection-ip'] || headers['client-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
}

function limpiarLlamadasVencidas(){
  const limite = Date.now() - (10 * MIN_INTERVALO_MS);
  for(const [ip, ts] of ultimaLlamadaPorIp){
    if(ts < limite) ultimaLlamadaPorIp.delete(ip);
  }
}

// fetch con timeout: si NOAA se cuelga, fallamos rápido
async function fetchConTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try{
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  }finally{
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const icao = (params.icao || '').trim().toUpperCase();
  const hours = /^[0-9]{1,3}$/.test(params.hours || '') ? params.hours : '24';
  const type = params.type === 'taf' ? 'taf' : 'metar';

  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    "Cache-Control":                "no-store",
  };

  limpiarLlamadasVencidas();
  const ip = obtenerIp(event);
  const ahora = Date.now();
  const ultima = ultimaLlamadaPorIp.get(ip);
  if(ultima && ahora - ultima < MIN_INTERVALO_MS){
    return {
      statusCode: 429,
      headers: CORS,
      body: JSON.stringify({ error: 'Demasiadas solicitudes, espera unos segundos e intenta de nuevo.' }),
    };
  }
  ultimaLlamadaPorIp.set(ip, ahora);

  // Validación de forma del ICAO en el servidor: nunca reenviar a
  // aviationweather.gov un valor que no sean 4 letras (ver hallazgo 2.1
  // de la auditoría 2026-08-08).
  if(!/^[A-Z]{4}$/.test(icao)){
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Código ICAO inválido: debe tener 4 letras (ej. SKBO).' }),
    };
  }

  const cacheKey = `${type}:${icao}:${type === 'taf' ? '-' : hours}`;
  limpiarCacheVencido();
  const cached = cache.get(cacheKey);
  if(cached){
    return { statusCode: 200, headers: CORS, body: cached.body };
  }

  // El endpoint de TAF de aviationweather.gov no acepta "hours": solo
  // entrega el boletín vigente. El de METAR/SPECI sí lo admite.
  const query = type === 'taf'
    ? `ids=${icao}&format=json`
    : `ids=${icao}&format=json&hours=${hours}`;
  const targetUrl = `https://aviationweather.gov/api/data/${type}?${query}`;

  try{
    const res = await fetchConTimeout(targetUrl, 8000);
    if(!res.ok){
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: `aviationweather.gov respondió ${res.status}` }),
      };
    }
    const body = await res.text();
    cache.set(cacheKey, { body, expira: Date.now() + (TTL_MS[type] || TTL_MS.metar) });
    return { statusCode: 200, headers: CORS, body };
  }catch(err){
    const timedOut = err && err.name === 'AbortError';
    return {
      statusCode: timedOut ? 504 : 502,
      headers: CORS,
      body: JSON.stringify({
        error: timedOut
          ? 'Tiempo de espera agotado consultando aviationweather.gov'
          : 'No se pudo consultar aviationweather.gov',
        detail: err.message,
      }),
    };
  }
};
