// netlify/functions/taf-historial.js
// Reconstruye el historial de boletines TAF de una estación en un rango de
// tiempo. aviationweather.gov NO tiene un endpoint "TAF entre fecha X y fecha
// Y": su API sólo entrega, para un instante puntual, el TAF que estaba vigente
// en ese momento (parámetros date=AAAAMMDD_HHMM & time=issue). Por eso pedimos
// varias "fotos" espaciadas a lo largo del rango pedido, todas en paralelo
// desde el propio servidor (sin CORS ni límites de los proxies públicos), y
// luego juntamos los boletines distintos que salieron entre esas fotos.

const MAX_MUESTRAS = 120;      // tope defensivo de peticiones en paralelo
const PASO_MIN_MS = 2 * 3600000; // 2 horas: margen seguro bajo el intervalo típico de emisión de un TAF (3-6h)

function fechaAAAAMMDD_HHMM(ms){
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

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
  const from = parseInt(params.from, 10);
  const to = parseInt(params.to, 10);

  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    "Cache-Control":                "no-store",
  };

  if(!/^[A-Z]{4}$/.test(icao)){
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Código ICAO inválido: debe tener 4 letras (ej. SKBO).' }),
    };
  }
  if(!Number.isFinite(from) || !Number.isFinite(to) || from >= to){
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Rango de fechas inválido.' }),
    };
  }

  // Si el rango pedido es enorme, espaciamos más las muestras en vez de
  // truncarlo, para seguir cubriendo todo el período (con menos resolución).
  const rangoMs = to - from;
  const pasoMs = Math.max(PASO_MIN_MS, Math.ceil(rangoMs / MAX_MUESTRAS));

  const muestras = [];
  for(let t = from; t <= to && muestras.length < MAX_MUESTRAS; t += pasoMs){
    muestras.push(t);
  }
  if(muestras[muestras.length - 1] !== to && muestras.length < MAX_MUESTRAS) muestras.push(to);

  const peticiones = muestras.map(t => {
    const url = `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json&time=issue&date=${fechaAAAAMMDD_HHMM(t)}`;
    return fetchConTimeout(url, 8000)
      .then(res => (res.ok ? res.json() : []))
      .catch(() => []);
  });

  const resultados = await Promise.all(peticiones);

  // Juntar y quitar boletines repetidos (misma hora de emisión = mismo TAF).
  const vistos = new Map();
  for(const lista of resultados){
    if(!Array.isArray(lista)) continue;
    for(const taf of lista){
      if(taf && taf.issueTime) vistos.set(taf.issueTime, taf);
    }
  }

  // Nos quedamos con los que estuvieron vigentes en algún momento del rango pedido.
  const fromS = from / 1000, toS = to / 1000;
  const boletines = Array.from(vistos.values())
    .filter(t => (t.validTimeTo != null ? t.validTimeTo >= fromS : true) && (t.validTimeFrom != null ? t.validTimeFrom <= toS : true))
    .sort((a, b) => Date.parse(b.issueTime || 0) - Date.parse(a.issueTime || 0));

  return { statusCode: 200, headers: CORS, body: JSON.stringify(boletines) };
};
