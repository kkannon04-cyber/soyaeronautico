// netlify/functions/satelite.js
// Función serverless: proxy hacia el SLIDER de CIRA/RAMMB (Colorado State University),
// la misma fuente pública que alimenta https://slider.cira.colostate.edu
//
// Sirve tres recursos distintos al navegador del estudiante:
//   ?recurso=horarios  -> lista de timestamps disponibles (JSON). CIRA no envía
//                         cabecera CORS en este endpoint, así que el navegador NO
//                         puede pedirlo directo: tiene que pasar por aquí.
//   ?recurso=imagen    -> el PNG de una imagen concreta, reenviado con CORS propio.
//                         La animación de la página carga las imágenes directo de
//                         CIRA (más rápido y sin gastar ancho de banda de Netlify);
//                         esta ruta existe sólo para el análisis por píxeles, porque
//                         un <canvas> no puede leer píxeles de una imagen de otro
//                         dominio salvo que venga con cabeceras CORS.
//   ?recurso=escala    -> la barra de color oficial del canal (PNG 1920x12), que se
//                         usa como leyenda visible y como referencia del análisis.
//
// Mismo patrón que metar.js: caché en memoria + rate limit por IP + validación
// estricta en el servidor contra listas blancas (nunca se arma una URL saliente
// con texto libre del usuario).

// ---------- LISTAS BLANCAS ----------
// Verificadas una a una contra la API real: las 4 combinaciones satélite×sector
// responden 200 para todos estos productos.
const SATELITES = new Set(['goes-19', 'goes-18']);
const SECTORES  = new Set(['full_disk', 'conus']);

const PRODUCTOS = new Set([
  'geocolor',
  'natural_color',
  'band_02',
  'band_07',
  'band_08',
  'band_09',
  'band_10',
  'band_13',
  'band_14',
  'rgb_air_mass',
  'jma_day_cloud_phase_distinction_rgb',
  'eumetsat_nighttime_microphysics',
  'day_snow_fog',
  'cira_debra_dust',
  'split_window_difference_10_3-12_3',
]);

// Nombres de tabla de color (campo color_table_name del catálogo oficial de CIRA).
const TABLAS = new Set([
  'lowlight4',
  'svgair2',
  'svgawvx',
  'ircimss2',
  'zehr4a',
  'rgb_air_mass',
  'jma_day_cloud_phase_distinction_rgb',
  'eumetsat_nighttime_microphysics',
  'day_snow_fog',
  'abi_debra',
  'split_window_difference_10_3-12_3',
]);

const HOST_JSON  = 'https://rammb-slider.cira.colostate.edu';
const HOST_IMG   = 'https://slider.cira.colostate.edu';

// ---------- CACHÉ EN MEMORIA ----------
// Netlify reutiliza la instancia mientras siga "caliente". Los horarios de CIRA
// se renuevan cada 5-10 minutos según sector, así que 2 minutos de caché no
// arriesga mostrar un dato viejo y evita golpear su servidor en cada visita.
const cache = new Map();
const TTL_HORARIOS_MS = 2 * 60 * 1000;
const MAX_ENTRADAS_CACHE = 60;

function limpiarCacheVencido(){
  const ahora = Date.now();
  for(const [key, entry] of cache){
    if(entry.expira <= ahora) cache.delete(key);
  }
  // Tope duro por si muchas combinaciones distintas entran dentro del TTL:
  // esta función vive en memoria compartida entre invocaciones.
  while(cache.size > MAX_ENTRADAS_CACHE){
    cache.delete(cache.keys().next().value);
  }
}

// ---------- RATE LIMIT BÁSICO (en memoria, por IP) ----------
// Mismo criterio que metar.js: una solicitud por segundo por IP. No es robusto
// entre instancias frías, pero frena ráfagas de un mismo cliente.
const ultimaLlamadaPorIp = new Map();
const MIN_INTERVALO_MS = 1000;

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

