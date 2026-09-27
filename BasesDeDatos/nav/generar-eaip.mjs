// Genera las aerovías de una región a partir de su eAIP en formato Eurocontrol (el mismo que usa
// el eAIP de Colombia). Esas páginas etiquetan cada dato con su campo AIXM en el id del elemento
// (RTE.TXT_DESIG, DESIGNATED_POINT.GEO_LAT, RTE_SEG.VAL_LEN…), así que se leen sin interpretar
// la maquetación.
//
// Uso (Node 18 o superior, sin dependencias):
//   1. Guardar con el navegador (Guardar como… → «solo HTML») las páginas ENR 3.x y ENR 4.1 de la
//      enmienda vigente en una carpeta. Algunos servidores (COCESNA) bloquean las descargas que no
//      vienen de un navegador.
//   2. Actualizar abajo la vigencia de la región si cambió la enmienda.
//   3. node BasesDeDatos/nav/generar-eaip.mjs <region> <carpeta>
//
// Regiones: cocesna (FIR Centroamérica) · dcansp (FIR Curazao).
import fs from 'fs';
import path from 'path';
import { Region, coordenada, nivelPorLimites, textoHtml, redondear, arbolHtml, texto, descendientes, hijos } from './lib-aerovias.mjs';

const REGIONES = {
  cocesna: {
    meta: {
      codigo: 'centroamerica', region: 'Centroamérica (FIR CENAMER)',
      fuente: 'eAIP de Centroamérica, COCESNA — ENR 3.1, ENR 3.2 y ENR 4.1 de cada Estado',
      url: 'https://www.cocesna.org/aipca/history.html',
      vigencia: 'NON AIRAC AMDT 59/26, en vigor desde el 01 OCT 2026',
      // Rutas inferiores hasta 19 500 FT AMSL; superiores por encima (límites publicados en ENR 3).
      textoNiveles: { inf: 'ruta inferior (hasta 19 500 FT)', sup: 'ruta superior (por encima de 19 500 FT)', ambos: 'rutas inferior y superior' },
      paises: ['GT', 'BZ', 'SV', 'HN', 'NI', 'CR'],
    },
    limiteFt: 19500,
    enr3: /ENR-3\.[123]\b/, enr41: /ENR-4\.1\b/,
    idioma: 'es',
  },
  dcansp: {
    meta: {
      codigo: 'curazao', region: 'Curazao, Aruba y Bonaire (FIR Curazao)',
      fuente: 'eAIP Dutch Caribbean, DC-ANSP — ENR 3 y ENR 4.1',
      url: 'https://dc-ansp.org/eAIS/eAIP/default.html',
      vigencia: 'AIRAC AMDT 03-26, en vigor desde el 01 OCT 2026',
      textoNiveles: { inf: 'ruta inferior (hasta FL195)', sup: 'ruta superior (desde FL195)', ambos: 'rutas inferior y superior' },
      paises: ['CW', 'AW', 'BQ', 'SX'],
    },
    limiteFt: 19500,   // rutas inferiores hasta FL195 y superiores desde FL195 (límites publicados en ENR 3)
    enr3: /ENR[- ]3\.[123]/, enr41: /ENR[- ]4\.1\b/,
    idioma: 'en',
    formato: 'filas',   // sin campos AIXM: las filas llevan como id el nombre del punto
  },
};

const [clave, carpeta] = process.argv.slice(2);
const cfg = REGIONES[clave];
if(!cfg || !carpeta){ console.error('Uso: node generar-eaip.mjs <' + Object.keys(REGIONES).join('|') + '> <carpeta>'); process.exit(1); }

const archivos = fs.readdirSync(carpeta).filter(f => /\.html?$/i.test(f)).sort();
const leer = f => quitarEnmiendas(fs.readFileSync(path.join(carpeta, f), 'utf8'));

// Las páginas de una enmienda muestran tachado lo que se elimina: nunca se lee.
function quitarEnmiendas(html){
  return html.replace(/<del\b[\s\S]*?<\/del>/gi, '')
    .replace(/<(span|p|div)\b[^>]*class="[^"]*(?:deleted|AmdtDeleted)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '');
}

