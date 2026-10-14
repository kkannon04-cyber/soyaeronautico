// ============================================================
// EXÁMENES DISEÑADOS — piezas comunes (SoyAeronautico)
//
// Lo cargan panel-profesor.html (editor y vista previa) y
// evaluacion.html (presentar el examen y ver el expediente).
// Requiere notam-codigos.js cargado antes.
//
// Aquí NO se califica nada: la nota la calcula siempre el servidor
// (funciones _ev_* de supabase-schema.sql). Este archivo sólo lee el
// NOTAM para proponerle la clave al profesor y dibuja las preguntas.
//
// Significados de la línea Q tomados del Doc 8126 (6.3.2.3 tipo,
// 6.3.3.6 tráfico, 6.3.3.8 propósito, 6.3.3.9 alcance) y del Doc 8400
// (asunto y condición, vía notam-codigos.js).
// ============================================================

const EV_LISTAS = {
  tipo: [
    { v: 'N', t: 'NOTAM nuevo (contiene información nueva)' },
    { v: 'R', t: 'NOTAM que reemplaza a otro NOTAM' },
    { v: 'C', t: 'NOTAM que cancela otro NOTAM' }
  ],
  trafico: [
    { v: 'I', t: 'Tránsito IFR' },
    { v: 'V', t: 'Tránsito VFR' },
    { v: 'IV', t: 'Tránsito IFR y VFR' },
    { v: 'K', t: 'Lista de verificación de NOTAM' }
  ],
  proposito: [
    { v: 'NBO', t: 'Atención inmediata de las tripulaciones, se incluye en el PIB y concierne a las operaciones de vuelo' },
    { v: 'BO', t: 'De importancia operacional: se incluye en el PIB y concierne a las operaciones de vuelo' },
    { v: 'M', t: 'Misceláneo: no se incluye en el PIB, disponible a solicitud' },
    { v: 'K', t: 'Lista de verificación de NOTAM' }
  ],
  alcance: [
    { v: 'A', t: 'Aeródromo' },
    { v: 'AE', t: 'Aeródromo y en ruta' },
    { v: 'AW', t: 'Aeródromo y aviso para la navegación' },
    { v: 'E', t: 'En ruta' },
    { v: 'W', t: 'Aviso para la navegación' },
    { v: 'K', t: 'Lista de verificación de NOTAM' }
  ]
};

// Opciones de asunto y condición, agrupadas como en el Doc 8400.
function evGruposLista(lista) {
  if (lista === 'asunto' || lista === 'condicion') {
    const fuente = lista === 'asunto' ? NOTAM_CODIGOS.asuntos : NOTAM_CODIGOS.condiciones;
    const esp = lista === 'asunto' ? NOTAM_CODIGOS.especiales.asunto : NOTAM_CODIGOS.especiales.condicion;
    return fuente.map(g => ({ grupo: g.grupo, opciones: g.codigos.map(k => ({ v: k.c, t: k.s })) }))
      .concat([{ grupo: 'Casos especiales', opciones: esp.map(k => ({ v: k.c, t: k.s })) }]);
  }
  return [{ grupo: null, opciones: EV_LISTAS[lista] || [] }];
}

// Las mismas listas como las ve el estudiante: sin pistas del código. Los
// grupos pierden la letra entre paréntesis («… (L)»), las opciones van en
// orden alfabético (el orden del Doc 8400 sigue el código) y los casos
// especiales pierden la referencia «(código QKKKK, Doc 8400, 3.5)».
function evGruposListaEstudiante(lista) {
  const grupos = evGruposLista(lista);
  if (lista !== 'asunto' && lista !== 'condicion') return grupos;
  return grupos.map(g => ({
    grupo: g.grupo ? g.grupo.replace(/\s*\([A-Z]+\)\s*$/, '') : g.grupo,
    opciones: g.opciones
      .map(o => ({ v: o.v, t: o.t.replace(/\s*\((?:código|Doc)[^)]*\)\s*$/, '') }))
      .sort((a, b) => a.t.localeCompare(b.t, 'es'))
  }));
}

