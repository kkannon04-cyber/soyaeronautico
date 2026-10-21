// netlify/functions/notam-colombia.js
// NOTAM vigentes de Colombia, leídos de las listas que publica Aerocivil:
// https://aerobarranquilla.aerocivil.gov.co/publicaciones/3708/listas-de-verificacion-y-listas-de-notam-validos/
//
// Aerocivil solo las publica en PDF (Oracle Reports) y su servidor no deja que
// el navegador las pida directamente (CORS), así que esta función las descarga,
// lee el texto con sus coordenadas y devuelve los NOTAM ya separados por
// casillas. Sin dependencias: el PDF se lee con un intérprete mínimo de abajo.
//
// Fuentes (una por serie, con respaldo):
//   A  -> Alfa2.pdf    (ordenado por aeródromo; en inglés)   respaldo Alfa1.pdf
//   B  -> Bravo2.pdf                                          respaldo Bravo1.pdf
//   C/D-> Charlie2.pdf (ordenado por aeródromo)              respaldo Charlie1.pdf
// Los enlaces de descarga (idHash) cambian cuando Aerocivil vuelve a subir un
// archivo: si uno ya no sirve, se toman los vigentes de la página de la
// publicación y se reintenta.
//
// La lista NO trae la casilla Q) ni la FIR de cada NOTAM; no se inventan.
//
// ── Caché (para no gastar créditos de Netlify ni cargar a Aerocivil) ───────
// Aerocivil regenera los PDF más o menos cada 10 minutos, así que:
// 1) Cache-Control de 10 min + stale-while-revalidate: la CDN de Netlify
//    sirve la respuesta sin volver a invocar la función.
// 2) Caché en memoria mientras el contenedor siga caliente.
// 3) Si Aerocivil falla, se sirve la última copia buena con "desactualizado".

const zlib = require('zlib');

const BASE = 'https://aerobarranquilla.aerocivil.gov.co';
const PAGINA = BASE + '/publicaciones/3708/listas-de-verificacion-y-listas-de-notam-validos/';
const DESCARGA = BASE + '/loader.php?lServicio=Tools2&lTipo=descargas&lFuncion=descargar&idHash=';

const FUENTES = [
  { serie: 'A', archivos: ['Alfa2.pdf', 'Alfa1.pdf'] },
  { serie: 'B', archivos: ['Bravo2.pdf', 'Bravo1.pdf'] },
  { serie: 'C', archivos: ['Charlie2.pdf', 'Charlie1.pdf'] }
];

// Últimos enlaces conocidos (2026-10-21), por si la página no responde.
const HASH_RESPALDO = {
  'Alfa2.pdf': '2rR4XTCYCuE2uPRU7FvPzzpSZVVzeFdZPQ',
  'Alfa1.pdf': 'fSR6PYr1cN89slR_sH6ykzp3L3pDUE1vPQ',
  'Bravo2.pdf': 'qzvpjMJIQe5OL76NFJG2zzpaajE1V2tBPQ',
  'Bravo1.pdf': 'mh7vf6UEQ8xkR7aTkpaVOTpmUDJVdWxNPQ',
  'Charlie2.pdf': '767vC5l2JxHww4rrDiW_JTovTlJJbWRnPQ',
  'Charlie1.pdf': 'DiiZpvUOE7KFJQqusWDjTzpUekhIL3d3PQ'
};

// Lugares que la lista corta antes del indicador OACI. Códigos tomados del
// AIP Colombia (AD 1.3, eAIP AMDT 73/26).
const LUGARES_RECORTADOS = [
  { prefijo: 'SAN JOSE DEL GUAVIAR', icao: 'SKSJ' },
  { prefijo: 'SAN SEBASTIAN DE MAR', icao: 'SKQU' }
];
const FIR_SIN_CODIGO = { 'FIR/UIR BOGOTA': 'SKED', 'FIR/UIR BARRANQUILLA': 'SKEC' };

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 7000;
let cache = { data: null, expira: 0 };
let hashesConocidos = { ...HASH_RESPALDO };

