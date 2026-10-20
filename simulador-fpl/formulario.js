// Pinta un plan sobre el escaneo del formulario GSAN-2.2-12-04 de Aerocivil, como lo llenaría el piloto a mano.
// Las posiciones están en píxeles de la imagen (1278 × 1653) y se convierten a porcentajes.
const ANCHO = 1278;
const ALTO = 1653;
export const IMAGEN = 'img/formulario-gsan.jpg';

// [x, y, ancho, alto] de cada casilla sobre la imagen.
const C = {
  destinatarios: [[352, 226, 828, 24], [352, 255, 828, 24], [352, 283, 732, 24]],
  deposito: [150, 334, 174, 25], remitente: [372, 334, 232, 25],
  c7: [439, 459, 200, 24], c8reglas: [791, 458, 27, 25], c8tipo: [1079, 458, 30, 25],
  c9num: [176, 533, 50, 22], c9tipo: [277, 533, 116, 22], c9estela: [435, 531, 26, 23],
  c10a: [614, 531, 256, 22], c10b: [882, 531, 226, 22],
  c13ad: [266, 598, 114, 22], c13hora: [538, 598, 115, 22],
  c15vel: [182, 663, 137, 23], c15nivel: [358, 663, 143, 23],
  ruta: [[537, 663, 644, 22], [150, 689, 1031, 21], [150, 713, 1031, 21], [150, 737, 1031, 20], [150, 759, 952, 18]],
  c16ad: [262, 834, 114, 22], c16eet: [519, 834, 114, 22], c16altn: [753, 834, 114, 22], c16altn2: [978, 834, 114, 22],
  c18: [[180, 892, 1001, 23], [150, 919, 1031, 21], [150, 943, 1031, 21], [150, 966, 1031, 19], [150, 987, 925, 18]],
  E: [233, 1120, 116, 22], P: [502, 1109, 79, 22],
  R: { U: [913, 1115, 36, 36], V: [1006, 1115, 36, 36], E: [1089, 1115, 36, 36] },
  S: { S: [228, 1207, 36, 36], P: [320, 1207, 36, 36], D: [409, 1207, 36, 36], M: [494, 1207, 36, 36], J: [583, 1207, 36, 36] },
  J: { J: [765, 1203, 36, 36], L: [851, 1205, 36, 36], F: [937, 1205, 36, 36], U: [1021, 1205, 36, 36], V: [1112, 1205, 36, 36] },
  D: { D: [176, 1288, 36, 36], num: [233, 1294, 56, 20], cap: [339, 1294, 117, 20], C: [494, 1288, 34, 36], color: [585, 1294, 235, 20] },
  A: [234, 1346, 947, 21], N: [183, 1390, 36, 36], obs: [234, 1395, 795, 21], C19: [234, 1447, 525, 21],
  presentado: [152, 1508, 214, 66], dia: [735, 1549, 82, 25], mes: [820, 1549, 109, 25], anio: [932, 1549, 85, 25], licencia: [1024, 1528, 156, 46],
};

const pct = ([x, y, w, h]) => `left:${(x / ANCHO) * 100}%;top:${(y / ALTO) * 100}%;width:${(w / ANCHO) * 100}%;height:${(h / ALTO) * 100}%`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function campo(caja, texto, clase = '') {
  return `<span class="fc ${clase}" style="${pct(caja)}">${esc(texto)}</span>`;
}
const tachon = (caja) => `<span class="fc-tachon" style="${pct(caja)}" aria-hidden="true"></span>`;

// Reparte el texto por palabras en los renglones disponibles (ancho en píxeles de la imagen).
export function partirEnRenglones(texto, renglones, anchoLetra = 13.2) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const salida = renglones.map(() => '');
  let r = 0;
  for (const p of palabras) {
    while (r < renglones.length) {
      const cap = Math.floor(renglones[r][2] / anchoLetra);
      const prueba = salida[r] ? `${salida[r]} ${p}` : p;
      if (prueba.length <= cap || !salida[r]) { salida[r] = prueba; break; }
      r++;
    }
    if (r >= renglones.length) return null;
  }
  return salida;
}