function evTextoDeLista(lista, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  for (const g of evGruposLista(lista)) {
    const o = g.opciones.find(x => x.v === valor);
    if (o) return o.t;
  }
  return String(valor);
}

function evEsc(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function evNuevoId(prefijo) {
  const azar = (crypto && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return (prefijo || 'p') + '_' + azar;
}

// Puntaje máximo de una pregunta. En NOTAM es la suma de sus casillas.
function evMaxPregunta(q) {
  if (!q || q.tipo === 'seccion') return 0;
  if (q.tipo === 'notam') return (q.casillas || []).reduce((s, c) => s + (Number(c.puntos) || 0), 0);
  return Number(q.puntos) || 0;
}

function evMaxExamen(contenido) {
  return ((contenido && contenido.preguntas) || []).reduce((s, q) => s + evMaxPregunta(q), 0);
}

// ============================================================
// LECTURA DEL NOTAM
// ============================================================

// AAMMDDhhmm (Doc 8126, 6.3.6.1) → 'AAAA-MM-DDThh:mm'. Devuelve null si no
// es un grupo fecha-hora válido.
function evFechaNotam(grupo) {
  const m = String(grupo || '').match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, aa, mm, dd, hh, mi] = m;
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31 || +hh > 23 || +mi > 59) return null;
  // Los ejemplos clásicos del Doc 8400 son de 1992 (AA = 92).
  return `${+aa > 70 ? '19' : '20'}${aa}-${mm}-${dd}T${hh}:${mi}`;
}