// ═══════════════════════ Lectura mínima de PDF ═══════════════════════════
// Solo lo que usan los reportes de Oracle (Developer 2000): objetos sueltos,
// árbol de páginas y flujos de contenido con BT/TD/Tf/Tj.

const CP1252 = { 0x80:'€',0x82:'‚',0x83:'ƒ',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x88:'ˆ',0x89:'‰',0x8A:'Š',0x8B:'‹',0x8C:'Œ',0x8E:'Ž',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x98:'˜',0x99:'™',0x9A:'š',0x9B:'›',0x9C:'œ',0x9E:'ž',0x9F:'Ÿ' };
const decodificar = bytes => bytes.map(b => CP1252[b] || String.fromCharCode(b)).join('');

function leerObjetos(buf){
  const s = buf.toString('latin1');
  const mapa = new Map();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while((m = re.exec(s))){
    const ini = m.index + m[0].length;
    const fin = s.indexOf('endobj', ini);
    if(fin < 0) break;
    mapa.set(+m[1], { ini, fin });
    re.lastIndex = fin;
  }
  return { s, mapa, buf };
}

function cuerpo(doc, n){
  const o = doc.mapa.get(n);
  return o ? doc.s.slice(o.ini, o.fin) : '';
}

function flujo(doc, n){
  const o = doc.mapa.get(n);
  if(!o) return '';
  const txt = doc.s.slice(o.ini, o.fin);
  const k = txt.indexOf('stream');
  if(k < 0) return '';
  let a = o.ini + k + 6;
  if(doc.s[a] === '\r') a++;
  if(doc.s[a] === '\n') a++;
  const b = doc.s.lastIndexOf('endstream', o.fin);
  let datos = doc.buf.subarray(a, b);
  if(/\/FlateDecode/.test(txt.slice(0, k))){
    try{ datos = zlib.inflateSync(datos); }
    catch(e){ datos = zlib.inflateRawSync(datos.subarray(2)); }
  }
  return datos.toString('latin1');
}

function referencias(doc, txt){
  // "[1 0 R 2 0 R]" directo, o "4 0 R" que apunta a un array
  const ref = /^\s*(\d+)\s+0\s+R\s*$/.exec(txt);
  if(ref) return referencias(doc, cuerpo(doc, +ref[1]));
  return [...txt.matchAll(/(\d+)\s+0\s+R/g)].map(x => +x[1]);
}

function paginas(doc){
  const trailer = doc.s.slice(doc.s.lastIndexOf('trailer'));
  const raiz = /\/Root\s+(\d+)\s+0\s+R/.exec(trailer);
  const catalogo = cuerpo(doc, raiz ? +raiz[1] : 2);
  const arbol = /\/Pages\s+(\d+)\s+0\s+R/.exec(catalogo);
  const out = [];
  const visitar = (n, prof) => {
    if(prof > 20) return;
    const t = cuerpo(doc, n);
    if(/\/Type\s*\/Pages\b/.test(t)){
      const kids = /\/Kids\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(t);
      if(kids) referencias(doc, kids[1]).forEach(k => visitar(k, prof + 1));
    }else if(/\/Type\s*\/Page\b/.test(t)){
      out.push(n);
    }
  };
  visitar(arbol ? +arbol[1] : 3, 0);
  return out;
}

