// netlify/functions/metar-nala.js
// Función serverless dedicada al Simulador NALA: devuelve METAR y TAF de un
// aeródromo en UNA sola respuesta.
//
// Por qué existe aparte de metar.js:
// metar.js sirve una cosa por llamada (o METAR, o TAF), así que la ventana METEO
// del simulador tenía que pedir las dos en paralelo para la misma IP. Su rate
// limit de una solicitud por segundo rechazaba la segunda con 429 y la tarjeta
// del aeródromo quedaba sin datos. Combinando las dos consultas aquí, el
// navegador hace UNA petición por aeródromo y el choque desaparece de raíz.
// metar.js se deja intacto porque lo usan metar-taf.html y otras páginas.

// ---------- CACHÉ EN MEMORIA (a nivel de módulo) ----------
// Netlify reutiliza la misma instancia mientras siga "caliente". Se cachea por
// tipo, no por respuesta combinada: un METAR nuevo sale como mucho cada hora y
// un TAF cada 6, así que el TAF no tiene por qué volver a pedirse cada minuto
// solo porque el METAR haya caducado.
const cache = new Map();
const TTL_MS = {
  metar: 60 * 1000,        // 60 segundos
  taf: 5 * 60 * 1000       // 5 minutos
};
const MAX_ENTRADAS_CACHE = 120;

function limpiarCacheVencido(){
  const ahora = Date.now();
  for(const [key, entry] of cache){
    if(entry.expira <= ahora) cache.delete(key);
  }
  // Tope duro: esta memoria se comparte entre invocaciones de la misma instancia.
  while(cache.size > MAX_ENTRADAS_CACHE){
    cache.delete(cache.keys().next().value);
  }
}

// ---------- RATE LIMIT (en memoria, por IP) ----------
// Ventana deslizante, igual que satelite.js. Abrir METEO para un plan con
// origen, destino y alterno son tres solicitudes seguidas, y los popups del
// mapa añaden alguna más: un tope de "una por segundo" volvería a romper
// justamente lo que esta función viene a arreglar.
const llamadasPorIp = new Map();
const VENTANA_MS = 10 * 1000;
const MAX_EN_VENTANA = 30;

function obtenerIp(event){
  const headers = event.headers || {};
  return headers['x-nf-client-connection-ip'] || headers['client-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
}

// Devuelve true si la solicitud entra dentro del cupo de esta IP.
function admitir(ip){
  const ahora = Date.now();
  const desde = ahora - VENTANA_MS;
  for(const [otraIp, marcas] of llamadasPorIp){
    const vivas = marcas.filter(t => t > desde);
    if(vivas.length) llamadasPorIp.set(otraIp, vivas);
    else llamadasPorIp.delete(otraIp);
  }
  const marcas = llamadasPorIp.get(ip) || [];
  if(marcas.length >= MAX_EN_VENTANA) return false;
  marcas.push(ahora);
  llamadasPorIp.set(ip, marcas);
  return true;
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

// Pide un tipo (metar|taf) a aviationweather.gov y devuelve el reporte más
// reciente ya desempaquetado, o null si la estación no publica ese boletín.
// Lanza excepción solo ante fallo real de red o del servicio, para poder
// distinguir "no hay TAF publicado" de "no se pudo consultar".
async function consultar(tipo, icao, hours){
  const clave = `${tipo}:${icao}:${tipo === 'taf' ? '-' : hours}`;
  const cacheado = cache.get(clave);
  if(cacheado) return cacheado.valor;

  // El endpoint de TAF de aviationweather.gov no acepta "hours": solo entrega
  // el boletín vigente. El de METAR/SPECI sí lo admite.
  const query = tipo === 'taf'
    ? `ids=${icao}&format=json`
    : `ids=${icao}&format=json&hours=${hours}`;

  const res = await fetchConTimeout(`https://aviationweather.gov/api/data/${tipo}?${query}`, 8000);
  if(!res.ok) throw new Error(`aviationweather.gov respondió ${res.status}`);

  // Ojo: ante un designador que no publica ese boletín, aviationweather.gov no
  // responde "[]" sino un cuerpo VACÍO, y res.json() reventaría con "Unexpected
  // end of JSON input". Eso no es un fallo del servicio: es que no hay boletín,
  // y al controlador hay que decírselo así y no como un error de red.
  const texto = (await res.text()).trim();
  const data = texto ? JSON.parse(texto) : [];
  // El servicio entrega el reporte más reciente primero.
  const valor = Array.isArray(data) && data.length ? data[0] : null;
  cache.set(clave, { valor, expira: Date.now() + (TTL_MS[tipo] || TTL_MS.metar) });
  return valor;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const icao = (params.icao || '').trim().toUpperCase();
  const hours = /^[0-9]{1,3}$/.test(params.hours || '') ? params.hours : '3';

  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    "Cache-Control":                "no-store",
  };

  if(!admitir(obtenerIp(event))){
    return {
      statusCode: 429,
      headers: CORS,
      body: JSON.stringify({ error: 'Demasiadas solicitudes, espera unos segundos e intenta de nuevo.' }),
    };
  }

  // Validación de forma del ICAO en el servidor: nunca reenviar a
  // aviationweather.gov un valor que no sean 4 letras.
  if(!/^[A-Z]{4}$/.test(icao)){
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Código ICAO inválido: debe tener 4 letras (ej. SKBO).' }),
    };
  }

  limpiarCacheVencido();

  // Las dos consultas salen en paralelo DESDE EL SERVIDOR, donde no hay cupo por
  // IP que las estorbe. allSettled y no all: que falte el TAF no puede dejar sin
  // METAR al controlador.
  const [rM, rT] = await Promise.allSettled([
    consultar('metar', icao, hours),
    consultar('taf', icao, hours),
  ]);

  const motivo = (r) => {
    const err = r.reason;
    if(err && err.name === 'AbortError') return 'Tiempo de espera agotado consultando aviationweather.gov.';
    return (err && err.message) || 'No se pudo consultar aviationweather.gov.';
  };

  // Si fallaron las dos, es un fallo real del servicio y hay que decirlo con un
  // código de error, no devolver una ficha vacía que parezca "aeródromo sin datos".
  if(rM.status === 'rejected' && rT.status === 'rejected'){
    const timedOut = rM.reason && rM.reason.name === 'AbortError';
    return {
      statusCode: timedOut ? 504 : 502,
      headers: CORS,
      body: JSON.stringify({ error: motivo(rM) }),
    };
  }

  const cuerpo = {
    icao,
    // null = la estación no publica ese boletín (respuesta vacía del servicio).
    metar: rM.status === 'fulfilled' ? rM.value : null,
    taf:   rT.status === 'fulfilled' ? rT.value : null,
  };
  // errores[] solo aparece cuando la consulta falló de verdad: permite al cliente
  // distinguirlo de "no hay boletín publicado", que se representa con null.
  const errores = {};
  if(rM.status === 'rejected') errores.metar = motivo(rM);
  if(rT.status === 'rejected') errores.taf = motivo(rT);
  if(Object.keys(errores).length) cuerpo.errores = errores;

  return { statusCode: 200, headers: CORS, body: JSON.stringify(cuerpo) };
};