// Campos AIXM de un fragmento: { 'RTE_SEG.VAL_LEN': ['57 NM'], … }
function campos(html){
  const out = {};
  for(const m of html.matchAll(/<span\b[^>]*\bid="(?:gaixm--)?[\d-]*?--([A-Z_]+\.[A-Z_-]+)"[^>]*>([\s\S]*?)<\/span>/g)){
    (out[m[1]] = out[m[1]] || []).push(textoHtml(m[2]));
  }
  return out;
}
const uno = (c, k) => (c[k] || []).find(v => v && v !== '-') || '';

const TIPO = t => {
  const u = t.toUpperCase().replace(/\s+/g, '');
  if(/VORTAC/.test(u)) return 'VORTAC';
  if(/VOR\/?DME|DVOR\/?DME/.test(u)) return 'VOR-DME';
  if(/NDB\/?DME/.test(u)) return 'NDB-DME';
  if(/TACAN/.test(u)) return 'TACAN';
  if(/VOR/.test(u)) return 'VOR';
  if(/NDB|LOCATOR|\bL\b/.test(u)) return 'NDB';
  if(/DME/.test(u)) return 'DME';
  return u;
};
const REP = v => /▲/.test(v) ? 'C' : /[∆△]/.test(v) ? 'R' : 'U';
const NIVEL_TXT = { es: { odd: 'impares', even: 'pares' }, en: { odd: 'impares', even: 'pares' } };
const paridad = txt => /odd|impar/i.test(txt) ? 'odd' : /even|par\b/i.test(txt) ? 'even' : '';

const region = new Region(cfg.meta);

// Texto de los datos de un tramo, igual para los dos formatos.
function datosTramo(seg, a, b, id, rep){
  const dir = [seg.abajo && `${NIVEL_TXT[cfg.idioma][seg.abajo]} ${a}→${b}`, seg.arriba && `${NIVEL_TXT[cfg.idioma][seg.arriba]} ${b}→${a}`].filter(Boolean);
  return [
    seg.sup || seg.inf ? `límites ${seg.sup || '—'} / ${seg.inf || '—'}` : '',
    seg.mea ? `${seg.etqMin || 'MEA'} ${seg.mea}` : '',
    seg.clase ? `clase ${seg.clase}` : '', seg.ancho ? `límites laterales ${seg.ancho} NM` : '',
    seg.spec, dir.length ? `niveles ${dir.join(', ')}${dir.length === 1 ? ' (sentido único)' : ''}` : '',
    rep === 'C' ? `${id} ▲ obligatorio` : rep === 'R' ? `${id} ∆ a solicitud` : '',
  ].filter(Boolean).join(' · ');
}
const sinDato = v => !v || /^(NIL|-|—)$/i.test(v.trim());

/* ---------- Formato «filas» (DC-ANSP) ----------
   Una página por ruta. Cada punto P ocupa la fila «P» (y sus subfilas «Prow1» símbolo y nombre,
   «Prow2» latitud, «Prow3» longitud); el tramo que sale de P va en la fila «P_1». Las columnas se
   ubican por el encabezado de la página, porque ENR 3.1 y ENR 3.2 no las ordenan igual. En la
   columna de sentido hay dos celdas: impares y pares, con ↓ (en el orden de la tabla) o ↑. */
