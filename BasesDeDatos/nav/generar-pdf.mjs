// Genera las aerovías de un Estado a partir de su AIP en PDF (ENR 3), leyendo la POSICIÓN de cada
// palabra en la página, no el texto maquetado: así se sabe a qué columna pertenece cada dato.
//
// Uso (Node 18 o superior, sin dependencias):
//   1. Descargar los PDF de ENR 3 vigentes del AIP del Estado (ver la URL de cada región abajo).
//   2. Extraer las posiciones de las palabras con pdftotext de Poppler (no el de xpdf):
//        pdftotext -bbox archivo.pdf archivo_bbox.html
//   3. Revisar abajo la vigencia de la región.
//   4. node BasesDeDatos/nav/generar-pdf.mjs <region> <carpeta con los *_bbox.html>
//
// Cada punto se reconoce por sus coordenadas y cada tramo por lo que aparece entre dos puntos: la
// derrota (el número con «°») y la distancia. Los límites, la clase de espacio aéreo y el sentido
// de los niveles se imprimen de forma distinta en cada AIP y no se interpretan: la ficha del tramo
// remite a la página del AIP. El nivel (inferior o superior) sale del designador (prefijo «U»,
// Anexo 11) salvo que la región indique otra cosa.
//
// La verificación de lib-aerovias.mjs compara cada distancia publicada con la calculada desde las
// coordenadas: una discrepancia delata un punto mal leído.
import fs from 'fs';
import path from 'path';
import { Region, coordenada, textoHtml, redondear } from './lib-aerovias.mjs';

const nivelPorPrefijo = d => /^U/.test(d) ? 'sup' : 'inf';

// Columnas por la fila de números («1 2 3 4 5 6») del encabezado de la tabla: la columna 1 es la
// de designadores, puntos y coordenadas. La derrota y la distancia van en la columna de su rótulo
// («HDG», «Derrota», «Track» / «DIST», «Distancia», «Length»); si hay varias con el mismo rótulo
// manda la de más a la derecha: en las RNAV de Panamá y Uruguay la columna 2 es la formación del
// punto (radial y DME de un VOR) y la derrota o la distancia ortodrómica van en la 3.
function columnasPorNumeros(lineas){
  const fila = lineas.find(l => l.palabras.length >= 5 && l.palabras.every((w, i) => w.t === String(i + 1)));
  if(!fila) return null;
  const x = fila.palabras.map(w => w.x);
  const bordes = x.map((v, i) => i === 0 ? -Infinity : (x[i - 1] + v) / 2).concat(Infinity);
  const columnaDe = px => bordes.findIndex((b, i) => px >= b && px < bordes[i + 1]);
  const cabecera = lineas.filter(l => l.y < fila.y && l.y > fila.y - 110).flatMap(l => l.palabras);
  const columnaRotulo = re => { const c = cabecera.filter(w => re.test(w.t)).map(w => columnaDe(w.x)).filter(c => c >= 1); return c.length ? Math.max(...c) : 1; };
  const rango = c => [bordes[c], bordes[c + 1]];
  // Borde de la columna 1: el rótulo de derrota marca dónde empieza la 2. Los nombres largos de
  // radioayuda («CHACHAPOYAS VOR/DME (POY)») pasan del punto medio entre los números 1 y 2.
  const rotTrack = cabecera.filter(w => /^(HDG|HDG\/DIST|Derrota|Track|TR)$/i.test(w.t) && columnaDe(w.x) === 1).map(w => w.x);
  const b12 = rotTrack.length ? Math.max(bordes[1], Math.min(...rotTrack) - 5) : bordes[1];
  return { inicio: fila.y + 3, b12, b23: bordes[2],
    track: rango(columnaRotulo(/^(HDG|HDG\/DIST|Derrota|Track|TR)$/i)), dist: rango(columnaRotulo(/^(DIST|Distancia|Length|Longitud)$/i)) };
}
// Páginas que no son tablas de rutas ATS IFR: esperas en ruta, rutas de helicóptero y rutas VFR.
const PAGINA_AJENA = /ESPERA EN RUTA|EN-ROUTE HOLDING|HOLDING|RUTAS DE HELIC|HELICOPTER ROUTES|RUTAS VFR|VFR ROUTES/i;
// Coordenadas incompletas (p. ej. latitud sin hemisferio, errata del AIP): el punto no se puede
// situar, y la ruta se corta ahí en vez de unir el punto anterior con el siguiente.
const COORD_ROTA = /^\d{6}(?:[.,]\d+)?\s+\d{7}(?:[.,]\d+)?[EW]$|^\d{6}(?:[.,]\d+)?[NS]\s+\d{7}(?:[.,]\d+)?$/;