function* tokens(c){
  const n = c.length;
  let i = 0;
  while(i < n){
    const ch = c[i];
    if(ch === ' ' || ch === '\r' || ch === '\n' || ch === '\t' || ch === '\f'){ i++; continue; }
    if(ch === '%'){ while(i < n && c[i] !== '\n' && c[i] !== '\r') i++; continue; }
    if(ch === '('){
      let prof = 1, j = i + 1;
      const bytes = [];
      while(j < n && prof > 0){
        const d = c[j];
        if(d === '\\'){
          const e = c[j + 1];
          const esc = { n:10, r:13, t:9, b:8, f:12, '(':40, ')':41, '\\':92 };
          if(e in esc){ bytes.push(esc[e]); j += 2; continue; }
          if(e >= '0' && e <= '7'){
            let oct = '', k = j + 1;
            while(k < j + 4 && c[k] >= '0' && c[k] <= '7') oct += c[k++];
            bytes.push(parseInt(oct, 8) & 255); j = k; continue;
          }
          if(e === '\r' || e === '\n'){ j += 2; if(e === '\r' && c[j] === '\n') j++; continue; }
          bytes.push(e.charCodeAt(0)); j += 2; continue;
        }
        if(d === '(') prof++;
        if(d === ')'){ prof--; if(prof === 0) break; }
        bytes.push(d.charCodeAt(0)); j++;
      }
      yield { t:'str', v:decodificar(bytes) };
      i = j + 1; continue;
    }
    if(ch === '<' && c[i + 1] !== '<'){
      const j = c.indexOf('>', i);
      const hex = c.slice(i + 1, j).replace(/\s+/g, '');
      const bytes = [];
      for(let k = 0; k < hex.length; k += 2) bytes.push(parseInt((hex.slice(k, k + 2) + '0').slice(0, 2), 16));
      yield { t:'str', v:decodificar(bytes) };
      i = j + 1; continue;
    }
    if(ch === '[' || ch === ']'){ yield { t:ch }; i++; continue; }
    if(ch === '<' || ch === '>'){ i += 2; continue; }
    let j = i + 1;
    while(j < n && !/[\s()\[\]<>%\/]/.test(c[j])) j++;
    const pal = c.slice(i, j);
    if(ch === '/') yield { t:'name', v:pal.slice(1) };
    else if(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(pal)) yield { t:'num', v:parseFloat(pal) };
    else yield { t:'op', v:pal };
    i = j;
  }
}

const mult = (a, b) => [
  a[0]*b[0] + a[1]*b[2], a[0]*b[1] + a[1]*b[3],
  a[2]*b[0] + a[3]*b[2], a[2]*b[1] + a[3]*b[3],
  a[4]*b[0] + a[5]*b[2] + b[4], a[4]*b[1] + a[5]*b[3] + b[5]
];

function textoDePagina(contenido, pagina){
  const items = [];
  const pila = [];
  let ctm = [1,0,0,1,0,0], tm = [1,0,0,1,0,0], tlm = [1,0,0,1,0,0];
  let tamano = 10, interlineado = 0, args = [];
  const emitir = str => {
    if(!str) return;
    const m = mult(tm, ctm);
    if(str.trim()) items.push({ p:pagina, x:m[4], y:m[5], s:tamano, t:str });
    // avance aproximado: estas fuentes son casi monoespaciadas
    tm = mult([1,0,0,1, str.length * tamano * 0.6, 0], tm);
  };
  const nuevaLinea = (tx, ty) => { tlm = mult([1,0,0,1,tx,ty], tlm); tm = tlm.slice(); };
  const cadena = () => (args.find(a => a.t === 'str') || {}).v;
  for(const tk of tokens(contenido)){
    if(tk.t !== 'op'){ args.push(tk); continue; }
    const nums = args.filter(a => a.t === 'num').map(a => a.v);
    switch(tk.v){
      case 'q': pila.push(ctm.slice()); break;
      case 'Q': ctm = pila.pop() || [1,0,0,1,0,0]; break;
      case 'cm': if(nums.length === 6) ctm = mult(nums, ctm); break;
      case 'BT': tm = [1,0,0,1,0,0]; tlm = [1,0,0,1,0,0]; break;
      case 'Tf': if(nums.length) tamano = nums[nums.length - 1]; break;
      case 'TL': if(nums.length) interlineado = nums[0]; break;
      case 'Td': nuevaLinea(nums[0] || 0, nums[1] || 0); break;
      case 'TD': interlineado = -(nums[1] || 0); nuevaLinea(nums[0] || 0, nums[1] || 0); break;
      case 'Tm': if(nums.length === 6){ tlm = nums.slice(); tm = nums.slice(); } break;
      case 'T*': nuevaLinea(0, -interlineado); break;
      case 'Tj': emitir(cadena()); break;
      case "'": case '"': nuevaLinea(0, -interlineado); emitir(cadena()); break;
      case 'TJ': {
        let acum = '';
        for(const a of args){
          if(a.t === 'str') acum += a.v;
          else if(a.t === 'num' && a.v < -200) acum += ' ';
        }
        emitir(acum);
        break;
      }
    }
    args = [];
  }
  return items;
}