function leerFilas(f){
  const raiz = arbolHtml(leer(f));
  const filas = descendientes(raiz, n => n.tag === 'tr');
  const porId = new Map(filas.filter(t => t.attrs.id).map(t => [t.attrs.id, t]));
  const cab = filas.find(t => /_H0bis$/i.test(t.attrs.id || ''));
  if(!cab) return;
  const celdasCab = hijos(cab, 'td').concat(hijos(cab, 'th')).map(texto);
  const col = re => celdasCab.findIndex(t => re.test(t));
  const cTrack = col(/Track MAG/i), cLim = col(/Upper limit/i), cLat = col(/Lateral/i), cDir = col(/Direction/i);
  const tras = i => i > cDir ? i + 1 : i;   // la columna de sentido ocupa dos celdas en las filas de datos
  const cRnav = col(/RNP|RNAV/i), cObs = col(/Remarks/i);
  const ruta = (f.match(/ENR ?3\.\d\s+([A-Z]+\s*\d+)/i) || [])[1].replace(/\s+/g, '');
  const seccionSup = /ENR ?3\.2/.test(f);
  const tramos = [];
  let prev = null, seg = null, repPrev = 'U';
  for(const tr of filas){
    const id = tr.attrs.id || '';
    const r1 = porId.get(id + 'row1');
    if(r1 && !/_1$/.test(id)){
      const [simb, nombre] = hijos(r1, 'td').map(texto);
      const lat = coordenada(texto(hijos(porId.get(id + 'row2'), 'td').at(-1)));
      const lon = coordenada(texto(hijos(porId.get(id + 'row3'), 'td').at(-1)));
      const nav = (nombre || '').match(/^(.*?)\s*[(‘'’]([A-Z0-9]{2,4})[)’'‘]$/);   // «CURACAO VOR/DME 'PJG'»
      const rep = REP(simb || '');
      const ident = nav ? nav[2] : (nombre || id).trim();
      const idx = region.punto(ident, lat, lon, nav ? 'N' : rep, nav ? nav[1] : '');
      if(prev != null && seg){
        const a = region.puntos[prev][0];
        tramos.push([prev, idx, seg.d, seg.t, seg.r, nivelPorLimites(seg.sup, seg.inf, cfg.limiteFt, /^U/.test(ruta) || seccionSup ? 'sup' : 'inf'),
          datosTramo(seg, a, ident, ident, rep), region.observacion(seg.obs)]);
      }
      prev = idx; seg = null; repPrev = rep;
      continue;
    }
    if(/_1$/.test(id) && prev != null){
      const celdas = hijos(tr, 'td');
      const t = i => i >= 0 && celdas[i] ? texto(celdas[i]) : '';
      const m = t(cTrack).match(/(\d{1,3}(?:\.\d+)?)°\s*(\d{1,3}(?:\.\d+)?)°\s*([\d.]+)\s*NM/i);
      // Límites: cada valor va en su propia subfila (superior, inferior, MEA, clase).
      const lim = celdas[cLim] ? descendientes(celdas[cLim], n => n.tag === 'tr').map(texto).filter(Boolean) : [];
      const clase = lim.find(v => /^CLASS\b/i.test(v));
      const valores = lim.filter(v => !/^CLASS\b/i.test(v));
      const flecha = s => /↓/.test(s) ? 'abajo' : /↑/.test(s) ? 'arriba' : '';
      const impar = flecha(t(cDir)), par = flecha(t(cDir + 1));
      seg = {
        d: m ? +m[3] : null, t: m ? redondear(+m[1]) : null, r: m ? redondear(+m[2]) : null,
        sup: valores[0] || '', inf: valores[1] || '', mea: valores[2] || '',
        clase: clase ? clase.replace(/^CLASS\s*/i, '') : '', ancho: cLat >= 0 && !sinDato(t(cLat)) ? t(cLat) : '',
        spec: cRnav >= 0 && !sinDato(t(tras(cRnav))) ? t(tras(cRnav)) : '',
        obs: cObs >= 0 && !sinDato(t(tras(cObs))) ? t(tras(cObs)) : '',
        abajo: impar === 'abajo' ? 'odd' : par === 'abajo' ? 'even' : '',
        arriba: impar === 'arriba' ? 'odd' : par === 'arriba' ? 'even' : '',
      };
    }
  }
  region.ruta(ruta, '', tramos);
}

function leerRadioayudasFilas(f){
  const raiz = arbolHtml(leer(f));
  for(const tr of descendientes(raiz, n => n.tag === 'tr')){
    const c = hijos(tr, 'td').map(texto);
    if(c.length < 6) continue;
    const coord = c[4].match(/(\d{6}(?:\.\d+)?[NS])\s+(\d{7}(?:\.\d+)?[EW])/);
    if(!coord || !/^[A-Z0-9]{2,4}$/.test(c[1])) continue;
    const nom = c[0].match(/^(.*?)\s+(VOR\/DME|VORTAC|VOR|NDB\/DME|NDB|DME|TACAN)\b\s*(\(([^)]*)\))?/i);
    const f1 = c[2].match(/([\d.]+)\s*(MHZ|KHZ)/i), ch = c[2].match(/CH\s*(\w+)/i);
    region.radioayudas.push([c[1], nom ? nom[1] : c[0], TIPO(nom ? nom[2] : c[0]),
      f1 ? `${f1[1]} ${/K/i.test(f1[2]) ? 'kHz' : 'MHz'}` : '', +coordenada(coord[1]).toFixed(5), +coordenada(coord[2]).toFixed(5),
      ch ? ch[1] : '', null, '', c[3], [nom && nom[4] ? `VAR/declinación publicada: ${nom[4]}` : '', /^\d/.test(c[5]) ? `elevación ${c[5]}` : ''].filter(Boolean).join(' · ')]);
  }
}