function evFechaLegible(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return valor ? String(valor) : '';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]} UTC`;
}

// Separa el NOTAM en sus partes. Tolera paréntesis de apertura y cierre,
// varias casillas en la misma línea y EST pegado o separado de la fecha.
function evNotamParsear(texto) {
  const avisos = [];
  const limpio = String(texto || '').replace(/\r/g, '').trim().replace(/^\(/, '').replace(/\)\s*$/, '');
  const out = { tipo: null, ref: null, serie: null, numero: null, q: null, items: {}, avisos };
  if (!limpio) { avisos.push('Pega el NOTAM completo.'); return out; }

  const cab = limpio.match(/([A-Z])(\d{4})\/(\d{2})\s+NOTAM([NRC])(?:\s+([A-Z]\d{4}\/\d{2}))?/);
  if (cab) {
    out.serie = cab[1];
    out.numero = `${cab[2]}/${cab[3]}`;
    out.tipo = cab[4];
    out.ref = cab[5] || null;
    if (out.tipo !== 'N' && !out.ref) avisos.push('Es un NOTAMR o NOTAMC pero no encontré el NOTAM al que se refiere.');
  } else {
    avisos.push('No encontré la cabecera (por ejemplo «A0135/20 NOTAMN»).');
  }

  // Marcas de casilla: «Q)», «A)»… al inicio de línea o tras un espacio.
  const marcas = [];
  const re = /(?:^|\s)([QA-G])\)\s*/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    marcas.push({ letra: m[1], inicio: m.index, contenido: m.index + m[0].length });
  }
  marcas.forEach((mk, i) => {
    const fin = i + 1 < marcas.length ? marcas[i + 1].inicio : limpio.length;
    if (out.items[mk.letra] === undefined) out.items[mk.letra] = limpio.slice(mk.contenido, fin).trim();
  });

  if (out.items.Q) {
    const p = out.items.Q.replace(/\s+/g, '').split('/');
    // Límites pegados sin barra («000200»), como en un ejemplo del Doc 8400.
    if (/^\d{6}$/.test(p[5] || '')) p.splice(5, 1, p[5].slice(0, 3), p[5].slice(3));
    const codigo = (p[1] || '').toUpperCase();
    out.q = {
      fir: p[0] || '',
      codigo,
      asunto: /^Q[A-Z]{4}$/.test(codigo) ? codigo.slice(1, 3) : null,
      condicion: /^Q[A-Z]{4}$/.test(codigo) ? codigo.slice(3, 5) : null,
      trafico: p[2] || '',
      proposito: p[3] || '',
      alcance: p[4] || '',
      inferior: p[5] || '',
      superior: p[6] || '',
      coord: null,
      radio: null
    };
    const geo = (p[7] || '').match(/^(\d{4}[NS]\d{5}[EW])(\d{3})?$/);
    if (geo) { out.q.coord = geo[1]; out.q.radio = geo[2] || null; }
    if (!out.q.asunto) avisos.push(`El código «${codigo}» no tiene la forma Q + 4 letras.`);
  } else {
    avisos.push('No encontré la casilla Q).');
  }
  return out;
}

// Coordenadas «5129N00028W» → «51°29'N 000°28'W».
function evCoordLegible(c) {
  const m = String(c || '').match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/);
  return m ? `${m[1]}°${m[2]}'${m[3]} ${m[4]}°${m[5]}'${m[6]}` : String(c || '');
}

// Propone las casillas que el estudiante debe decodificar, con su clave.
// El profesor las revisa, quita las que no quiera y ajusta puntos y claves.
function evNotamCasillas(n) {
  const cas = [];
  const add = (c) => cas.push(Object.assign({ puntos: 1, manual: false, incluir: true }, c));
  const avisos = n.avisos.slice();

  if (n.tipo) add({ id: 'tipo', etiqueta: 'Tipo de NOTAM', entrada: 'opcion', lista: 'tipo', clave: n.tipo });
  if (n.ref) add({ id: 'ref', etiqueta: 'NOTAM que reemplaza o cancela', entrada: 'texto', clave: n.ref, aceptadas: [] });
  if (n.serie) add({ id: 'serie', etiqueta: 'Serie del NOTAM', entrada: 'texto', clave: n.serie, aceptadas: [], incluir: false });

  if (n.q) {
    if (n.q.fir) add({ id: 'fir', etiqueta: 'Q) FIR', entrada: 'texto', clave: n.q.fir, aceptadas: [] });
    if (n.q.asunto) {
      const s = notamSignificadoAsunto(n.q.asunto);
      if (!s) avisos.push(`El asunto «${n.q.asunto}» no está en la tabla del Doc 8400: revísalo.`);
      add({ id: 'asunto', etiqueta: 'Q) Asunto (2.ª y 3.ª letras del código)', entrada: 'opcion', lista: 'asunto', clave: n.q.asunto });
    }
    if (n.q.condicion) {
      const s = notamSignificadoCondicion(n.q.condicion);
      if (!s) avisos.push(`La condición «${n.q.condicion}» no está en la tabla del Doc 8400: revísala.`);
      add({ id: 'condicion', etiqueta: 'Q) Condición (4.ª y 5.ª letras del código)', entrada: 'opcion', lista: 'condicion', clave: n.q.condicion });
    }
    if (n.q.trafico) {
      if (!EV_LISTAS.trafico.some(o => o.v === n.q.trafico)) avisos.push(`Tráfico «${n.q.trafico}» no es I, V, IV ni K (Doc 8126, 6.3.3.6).`);
      add({ id: 'trafico', etiqueta: 'Q) Tráfico', entrada: 'opcion', lista: 'trafico', clave: n.q.trafico });
    }
    if (n.q.proposito) {
      if (!EV_LISTAS.proposito.some(o => o.v === n.q.proposito)) avisos.push(`Propósito «${n.q.proposito}» no es NBO, BO, M ni K (Doc 8126, 6.3.3.8).`);
      add({ id: 'proposito', etiqueta: 'Q) Propósito', entrada: 'opcion', lista: 'proposito', clave: n.q.proposito });
    }
    if (n.q.alcance) {
      if (!EV_LISTAS.alcance.some(o => o.v === n.q.alcance)) avisos.push(`Alcance «${n.q.alcance}» no es A, AE, AW, E, W ni K (Doc 8126, 6.3.3.9).`);
      add({ id: 'alcance', etiqueta: 'Q) Alcance', entrada: 'opcion', lista: 'alcance', clave: n.q.alcance });
    }
    if (/^\d{3}$/.test(n.q.inferior)) add({ id: 'inferior', etiqueta: 'Q) Límite inferior (FL)', entrada: 'numero', clave: n.q.inferior });
    if (/^\d{3}$/.test(n.q.superior)) add({ id: 'superior', etiqueta: 'Q) Límite superior (FL)', entrada: 'numero', clave: n.q.superior });
    if (n.q.coord) add({ id: 'coord', etiqueta: 'Q) Coordenadas', entrada: 'coord', clave: n.q.coord });
    if (n.q.radio) add({ id: 'radio', etiqueta: 'Q) Radio (NM)', entrada: 'numero', clave: n.q.radio });
  }

  const it = n.items;
  if (it.A) add({ id: 'a', etiqueta: 'A) Lugar (indicador OACI)', entrada: 'texto', clave: it.A.split(/\s+/)[0], aceptadas: [] });
  if (it.B) {
    const f = evFechaNotam(it.B.replace(/\s+/g, ''));
    if (!f) avisos.push(`B) «${it.B}» no es un grupo fecha-hora AAMMDDhhmm.`);
    add({ id: 'b', etiqueta: 'B) Comienzo (UTC)', entrada: 'fecha', clave: f || '' });
  }
  if (it.C) {
    const crudo = it.C.replace(/\s+/g, '').toUpperCase();
    if (crudo === 'PERM') {
      add({ id: 'c', etiqueta: 'C) Fin (UTC)', entrada: 'fecha_fin', clave: { perm: true, fecha: '', est: false } });
    } else {
      const mm = crudo.match(/^(\d{10})(EST)?$/);
      const f = mm ? evFechaNotam(mm[1]) : null;
      if (!f) avisos.push(`C) «${it.C}» no es un grupo fecha-hora, EST ni PERM.`);
      add({ id: 'c', etiqueta: 'C) Fin (UTC)', entrada: 'fecha_fin', clave: { perm: false, fecha: f || '', est: !!(mm && mm[2]) } });
    }
  }
  if (it.D) add({ id: 'd', etiqueta: 'D) Horario', entrada: 'libre', clave: it.D, manual: true });
  if (it.E) add({ id: 'e', etiqueta: 'E) Texto en lenguaje claro', entrada: 'libre', clave: it.E, manual: true, puntos: 2 });
  if (it.F) add({ id: 'f', etiqueta: 'F) Límite inferior', entrada: 'libre', clave: it.F, manual: true });
  if (it.G) add({ id: 'g', etiqueta: 'G) Límite superior', entrada: 'libre', clave: it.G, manual: true });

  return { casillas: cas, avisos };
}

// Clave de una casilla en palabras, para el profesor y para la revisión.
function evClaveLegible(c, clave) {
  const k = clave === undefined ? c.clave : clave;
  if (k === null || k === undefined || k === '') return '—';
  switch (c.entrada) {
    case 'opcion': return evTextoDeLista(c.lista, k);
    case 'fecha': return evFechaLegible(k);
    case 'fecha_fin':
      if (!k || typeof k !== 'object') return String(k);
      if (k.perm) return 'PERM — permanente';
      return evFechaLegible(k.fecha) + (k.est ? ' (estimada, EST)' : '');
    case 'coord': return evCoordLegible(k);
    case 'numero': return String(k);
    default: return String(k);
  }
}

// ============================================================
// DIBUJO DE PREGUNTAS PARA EL ESTUDIANTE
// ============================================================

// Devuelve un elemento con la pregunta lista para responder. `valor` es lo
// que ya había respondido (borrador); `alCambiar(nuevoValor)` se llama en
// cada cambio. Con soloLectura las entradas quedan deshabilitadas.
function evRenderPregunta(q, numero, total, valor, alCambiar, soloLectura) {
  const card = document.createElement('div');

  if (q.tipo === 'seccion') {
    card.className = 'ev-seccion';
    card.innerHTML = `<h2>${evEsc(q.titulo || 'Sección')}</h2>${q.texto ? `<p>${evEsc(q.texto)}</p>` : ''}`;
    return card;
  }

  card.className = 'question-card ev-pregunta';
  card.dataset.pregunta = q.id;
  const max = evMaxPregunta(q);
  const etiquetaTipo = { opcion: q.multiple ? 'Selección múltiple' : 'Opción múltiple', corta: 'Respuesta corta', abierta: 'Respuesta abierta', notam: 'Decodificar NOTAM' }[q.tipo] || '';
  card.innerHTML = `
    <div class="q-header">
      <span class="q-num">${numero} / ${total}</span>
      <span class="ev-tipo">${etiquetaTipo}</span>
      <span class="ev-puntos">${max} pt${max === 1 ? '' : 's'}</span>
    </div>
    ${q.enunciado ? `<div class="q-text">${evEsc(q.enunciado)}</div>` : ''}
    ${q.contexto ? `<pre class="ev-contexto">${evEsc(q.contexto)}</pre>` : ''}
    <div class="ev-cuerpo"></div>`;
  const cuerpo = card.querySelector('.ev-cuerpo');
  const deshab = soloLectura ? 'disabled' : '';

  if (q.tipo === 'opcion') {
    const elegidas = new Set(Array.isArray(valor) ? valor : []);
    if (q.multiple) cuerpo.insertAdjacentHTML('beforeend', '<p class="ev-ayuda">Marca todas las opciones correctas.</p>');
    const opciones = document.createElement('div');
    opciones.className = 'options';
    (q.opciones || []).forEach((texto, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn' + (elegidas.has(i) ? ' elegida' : '');
      btn.setAttribute('aria-pressed', String(elegidas.has(i)));
      btn.textContent = texto;
      btn.disabled = !!soloLectura;
      btn.addEventListener('click', () => {
        if (q.multiple) { elegidas.has(i) ? elegidas.delete(i) : elegidas.add(i); }
        else { elegidas.clear(); elegidas.add(i); }
        opciones.querySelectorAll('.opt-btn').forEach((b, j) => {
          b.classList.toggle('elegida', elegidas.has(j));
          b.setAttribute('aria-pressed', String(elegidas.has(j)));
        });
        alCambiar(Array.from(elegidas).sort((a, b) => a - b));
      });
      opciones.appendChild(btn);
    });
    cuerpo.appendChild(opciones);
  }

  if (q.tipo === 'corta') {
    cuerpo.innerHTML = `<input type="text" class="ev-input" maxlength="300" placeholder="Tu respuesta" value="${evEsc(valor || '')}" ${deshab} aria-label="Respuesta a la pregunta ${numero}">`;
    cuerpo.querySelector('input').addEventListener('input', e => alCambiar(e.target.value));
  }

  if (q.tipo === 'abierta') {
    const limite = Number(q.limite_palabras) || 0;
    cuerpo.innerHTML = `
      <textarea class="ev-input ev-area" rows="6" maxlength="8000" placeholder="Escribe tu respuesta" ${deshab} aria-label="Respuesta a la pregunta ${numero}">${evEsc(valor || '')}</textarea>
      <div class="ev-contador"></div>`;
    const area = cuerpo.querySelector('textarea');
    const cont = cuerpo.querySelector('.ev-contador');
    const contar = () => {
      const n = (area.value.trim().match(/\S+/g) || []).length;
      cont.textContent = limite ? `${n} / ${limite} palabras` : `${n} palabra${n === 1 ? '' : 's'}`;
      cont.classList.toggle('excedido', limite > 0 && n > limite);
    };
    contar();
    area.addEventListener('input', () => { contar(); alCambiar(area.value); });
  }

  if (q.tipo === 'notam') {
    const resp = Object.assign({}, valor && typeof valor === 'object' ? valor : {});
    cuerpo.innerHTML = `
      <pre class="ev-notam">${evEsc(q.notam || '')}</pre>
      <p class="ev-ayuda">Decodifica cada parte del NOTAM. Las fechas y horas van en UTC.</p>
      <div class="ev-casillas"></div>`;
    const grid = cuerpo.querySelector('.ev-casillas');
    (q.casillas || []).forEach(c => {
      const fila = document.createElement('div');
      fila.className = 'ev-casilla' + (c.entrada === 'libre' ? ' ancha' : '');
      const idCampo = `ev-${q.id}-${c.id}`;
      const v = resp[c.id];
      let control = '';
      // En las listas el valor de cada opción es un número sin significado:
      // el código (que delataría la respuesta al inspeccionar la página) sólo
      // se recupera aquí, al elegir.
      const codigos = [];
      if (c.entrada === 'opcion') {
        control = `<select id="${idCampo}" class="ev-input" ${deshab}><option value="">— Elige —</option>${
          evGruposListaEstudiante(c.lista).map(g => {
            const ops = g.opciones.map(o => `<option value="${codigos.push(o.v) - 1}" ${v === o.v ? 'selected' : ''}>${evEsc(o.t)}</option>`).join('');
            return g.grupo ? `<optgroup label="${evEsc(g.grupo)}">${ops}</optgroup>` : ops;
          }).join('')}</select>`;
      } else if (c.entrada === 'fecha') {
        control = `<input type="datetime-local" id="${idCampo}" class="ev-input" value="${evEsc(v || '')}" ${deshab}>`;
      } else if (c.entrada === 'fecha_fin') {
        const ff = v && typeof v === 'object' ? v : { perm: false, fecha: '', est: false };
        control = `
          <div class="ev-fin" id="${idCampo}">
            <label class="ev-check"><input type="checkbox" data-perm ${ff.perm ? 'checked' : ''} ${deshab}> Permanente (PERM)</label>
            <input type="datetime-local" class="ev-input" data-fecha value="${evEsc(ff.fecha || '')}" ${ff.perm || soloLectura ? 'disabled' : ''}>
            <label class="ev-check"><input type="checkbox" data-est ${ff.est ? 'checked' : ''} ${ff.perm || soloLectura ? 'disabled' : ''}> Hora estimada (EST)</label>
          </div>`;
      } else if (c.entrada === 'libre') {
        control = `<textarea id="${idCampo}" class="ev-input" rows="3" maxlength="2000" ${deshab}>${evEsc(v || '')}</textarea>`;
      } else {
        const modo = c.entrada === 'numero' ? 'inputmode="numeric"' : '';
        control = `<input type="text" id="${idCampo}" class="ev-input" maxlength="120" ${modo} value="${evEsc(v || '')}" ${deshab} autocomplete="off">`;
      }
      fila.innerHTML = `<label for="${idCampo}">${evEsc(c.etiqueta)} <span class="ev-pts">${Number(c.puntos) || 0} pt</span></label>${control}`;
      grid.appendChild(fila);

      if (soloLectura) return;
      if (c.entrada === 'fecha_fin') {
        const caja = fila.querySelector('.ev-fin');
        const leer = () => {
          const perm = caja.querySelector('[data-perm]').checked;
          caja.querySelector('[data-fecha]').disabled = perm;
          caja.querySelector('[data-est]').disabled = perm;
          resp[c.id] = { perm, fecha: perm ? '' : caja.querySelector('[data-fecha]').value, est: perm ? false : caja.querySelector('[data-est]').checked };
          alCambiar(Object.assign({}, resp));
        };
        caja.querySelectorAll('input').forEach(i => i.addEventListener('input', leer));
        caja.querySelectorAll('input[type="checkbox"]').forEach(i => i.addEventListener('change', leer));
      } else {
        const campo = fila.querySelector('#' + CSS.escape(idCampo));
        const ev = c.entrada === 'opcion' ? 'change' : 'input';
        campo.addEventListener(ev, () => {
          resp[c.id] = c.entrada === 'opcion' ? (campo.value === '' ? '' : codigos[+campo.value]) : campo.value;
          alCambiar(Object.assign({}, resp));
        });
      }
    });
  }

  return card;
}

// ¿La respuesta a esta pregunta está completa? (Para el contador de
// «respondidas»; no se impide entregar con casillas en blanco.)
function evRespondida(q, valor) {
  if (q.tipo === 'seccion') return true;
  if (q.tipo === 'opcion') return Array.isArray(valor) && valor.length > 0;
  if (q.tipo === 'notam') {
    if (!valor || typeof valor !== 'object') return false;
    return (q.casillas || []).every(c => {
      const v = valor[c.id];
      if (c.entrada === 'fecha_fin') return v && (v.perm || v.fecha);
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
  }
  return typeof valor === 'string' && valor.trim() !== '';
}

// Respuesta de una casilla en palabras (revisión y expediente).
function evRespuestaCasillaLegible(c, v) {
  if (v === undefined || v === null || v === '') return '<span class="ev-vacio">Sin responder</span>';
  if (c.entrada === 'fecha_fin' && typeof v === 'object' && !v.perm && !v.fecha) return '<span class="ev-vacio">Sin responder</span>';
  return evEsc(evClaveLegible(c, v));
}

function evPuntosTexto(p) {
  if (p === null || p === undefined) return '—';
  const n = Number(p);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Revisión de una pregunta ya entregada. `cal` es el resultado del servidor
// para esa pregunta (puede faltar si las notas no se han liberado) y
// `conClave` decide si se muestra la respuesta correcta.
function evRenderRevision(q, numero, total, valor, cal, conClave) {
  const card = document.createElement('div');
  if (q.tipo === 'seccion') {
    card.className = 'ev-seccion';
    card.innerHTML = `<h2>${evEsc(q.titulo || 'Sección')}</h2>${q.texto ? `<p>${evEsc(q.texto)}</p>` : ''}`;
    return card;
  }
  const c = cal || null;
  const pendiente = c && (c.puntos === null || c.puntos === undefined || (c.pendientes || 0) > 0);
  const estado = !c ? '' : c.anulada === 'excluir' ? 'anulada' : pendiente ? 'pendiente' : (Number(c.puntos) >= Number(c.max) && Number(c.max) > 0) ? 'correct' : Number(c.puntos) > 0 ? 'parcial' : 'wrong';
  card.className = 'question-card ev-pregunta ' + estado;
  const max = c ? Number(c.max) : evMaxPregunta(q);

  let insignia = '';
  if (c) {
    if (c.anulada === 'excluir') insignia = '<span class="ev-insignia anulada">Pregunta anulada (no cuenta)</span>';
    else if (c.anulada === 'completo') insignia = `<span class="ev-insignia ok">Anulada: puntaje completo · ${evPuntosTexto(c.puntos)} / ${evPuntosTexto(max)}</span>`;
    else if (pendiente) insignia = `<span class="ev-insignia pendiente">Por calificar${c.puntos !== null && c.puntos !== undefined ? ' · ' + evPuntosTexto(c.puntos) + ' / ' + evPuntosTexto(max) + ' hasta ahora' : ''}</span>`;
    else insignia = `<span class="ev-insignia ${estado === 'correct' ? 'ok' : estado === 'parcial' ? 'parcial' : 'mal'}">${evPuntosTexto(c.puntos)} / ${evPuntosTexto(max)} pts</span>`;
  }

  card.innerHTML = `
    <div class="q-header">
      <span class="q-num">${numero} / ${total}</span>
      ${insignia}
    </div>
    ${q.enunciado ? `<div class="q-text">${evEsc(q.enunciado)}</div>` : ''}
    ${q.contexto ? `<pre class="ev-contexto">${evEsc(q.contexto)}</pre>` : ''}
    <div class="ev-cuerpo"></div>
    ${c && c.comentario ? `<div class="ev-comentario"><b>Comentario del profesor:</b> ${evEsc(c.comentario)}</div>` : ''}`;
  const cuerpo = card.querySelector('.ev-cuerpo');

  if (q.tipo === 'opcion') {
    const elegidas = new Set(Array.isArray(valor) ? valor : []);
    const correctas = new Set(conClave && Array.isArray(q.correctas) ? q.correctas : []);
    cuerpo.innerHTML = `<div class="options">${(q.opciones || []).map((t, i) => {
      let cls = 'opt-btn';
      if (elegidas.has(i)) cls += conClave ? (correctas.has(i) ? ' selected-correct' : ' selected-wrong') : ' elegida';
      else if (correctas.has(i)) cls += ' reveal-correct';
      const marca = elegidas.has(i) ? ' <span class="ev-marca">← tu respuesta</span>' : (correctas.has(i) ? ' <span class="ev-marca">← correcta</span>' : '');
      return `<div class="${cls}">${evEsc(t)}${marca}</div>`;
    }).join('')}</div>${elegidas.size === 0 ? '<p class="ev-vacio">No respondiste esta pregunta.</p>' : ''}`;
  }

  if (q.tipo === 'corta' || q.tipo === 'abierta') {
    const texto = typeof valor === 'string' && valor.trim() ? evEsc(valor) : '<span class="ev-vacio">Sin responder</span>';
    let clave = '';
    if (conClave && q.tipo === 'corta' && Array.isArray(q.aceptadas) && q.aceptadas.length) {
      clave = `<div class="ev-clave"><b>Respuestas aceptadas:</b> ${q.aceptadas.map(evEsc).join(' · ')}</div>`;
    }
    if (conClave && q.tipo === 'abierta') {
      if (q.modelo) clave += `<div class="ev-clave"><b>Respuesta modelo:</b> <span style="white-space:pre-wrap;">${evEsc(q.modelo)}</span></div>`;
      if (Array.isArray(q.criterios) && q.criterios.length) {
        clave += `<div class="ev-clave"><b>Criterios de calificación:</b><ul>${q.criterios.map(k => `<li>${evEsc(k.texto)} — ${evPuntosTexto(k.puntos)} pt</li>`).join('')}</ul></div>`;
      }
    }
    cuerpo.innerHTML = `<div class="ev-respuesta">${texto}</div>${clave}`;
  }

  if (q.tipo === 'notam') {
    const resp = valor && typeof valor === 'object' ? valor : {};
    const casCal = (c && c.casillas) || {};
    cuerpo.innerHTML = `
      <pre class="ev-notam">${evEsc(q.notam || '')}</pre>
      <div class="ev-tabla-scroll"><table class="ev-tabla">
        <thead><tr><th>Casilla</th><th>Tu respuesta</th>${conClave ? '<th>Clave</th>' : ''}<th>Puntos</th></tr></thead>
        <tbody>${(q.casillas || []).map(k => {
          const kc = casCal[k.id] || null;
          const pts = !kc ? '—' : (kc.puntos === null || kc.puntos === undefined) ? '<span class="ev-insignia pendiente">Por calificar</span>'
            : `<span class="ev-insignia ${Number(kc.puntos) >= Number(kc.max) && Number(kc.max) > 0 ? 'ok' : Number(kc.puntos) > 0 ? 'parcial' : 'mal'}">${evPuntosTexto(kc.puntos)} / ${evPuntosTexto(kc.max)}</span>`;
          return `<tr>
            <td>${evEsc(k.etiqueta)}</td>
            <td class="ev-celda-resp">${evRespuestaCasillaLegible(k, resp[k.id])}</td>
            ${conClave ? `<td class="ev-celda-clave">${evEsc(evClaveLegible(k))}${Array.isArray(k.aceptadas) && k.aceptadas.length ? `<br><small>También: ${k.aceptadas.map(evEsc).join(' · ')}</small>` : ''}</td>` : ''}
            <td>${pts}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  return card;
}
