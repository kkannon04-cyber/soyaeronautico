// Genera las aerovías de Ecuador a partir de fuentes/ecuador-enr3.txt: la transcripción de las
// tablas de ENR 3.1, 3.2 y 3.3 del AIP de Ecuador, que el IFIS3 de la DGAC publica como imágenes
// (ver la cabecera de ese archivo para la fuente y el formato).
//
// Una transcripción a mano puede tener erratas, así que este generador las busca antes de
// escribir nada: compara cada distancia publicada con la calculada desde las coordenadas, y cada
// derrota magnética con el rumbo verdadero (la diferencia es la declinación, que en Ecuador está
// entre 1° y 6° W). Si algo no casa, se detiene y dice dónde.
//
// Uso: node BasesDeDatos/nav/generar-ecuador.mjs
import fs from 'fs';
import path from 'path';
import { AQUI, Region, coordenada, distanciaNM, rumboInicial } from './lib-aerovias.mjs';

const texto = fs.readFileSync(path.join(AQUI, 'fuentes', 'ecuador-enr3.txt'), 'utf8');
const region = new Region({
  codigo: 'ecuador', region: 'Ecuador (FIR Guayaquil)',
  fuente: 'AIP de Ecuador, DGAC (IFIS3) — ENR 3.1, 3.2 y 3.3, transcritas de las tablas publicadas como imagen',
  url: 'https://www.ais.aviacioncivil.gob.ec/ifis3/aip/ENR%203.1',
  vigencia: 'última enmienda del AIP en IFIS3 al transcribir: AIRAC AIP AMDT 01-26',
  textoNiveles: { inf: 'ruta inferior (hasta FL245)', sup: 'ruta superior (desde FL245)', ambos: 'rutas inferior y superior' },
  paises: [],
});

const errores = [];
let ruta = null, seccion = '', tramos = [], prev = null, seg = null;
const cerrar = () => { if(ruta) region.ruta(ruta, '', tramos); ruta = null; tramos = []; prev = null; seg = null; };
const REP = { '▲': 'C', '△': 'R', '?': 'U' };

texto.split(/\r?\n/).forEach((linea, n) => {
  const l = linea.trim();
  if(!l || (l.startsWith('#') && !l.startsWith('# RUTA'))) return;
  let m = l.match(/^# RUTA (\S+) (ENR 3\.\d)$/);
  if(m){ cerrar(); ruta = m[1]; seccion = m[2]; return; }
  if(!ruta){ errores.push(`línea ${n + 1}: fuera de una ruta`); return; }
  m = l.match(/^- (\d{3}|--) (\d{3}|--) ([\d.]+) \| (.*)$/);
  if(m){
    if(prev == null || seg){ errores.push(`línea ${n + 1} (${ruta}): tramo sin punto anterior o dos tramos seguidos`); return; }
    seg = { t: m[1] === '--' ? null : +m[1] % 360, r: m[2] === '--' ? null : +m[2] % 360, d: +m[3], datos: m[4] };
    return;
  }
  m = l.match(/^([▲△?]) ([A-Z]{2,5}) (\d{6}[NS]) (\d{7}[EW])(?: \| (.+))?$/);
  if(!m){ errores.push(`línea ${n + 1} (${ruta}): formato no reconocido «${l}»`); return; }
  const [, simb, id, lat, lon, nombre] = m;
  const la = coordenada(lat), lo = coordenada(lon);
  const esNav = !!nombre && /VOR|NDB|DME/.test(nombre);
  const idx = region.punto(id, la, lo, esNav ? 'N' : REP[simb], nombre || '');
  if(prev != null){
    if(!seg){ errores.push(`línea ${n + 1} (${ruta}): falta el tramo entre ${region.puntos[prev][0]} y ${id}`); }
    else {
      const a = region.puntos[prev];
      const calc = distanciaNM(a[1], a[2], la, lo);
      if(Math.abs(calc - seg.d) > Math.max(1, seg.d * 0.02)) errores.push(`${ruta} ${a[0]}–${id}: distancia transcrita ${seg.d} NM, calculada ${calc.toFixed(1)} NM`);
      // Declinación implícita: rumbo verdadero − derrota magnética (E positiva). En la FIR Guayaquil
      // va de unos 6° W en el continente a unos 4° E en Galápagos, y la UN789 llega a ~10° E hacia
      // los 120° W (el propio AIP publica GEO 100,7° / MAG 097° en GLV). Fuera de −8°…+12° hay
      // una errata de transcripción.
      const dec = d => ((d % 360) + 540) % 360 - 180;
      if(seg.t != null){ const d = dec(rumboInicial(a[1], a[2], la, lo) - seg.t); if(d > 12 || d < -8) errores.push(`${ruta} ${a[0]}–${id}: derrota ${seg.t}° implica declinación ${d.toFixed(1)}°`); }
      if(seg.r != null){ const d = dec(rumboInicial(la, lo, a[1], a[2]) - seg.r); if(d > 12 || d < -8) errores.push(`${ruta} ${id}–${a[0]}: derrota ${seg.r}° implica declinación ${d.toFixed(1)}°`); }
      const nivel = seccion === 'ENR 3.1' ? 'inf' : 'sup';   // ENR 3.1: hasta FL245 · 3.2 y 3.3: UNL / FL245
      const datos = [seg.datos, simb === '▲' ? `${id} ▲ obligatorio` : simb === '△' ? `${id} △ a solicitud` : '',
        seg.t != null && seg.r == null ? 'solo se publica la derrota en este sentido' : ''].filter(Boolean).join(' · ');
      tramos.push([prev, idx, seg.d, seg.t, seg.r, nivel, datos, null]);
    }
  }
  prev = idx; seg = null;
});
cerrar();

if(errores.length){
  console.error(`La transcripción tiene ${errores.length} problemas (no se escribe nada):`);
  errores.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
region.escribir();