const REGIONES = {
  panama: {
    meta: {
      codigo: 'panama', region: 'Panamá (FIR Panamá)',
      fuente: 'AIP de Panamá, AAC — ENR 3 Rutas ATS (PDF)',
      url: 'https://www.aeronautica.gob.pa/ais-aip/',
      vigencia: 'ENR 3 publicado por la AAC, páginas con fecha hasta el 30 JUN 26',
      textoNiveles: { inf: 'ruta inferior (hasta FL195)', sup: 'ruta superior (por encima de FL195)', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
  },
  dominicana: {
    meta: {
      codigo: 'dominicana', region: 'República Dominicana (FIR Santo Domingo)',
      fuente: 'AIP de la República Dominicana, IDAC — ENR 3.1, 3.2 y 3.3 (PDF)',
      url: 'https://aip.sna.gob.do/Aip/Enroute',
      vigencia: 'ENR 3 en vigor desde el 30 OCT 25 (fecha de sus páginas)',
      // Las rutas sin prefijo U publican FL195 como límite superior.
      textoNiveles: { inf: 'ruta inferior (hasta FL195)', sup: 'ruta superior (por encima de FL195)', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
  },
  cuba: {
    meta: {
      codigo: 'cuba', region: 'Cuba (FIR Habana)',
      fuente: 'AIP de Cuba, IACC — ENR 3.1, 3.2 y 3.3 (PDF)',
      url: 'https://aismet.avianet.cu/',
      vigencia: 'AIRAC AIP AMDT 1/25, páginas del 04 SEP 2025',
      textoNiveles: { inf: 'ruta inferior (hasta FL245)', sup: 'ruta superior (por encima de FL245)', ambos: 'rutas inferior y superior (UNL / FL040)' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
    // Límites publicados: A, B, G, R y V hasta FL245; las «U», UNL / FL245; las J, UNL / FL040.
    nivel: d => /^U/.test(d) ? 'sup' : /^J/.test(d) ? 'ambos' : 'inf',
  },
  uruguay: {
    meta: {
      codigo: 'uruguay', region: 'Uruguay (FIR Montevideo)',
      fuente: 'AIP de Uruguay, DINACIA — ENR 3 Rutas ATS (PDF)',
      url: 'https://www.dinacia.gub.uy/node/563',
      vigencia: 'ENR 3 publicado el 13 MAY 2026',
      // Las rutas sin prefijo U publican FL245 como límite superior.
      textoNiveles: { inf: 'ruta inferior (hasta FL245)', sup: 'ruta superior (por encima de FL245)', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    // Uruguay imprime la derrota y la distancia a la altura del punto de salida.
    alineacion: 'desde', columnas: columnasPorNumeros,
  },
  paraguay: {
    meta: {
      codigo: 'paraguay', region: 'Paraguay (FIR Asunción)',
      fuente: 'AIP del Paraguay, DINAC — ENR 3 (PDF de la AMDT AIRAC 01/2026)',
      url: 'https://mdn.dinac.gov.py/v3/index.php/ais/aip-paraguay',
      vigencia: 'AMDT AIRAC 01/2026; cada página lleva su fecha',
      textoNiveles: { inf: 'ruta inferior', sup: 'ruta superior', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
  },
  peru: {
    meta: {
      codigo: 'peru', region: 'Perú (FIR Lima)',
      fuente: 'AIP del Perú, CORPAC — ENR 3.1, 3.2 y 3.3 (PDF del servidor oficial de respaldo)',
      url: 'https://eaip-peru.corpac.gob.pe/',
      vigencia: 'PDF publicados por CORPAC en su servidor de contingencia (actualizados el 17 SEP 2026); cada página lleva su fecha',
      textoNiveles: { inf: 'ruta inferior', sup: 'ruta superior', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
  },
  argentina: {
    meta: {
      codigo: 'argentina', region: 'Argentina (FIR Ezeiza, Córdoba, Mendoza, Resistencia y Comodoro Rivadavia)',
      fuente: 'AIP de Argentina, ANAC — ENR 3.1 y ENR 3.2 (PDF)',
      url: 'https://ais.anac.gob.ar/aip#enr',
      vigencia: 'ENR 3.1 y 3.2 de la AMDT AIRAC 01/26 (11 JUN 2026)',
      textoNiveles: { inf: 'ruta inferior', sup: 'ruta superior', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre', columnas: columnasPorNumeros,
    trackSinGrado: true, distConNM: true, distJuntoAB: true,
    toleranciaNM: 1.5,   // publica las distancias redondeadas a la milla entera
  },
  chile: {
    meta: {
      codigo: 'chile', region: 'Chile (FIR Santiago, Antofagasta, Puerto Montt y Punta Arenas)',
      fuente: 'AIP de Chile, DGAC — ENR 3, rutas convencionales y RNAV (PDF)',
      url: 'https://aipchile.dgac.gob.cl/aip/vol1/seccion/enr',
      vigencia: 'ENR 3 vigente en el sitio de la DGAC (cada página lleva su fecha)',
      // Límites publicados: rutas sin prefijo U hasta FL245; las «U», de FL245 a FL450 o FL600.
      textoNiveles: { inf: 'ruta inferior (hasta FL245)', sup: 'ruta superior (desde FL245)', ambos: 'rutas inferior y superior' },
      paises: [],
    },
    alineacion: 'entre',
    toleranciaNM: 1.5,   // publica las distancias redondeadas a la milla entera
    // Sin fila de números: las columnas salen de los rótulos «TR MAG», «DIST» y «LÍMITES».
    columnas(lineas){
      const buscar = re => { for(const l of lineas) for(const w of l.palabras) if(re.test(w.t)) return { x: w.x, y: l.y }; return null; };
      const tr = buscar(/^TR$/), dist = buscar(/^DIST$/), lim = buscar(/^LÍMITES$/), fin = buscar(/^EVEN$/);
      if(!tr || !dist || !lim) return null;
      return { inicio: (fin ? fin.y : dist.y) + 1, track: [tr.x - 30, dist.x - 4], dist: [dist.x - 12, lim.x - 4], designadorCentrado: true };
    },
  },
};

const [clave, carpeta] = process.argv.slice(2);
const cfg = REGIONES[clave];
if(!cfg || !carpeta){ console.error('Uso: node generar-pdf.mjs <' + Object.keys(REGIONES).join('|') + '> <carpeta>'); process.exit(1); }

// Palabras de cada página agrupadas en líneas (misma altura ± 2,5 pt).
function paginas(archivo){
  const html = fs.readFileSync(archivo, 'utf8');
  return html.split(/<page /).slice(1).map(p => {
    const palabras = [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map(m => ({ x: +m[1], y: +m[2], x2: +m[3], t: textoHtml(m[5]) })).filter(w => w.t)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const lineas = [];
    for(const w of palabras){
      const l = lineas[lineas.length - 1];
      if(l && w.y - l.y <= 2.5) l.palabras.push(w); else lineas.push({ y: w.y, palabras: [w] });
    }
    lineas.forEach(l => { l.palabras.sort((a, b) => a.x - b.x); l.texto = l.palabras.map(w => w.t).join(' '); });
    const etiqueta = ((lineas.slice(0, 4).map(l => l.texto).join(' ').match(/ENR\s*3[\d.\-A-Z]*/) || [])[0] || '').replace(/\s+/g, ' ');
    return { lineas, etiqueta, alto: +(p.match(/height="([\d.]+)"/) || [0, 800])[1] };
  });
}

const COORD_PAR = /(\d{6}(?:[.,]\d+)?\s*[NS])\s*[-–]?\s*(\d{7}(?:[.,]\d+)?\s*[EW])/;
const COORD_GMS = /(\d{1,2}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(?:[.,]\d+)?\s*''\s*[NS])\s*-?\s*(\d{1,3}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(?:[.,]\d+)?\s*''\s*[EW])/;
// Minutos y segundos se escriben con varios signos (’ ´ ′ / " ” ″): se unifican en ' y ''.
const normalizarGMS = s => s.replace(/[’´′]/g, "'").replace(/[”″"]/g, "''");
const SOLO_LAT = /^(\d{6}(?:[.,]\d+)?[NS])$/, SOLO_LON = /^(\d{7}(?:[.,]\d+)?[EW])$/;
// Paraguay: hemisferio delante y cada coordenada en su línea («S27°26'49''» / «W059°03'26''»).
const LAT_PRE = /^([NS])\s*(\d{1,2}°\d{1,2}'\d{1,2}(?:[.,]\d+)?'')$/, LON_PRE = /^([EW])\s*(\d{1,3}°\d{1,2}'\d{1,2}(?:[.,]\d+)?'')$/;
const DESIGNADOR = /^(?!FL\b|FL\s)(U?[A-Z]{1,2})\s?-?\s?(\d{1,4})$/;   // «FL 245» es un nivel, no una ruta
const PIE = /\bAMDT\b|\bAIRAC\b|^AIS\b|AIS[- ]?(PANAM|CUBA|CHILE|URUGUAY)|Effective|^RMK:|^CHG:/i;

const region = new Region(cfg.meta);
region.toleranciaNM = cfg.toleranciaNM || 1;
region.modo = 'pdf';   // discrepancias: ver Region.resolverDiscrepancias
const archivos = fs.readdirSync(carpeta).filter(f => /_bbox\.html$/i.test(f)).sort();

// Recorre todas las páginas como un solo flujo de elementos: designadores, puntos y datos.
const elementos = [];
let col = null;
let latPendiente = null;   // latitud sin longitud todavía: puede seguir en la página siguiente (Cuba)
for(const f of archivos){
  paginas(path.join(carpeta, f)).forEach((pag, ip) => {
    if(PAGINA_AJENA.test(pag.lineas.slice(0, 6).map(l => l.texto).join(' ')) || /ENR ?3.[46]/.test(pag.etiqueta)){ elementos.push({ tipo: 'ruta', id: '—' }); return; }
    col = cfg.columnas(pag.lineas) || col;
    if(!col) return;
    const y0 = cfg.columnas(pag.lineas) ? col.inicio : 0;
    const pieY = (pag.lineas.find(l => l.y > pag.alto * 0.8 && PIE.test(l.texto)) || { y: Infinity }).y;
    for(const l of pag.lineas){
      if(l.y < y0 || l.y >= pieY) continue;
      const enCol1 = l.palabras.filter(w => col.b12 != null ? w.x < col.b12 : true);
      const t1 = normalizarGMS(enCol1.map(w => w.t).join(' '));
      const lugar = { archivo: f, pagina: ip + 1, etiqueta: pag.etiqueta };
      // Designador de ruta: sola en su línea (columna 1, o centrado en Chile).
      const cand = col.designadorCentrado ? l.texto : t1;
      // «L 348 (CONTINUACIÓN)»: la misma ruta que sigue en otra página. «Q 808 (1)»: llamada a nota.
      // «L302 (RNAV10 - RNP10)»: especificación de navegación.
      const sinCont = cand.trim().replace(/(\s*\([^()]*\))+\s*$/, '');
      const dm = sinCont.match(DESIGNADOR);
      if(dm && (!col.designadorCentrado || sinCont.split(/\s+/).length === 2)){ elementos.push({ tipo: 'ruta', id: dm[1] + dm[2], y: l.y, ...lugar }); continue; }
      // Datos de tramo de la línea (derrotas y distancia), que van en sus propias columnas: también
      // en la línea de un punto (Uruguay imprime la distancia junto a las coordenadas).
      const enTrack = l.palabras.filter(w => col.track ? w.x >= col.track[0] && w.x < col.track[1] : w.x >= col.b12 && w.x < col.b23);
      const enDist = l.palabras.filter(w => col.dist ? w.x >= col.dist[0] && w.x < col.dist[1] : w.x >= col.b12 && w.x < col.b23);
      // Derrota sola («112°») o con su recíproca en el mismo bloque («032°/213°»). Argentina la
      // publica sin «°» («092») y la distancia con «NM» detrás («51 NM»): ahí se distinguen así.
      const siguienteNM = w => { const k = l.palabras.indexOf(w); return /^NM$/i.test((l.palabras[k + 1] || {}).t || ''); };
      const tracks = enTrack.filter(w => /^\d{3}(?:[.,]\d+)?\s*[°º](?:\s*\/\s*\d{3}(?:[.,]\d+)?\s*[°º])?$/.test(w.t) || (cfg.trackSinGrado && /^\d{3}$/.test(w.t) && !siguienteNM(w)))
        .flatMap(w => [...w.t.matchAll(/(\d{3}(?:[.,]\d+)?)\s*[°º]?/g)].map(x => parseFloat(x[1].replace(',', '.'))));
      // Distancia suelta («48») o pegada a la unidad («090NM», Perú).
      const dists = enDist.filter(w => /^\d{1,4}(?:[.,]\d+)?NM$/i.test(w.t) || (/^\d{1,4}(?:[.,]\d+)?$/.test(w.t) && (!cfg.distConNM || siguienteNM(w))))
        .map(w => parseFloat(w.t.replace(/NM$/i, '').replace(',', '.')));
      const dato = tracks.length || dists.length ? { tipo: 'dato', tracks, dists, y: l.y, ...lugar } : null;
      // Coordenadas: en la misma línea, o latitud y longitud en líneas seguidas (Cuba).
      const texto = col.designadorCentrado ? normalizarGMS(l.texto) : t1;
      let m = texto.match(COORD_PAR) || texto.match(COORD_GMS);
      const c1 = t1.trim(), latPre = c1.match(LAT_PRE), lonPre = c1.match(LON_PRE);
      if(!m && (SOLO_LAT.test(c1) || latPre)){
        latPendiente = { lat: latPre ? latPre[2] + latPre[1] : c1, y: l.y, texto: c1 };
        if(dato) elementos.push(dato);
        continue;
      }
      if(!m && latPendiente && (SOLO_LON.test(c1) || lonPre)) m = [null, latPendiente.lat, lonPre ? lonPre[2] + lonPre[1] : c1];
      // Una latitud sin longitud legible detrás (p. ej. «W055°10°14''», errata del AIP): el punto
      // no se puede situar y la ruta se corta ahí.
      if(!m && latPendiente && c1){
        elementos.push({ tipo: 'roto', texto: latPendiente.texto + ' ' + c1, y: l.y, ...lugar });
        latPendiente = null;
        if(dato) elementos.push(dato);
        continue;
      }
      if(m){
        // Con latitud y longitud en líneas separadas, el nombre va en la línea anterior a la latitud.
        const nombreMismaLinea = m[0] ? texto.slice(0, texto.indexOf(m[0])).trim() : '';
        elementos.push({ tipo: 'punto', lat: coordenada(m[1].replace(/\s+/g, '')), lon: coordenada(m[2].replace(/\s+/g, '')),
          nombre: nombreMismaLinea, y: latPendiente ? latPendiente.y : l.y, ...lugar });
        latPendiente = null;
        if(dato) elementos.push(dato);   // tras el punto: pertenece al tramo que sale de él
        continue;
      }
      // Aquí la columna 1 está vacía (si tuviera texto con una latitud pendiente, el punto ya se
      // habría marcado como ilegible): la latitud pendiente sigue esperando su longitud.
      if(COORD_ROTA.test(t1.trim().split(' ').slice(-2).join(' '))){
        elementos.push({ tipo: 'roto', texto: t1.trim(), y: l.y, ...lugar });
        if(dato) elementos.push(dato);
        continue;
      }
      // Resto: posible nombre de punto (columna 1).
      if(t1.trim()) elementos.push({ tipo: 'texto', texto: t1.trim(), y: l.y, ...lugar });
      if(dato) elementos.push(dato);
    }
  });
}

/* ---------- Del flujo de elementos a rutas ----------
   Nombre del punto: el que va en su misma línea o, si no, el último texto de la columna 1 antes
   de sus coordenadas. Datos del tramo A→B: los que aparecen entre las coordenadas de A y las de B
   («entre»), o desde el nombre de A hasta el nombre de B («desde», Uruguay). */
// Identificador del punto a partir de su nombre publicado (puede ocupar varias líneas):
//   1. radioayuda: el código entre paréntesis o comillas, o el de 2-3 letras que precede a «VOR»;
//   2. punto de límite («BDRY FIR (KUKEN)»): el código de 5 letras entre paréntesis;
//   3. el primer nombre en clave de 5 letras, o el primer código corto que no sea una palabra
//      genérica; 4. un aeródromo: su indicador OACI entre paréntesis («(SURV)»).
const GENERICAS = new Set(['BDRY', 'FIR', 'UIR', 'TMA', 'CTA', 'CTR', 'LIM', 'ACC', 'APP', 'VOR', 'DME', 'NDB', 'RNAV', 'RNP', 'CONV', 'SEE', 'VER', 'NIL', 'FL', 'FT']);
function identificar(nombre){
  const n = nombre.replace(/\s+/g, ' ').trim();
  const rep = /▲/.test(n) ? 'C' : /[∆Δ△]/.test(n) ? 'R' : 'U';
  // «*» y «**»: llamadas a notas del AIP. «( SEKLO)»: espacios sobrantes dentro del paréntesis.
  const limpio = n.replace(/[▲∆Δ△Ⓜ*]/g, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  if(/\b(VOR|DVOR|DME|NDB|TACAN|VORTAC)\b/.test(limpio)){
    const p = limpio.match(/[(‘'’]([A-Z0-9]{2,3})[)’'‘]/);
    const primero = limpio.match(/(?:^|\s)([A-Z]{2,3})\s+(?:D?VOR|NDB|DME|TACAN|VORTAC)/);
    // «EZEIZA VOR/DME EZE» · «USHUAIA DVOR-DME(x)USU»
    const despues = limpio.match(/(?:D?VOR|NDB|DME|TACAN|VORTAC)(?:[\/-]DME)?(?:\([a-z]\))?\s*([A-Z]{2,3})$/);
    const id = p ? p[1] : despues ? despues[1] : primero ? primero[1] : null;
    if(id) return { id, clase: 'N', nota: limpio.replace(/[(‘'’][A-Z0-9]{2,4}[)’'‘]/g, '').trim(), rep };
  }
  const tokens = limpio.split(' ');
  const limite = /BDRY|FIR|LIMIT/.test(limpio) && limpio.match(/\(([A-Z]{5})\)/);
  if(limite) return { id: limite[1], clase: rep, nota: '', rep };
  const cinco = tokens.find(t => /^[A-Z]{5}$/.test(t) && !GENERICAS.has(t));
  // Radioayuda escrita solo con su código entre paréntesis («ASUNCIÓN (VAS)», Paraguay).
  const nav3 = limpio.match(/\(([A-Z]{3})\)/);
  if(!cinco && nav3) return { id: nav3[1], clase: 'N', nota: limpio.replace(/\([A-Z]{3}\)/, '').trim(), rep };
  const corto = tokens.find(t => /^[A-Z]{2,5}\d{0,2}$/.test(t) && !GENERICAS.has(t));
  const oaci = limpio.match(/\(([A-Z]{4})\)/);
  const id = cinco || corto || (oaci && oaci[1]);
  return id ? { id, clase: rep, nota: '', rep } : null;
}

// Primera pasada: cada punto con su nombre y la posición (en el flujo) de su nombre y de sus
// coordenadas; cada ruta con la lista de sus puntos.
const rutas = new Map();   // designador -> { id, puntos: [] } (una ruta partida en páginas sigue igual)
const problemas = [];
let ruta = null, textos = [];
elementos.forEach((e, orden) => {
  if(e.tipo === 'ruta'){
    if(e.id === '—'){ ruta = null; return; }   // página que no es de rutas: corta la ruta en curso
    if(!ruta || ruta.id !== e.id){ ruta = rutas.get(e.id) || { id: e.id, puntos: [] }; rutas.set(e.id, ruta); ruta.corte = true; }
    textos = [];
    return;
  }
  if(!ruta) return;
  if(e.tipo === 'texto'){ textos.push({ e, orden }); return; }
  if(e.tipo === 'roto'){
    problemas.push(`${ruta.id}: coordenadas incompletas en ${e.archivo} p.${e.pagina} («${e.texto}»): la ruta se corta en ese punto`);
    ruta.corte = true; textos = [];
    return;
  }
  if(e.tipo !== 'punto') return;
  // Nombre: en la línea de las coordenadas, o hasta tres líneas de la columna 1 justo encima.
  const conNombre = !!e.nombre;
  let previos = conNombre ? [] : textos.filter(t => t.e.pagina === e.pagina && t.e.archivo === e.archivo && e.y - t.e.y <= 30 && e.y >= t.e.y).slice(-3);
  // El nombre puede quedar al pie de la página anterior y las coordenadas al comienzo de esta.
  if(!conNombre && !previos.length){
    const pie = textos.filter(t => t.e.archivo === e.archivo && t.e.pagina === e.pagina - 1);
    const ult = pie[pie.length - 1];
    if(ult) previos = pie.filter(t => ult.e.y - t.e.y <= 30).slice(-3);
  }
  const nombre = conNombre ? e.nombre : previos.map(t => t.e.texto).join(' ');
  const ident = identificar(nombre);
  textos = [];
  if(!ident || e.lat == null || e.lon == null){
    problemas.push(`${ruta.id}: punto sin nombre legible en ${e.archivo} p.${e.pagina} («${nombre}»)`);
    ruta.corte = true;   // no se une el punto anterior con el siguiente a través de este
    return;
  }
  const idx = region.punto(ident.id, e.lat, e.lon, ident.clase, ident.nota);
  ruta.puntos.push({ idx, orden, inicio: previos.length ? previos[0].orden : orden, lugar: e, tras_corte: ruta.corte });
  ruta.corte = false;
});

// Segunda pasada: los datos del tramo A→B son los que aparecen entre las coordenadas de A y las
// de B («entre»), o entre el nombre de A y el de B («desde», Uruguay).
for(const r of rutas.values()){
  // Chile repite el último punto de una página al comienzo de la siguiente: es el mismo punto, y
  // los datos del tramo siguiente vienen tras su segunda aparición.
  const puntos = [];
  for(const p of r.puntos){
    const u = puntos[puntos.length - 1];
    if(u && u.idx === p.idx && !p.tras_corte) puntos[puntos.length - 1] = { ...p, tras_corte: u.tras_corte };
    else puntos.push(p);
  }
  const tramos = [];
  for(let k = 1; k < puntos.length; k++){
    const A = puntos[k - 1], B = puntos[k];
    if(B.tras_corte) continue;
    const [desde, hasta] = cfg.alineacion === 'desde' ? [A.inicio, B.inicio] : [A.orden, B.orden];
    const d = elementos.slice(desde, hasta).filter(x => x.tipo === 'dato');
    const tracks = d.flatMap(x => x.tracks);
    let dists = d.flatMap(x => x.dists);
    // Argentina imprime la distancia de A→B a la altura de las coordenadas de B (algo antes o
    // algo después): se toma la más cercana a esa línea.
    if(cfg.distJuntoAB){
      const cand = elementos.filter(x => x.tipo === 'dato' && x.dists.length && x.archivo === B.lugar.archivo && x.pagina === B.lugar.pagina && Math.abs(x.y - B.lugar.y) <= 24)
        .sort((p, q) => Math.abs(p.y - B.lugar.y) - Math.abs(q.y - B.lugar.y));
      if(cand.length) dists = cand[0].dists;
    }
    tramos.push([A.idx, B.idx, dists.length ? dists[0] : null, tracks.length ? redondear(tracks[0]) : null,
      tracks.length > 1 ? redondear(tracks[1]) : null, (cfg.nivel || nivelPorPrefijo)(r.id, A.lugar.etiqueta),
      `límites, clase y sentido de los niveles: ver el AIP${A.lugar.etiqueta ? ', ' + A.lugar.etiqueta : ''}`, null]);
  }
  region.ruta(r.id, '', tramos);
}
problemas.forEach(p => console.log('  · ' + p));
// DEPURAR=<expresión>: muestra el flujo de elementos alrededor de los que coincidan.
if(process.env.DEPURAR){
  const re = new RegExp(process.env.DEPURAR);
  elementos.forEach((e, i) => {
    if(!re.test(JSON.stringify(e))) return;
    console.log('— elemento ' + i);
    elementos.slice(Math.max(0, i - 4), i + 4).forEach(x => console.log('   ', x.tipo, x.id || x.texto || x.nombre || '', x.tracks || '', x.dists || '', 'p.' + x.pagina, x.y != null ? 'y=' + x.y.toFixed(0) : ''));
  });
}
region.escribir();
