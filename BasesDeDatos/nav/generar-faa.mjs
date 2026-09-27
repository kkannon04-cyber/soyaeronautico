// Genera las aerovías, los puntos significativos y las radioayudas de EE.UU. que dibuja el
// Simulador NALA, a partir de los datos OFICIALES de la FAA.
//
// Fuente: FAA NASR 28 Day Subscription (National Airspace System Resources), Aeronautical
// Information Services. Publicación del Gobierno de EE.UU., de dominio público.
//   https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/
//
// Las aerovías de NASR solo cambian cada 56 días (ciclo mayor de cartas en ruta): el paquete de
// un ciclo intermedio de 28 días repite las del ciclo anterior. Por eso la vigencia muestra las
// dos fechas: la de la suscripción y la de las aerovías (EFF_DATE de AWY_BASE.csv).
//
// Uso (Node 18 o superior, sin dependencias):
//   1. Descargar de la página del ciclo los CSV «extra» de aerovías, fijos y radioayudas:
//        https://nfdc.faa.gov/webContent/28DaySub/extra/<DD_Mmm_AAAA>_AWY_CSV.zip
//        https://nfdc.faa.gov/webContent/28DaySub/extra/<DD_Mmm_AAAA>_FIX_CSV.zip
//        https://nfdc.faa.gov/webContent/28DaySub/extra/<DD_Mmm_AAAA>_NAV_CSV.zip
//   2. Descomprimirlos en una misma carpeta (en Windows: tar -xf archivo.zip).
//   3. node BasesDeDatos/nav/generar-faa.mjs <carpeta> <AAAA-MM-DD de la suscripción>
//
// Escribe BasesDeDatos/nav/aerovias/eeuu.json (formato común: ver lib-aerovias.mjs).
import fs from 'fs';
import path from 'path';
import { Region } from './lib-aerovias.mjs';

const [carpeta, suscripcion] = process.argv.slice(2);
if(!carpeta || !/^\d{4}-\d{2}-\d{2}$/.test(suscripcion || '')){
  console.error('Uso: node generar-faa.mjs <carpeta con los CSV> <AAAA-MM-DD de la suscripción NASR>');
  process.exit(1);
}

// Busca un CSV por nombre en la carpeta o en sus subcarpetas (cada ZIP trae la suya).
function buscar(nombre, dir = carpeta){
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()){ const r = buscar(nombre, p); if(r) return r; }
    else if(e.name === nombre) return p;
  }
  return null;
}