function extraerTexto(buf){
  const doc = leerObjetos(buf);
  const items = [];
  paginas(doc).forEach((n, idx) => {
    const cont = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(cuerpo(doc, n));
    if(!cont) return;
    let refs = [...cont[1].matchAll(/(\d+)\s+0\s+R/g)].map(x => +x[1]);
    if(refs.length === 1 && !/stream/.test(cuerpo(doc, refs[0]))) refs = referencias(doc, cuerpo(doc, refs[0]));
    const contenido = refs.map(r => flujo(doc, r)).join('\n');
    items.push(...textoDePagina(contenido, idx + 1));
  });
  return items;
}

// ═══════════════════════ De texto a NOTAM ════════════════════════════════

// Agrupa los fragmentos en renglones (misma página y casi la misma altura).
function renglones(items){
  const orden = items.slice().sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  const out = [];
  for(const it of orden){
    const ult = out[out.length - 1];
    if(ult && ult.p === it.p && Math.abs(ult.y - it.y) < 3) ult.items.push(it);
    else out.push({ p:it.p, y:it.y, items:[it] });
  }
  out.forEach(r => r.items.sort((a, b) => a.x - b.x));
  return out;
}

// Sello de generación del pie ("261021 1757" = AAMMDD hhmm, hora de Colombia).
function selloGeneracion(items){
  for(const it of items){
    const m = /^\s*(\d{2})(\d{2})(\d{2})\s+(\d{2})(\d{2})\s*$/.exec(it.t);
    if(m && it.s <= 7){
      const utc = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4] + 5, +m[5]);
      return new Date(utc).toISOString();
    }
  }
  return null;
}

function esPieOEncabezado(it, renglon){
  if(it.s <= 7) return true;                              // sello y "DIRECCION DE INFORMATICA"
  if(/^pag\.?$/i.test(it.t.trim())) return true;
  if(/^\d{1,3}$/.test(it.t.trim())){
    if(it.y > 740) return true;                           // número de página arriba
    if(renglon.items.some(o => /^pag\.?$/i.test(o.t.trim()))) return true;
  }
  return false;
}

// Encabezado de cada NOTAM. Dos diseños:
//   letra + número + año  ("C 3276/ 26", listas C/D)
//   número + fecha        ("0717  250402", listas A y B)
function anclaDe(renglon, serieArchivo){
  const its = renglon.items;
  const izq = its.filter(i => i.x < 130);
  const letra = izq.find(i => /^[A-D]$/.test(i.t.trim()) && i.x < 75);
  const num = izq.find(i => /^\d{4}$/.test(i.t.trim()) && i.x < 90);
  if(!num) return null;
  if(letra){
    const anio = izq.find(i => /^\d{2}$/.test(i.t.trim()) && i.x > num.x);
    if(!anio) return null;
    return { serie:letra.t.trim(), num:num.t.trim(), anio:anio.t.trim(), fecha:null, limite:anio.x };
  }
  const fecha = izq.find(i => /^\d{6}$/.test(i.t.trim()) && i.x > num.x);
  if(!fecha) return null;
  return { serie:serieArchivo, num:num.t.trim(), anio:fecha.t.trim().slice(0, 2), fecha:fecha.t.trim(), limite:fecha.x };
}

