// Utilidades comunes de los generadores de aerovías del Simulador NALA.
//
// Cada generador lee la publicación OFICIAL de un Estado (AIP, eAIP o base de datos del
// servicio de información aeronáutica) y escribe BasesDeDatos/nav/aerovias/<codigo>.json con un
// formato común, que NALA dibuja igual sea cual sea la región:
//
//   puntos:       [ident, lat, lon, clase, nota, país]
//                 clase: N radioayuda · C notificación obligatoria (▲) · R a solicitud (∆)
//                        K fijo de navegación computarizado (CNF) · U el AIP no lo indica
//   rutas:        [designador, subregión, tramos[]]
//   tramo:        [puntoA, puntoB, distNM, derrotaMagA→B, derrotaMagB→A, nivel, datos, obs]
//                 nivel: inf · sup · ambos (el tramo pertenece a las dos estructuras)
//                 datos: texto ya redactado con lo que publica el AIP para el tramo
//                 obs:   índice en observaciones[] o null
//   radioayudas:  [ident, nombre, tipo, frecuencia (texto con unidad), lat, lon, canal,
//                  declinación de la estación (° E+), lugar, estado, nota]
//
// Nada se completa de memoria: si el AIP no publica un dato, queda vacío.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const CARPETA_SALIDA = path.join(AQUI, 'aerovias');

