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
  const hours = /^[0-9]{1,3}$/.test(params.hours ||