const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function lugarDe(texto){
  const t = texto.trim().replace(/\s+/g, ' ');
  const m = /^(.*?)\s*\(([A-Z]{4})\)$/.exec(t);
  if(m) return { lugar:m[1], icao:m[2] };
  const fir = FIR_SIN_CODIGO[quitarTildes(t).toUpperCase()];
  if(fir) return { lugar:t, icao:fir };
  const base = t.replace(/\s*\([A-Z]{0,3}$/, '');
  // Con el código recortado, a veces el nombre ya lo trae: "SANTIAGO DE CALI/SKCL - ..."
  const enNombre = /\/(S[KQ][A-Z]{2})\b/.exec(base);
  if(enNombre) return { lugar:base, icao:enNombre[1] };
  const norm = quitarTildes(base).toUpperCase();
  const r = LUGARES_RECORTADOS.find(l => norm.startsWith(l.prefijo));
  return { lugar:base, icao:r ? r.icao : null };
}

const FG_FRAGMENTO = /^(GND|SFC|UNL|FL\s?\d{2,3}|\d{1,6}(FT|F|M)?|A|AM|AMS|AMSL|AGL|T|T A|T AM|T AMSL|FT|FT A|FT AM|FT AMSL)$/;
const FG_INICIO = /^(GND|SFC|FL\s?\d{2,3}|\d{2,6}FT?)$/;

function construirNotam(bloque){
  const { ancla, lineas, textoX } = bloque;
  const derecha = textoX + 25;
  const ref = { tipo:'NOTAMN', ref:null };
  const columna = [];
  const sueltos = [];   // fragmentos a la derecha que no son referencia (casilla G)

  for(const ln of lineas){
    const unido = ln.items.map(i => i.t.trim()).join(' ').replace(/\s+/g, ' ');
    const m = /RPLC\s+(?:NOTAM\s+)?N?\s*([A-D])\s*\/?\s*(\d{4})\s*\/\s*(\d{2})/.exec(unido) ||
              /NOTAM\s+([A-D])\s*(\d{4})\s*\/\s*(\d{2})/.exec(unido);
    const enDerecha = ln.items.filter(i => i.x >= derecha);
    if(m && enDerecha.length && enDerecha[0].x === ln.items[0].x){
      ref.tipo = 'NOTAMR';
      ref.ref = `${m[1]}${m[2]}/${m[3]}`;
      continue;
    }
    const izq = ln.items.filter(i => i.x < derecha);
    const der = enDerecha.filter(i => !/^IS RPLC$/.test(i.t.trim()));
    if(enDerecha.some(i => /^IS RPLC$/.test(i.t.trim()))) ref.tipo = 'NOTAMR';
    if(izq.length) columna.push({ y:ln.y, p:ln.p, x:izq[0].x, t:izq.map(i => i.t).join(' ') });
    if(der.length) sueltos.push({ y:ln.y, p:ln.p, t:der.map(i => i.t.trim()).join(' ') });
  }

  // Renglón 0: lugar (si no es una continuación de página)
  let i = 0;
  let lugar = { lugar:'', icao:null };
  if(columna.length && !/^\s*\d{10}/.test(columna[0].t) && bloque.conLugar){
    lugar = lugarDe(columna[0].t);
    i = 1;
  }

  // Vigencia: B) C) EST/PERM y horario D)
  let b = null, c = null, est = false, d = '';
  if(columna[i] && /^\s*\d{10}/.test(columna[i].t)){
    const xVig = columna[i].x;
    const partes = [columna[i].t];
    let j = i + 1;
    const xTexto = columna.slice(j).map(l => l.x).sort((p, q) => p - q)[0];
    const terminaVig = t => /\s,\s*$/.test(t) || /^\s*,\s*$/.test(t);
    if(!terminaVig(columna[i].t)){
      // El horario puede seguir en otros renglones hasta una coma suelta.
      const hayComa = columna.slice(j, j + 8).findIndex(l => /^\s*,\s*$/.test(l.t));
      const distinto = Math.abs(xVig - (xTexto ?? xVig)) >= 0.15;
      if(hayComa >= 0){
        for(let k = 0; k <= hayComa; k++) partes.push(columna[j + k].t);
        j += hayComa + 1;
      }else if(distinto){
        while(columna[j] && Math.abs(columna[j].x - xVig) < 0.1) partes.push(columna[j++].t);
      }
    }
    const v = partes.join(' ').replace(/\s+/g, ' ').trim();
    const mv = /^(\d{10})\s*\/?\s*(\d{10}|PERM)?\s*(EST)?\s*(.*)$/.exec(v);
    if(mv){
      b = mv[1];
      c = mv[2] || null;
      est = !!mv[3];
      d = mv[4].replace(/[\s,]+$/, '').replace(/^[\s,]+/, '').trim();
    }
    i = j;
  }

  // Casillas F) y G): renglones finales separados por un hueco, con alturas.
  let resto = columna.slice(i);
  let f = '', g = '';
  let corte = resto.length;
  while(corte > 0 && FG_FRAGMENTO.test(resto[corte - 1].t.trim())) corte--;
  if(corte < resto.length && FG_INICIO.test(resto[corte].t.trim())){
    const previo = resto[corte - 1];
    const hueco = previo && previo.p === resto[corte].p ? previo.y - resto[corte].y : 99;
    if(hueco > 18){
      f = resto.slice(corte).map(l => l.t.trim()).join(' ');
      resto = resto.slice(0, corte);
    }
  }
  if(f || sueltos.length){
    g = sueltos.filter(s => FG_FRAGMENTO.test(s.t.replace(/\s+/g, ' ')) || /^\d{1,6}F?T?$/.test(s.t))
      .map(s => s.t).join(' ');
  }
  const pegar = s => s.replace(/(\d)F T\b/g, '$1FT').replace(/\s+/g, ' ').trim();
  f = pegar(f); g = pegar(g);
  // Lo que quedó a la derecha y no es casilla G se devuelve al texto.
  const sobrantes = (f || g) ? [] : sueltos;

  const lineasE = resto.map(l => l.t.replace(/\s+$/, ''));
  sobrantes.forEach(s => lineasE.push(s.t));
  while(lineasE.length && !lineasE[0].trim()) lineasE.shift();
  if(lineasE.length) lineasE[0] = lineasE[0].replace(/^\s+/, '');
  const e = lineasE.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    id: `${ancla.serie}${ancla.num}/${ancla.anio}`,
    serie: ancla.serie,
    tipo: ref.tipo,
    ref: ref.ref,
    lugar: lugar.lugar,
    icao: lugar.icao,
    b, c, est, d, e, f, g
  };
}