function renglones(cajas, texto) {
  for (const ancho of [13.2, 12, 11, 10.4]) {
    const lineas = partirEnRenglones(texto, cajas, ancho);
    if (lineas) return { lineas, escala: 13.2 / ancho };
  }
  return { lineas: partirEnRenglones(texto, cajas, 9.5) || [texto], escala: 1.39 };
}

export function pintarFormulario(plan, contenedor) {
  const c = plan.c;
  const x = c.c19;
  const partes = [];
  const dest = renglones(C.destinatarios, (c.destinatarios || []).join(' '));
  dest.lineas.forEach((l, i) => partes.push(campo(C.destinatarios[i], l, 'izq')));
  partes.push(campo(C.deposito, c.deposito, 'separado'), campo(C.remitente, c.remitente, 'separado'));
  partes.push(campo(C.c7, c.c7, 'separado'), campo(C.c8reglas, c.c8reglas), campo(C.c8tipo, c.c8tipo));
  partes.push(campo(C.c9num, c.c9num), campo(C.c9tipo, c.c9tipo, 'separado'), campo(C.c9estela, c.c9estela));
  partes.push(campo(C.c10a, c.c10a, 'izq'), campo(C.c10b, c.c10b, 'izq'));
  partes.push(campo(C.c13ad, c.c13ad, 'separado'), campo(C.c13hora, c.c13hora, 'separado'));
  partes.push(campo(C.c15vel, c.c15vel, 'separado'), campo(C.c15nivel, c.c15nivel, 'separado'));
  const ruta = renglones(C.ruta, c.c15ruta);
  ruta.lineas.forEach((l, i) => partes.push(campo(C.ruta[i], l, `izq${ruta.escala > 1 ? ' apretado' : ''}`)));
  partes.push(campo(C.c16ad, c.c16ad, 'separado'), campo(C.c16eet, c.c16eet, 'separado'), campo(C.c16altn, c.c16altn, 'separado'), campo(C.c16altn2, c.c16altn2, 'separado'));
  const c18 = renglones(C.c18, c.c18);
  c18.lineas.forEach((l, i) => partes.push(campo(C.c18[i], l, `izq${c18.escala > 1 ? ' apretado' : ''}`)));
  // Casilla 19: lo que el piloto no lleva se tacha.
  partes.push(campo(C.E, `${x.E.slice(0, 2)}  ${x.E.slice(2)}`, 'separado'), campo(C.P, x.P, 'separado'));
  for (const k of ['U', 'V', 'E']) if (!x.R?.[k]) partes.push(tachon(C.R[k]));
  if (!x.S) for (const k of ['S', 'P', 'D', 'M', 'J']) partes.push(tachon(C.S[k]));
  else for (const k of ['P', 'D', 'M', 'J']) if (!x.S[k]) partes.push(tachon(C.S[k]));
  if (!x.J) for (const k of ['J', 'L', 'F', 'U', 'V']) partes.push(tachon(C.J[k]));
  else for (const k of ['L', 'F', 'U', 'V']) if (!x.J[k]) partes.push(tachon(C.J[k]));
  if (!x.D) { partes.push(tachon(C.D.D), tachon(C.D.C)); } else {
    partes.push(campo(C.D.num, String(x.D.num).padStart(2, '0'), 'separado'), campo(C.D.cap, String(x.D.cap).padStart(3, '0'), 'separado'), campo(C.D.color, x.D.color, 'izq'));
    if (!x.D.cubierta) partes.push(tachon(C.D.C));
  }
  partes.push(campo(C.A, x.A, 'izq'));
  if (x.N) partes.push(campo(C.obs, x.N, 'izq')); else partes.push(tachon(C.N));
  partes.push(campo(C.C19, x.C, 'izq'));
  partes.push(`<span class="fc izq multilinea" style="${pct(C.presentado)}">${esc(c.presentadoPor)}</span>`);
  partes.push(campo(C.dia, c.fecha?.d), campo(C.mes, c.fecha?.m), campo(C.anio, c.fecha?.a));
  partes.push(`<span class="fc multilinea" style="${pct(C.licencia)}">${esc(c.licencia)}</span>`);
  contenedor.classList.add('formulario');
  contenedor.innerHTML = `<img class="formulario-fondo" src="${IMAGEN}" alt="Plan de vuelo ${esc(c.c7)} en el formulario GSAN-2.2-12-04" draggable="false">${partes.join('')}`;
  return contenedor;
}