// CSV con comillas dobles y comillas escapadas (""), el formato de NASR.
function parseCsv(txt){
  const filas = []; let fila = [], campo = '', entreComillas = false;
  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    if(entreComillas){
      if(c === '"'){ if(txt[i+1] === '"'){ campo += '"'; i++; } else entreComillas = false; }
      else campo += c;
    } else if(c === '"') entreComillas = true;
    else if(c === ','){ fila.push(campo); campo = ''; }
    else if(c === '\n'){ fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if(c !== '\r') campo += c;
  }
  if(campo || fila.length){ fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter(f => f.length > 1).map(f => Object.fromEntries(cab.map((k, i) => [k, (f[i] ?? '').trim()])));
}
function leer(nombre){
  const p = buscar(nombre);
  if(!p) throw new Error(`No se encontró ${nombre} en ${carpeta}`);
  return parseCsv(fs.readFileSync(p, 'utf8'));
}

const num = (v, dec) => { const n = parseFloat(v); return Number.isFinite(n) ? +n.toFixed(dec) : null; };
const ent = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const fecha = v => v.replace(/\//g, '-');   // «2026/09/03» -> «2026-09-03»
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fechaAip = iso => { const [a, m, d] = iso.split('-'); return `${d} ${MESES[+m - 1]} ${a}`; };

const awyBase = leer('AWY_BASE.csv'), awySeg = leer('AWY_SEG_ALT.csv');
const fixBase = leer('FIX_BASE.csv'), navBase = leer('NAV_BASE.csv');

const vigAerovias = [...new Set(awyBase.map(r => fecha(r.EFF_DATE)))];
const vigFijos = [...new Set(fixBase.map(r => fecha(r.EFF_DATE)))];
if(vigAerovias.length !== 1 || vigFijos.length !== 1) throw new Error('Los CSV mezclan fechas de vigencia: ' + vigAerovias + ' / ' + vigFijos);

const region = new Region({
  codigo: 'eeuu', region: 'Estados Unidos',
  fuente: 'FAA NASR 28 Day Subscription — Aeronautical Information Services (dominio público)',
  url: 'https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/',
  vigencia: `aerovías vigentes desde el ${fechaAip(vigAerovias[0])}; fijos y radioayudas de la suscripción del ${fechaAip(suscripcion)}`,
  textoNiveles: { inf: 'ruta inferior (bajo FL180)', sup: 'ruta superior (FL180 o más)', ambos: 'rutas inferior y superior' },
  paises: ['US', 'PR', 'VI', 'GU', 'AS', 'MP', 'UM'],
});

/* ---------- Puntos de las aerovías ----------
   Cada tramo nombra su punto de origen y el tipo de punto (FROM_PT_TYPE): un fijo (WP punto de
   recorrido, RP punto de notificación, CN fijo de navegación computarizado) o una radioayuda
   (VORTAC, VOR/DME, NDB…). Con el tipo, cada identificador se resuelve sin ambigüedad. */
const fijosPorId = new Map(), navPorId = new Map();
fixBase.forEach(r => { const a = fijosPorId.get(r.FIX_ID) || []; a.push(r); fijosPorId.set(r.FIX_ID, a); });
navBase.forEach(r => { const a = navPorId.get(r.NAV_ID) || []; a.push(r); navPorId.set(r.NAV_ID, a); });
const TIPOS_FIJO = new Set(['WP', 'RP', 'CN', '']);
const ESTRUCTURA = { HIGH: 'obligatorio en la estructura alta', LOW: 'obligatorio en la estructura baja', 'LOW/HIGH': 'obligatorio en las estructuras alta y baja' };

function resolverPunto(id, tipo){
  const esNav = !TIPOS_FIJO.has(tipo);
  let cand = esNav ? (navPorId.get(id) || []).filter(n => n.NAV_TYPE === tipo) : (fijosPorId.get(id) || []);
  if(!esNav && !cand.length) cand = navPorId.get(id) || [];
  if(cand.length !== 1) return null;
  const r = cand[0];
  const lat = num(r.LAT_DECIMAL, 5), lon = num(r.LONG_DECIMAL, 5);
  if(lat == null || lon == null) return null;
  if(r.NAV_ID) return region.punto(id, lat, lon, 'N', `${r.NAME} ${r.NAV_TYPE}`, r.COUNTRY_CODE);
  // CN: fijo de navegación computarizado (CNF), solo para los sistemas de navegación: no se usa
  // en planes de vuelo ni en autorizaciones ATC.
  const clase = r.FIX_USE_CODE === 'CN' ? 'K' : r.COMPULSORY ? 'C' : 'R';
  return region.punto(id, lat, lon, clase, ESTRUCTURA[r.COMPULSORY] || '', r.COUNTRY_CODE);
}

/* ---------- Nivel de cada tramo ----------
   En EE.UU. la estructura baja llega hasta 17 999 FT MSL y la alta empieza en FL180 (14 CFR 71,
   espacio aéreo clase A). Un tramo es inferior si su altitud mínima publicada queda por debajo de
   18 000 FT, y superior si su MAA llega a FL180 o más. Las rutas oceánicas (Atlántico, Pacífico,
   Bahamas) suelen ir de una MEA baja a una MAA de FL600, y valen para las dos capas. Cuando un
   tramo no publica MEA ni MAA, decide la familia de la ruta (J y Q altas; V, T y el resto bajas). */
const LIMITE_ALTA = 18000;
function nivelTramo(r, base){
  const alta = base.AWY_DESIGNATION === 'J' || /^Q/.test(base.AWY_ID);
  const bajaPorFamilia = ['V', 'G', 'R', 'SP'].includes(base.AWY_DESIGNATION) || /^T/.test(base.AWY_ID);
  const minimo = ent(r.MIN_ENROUTE_ALT) ?? ent(r.MIN_ENROUTE_ALT_OPPOSITE) ?? ent(r.GPS_MIN_ENROUTE_ALT) ?? ent(r.MIN_OBSTN_CLNC_ALT);
  const maa = ent(r.MAX_AUTH_ALT);
  const inf = minimo != null ? minimo < LIMITE_ALTA : !alta;
  const sup = maa != null ? maa >= LIMITE_ALTA : !bajaPorFamilia;
  return inf && sup ? 'ambos' : sup ? 'sup' : 'inf';
}

// Desde 18 000 FT se vuela por niveles de vuelo (FL), como se publica en EE.UU.
const alt = v => v >= 18000 ? 'FL' + Math.round(v / 100) : v.toLocaleString('es-CO') + ' FT';
// MEA con su sentido cuando NASR publica una distinta para cada dirección.
function meaTexto(v, dir, vOp, dirOp){
  const a = ent(v), b = ent(vOp);
  if(a == null && b == null) return '';
  if(b == null || b === a) return alt(a ?? b);
  return `${a != null ? alt(a) : '—'}${dir ? ' ' + dir : ''} / ${alt(b)}${dirOp ? ' ' + dirOp : ''}`;
}
function datosTramo(f, frontera){
  const mea = meaTexto(f.MIN_ENROUTE_ALT, f.MIN_ENROUTE_ALT_DIR, f.MIN_ENROUTE_ALT_OPPOSITE, f.MIN_ENROUTE_ALT_OPPOSITE_DIR);
  const gmea = meaTexto(f.GPS_MIN_ENROUTE_ALT, f.GPS_MIN_ENROUTE_ALT_DIR, f.GPS_MIN_ENROUTE_ALT_OPPOSITE, f.GPS_MEA_OPPOSITE_DIR);
  const moca = ent(f.MIN_OBSTN_CLNC_ALT), maa = ent(f.MAX_AUTH_ALT);
  return [frontera ? 'cruza la frontera: distancia no publicada' : '', mea && 'MEA ' + mea, gmea && 'MEA GNSS ' + gmea,
    moca != null ? 'MOCA ' + alt(moca) : '', maa != null ? 'MAA ' + alt(maa) : ''].filter(Boolean).join(' · ');
}

/* ---------- Tramos ----------
   NASR marca los cruces de frontera con pseudopuntos sin coordenadas («U.S. MEXICAN BORDER-2»).
   Un cruce aislado entre dos puntos conocidos es la misma recta cortada por la frontera, y se une.
   Dos cruces seguidos significan que la aerovía sale del país y vuelve a entrar: NASR no publica
   la parte extranjera (puede tener puntos propios), así que se deja el hueco. Tampoco se dibuja
   el tramo que sigue a un punto con AWY_SEG_GAP_FLAG = Y (interrupción publicada de la aerovía). */
const segsPorRuta = new Map();
awySeg.forEach(r => {
  const k = r.AWY_LOCATION + '|' + r.AWY_ID;
  const a = segsPorRuta.get(k) || []; a.push(r); segsPorRuta.set(k, a);
});

const SUBREGION = { A: 'Alaska', H: 'Hawái' };
const sinResolver = [];
let unidosPorFrontera = 0, huecos = 0;
awyBase.forEach(base => {
  const filas = (segsPorRuta.get(base.AWY_LOCATION + '|' + base.AWY_ID) || []).sort((a, b) => a.POINT_SEQ - b.POINT_SEQ);
  const lista = [];
  let prev = null, filasDesdePrev = [], fronteras = 0, cortado = false;
  filas.forEach(r => {
    if(/BORDER/.test(r.FROM_POINT)){ fronteras++; filasDesdePrev.push(r); return; }
    const idx = resolverPunto(r.FROM_POINT, r.FROM_PT_TYPE);
    if(idx == null){ sinResolver.push(base.AWY_ID + ':' + r.FROM_POINT); prev = null; filasDesdePrev = []; fronteras = 0; return; }
    if(prev != null && !cortado && fronteras <= 1){
      const f0 = filasDesdePrev[0];                         // fila del punto anterior (datos del tramo)
      const fN = filasDesdePrev[filasDesdePrev.length - 1]; // última fila antes de este punto
      const directo = fronteras === 0;
      // En un tramo unido por la frontera, la derrota de salida y la distancia de la primera fila
      // solo llegan hasta la frontera: se conserva la derrota (misma recta) y se omite la distancia.
      const alts = directo ? f0 : (ent(fN.MIN_ENROUTE_ALT) != null ? fN : f0);
      const t = ent(Math.round(parseFloat(f0.MAG_COURSE)));
      const rr = directo ? ent(Math.round(parseFloat(f0.OPP_MAG_COURSE))) : ent(Math.round(parseFloat(fN.OPP_MAG_COURSE)));
      lista.push([prev, idx, directo ? num(f0.MAG_COURSE_DIST, 1) : null, t, rr, nivelTramo(alts, base),
        datosTramo(alts, !directo), region.observacion(f0.REMARK || base.REMARK)]);
      if(!directo) unidosPorFrontera++;
    } else if(prev != null) huecos++;
    prev = idx; filasDesdePrev = [r]; fronteras = 0;
    cortado = r.AWY_SEG_GAP_FLAG === 'Y';
  });
  region.ruta(base.AWY_ID, SUBREGION[base.AWY_LOCATION], lista);
});

/* ---------- Radioayudas de EE.UU. ----------
   Solo las de COUNTRY_CODE = US (incluye Puerto Rico, Islas Vírgenes, Guam…). NASR trae también
   algunas extranjeras, pero la fuente oficial de esas es el AIP de su propio Estado. Se excluyen
   las apagadas (SHUTDOWN), los VOT (equipos de prueba de receptor), las radiobalizas en abanico y
   los radiofaros marítimos, que no son radioayudas en ruta. */
const ESTADO = { 'OPERATIONAL IFR': 'operativa IFR', 'OPERATIONAL RESTRICTED': 'operativa con restricciones', 'OPERATIONAL VFR ONLY': 'operativa solo VFR' };
region.radioayudas = navBase
  .filter(r => r.COUNTRY_CODE === 'US' && r.NAV_STATUS !== 'SHUTDOWN' && !['VOT', 'FAN MARKER', 'MARINE NDB'].includes(r.NAV_TYPE))
  .map(r => {
    const vm = ent(r.MAG_VARN), tipo = r.NAV_TYPE.replace('/', '-'), elev = ent(Math.round(parseFloat(r.ELEV)));
    return [r.NAV_ID, r.NAME, tipo, r.FREQ ? `${r.FREQ} ${tipo.startsWith('NDB') ? 'kHz' : 'MHz'}` : '', num(r.LAT_DECIMAL, 5), num(r.LONG_DECIMAL, 5), r.CHAN || '',
            vm == null ? null : (r.MAG_VARN_HEMIS === 'W' ? -vm : vm), [r.CITY, r.STATE_CODE].filter(Boolean).join(', '),
            ESTADO[r.NAV_STATUS] || r.NAV_STATUS, [r.PUBLIC_USE_FLAG === 'Y' ? '' : 'uso no público', elev != null ? `elevación ${elev} FT` : ''].filter(Boolean).join(' · ')];
  })
  .filter(r => r[4] != null && r[5] != null)
  .sort((a, b) => a[0].localeCompare(b[0]));

region.escribir();
console.log(`Suscripción ${suscripcion} · aerovías vigentes desde ${vigAerovias[0]} · ${unidosPorFrontera} tramos unidos por un cruce de frontera, ${huecos} huecos`);
if(sinResolver.length) console.log(`Puntos sin resolver (${sinResolver.length}): ${sinResolver.slice(0, 20).join(' ')}`);