if(cfg.formato === 'filas'){
  archivos.filter(f => cfg.enr3.test(f)).forEach(leerFilas);
  archivos.filter(f => cfg.enr41.test(f)).forEach(leerRadioayudasFilas);
  region.escribir();
  process.exit(0);
}

/* ---------- Rutas (ENR 3.x) ----------
   Cada tabla alterna filas de punto (Table-row-type-2) y de tramo (Table-row-type-3), tras una
   fila con el designador (Table-row-type-1). Los datos de un tramo van entre el punto anterior y
   el siguiente. */
for(const f of archivos.filter(f => cfg.enr3.test(f))){
  const html = leer(f);
  const seccionSup = /ENR[- ]3\.2/.test(f) && !/RNAV|3\.3/.test(f);
  const cortes = [...html.matchAll(/<tr\b[^>]*class="Table-row-type-(\d)[^"]*"[^>]*>/g)];
  let ruta = null, tramos = [], prev = null, seg = null;
  const cerrar = () => { if(ruta) region.ruta(ruta, '', tramos); ruta = null; tramos = []; prev = null; seg = null; };
  cortes.forEach((m, k) => {
    const fila = html.slice(m.index, k + 1 < cortes.length ? cortes[k + 1].index : html.length);
    const c = campos(fila);
    if(m[1] === '1' && c['RTE.TXT_DESIG']){ cerrar(); ruta = uno(c, 'RTE.TXT_DESIG').replace(/\s+/g, ''); return; }
    if(!ruta) return;
    const lat = uno(c, 'DESIGNATED_POINT.GEO_LAT') || uno(c, 'NAVAID.GEO_LAT');
    if(lat){
      const esNav = !!uno(c, 'NAVAID.IDENT');
      const id = esNav ? uno(c, 'NAVAID.IDENT') : uno(c, 'DESIGNATED_POINT.CODE_IDENT');
      const lon = uno(c, 'DESIGNATED_POINT.GEO_LONG') || uno(c, 'NAVAID.GEO_LONG');
      const rep = REP(uno(c, 'RTE_SEG.CODE_REP_ATC_START') || uno(c, 'RTE_SEG.CODE_REP_ATC_END'));
      const nota = esNav ? `${uno(c, 'NAVAID.NAME')} ${uno(c, 'NAVAID.TYPE')}`.trim() : '';
      const idx = region.punto(id, coordenada(lat), coordenada(lon), esNav ? 'N' : rep, nota);
      if(prev != null && seg){
        const porDefecto = /^U/.test(ruta) || seccionSup ? 'sup' : 'inf';
        tramos.push([prev, idx, seg.d, seg.t, seg.r, nivelPorLimites(seg.sup, seg.inf, cfg.limiteFt, porDefecto),
          datosTramo(seg, region.puntos[prev][0], id, id, rep), region.observacion(seg.obs)]);
      }
      prev = idx; seg = null;
      return;
    }
    if(c['RTE_SEG.VAL_LEN'] || c['RTE_SEG.VAL_MAG_TRACK']){
      // Sentido de los niveles: las dos celdas que siguen a la de límites laterales son ⇓ (en el
      // orden de la tabla) y ⇑ (en sentido contrario).
      let abajo = '', arriba = '';
      const iAncho = fila.indexOf('RTE_SEG.VAL_WIDTH');
      if(iAncho >= 0){
        const celdas = fila.slice(iAncho).split(/<\/td>/i);
        abajo = paridad(textoHtml(celdas[1] || '')); arriba = paridad(textoHtml(celdas[2] || ''));
      }
      const len = uno(c, 'RTE_SEG.VAL_LEN');
      const dm = len.match(/([\d.]+)\s*(NM|KM)?/i);
      seg = {
        d: dm ? (/KM/i.test(dm[2] || '') ? +(dm[1] / 1.852).toFixed(1) : +dm[1]) : null,
        t: redondear(parseFloat(uno(c, 'RTE_SEG.VAL_MAG_TRACK'))), r: redondear(parseFloat(uno(c, 'RTE_SEG.VAL_REVERS_MAG_TRACK'))),
        sup: uno(c, 'RTE_SEG.VAL_DIST_VER_UPPER'), inf: uno(c, 'RTE_SEG.VAL_DIST_VER_LOWER'),
        mea: uno(c, 'RTE_SEG.VAL_DIST_VER_MNM'), etqMin: 'altitud mínima', ancho: uno(c, 'RTE_SEG.VAL_WIDTH'), clase: uno(c, 'RTE_SEG.AIRSPACE_CLASS'),
        spec: uno(c, 'RTE_SEG.RNP-RNAV'), obs: (c['RTE_SEG.TXT_RMK'] || []).join(' '), abajo, arriba,
      };
    }
  });
  cerrar();
}

/* ---------- Radioayudas (ENR 4.1) ---------- */
for(const f of archivos.filter(f => cfg.enr41.test(f))){
  const html = leer(f);
  const pais = (f.match(/ES-(M[A-Z])-ENR/) || [])[1];
  const PAIS_OACI = { MZ: 'BZ', MG: 'GT', MS: 'SV', MH: 'HN', MN: 'NI', MR: 'CR' };
  const filas = html.split(/<tr\b/i).slice(1);
  for(const fila of filas){
    const c = campos(fila);
    const id = uno(c, 'NAVAID.IDENT'), lat = coordenada(uno(c, 'NAVAID.GEO_LAT')), lon = coordenada(uno(c, 'NAVAID.GEO_LONG'));
    if(!id || lat == null || lon == null) continue;
    const frec = uno(c, 'NAVAID.VAL_FREQ');
    const unidad = uno(c, 'NAVAID.UOM_FREQ').replace(/MHZ/i, 'MHz').replace(/KHZ/i, 'kHz');
    const decl = uno(c, 'NAVAID.VORDECLINATION') || uno(c, 'NAVAID.MAGVAR');
    const dm = decl.match(/([\d.]+)\s*°?\s*([EW])/i);
    const elev = uno(c, 'NAVAID.VAL_ELEV'), uElev = uno(c, 'NAVAID.UOM_DIST_VER');
    const elevFt = elev ? Math.round(/^M$/i.test(uElev) ? elev / 0.3048 : +elev) : null;
    region.radioayudas.push([id, uno(c, 'NAVAID.NAME'), TIPO(uno(c, 'NAVAID.TYPE')), frec ? `${frec} ${unidad}`.trim() : '', +lat.toFixed(5), +lon.toFixed(5),
      uno(c, 'NAVAID.CHANNEL').replace(/[()]/g, '').replace(/^CH\s*/i, '').trim(), dm ? (/W/i.test(dm[2]) ? -dm[1] : +dm[1]) : null,
      PAIS_OACI[pais] || '', uno(c, 'NAVAID.CODE_WORK_HR'), elevFt != null ? `elevación ${elevFt} FT` : '']);
  }
}

region.escribir();