function notamsDePdf(buf, serieArchivo){
  const items = extraerTexto(buf);
  const generado = selloGeneracion(items);
  const filas = renglones(items);
  const bloques = [];
  let actual = null;
  let vistaPagina = 0;
  for(const r of filas){
    r.items = r.items.filter(it => !esPieOEncabezado(it, r));
    if(!r.items.length) continue;
    const ancla = anclaDe(r, serieArchivo);
    if(ancla){
      const id = `${ancla.serie}${ancla.num}/${ancla.anio}`;
      const resto = r.items.filter(it => it.x > ancla.limite + 5);
      if(actual && actual.id === id){
        // El NOTAM sigue en otra página y la lista repite su número.
        if(resto.length) actual.lineas.push({ p:r.p, y:r.y, items:resto });
      }else{
        actual = { id, ancla, lineas:[], textoX: resto.length ? resto[0].x : 180, conLugar: resto.length > 0 };
        if(resto.length) actual.lineas.push({ p:r.p, y:r.y, items:resto });
        bloques.push(actual);
      }
      vistaPagina = r.p;
      continue;
    }
    if(!actual) continue;                    // encabezado de la primera página
    if(r.p !== vistaPagina && r.y > 740) continue;
    actual.lineas.push(r);
  }
  return { generado, notams: bloques.map(construirNotam) };
}

// ═══════════════════════ Descarga ════════════════════════════════════════
// Netlify corta la función a los 10 s: todo se hace dentro de un presupuesto.
// Aerocivil responde 429 si se le pide mucho seguido; en ese caso no se insiste.

async function traer(url, limite){
  const ms = Math.min(TIMEOUT_MS, limite - Date.now());
  if(ms < 800) throw Object.assign(new Error('sin tiempo'), { motivo:'tiempo' });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try{
    const r = await fetch(url, { signal:ctl.signal, headers:{ 'User-Agent':'Mozilla/5.0 (SoyAeronautico.com; NOTAM educativo)' } });
    if(r.status === 429) throw Object.assign(new Error('HTTP 429'), { motivo:'ocupado' });
    if(!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { motivo:'http' });
    return Buffer.from(await r.arrayBuffer());
  }finally{
    clearTimeout(t);
  }
}