// fetch con timeout: si CIRA se cuelga, fallamos rápido
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
  const params  = event.queryStringParameters || {};
  const recurso = (params.recurso || 'horarios').trim();

  const CORS_JSON = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
    'Cache-Control':                'no-store',
  };

  const error = (statusCode, mensaje) => ({
    statusCode,
    headers: CORS_JSON,
    body: JSON.stringify({ error: mensaje }),
  });

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers: CORS_JSON, body: '' };
  }

  // ---------- Rate limit ----------
  limpiarLlamadasVencidas();
  const ip = obtenerIp(event);
  const ahora = Date.now();
  const ultima = ultimaLlamadaPorIp.get(ip);
  if(ultima && ahora - ultima < MIN_INTERVALO_MS){
    return error(429, 'Demasiadas solicitudes, espera unos segundos e intenta de nuevo.');
  }
  ultimaLlamadaPorIp.set(ip, ahora);

  // ---------- Recurso: escala (barra de color oficial del canal) ----------
  if(recurso === 'escala'){
    const sat   = (params.sat || '').trim();
    const tabla = (params.tabla || '').trim();
    if(!SATELITES.has(sat)) return error(400, 'Satélite no válido.');
    if(!TABLAS.has(tabla))  return error(400, 'Tabla de color no válida.');

    const url = `${HOST_IMG}/data/color_bar/${sat}/color_bar_1920_${tabla}.png`;
    try{
      const res = await fetchConTimeout(url, 8000);
      if(!res.ok) return error(502, `CIRA respondió ${res.status} al pedir la barra de color.`);
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type':  'image/png',
          // La barra de color de un canal no cambia: se puede cachear largo.
          'Cache-Control': 'public, max-age=604800',
        },
        body: buf.toString('base64'),
        isBase64Encoded: true,
      };
    }catch(err){
      const timedOut = err && err.name === 'AbortError';
      return error(timedOut ? 504 : 502, timedOut
        ? 'Tiempo de espera agotado pidiendo la barra de color a CIRA.'
        : 'No se pudo obtener la barra de color de CIRA.');
    }
  }

  // ---------- Validación común de horarios/imagen ----------
  const sat      = (params.sat || '').trim();
  const sector   = (params.sector || '').trim();
  const producto = (params.producto || '').trim();

  if(!SATELITES.has(sat))    return error(400, 'Satélite no válido.');
  if(!SECTORES.has(sector))  return error(400, 'Sector no válido.');
  if(!PRODUCTOS.has(producto)) return error(400, 'Canal no válido.');

  // ---------- Recurso: horarios ----------
  if(recurso === 'horarios'){
    const cacheKey = `h:${sat}:${sector}:${producto}`;
    limpiarCacheVencido();
    const cached = cache.get(cacheKey);
    if(cached){
      return { statusCode: 200, headers: CORS_JSON, body: cached.body };
    }

    const url = `${HOST_JSON}/data/json/${sat}/${sector}/${producto}/latest_times.json`;
    try{
      const res = await fetchConTimeout(url, 8000);
      if(!res.ok) return error(502, `CIRA respondió ${res.status} al pedir los horarios.`);
      const body = await res.text();
      cache.set(cacheKey, { body, expira: Date.now() + TTL_HORARIOS_MS });
      return { statusCode: 200, headers: CORS_JSON, body };
    }catch(err){
      const timedOut = err && err.name === 'AbortError';
      return error(timedOut ? 504 : 502, timedOut
        ? 'Tiempo de espera agotado consultando CIRA.'
        : 'No se pudo consultar el servidor de CIRA.');
    }
  }

  // ---------- Recurso: imagen ----------
  if(recurso === 'imagen'){
    const ts = (params.ts || '').trim();
    // El timestamp de SLIDER es exactamente YYYYMMDDhhmmss.
    if(!/^[0-9]{14}$/.test(ts)) return error(400, 'Marca de tiempo no válida.');

    // Ojo: en la ruta de imágenes la fecha va separada por barras (2026/08/28),
    // aunque el timestamp del directorio siguiente va compacto.
    const fecha = `${ts.slice(0, 4)}/${ts.slice(4, 6)}/${ts.slice(6, 8)}`;
    const url = `${HOST_IMG}/data/imagery/${fecha}/${sat}---${sector}/${producto}/${ts}/00/000_000.png`;

    try{
      const res = await fetchConTimeout(url, 12000);
      if(!res.ok) return error(502, `CIRA respondió ${res.status} al pedir la imagen.`);
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type':  'image/png',
          // Una imagen de un instante concreto ya no cambia nunca.
          'Cache-Control': 'public, max-age=86400',
        },
        body: buf.toString('base64'),
        isBase64Encoded: true,
      };
    }catch(err){
      const timedOut = err && err.name === 'AbortError';
      return error(timedOut ? 504 : 502, timedOut
        ? 'Tiempo de espera agotado descargando la imagen de CIRA.'
        : 'No se pudo descargar la imagen de CIRA.');
    }
  }

  return error(400, 'Recurso no reconocido.');
};