// Coordenadas en los formatos de los AIP:
//   143947.00N · 0920841.00W · 020742S · 0795201W   (GGMMSS[.ss] / GGGMMSS[.ss])
//   19°26'19'' S · 70°36'5'' W                       (grados, minutos y segundos con símbolos)
//   324955S-0684727W                                 (par unido por guion)
export function coordenada(txt){
  const t = String(txt).trim().replace(/[’′´]/g, "'").replace(/[”″"]/g, "''");
  // GGMM[.m] / GGGMM[.m]: grados y minutos, sin segundos (4 cifras la latitud, 5 la longitud).
  let m = t.match(/^(\d+)(?:[.,](\d+))?\s*([NSEW])$/i);
  if(m && m[1].length === (/[NS]/i.test(m[3]) ? 4 : 5)){
    const g = m[1].slice(0, -2), min = parseFloat(m[1].slice(-2) + '.' + (m[2] || '0'));
    const v = +g + min / 60;
    return /[SW]/i.test(m[3]) ? -v : v;
  }
  m = t.match(/^(\d{2,3})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([NSEW])$/i);
  if(m){
    const v = +m[1] + +m[2] / 60 + parseFloat(m[3].replace(',', '.')) / 3600;
    return /[SW]/i.test(m[4]) ? -v : v;
  }
  m = t.match(/^(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:''|")\s*([NSEW])$/i);
  if(m){
    const v = +m[1] + +m[2] / 60 + parseFloat(m[3].replace(',', '.')) / 3600;
    return /[SW]/i.test(m[4]) ? -v : v;
  }
  return null;
}

const R_NM = 3440.065;
const RAD = Math.PI / 180;
export function distanciaNM(lat1, lon1, lat2, lon2){
  const f1 = lat1 * RAD, f2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const s = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) * R_NM;
}

// Rumbo verdadero inicial (ortodrómico) de A hacia B, en grados.
export function rumboInicial(lat1, lon1, lat2, lon2){
  const f1 = lat1 * RAD, f2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// Altitud o nivel publicado -> pies, para clasificar el tramo. «UNL» es ilimitado; lo que no se
// reconoce devuelve null y el tramo se clasifica por su sección del AIP.
export function pies(txt){
  const t = String(txt || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if(!t) return null;
  if(/\bUNL/.test(t)) return Infinity;
  let m = t.match(/\bFL\s*(\d{2,3})\b/);
  if(m) return +m[1] * 100;
  m = t.match(/\b(\d{1,3}(?:[ ,.]\d{3})|\d{3,5})\s*(FT|M)\b/);
  if(m){ const v = +m[1].replace(/[ ,.]/g, ''); return m[2] === 'M' ? Math.round(v / 0.3048) : v; }
  if(/\bGND\b|\bSFC\b/.test(t)) return 0;
  return null;
}

// Nivel de un tramo según sus límites y el límite entre estructuras de la región (en pies):
// es inferior si su límite inferior queda por debajo y superior si su límite superior queda por
// encima. Sin límites legibles, decide la sección del AIP (ENR 3.1 / 3.2) o el prefijo «U».
export function nivelPorLimites(sup, inf, limite, porDefecto){
  const s = pies(sup), i = pies(inf);
  if(s == null || i == null) return porDefecto;
  const esInf = i < limite, esSup = s > limite;
  return esInf && esSup ? 'ambos' : esSup ? 'sup' : esInf ? 'inf' : porDefecto;
}

// Constructor del JSON común: deduplica los puntos (mismo identificador y posición) y las
// observaciones, y deja los tramos listos.
export class Region {
  constructor(meta){
    this.meta = meta;
    this.puntos = []; this.indice = new Map();
    this.rutas = []; this.obs = []; this.indiceObs = new Map();
    this.radioayudas = [];
  }
  punto(id, lat, lon, clase = 'U', nota = '', pais = ''){
    if(lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Punto sin coordenadas: ${id}`);
    const clave = id + '|' + lat.toFixed(3) + '|' + lon.toFixed(3);
    if(this.indice.has(clave)){
      const i = this.indice.get(clave), p = this.puntos[i];
      // Si una ruta publica el punto como obligatorio y otra no, en la ficha se ve «obligatorio en
      // alguna ruta»: la obligación por ruta va en los datos de cada tramo.
      if(clase === 'C' && p[3] !== 'N') p[3] = 'C';
      if(p[3] === 'U' && clase !== 'U') p[3] = clase;
      return i;
    }
    this.puntos.push([id, +lat.toFixed(5), +lon.toFixed(5), clase, nota, pais]);
    this.indice.set(clave, this.puntos.length - 1);
    return this.puntos.length - 1;
  }
  observacion(txt){
    txt = (txt || '').replace(/\s+/g, ' ').trim();
    if(!txt) return null;
    if(!this.indiceObs.has(txt)){ this.obs.push(txt); this.indiceObs.set(txt, this.obs.length - 1); }
    return this.indiceObs.get(txt);
  }
  ruta(designador, subregion, tramos){ if(tramos.length) this.rutas.push([designador, subregion || '', tramos]); }

  // Compara la distancia publicada de cada tramo con la calculada desde las coordenadas. Una
  // diferencia grande delata un punto mal leído o una errata del propio AIP: el generador la
  // informa y quien lo ejecuta decide.
  verificar(tolNM = 1, tolRel = 0.02){
    let n = 0, max = 0; const malos = [];
    this._malos = [];
    for(const [aw, , tramos] of this.rutas) tramos.forEach((t, k) => {
      if(t[2] == null) return;
      const a = this.puntos[t[0]], b = this.puntos[t[1]];
      const c = distanciaNM(a[1], a[2], b[1], b[2]);
      const dif = Math.abs(c - t[2]); n++; max = Math.max(max, dif);
      if(dif > tolNM && dif / Math.max(t[2], 1) > tolRel){
        malos.push(`${aw} ${a[0]}–${b[0]}: publicado ${t[2]} NM, calculado ${c.toFixed(1)} NM`);
        this._malos.push({ aw, tramos, k });
      }
    });
    return { tramosConDistancia: n, maxDifNM: +max.toFixed(1), discrepancias: malos };
  }

  // Qué hacer con un tramo cuya distancia publicada no casa con sus coordenadas:
  //  · lectura de PDF (modo «pdf»): si el número coincide con la distancia de un tramo vecino de
  //    la misma ruta, fue un desplazamiento al leer la tabla: el trazo se conserva sin ese número.
  //    Si no hay explicación, el tramo no se dibuja (mejor un hueco que una línea dudosa).
  //  · datos estructurados (eAIP, NASR): la discrepancia es del propio AIP; el tramo se conserva
  //    y su ficha lo advierte.
  resolverDiscrepancias(modo, tolNM){
    const calc = t => { const a = this.puntos[t[0]], b = this.puntos[t[1]]; return distanciaNM(a[1], a[2], b[1], b[2]); };
    const casa = (d, t) => t && Math.abs(calc(t) - d) <= Math.max(tolNM, d * 0.02);
    const excluir = new Set(), informe = { desplazadas: 0, excluidos: [], anotados: 0 };
    for(const { aw, tramos, k } of this._malos || []){
      const t = tramos[k];
      if(modo === 'pdf'){
        if(casa(t[2], tramos[k - 1]) || casa(t[2], tramos[k + 1])){ t[2] = null; informe.desplazadas++; }
        else { excluir.add(t); informe.excluidos.push(`${aw} ${this.puntos[t[0]][0]}–${this.puntos[t[1]][0]}`); }
      } else {
        const nota = `La distancia publicada (${t[2]} NM) no coincide con la calculada desde las coordenadas publicadas (${calc(t).toFixed(1)} NM).`;
        t[7] = this.observacion(t[7] != null ? this.obs[t[7]] + ' ' + nota : nota);
        informe.anotados++;
      }
    }
    if(excluir.size) this.rutas.forEach(r => { r[2] = r[2].filter(t => !excluir.has(t)); });
    this.rutas = this.rutas.filter(r => r[2].length);
    return informe;
  }

  // Derrotas: la diferencia entre el rumbo verdadero calculado desde las coordenadas y la derrota
  // magnética publicada es la declinación del lugar, que cambia poco en una zona. Una derrota que se
  // aparta más de `umbral` grados de lo habitual en su zona (celdas de 5°×5° y sus vecinas) quedó
  // asignada al tramo equivocado al leer el AIP: se descarta antes que mostrar un rumbo falso.
  depurarDerrotas(umbral = 15){
    const celda = (lat, lon) => Math.floor(lat / 5) + '|' + Math.floor(lon / 5);
    const dif = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
    const muestras = [], porCelda = new Map();
    for(const [aw, , tramos] of this.rutas) for(const t of tramos){
      if(t[3] == null) continue;
      const a = this.puntos[t[0]], b = this.puntos[t[1]];
      if(distanciaNM(a[1], a[2], b[1], b[2]) < 3) continue;
      const verdadero = rumboInicial(a[1], a[2], b[1], b[2]);
      const m = { t, aw, dec: dif(verdadero, t[3]), c: celda((a[1] + b[1]) / 2, (a[2] + b[2]) / 2) };
      muestras.push(m);
      (porCelda.get(m.c) || porCelda.set(m.c, []).get(m.c)).push(m.dec);
    }
    const mediana = v => { const s = v.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    let descartadas = 0;
    for(const m of muestras){
      const [la, lo] = m.c.split('|').map(Number), vec = [];
      for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++) vec.push(...(porCelda.get((la + i) + '|' + (lo + j)) || []));
      if(vec.length < 3) continue;
      const med = mediana(vec);
      // Publicada en sentido contrario al orden de la tabla (p. ej. rutas de sentido único listadas
      // de norte a sur con la derrota hacia el norte): pertenece al tramo B→A.
      if(Math.abs(dif(m.dec + 180, med)) <= umbral){ [m.t[3], m.t[4]] = [m.t[4], m.t[3]]; this.invertidas = (this.invertidas || 0) + 1; continue; }
      if(Math.abs(dif(m.dec, med)) > umbral){
        if(process.env.DEPURAR_DERROTAS && descartadas < 40) console.log(`   derrota descartada ${m.aw} ${this.puntos[m.t[0]][0]}–${this.puntos[m.t[1]][0]}: publicada ${m.t[3]}°, declinación implícita ${m.dec.toFixed(1)}°, zona ${mediana(vec).toFixed(1)}°`);
        m.t[3] = null; m.t[4] = null; descartadas++;
      }
    }
    return descartadas;
  }

  escribir(){
    const descartadas = this.depurarDerrotas();
    if(this.invertidas) console.log(`Derrotas publicadas en sentido B→A (se asignan a ese sentido): ${this.invertidas}`);
    if(descartadas) console.log(`Derrotas descartadas por no casar con la declinación de su zona: ${descartadas}`);
    // Tolerancia mayor donde el AIP redondea las distancias a millas enteras (p. ej. Chile).
    const tol = this.toleranciaNM || 1;
    const previa = this.verificar(tol);
    if(previa.discrepancias.length){
      console.log(`Primera verificación: ${previa.discrepancias.length} discrepancias`);
      previa.discrepancias.forEach(d => console.log('  ⚠ ' + d));
      const inf = this.resolverDiscrepancias(this.modo || 'estructurado', tol);
      if(inf.desplazadas) console.log(`  → ${inf.desplazadas} distancias desplazadas al leer la tabla: se quitan (el trazo se conserva)`);
      if(inf.excluidos.length) console.log(`  → ${inf.excluidos.length} tramos sin explicación, excluidos: ${inf.excluidos.join(', ')}`);
      if(inf.anotados) console.log(`  → ${inf.anotados} tramos conservados con una nota en su ficha (discrepancia del propio AIP)`);
    }
    const verif = this.verificar(tol);
    if(previa.discrepancias.length) verif.discrepanciasResueltas = previa.discrepancias;
    const salida = {
      ...this.meta,
      generado: new Date().toISOString().slice(0, 10),
      aviso: 'Referencia de estudio: no sustituye al AIP vigente del Estado.',
      verificacion: verif,
      puntos: this.puntos, rutas: this.rutas, observaciones: this.obs, radioayudas: this.radioayudas,
    };
    fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
    const archivo = path.join(CARPETA_SALIDA, this.meta.codigo + '.json');
    fs.writeFileSync(archivo, JSON.stringify(salida));
    actualizarIndice();
    const tramos = this.rutas.reduce((s, r) => s + r[2].length, 0);
    console.log(`${this.meta.codigo}.json (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB): ${this.rutas.length} rutas, ${tramos} tramos, ${this.puntos.length} puntos, ${this.radioayudas.length} radioayudas`);
    console.log(`Verificación: ${verif.tramosConDistancia} tramos con distancia publicada, diferencia máxima ${verif.maxDifNM} NM, ${verif.discrepancias.length} discrepancias`);
    verif.discrepancias.forEach(d => console.log('  ⚠ ' + d));
    return salida;
  }
}

// indice.json: la lista de regiones que NALA descarga, con lo que muestra antes de cargarlas.
export function actualizarIndice(){
  const regiones = fs.readdirSync(CARPETA_SALIDA)
    .filter(f => f.endsWith('.json') && f !== 'indice.json')
    .map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(CARPETA_SALIDA, f), 'utf8'));
      return { archivo: f, codigo: j.codigo, region: j.region, fuente: j.fuente, vigencia: j.vigencia };
    })
    .sort((a, b) => a.region.localeCompare(b.region, 'es'));
  fs.writeFileSync(path.join(CARPETA_SALIDA, 'indice.json'), JSON.stringify({ regiones }, null, 1));
}

// Texto plano de un fragmento HTML (entidades básicas incluidas).
export function textoHtml(html){
  return String(html || '')
    .replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

/* ---------- Árbol HTML mínimo ----------
   Suficiente para el XHTML bien formado de los eAIP: etiquetas, atributos id/class y texto.
   Evita depender de un paquete externo para leer tablas anidadas. */
const VACIAS = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr', 'source']);
export function arbolHtml(html){
  const raiz = { tag: '#raiz', attrs: {}, children: [], parent: null };
  let actual = raiz;
  const limpio = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  for(const m of limpio.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g)){
    if(m[5] !== undefined){ actual.children.push({ text: m[5], parent: actual }); continue; }
    const tag = m[2].toLowerCase();
    if(m[1]){
      let n = actual;
      while(n && n.tag !== tag) n = n.parent;
      if(n) actual = n.parent || raiz;
      continue;
    }
    const attrs = {};
    for(const a of m[3].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
    const nodo = { tag, attrs, children: [], parent: actual };
    actual.children.push(nodo);
    if(!m[4] && !VACIAS.has(tag)) actual = nodo;
  }
  return raiz;
}
export function textoNodo(n){
  if(n.text !== undefined) return n.text;
  if(n.tag === 'br') return ' ';
  return n.children.map(textoNodo).join('');
}
export const texto = n => textoHtml(textoNodo(n));
export function descendientes(n, pred, out = []){
  for(const h of n.children || []){ if(h.tag && pred(h)) out.push(h); if(h.children) descendientes(h, pred, out); }
  return out;
}
export const hijos = (n, tag) => (n.children || []).filter(h => h.tag === tag);

export const redondear = v => v == null || !Number.isFinite(v) ? null : Math.round(v) % 360;