// Los enlaces vigentes salen de la página de la publicación.
async function actualizarEnlaces(limite){
  try{
    const html = (await traer(PAGINA, limite)).toString('latin1');
    const re = /idHash=([A-Za-z0-9_-]+)"[^>]*>\s*<strong class="nombre">([^<]+)<\/strong>/g;
    let m, n = 0;
    while((m = re.exec(html))){ hashesConocidos[m[2].trim()] = m[1]; n++; }
    return n > 0;
  }catch(e){
    return false;
  }
}

async function leerSerie(fuente, limite){
  let motivo = 'enlace';
  for(const archivo of fuente.archivos){
    const hash = hashesConocidos[archivo];
    if(!hash) continue;
    try{
      const buf = await traer(DESCARGA + hash, limite);
      // Con un enlace vencido Aerocivil responde una página "el archivo no existe".
      if(buf.subarray(0, 5).toString('latin1') !== '%PDF-'){ motivo = 'enlace'; continue; }
      const { generado, notams } = notamsDePdf(buf, fuente.serie);
      if(!notams.length){ motivo = 'vacio'; continue; }
      return { serie:fuente.serie, archivo, generado, notams };
    }catch(e){
      motivo = e.motivo || 'red';
      if(motivo === 'ocupado' || motivo === 'tiempo') break;
    }
  }
  return { serie:fuente.serie, archivo:null, generado:null, notams:[], motivo, error:'No se pudo leer la lista de Aerocivil' };
}

async function construirRespuesta(){
  const limite = Date.now() + 8500;
  let series = await Promise.all(FUENTES.map(f => leerSerie(f, limite)));
  // Si algún enlace venció, se toman los nuevos de la página y se reintenta.
  if(series.some(s => s.motivo === 'enlace') && limite - Date.now() > 2500 && await actualizarEnlaces(limite)){
    series = await Promise.all(series.map((s, i) => s.motivo === 'enlace' ? leerSerie(FUENTES[i], limite) : s));
  }
  const notams = series.flatMap(s => s.notams);
  if(!notams.length) throw new Error('Sin NOTAM legibles');
  return {
    fuente: PAGINA,
    consultado: new Date().toISOString(),
    listas: series.map(s => ({ serie: s.serie === 'C' ? 'C/D' : s.serie, archivo:s.archivo, generado:s.generado, total:s.notams.length, error:s.error || null })),
    notams
  };
}

let enCurso = null;   // si llegan varias visitas a la vez, una sola descarga

exports.handler = async () => {
  const HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    // La CDN de Netlify reutiliza la respuesta 10 min (el ciclo de Aerocivil);
    // "durable" la comparte entre todos sus servidores.
    'Cache-Control': 'public, max-age=300',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=600, stale-while-revalidate=1800'
  };
  const SIN_CACHE = { 'Cache-Control':'no-store', 'Netlify-CDN-Cache-Control':'no-store' };
  if(cache.data && cache.expira > Date.now()){
    return { statusCode:200, headers:HEADERS, body:cache.data };
  }
  try{
    enCurso = enCurso || construirRespuesta().finally(() => { enCurso = null; });
    const data = await enCurso;
    const body = JSON.stringify(data);
    // Una lista incompleta (una serie falló) se guarda menos tiempo.
    const completa = data.listas.every(l => !l.error);
    cache = { data:body, expira:Date.now() + (completa ? TTL_MS : 2 * 60 * 1000) };
    return { statusCode:200, headers: completa ? HEADERS : { ...HEADERS, 'Cache-Control':'public, max-age=60', 'Netlify-CDN-Cache-Control':'public, s-maxage=120' }, body };
  }catch(e){
    if(cache.data){
      const viejo = JSON.parse(cache.data);
      viejo.desactualizado = true;
      return { statusCode:200, headers:{ ...HEADERS, 'Cache-Control':'public, max-age=60', 'Netlify-CDN-Cache-Control':'public, s-maxage=60' }, body:JSON.stringify(viejo) };
    }
    return {
      statusCode:502,
      headers:{ ...HEADERS, ...SIN_CACHE },
      body:JSON.stringify({ error:'No se pudo consultar la lista de NOTAM de Aerocivil en este momento.' })
    };
  }
};

// Para pruebas locales
exports._interno = { extraerTexto, notamsDePdf };
