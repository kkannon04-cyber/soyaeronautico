// ============================================================
// PANEL DEL PROFESOR — sección «Mis exámenes» (SoyAeronautico)
//
// El profesor diseña exámenes fuera de los grupos (borrador con
// autoguardado), los publica en un grupo a la vez, califica las
// respuestas abiertas pregunta por pregunta y libera las notas a mano.
//
// Lo carga sólo panel-profesor.html. Usa de esa página: estado.grupos,
// estado.banco, aviso(), esc(), fechaCorta() y mostrarSeccion(); y de
// progreso.js obtenerClienteAuth() / obtenerSesionActual(). Las piezas
// comunes (lector de NOTAM, dibujo de preguntas) están en
// evaluaciones-comun.js.
//
// Todo lo que cambia notas pasa por funciones del servidor
// (supabase-schema.sql, bloque «EXÁMENES DISEÑADOS»), que dejan
// constancia en historial_examen.
// ============================================================

const ex = {
  examenes: [],
  publicaciones: [],
  versiones: [],
  conteos: {},            // publicacion_id → { entregas, pendientes }
  vista: 'lista',          // lista | editor | publicacion
  verEliminados: false,
  editando: null,          // examen en edición (copia local)
  guardadoTimer: null,
  guardando: false,
  sucio: false,
  ultimoGuardado: null,
  previa: false,
  pubActual: null,
  pubPestana: 'resultados',
  pubDatos: null,          // { version, entregas, estudiantes, historial }
  calPregunta: null,
  calSoloPendientes: true,
  calAnonimo: false,
  cargado: false
};

const EX_TIPOS = {
  opcion: 'Opción múltiple',
  corta: 'Respuesta corta',
  abierta: 'Respuesta abierta',
  notam: 'Decodificar NOTAM',
  seccion: 'Sección'
};

// Lo llama el arranque de panel-profesor.html. Al entrar a la sección
// desde la barra lateral se vuelve a la lista (salvo que se esté editando:
// el editor se queda donde estaba).
function exIniciar() {
  const nav = document.querySelector('.nav-item[data-seccion="examenes"]');
  if (nav) nav.addEventListener('click', async () => {
    if (ex.vista === 'editor') return;
    await exCargar();
    exPintarLista();
  });
  exCargar();
}

// ============================================================
// DATOS
// ============================================================
async function exCargar() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return;
  const cli = obtenerClienteAuth();
  const [rEx, rPub, rVer, rEnt] = await Promise.all([
    cli.from('examenes').select('id, titulo, descripcion, contenido, estado, eliminado_en, creado_en, actualizado_en').order('actualizado_en', { ascending: false }),
    cli.from('publicaciones').select('id, examen_id, version_id, grupo_id, grupo_nombre, titulo, abre_en, cierra_en, intentos_max, barajar, estado, ajustes, liberada_en, retirada_en, creado_en').is('retirada_en', null).order('creado_en', { ascending: false }),
    cli.from('examen_versiones').select('id, examen_id, numero, creado_en, puntaje_total').order('numero', { ascending: true }),
    cli.from('entregas_examen').select('publicacion_id, pendientes')
  ]);
  const err = rEx.error || rPub.error || rVer.error || rEnt.error;
  if (err) {
    document.getElementById('exRaiz').innerHTML = `<div class="vacio">No se pudieron cargar los exámenes: ${esc(err.message)}</div>`;
    return;
  }
  ex.examenes = rEx.data || [];
  ex.publicaciones = rPub.data || [];
  ex.versiones = rVer.data || [];
  ex.conteos = {};
  (rEnt.data || []).forEach(e => {
    const c = ex.conteos[e.publicacion_id] || { entregas: 0, pendientes: 0 };
    c.entregas++;
    c.pendientes += e.pendientes || 0;
    ex.conteos[e.publicacion_id] = c;
  });
  ex.cargado = true;
  exActualizarContadorNav();
  if (ex.vista === 'lista') exPintarLista();
}

function exActualizarContadorNav() {
  const n = ex.publicaciones.filter(p => p.estado !== 'liberada' && (ex.conteos[p.id] || {}).pendientes > 0).length;
  const el = document.getElementById('navExamenesContador');
  if (!el) return;
  el.textContent = String(n);
  el.style.display = n ? '' : 'none';
}

async function exRpc(nombre, args) {
  const { data, error } = await obtenerClienteAuth().rpc(nombre, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function exGuardarAhora() {
  if (!ex.editando || ex.guardando) return;
  clearTimeout(ex.guardadoTimer);
  ex.guardando = true;
  exPintarEstadoGuardado('Guardando…');
  const e = ex.editando;
  const { error } = await obtenerClienteAuth().from('examenes').update({
    titulo: (e.titulo || '').trim() || 'Examen sin título',
    descripcion: (e.descripcion || '').trim() || null,
    contenido: exContenidoParaGuardar(e.contenido),
    estado: e.estado,
    actualizado_en: new Date().toISOString()
  }).eq('id', e.id);
  ex.guardando = false;
  if (error) { exPintarEstadoGuardado('No se pudo guardar: ' + error.message, true); return false; }
  ex.sucio = false;
  ex.ultimoGuardado = new Date();
  exPintarEstadoGuardado();
  return true;
}

// Lo que se guarda: en NOTAM sólo las casillas incluidas van en
// `casillas` (son las que califica el servidor); las demás se conservan
// aparte para poder volver a incluirlas.
function exContenidoParaGuardar(contenido) {
  return {
    preguntas: (contenido.preguntas || []).map(q => {
      if (q.tipo === 'opcion') return Object.assign({}, q, { multiple: (q.correctas || []).length > 1 });
      if (q.tipo !== 'notam') return q;
      const todas = (q.casillas || []).concat(q.casillas_excluidas || []);
      // Los avisos del análisis son sólo para el editor: no se guardan.
      const { _avisos, ...resto } = q;
      return Object.assign({}, resto, {
        casillas: todas.filter(c => c.incluir !== false),
        casillas_excluidas: todas.filter(c => c.incluir === false)
      });
    })
  };
}

function exProgramarGuardado() {
  ex.sucio = true;
  exPintarEstadoGuardado('Cambios sin guardar…');
  clearTimeout(ex.guardadoTimer);
  ex.guardadoTimer = setTimeout(exGuardarAhora, 1200);
}

window.addEventListener('beforeunload', (e) => {
  if (ex.sucio) { exGuardarAhora(); e.preventDefault(); e.returnValue = ''; }
});

// ============================================================
// ESTADOS Y RÓTULOS
// ============================================================
function exEstadoPublicacion(p) {
  const c = ex.conteos[p.id] || { entregas: 0, pendientes: 0 };
  if (p.estado === 'liberada') return { clase: 'publicada', texto: 'Notas liberadas' };
  const vencida = p.cierra_en && new Date(p.cierra_en) <= new Date();
  if (p.estado === 'cerrada' || vencida) {
    return c.pendientes > 0 ? { clase: 'borrador', texto: `En calificación · ${c.pendientes} por calificar` }
                            : { clase: 'borrador', texto: 'Cerrada · lista para liberar' };
  }
  if (p.abre_en && new Date(p.abre_en) > new Date()) return { clase: 'ex-futura', texto: 'Programada' };
  return { clase: 'ex-abierta', texto: c.pendientes > 0 ? `Abierta · ${c.pendientes} por calificar` : 'Abierta' };
}

function exNumeroVersion(versionId) {
  const v = ex.versiones.find(x => x.id === versionId);
  return v ? v.numero : '?';
}

function exResumenContenido(contenido) {
  const preg = ((contenido && contenido.preguntas) || []).filter(q => q.tipo !== 'seccion');
  const pts = evMaxExamen(contenido);
  return `${preg.length} pregunta${preg.length === 1 ? '' : 's'} · ${evPuntosTexto(pts)} pts`;
}

// ============================================================
// VISTA: LISTA DE EXÁMENES
// ============================================================
function exPintarLista() {
  ex.vista = 'lista';
  const raiz = document.getElementById('exRaiz');
  if (!raiz) return;
  if (!ex.cargado) { raiz.innerHTML = '<div class="vacio">Cargando tus exámenes…</div>'; return; }

  const activos = ex.examenes.filter(e => !e.eliminado_en);
  const eliminados = ex.examenes.filter(e => e.eliminado_en);
  const lista = ex.verEliminados ? eliminados : activos;

  const porCalificar = ex.publicaciones.filter(p => p.estado !== 'liberada' && (ex.conteos[p.id] || {}).pendientes > 0);

  raiz.innerHTML = `
    <div class="seccion-head seccion-head-fila">
      <div>
        <h2>Mis exámenes</h2>
        <p>Diseña el examen una vez, con preguntas de opción múltiple, respuesta corta, abiertas o de decodificar NOTAM. Luego publícalo en el grupo que quieras: cada publicación tiene sus propias fechas, entregas y notas, que tus estudiantes ven sólo cuando tú las liberas.</p>
      </div>
      <button class="btn btn-primario" type="button" id="exNuevo">+ Nuevo examen</button>
    </div>

    ${porCalificar.length ? `
    <div class="panel-card ex-alerta">
      <h3>Por calificar</h3>
      <p class="card-sub">Publicaciones con respuestas abiertas o casillas de NOTAM esperando tu calificación.</p>
      ${porCalificar.map(p => `
        <div class="venc-item">
          <div><h5>${esc(p.titulo)}</h5><p>${esc(p.grupo_nombre)} · ${(ex.conteos[p.id] || {}).pendientes} respuesta${(ex.conteos[p.id] || {}).pendientes === 1 ? '' : 's'} pendiente${(ex.conteos[p.id] || {}).pendientes === 1 ? '' : 's'}</p></div>
          <button class="btn btn-secundario btn-mini" type="button" data-abrir-pub="${esc(p.id)}" data-pestana="calificar">Calificar</button>
        </div>`).join('')}
    </div>` : ''}

    <div class="ex-filtros">
      <button class="chip ${!ex.verEliminados ? 'active' : ''}" type="button" data-ver="activos">Mis exámenes (${activos.length})</button>
      <button class="chip ${ex.verEliminados ? 'active' : ''}" type="button" data-ver="eliminados">Eliminados (${eliminados.length})</button>
    </div>

    <div id="exLista">
      ${lista.length === 0
        ? `<div class="vacio">${ex.verEliminados
            ? 'No has eliminado ningún examen publicado.'
            : 'Todavía no tienes exámenes. Crea el primero con «+ Nuevo examen»: se guarda solo mientras lo armas.'}</div>`
        : lista.map(exTarjetaExamen).join('')}
    </div>

    ${ex.verEliminados && eliminados.length ? '<p class="ex-nota">Un examen nunca se borra de verdad: aquí siguen sus publicaciones, entregas e historial, en modo de sólo lectura, por si hay un reclamo. Puedes restaurarlo para volver a editarlo.</p>' : ''}`;

  raiz.querySelector('#exNuevo').addEventListener('click', exNuevo);
  raiz.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
    ex.verEliminados = b.dataset.ver === 'eliminados';
    exPintarLista();
  }));
  raiz.querySelectorAll('[data-abrir-pub]').forEach(b => b.addEventListener('click', () => exAbrirPublicacion(b.dataset.abrirPub, b.dataset.pestana)));
  raiz.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => exAbrirEditor(b.dataset.editar)));
  raiz.querySelectorAll('[data-publicar]').forEach(b => b.addEventListener('click', () => exAbrirEditor(b.dataset.publicar, true)));
  raiz.querySelectorAll('[data-duplicar]').forEach(b => b.addEventListener('click', () => exDuplicar(b.dataset.duplicar)));
  raiz.querySelectorAll('[data-eliminar]').forEach(b => b.addEventListener('click', () => exEliminar(b.dataset.eliminar)));
  raiz.querySelectorAll('[data-restaurar]').forEach(b => b.addEventListener('click', () => exRestaurar(b.dataset.restaurar)));
}

function exTarjetaExamen(e) {
  const pubs = ex.publicaciones.filter(p => p.examen_id === e.id);
  const vers = ex.versiones.filter(v => v.examen_id === e.id);
  const ultima = vers[vers.length - 1];
  const estadoBadge = e.eliminado_en
    ? '<span class="badge-estado borrador">Eliminado</span>'
    : pubs.length ? '<span class="badge-estado publicada">Publicado</span>'
    : e.estado === 'listo' ? '<span class="badge-estado publicada">Listo</span>'
    : '<span class="badge-estado borrador">Borrador</span>';

  return `
    <div class="item-lista ex-examen">
      <div class="item-top">
        <div style="flex:1;min-width:240px;">
          ${estadoBadge}
          <h4 style="margin-top:8px;">${esc(e.titulo)}</h4>
          <p>${exResumenContenido(e.contenido)}${ultima ? ` · última versión publicada: v${ultima.numero} (${fechaCorta(ultima.creado_en)})` : ' · nunca publicado'} · editado el ${fechaCorta(e.actualizado_en)}</p>
        </div>
        <div class="acciones" style="align-items:flex-start;">
          ${e.eliminado_en
            ? `<button class="btn btn-secundario btn-mini" type="button" data-restaurar="${esc(e.id)}">Restaurar</button>`
            : `<button class="btn btn-primario btn-mini" type="button" data-publicar="${esc(e.id)}">Publicar en un grupo</button>
               <button class="btn btn-secundario btn-mini" type="button" data-editar="${esc(e.id)}">Editar</button>
               <button class="btn btn-secundario btn-mini" type="button" data-duplicar="${esc(e.id)}">Duplicar</button>
               <button class="btn btn-peligro btn-mini" type="button" data-eliminar="${esc(e.id)}">Eliminar</button>`}
        </div>
      </div>
      ${pubs.length ? `
      <div class="ex-pubs">
        <div class="sub-titulo">PUBLICACIONES (${pubs.length})</div>
        ${pubs.map(p => {
          const est = exEstadoPublicacion(p);
          const c = ex.conteos[p.id] || { entregas: 0 };
          return `
          <div class="ex-pub-fila">
            <div>
              <strong>${esc(p.grupo_nombre)}</strong>${p.grupo_id ? '' : ' <span class="ex-tenue">(grupo eliminado)</span>'}
              <span class="badge-estado ${est.clase}">${esc(est.texto)}</span>
              <div class="ex-tenue">v${exNumeroVersion(p.version_id)} · ${c.entregas} entrega${c.entregas === 1 ? '' : 's'} · publicada el ${fechaCorta(p.creado_en)}${p.cierra_en ? ' · cierra el ' + fechaCorta(p.cierra_en) : ''}</div>
            </div>
            <button class="btn btn-secundario btn-mini" type="button" data-abrir-pub="${esc(p.id)}">Abrir</button>
          </div>`;
        }).join('')}
      </div>` : ''}
    </div>`;
}

async function exNuevo() {
  const sesion = await obtenerSesionActual();
  if (!sesion) { aviso('Necesitas iniciar sesión.', 'error'); return; }
  const { data, error } = await obtenerClienteAuth().from('examenes')
    .insert({ profesor_id: sesion.user.id, titulo: 'Examen sin título', contenido: { preguntas: [] } })
    .select('id, titulo, descripcion, contenido, estado, eliminado_en, creado_en, actualizado_en').single();
  if (error) { aviso(error.message, 'error'); return; }
  ex.examenes.unshift(data);
  exAbrirEditor(data.id);
}

async function exDuplicar(id) {
  const e = ex.examenes.find(x => x.id === id);
  const sesion = await obtenerSesionActual();
  if (!e || !sesion) return;
  const { data, error } = await obtenerClienteAuth().from('examenes')
    .insert({ profesor_id: sesion.user.id, titulo: e.titulo + ' (copia)', descripcion: e.descripcion, contenido: e.contenido })
    .select('id, titulo, descripcion, contenido, estado, eliminado_en, creado_en, actualizado_en').single();
  if (error) { aviso(error.message, 'error'); return; }
  ex.examenes.unshift(data);
  aviso('Examen duplicado como borrador.', 'ok');
  exPintarLista();
}

async function exEliminar(id) {
  const e = ex.examenes.find(x => x.id === id);
  if (!e) return;
  const publicado = ex.versiones.some(v => v.examen_id === id);
  const msg = `¿Eliminar "${e.titulo}"?\n\nDeja de aparecer en tu lista y pasa a «Eliminados», de donde puedes restaurarlo.` +
    (publicado ? ' Sus publicaciones abiertas se cierran; las entregas, notas e historial se conservan en modo de sólo lectura.' : '');
  if (!confirm(msg)) return;
  const r = await exRpc('eliminar_examen', { p_examen: id });
  if (!r.ok) { aviso(r.error, 'error'); return; }
  aviso('Examen eliminado. Queda en «Eliminados».', 'ok');
  await exCargar();
}

async function exRestaurar(id) {
  const r = await exRpc('restaurar_examen', { p_examen: id });
  if (!r.ok) { aviso(r.error, 'error'); return; }
  aviso('Examen restaurado.', 'ok');
  ex.verEliminados = false;
  await exCargar();
}

// ============================================================
// VISTA: EDITOR
// ============================================================
function exAbrirEditor(id, abrirPublicar) {
  const e = ex.examenes.find(x => x.id === id);
  if (!e) return;
  // Copia profunda: lo que se edita no toca la lista hasta guardar.
  const copia = JSON.parse(JSON.stringify(e));
  copia.contenido = copia.contenido && Array.isArray(copia.contenido.preguntas) ? copia.contenido : { preguntas: [] };
  // En el editor las casillas excluidas vuelven a la lista, marcadas.
  copia.contenido.preguntas.forEach(q => {
    if (q.tipo === 'notam') {
      q.casillas = (q.casillas || []).map(c => Object.assign(c, { incluir: true }))
        .concat((q.casillas_excluidas || []).map(c => Object.assign(c, { incluir: false })));
      delete q.casillas_excluidas;
    }
  });
  ex.editando = copia;
  ex.vista = 'editor';
  ex.previa = false;
  ex.sucio = false;
  ex.ultimoGuardado = new Date(e.actualizado_en);
  exPintarEditor();
  if (abrirPublicar) setTimeout(() => exMostrarPublicar(), 0);
  document.querySelector('.main-content').scrollTo({ top: 0 });
}

async function exSalirEditor() {
  if (ex.sucio) await exGuardarAhora();
  ex.editando = null;
  await exCargar();
  exPintarLista();
  document.querySelector('.main-content').scrollTo({ top: 0 });
}

function exPintarEstadoGuardado(texto, error) {
  const el = document.getElementById('exEstadoGuardado');
  if (!el) return;
  el.classList.toggle('error', !!error);
  if (texto) { el.textContent = texto; return; }
  const d = ex.ultimoGuardado;
  el.textContent = d ? `Guardado · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Guardado';
}

function exPintarEditor() {
  const raiz = document.getElementById('exRaiz');
  const e = ex.editando;
  const vers = ex.versiones.filter(v => v.examen_id === e.id);
  const ultima = vers[vers.length - 1];

  raiz.innerHTML = `
    <a href="#" class="ex-volver" id="exVolver">← Mis exámenes</a>
    <div class="ex-editor-cab">
      <div class="ex-editor-titulo">
        <input type="text" id="exTitulo" maxlength="140" value="${esc(e.titulo)}" aria-label="Título del examen" placeholder="Título del examen">
        <span class="ex-guardado" id="exEstadoGuardado" aria-live="polite"></span>
      </div>
      <div class="acciones">
        <button class="btn btn-secundario btn-mini" type="button" id="exPrevia">${ex.previa ? 'Volver a editar' : 'Vista previa'}</button>
        <button class="btn btn-primario btn-mini" type="button" id="exBtnPublicar">Publicar en un grupo</button>
      </div>
    </div>
    <p class="ex-nota">${ultima
      ? `Última versión publicada: <b>v${ultima.numero}</b> (${fechaCorta(ultima.creado_en)}). Si cambias algo y vuelves a publicar se crea la versión v${ultima.numero + 1}; lo que ya presentaron tus estudiantes sigue amarrado a su versión.`
      : 'Se guarda solo mientras escribes. Nada de esto lo ven tus estudiantes hasta que lo publiques en un grupo.'}</p>

    <div id="exZonaPublicar"></div>

    ${ex.previa ? '<div class="panel-card ex-previa" id="exPreviaCont"></div>' : `
    <div class="panel-card">
      <div class="campo" style="margin-bottom:0;">
        <label for="exDescripcion">Instrucciones para el estudiante (opcional)</label>
        <textarea id="exDescripcion" maxlength="2000" placeholder="Tienes 40 minutos. Las fechas y horas van en UTC.">${esc(e.descripcion || '')}</textarea>
      </div>
    </div>
    <div id="exPreguntas"></div>
    <div class="panel-card ex-agregar">
      <div class="sub-titulo">AGREGAR</div>
      <div class="acciones">
        <button class="btn btn-secundario btn-mini" type="button" data-agregar="opcion">+ Opción múltiple</button>
        <button class="btn btn-secundario btn-mini" type="button" data-agregar="corta">+ Respuesta corta</button>
        <button class="btn btn-secundario btn-mini" type="button" data-agregar="abierta">+ Respuesta abierta</button>
        <button class="btn btn-secundario btn-mini" type="button" data-agregar="notam">+ Decodificar NOTAM</button>
        <button class="btn btn-secundario btn-mini" type="button" data-agregar="seccion">+ Sección</button>
        <button class="btn btn-secundario btn-mini" type="button" id="exDesdeBanco">+ Desde mis bancos</button>
      </div>
      <div id="exZonaBanco"></div>
    </div>`}
    <div id="exRevision"></div>`;

  exPintarEstadoGuardado();
  raiz.querySelector('#exVolver').addEventListener('click', ev => { ev.preventDefault(); exSalirEditor(); });
  raiz.querySelector('#exTitulo').addEventListener('input', ev => { e.titulo = ev.target.value; exProgramarGuardado(); });
  raiz.querySelector('#exPrevia').addEventListener('click', () => { ex.previa = !ex.previa; exPintarEditor(); });
  raiz.querySelector('#exBtnPublicar').addEventListener('click', exMostrarPublicar);

  if (ex.previa) { exPintarPrevia(); return; }

  raiz.querySelector('#exDescripcion').addEventListener('input', ev => { e.descripcion = ev.target.value; exProgramarGuardado(); });
  raiz.querySelectorAll('[data-agregar]').forEach(b => b.addEventListener('click', () => exAgregar(b.dataset.agregar)));
  raiz.querySelector('#exDesdeBanco').addEventListener('click', exMostrarBanco);
  exPintarPreguntas();
}

function exPreguntaNueva(tipo) {
  const id = evNuevoId('p');
  switch (tipo) {
    case 'opcion': return { id, tipo, enunciado: '', opciones: ['', '', '', ''], correctas: [], puntos: 1 };
    case 'corta': return { id, tipo, enunciado: '', aceptadas: [], puntos: 1 };
    case 'abierta': return { id, tipo, enunciado: '', modelo: '', criterios: [], limite_palabras: null, puntos: 5 };
    case 'notam': return { id, tipo, enunciado: 'Decodifique el siguiente NOTAM.', notam: '', casillas: [] };
    default: return { id, tipo: 'seccion', titulo: 'Nueva sección', texto: '' };
  }
}

function exAgregar(tipo) {
  ex.editando.contenido.preguntas.push(exPreguntaNueva(tipo));
  exProgramarGuardado();
  exPintarPreguntas();
  const tarjetas = document.querySelectorAll('.ex-q');
  const ultima = tarjetas[tarjetas.length - 1];
  if (ultima) {
    ultima.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const foco = ultima.querySelector('textarea, input');
    if (foco) foco.focus({ preventScroll: true });
  }
}

function exPintarPreguntas() {
  const cont = document.getElementById('exPreguntas');
  if (!cont) return;
  const preg = ex.editando.contenido.preguntas;
  exPintarRevision();
  if (!preg.length) {
    cont.innerHTML = '<div class="vacio" style="margin-bottom:22px;">El examen todavía no tiene preguntas. Agrégalas con los botones de abajo, o tráelas de tus bancos.</div>';
    return;
  }
  let n = 0;
  cont.innerHTML = '';
  preg.forEach((q, i) => {
    if (q.tipo !== 'seccion') n++;
    cont.appendChild(exTarjetaPregunta(q, i, n));
  });
}

function exTarjetaPregunta(q, i, numero) {
  const total = ex.editando.contenido.preguntas.length;
  const card = document.createElement('div');
  card.className = 'panel-card ex-q' + (q.tipo === 'seccion' ? ' ex-q-seccion' : '');
  const max = evMaxPregunta(q);
  card.innerHTML = `
    <div class="ex-q-cab">
      <div>
        <span class="module-badge">${q.tipo === 'seccion' ? 'Sección' : 'Pregunta ' + numero}</span>
        <span class="ex-tenue">${EX_TIPOS[q.tipo]}${q.tipo !== 'seccion' ? ` · ${evPuntosTexto(max)} pt${max === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div class="acciones">
        <button class="btn btn-secundario btn-mini" type="button" data-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="btn btn-secundario btn-mini" type="button" data-mover="1" ${i === total - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
        <button class="btn btn-secundario btn-mini" type="button" data-copiar>Duplicar</button>
        <button class="btn btn-peligro btn-mini" type="button" data-quitar>Quitar</button>
      </div>
    </div>
    <div class="ex-q-cuerpo"></div>`;

  card.querySelector('[data-mover="-1"]').addEventListener('click', () => exMover(i, -1));
  card.querySelector('[data-mover="1"]').addEventListener('click', () => exMover(i, 1));
  card.querySelector('[data-copiar]').addEventListener('click', () => {
    const copia = JSON.parse(JSON.stringify(q));
    copia.id = evNuevoId('p');
    ex.editando.contenido.preguntas.splice(i + 1, 0, copia);
    exProgramarGuardado();
    exPintarPreguntas();
  });
  card.querySelector('[data-quitar]').addEventListener('click', () => {
    if (!confirm('¿Quitar esta ' + (q.tipo === 'seccion' ? 'sección' : 'pregunta') + ' del examen?')) return;
    ex.editando.contenido.preguntas.splice(i, 1);
    exProgramarGuardado();
    exPintarPreguntas();
  });

  const cuerpo = card.querySelector('.ex-q-cuerpo');
  const cambio = (repintar) => {
    exProgramarGuardado();
    if (repintar) exPintarPreguntas();
    else {
      const m = evMaxPregunta(q);
      const t = card.querySelector('.ex-q-cab .ex-tenue');
      if (t && q.tipo !== 'seccion') t.textContent = `${EX_TIPOS[q.tipo]} · ${evPuntosTexto(m)} pt${m === 1 ? '' : 's'}`;
      exPintarRevision();
    }
  };

  if (q.tipo === 'seccion') {
    cuerpo.innerHTML = `
      <div class="campo"><label>Título de la sección</label><input type="text" data-c="titulo" maxlength="140" value="${esc(q.titulo || '')}"></div>
      <div class="campo" style="margin-bottom:0;"><label>Texto (opcional)</label><textarea data-c="texto" maxlength="2000" style="min-height:60px;">${esc(q.texto || '')}</textarea></div>`;
    exEnlazarCampos(cuerpo, q, cambio);
    return card;
  }

  cuerpo.innerHTML = `
    <div class="campo"><label>Enunciado</label><textarea data-c="enunciado" maxlength="3000" style="min-height:70px;">${esc(q.enunciado || '')}</textarea></div>
    ${q.tipo !== 'notam' ? `
    <details class="ex-contexto" ${q.contexto ? 'open' : ''}>
      <summary>Material de apoyo (METAR, extracto del AIP, NOTAM de referencia…)</summary>
      <textarea data-c="contexto" maxlength="6000" class="ex-mono" placeholder="Se muestra en letra de terminal, tal cual lo pegues.">${esc(q.contexto || '')}</textarea>
    </details>` : ''}
    <div class="ex-q-especifico"></div>`;
  exEnlazarCampos(cuerpo, q, cambio);
  const esp = cuerpo.querySelector('.ex-q-especifico');

  if (q.tipo === 'opcion') exEditorOpcion(esp, q, cambio);
  if (q.tipo === 'corta') exEditorCorta(esp, q, cambio);
  if (q.tipo === 'abierta') exEditorAbierta(esp, q, cambio);
  if (q.tipo === 'notam') exEditorNotam(esp, q, cambio);
  return card;
}

function exEnlazarCampos(cont, q, cambio) {
  cont.querySelectorAll(':scope > .campo [data-c], :scope > details [data-c], :scope > [data-c]').forEach(el => {
    el.addEventListener('input', () => { q[el.dataset.c] = el.value; cambio(false); });
  });
}

function exMover(i, d) {
  const arr = ex.editando.contenido.preguntas;
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  exProgramarGuardado();
  exPintarPreguntas();
}

function exCampoPuntos(q, cambio, etiqueta) {
  const div = document.createElement('div');
  div.className = 'campo ex-puntos';
  div.innerHTML = `<label>${etiqueta || 'Puntos'}</label><input type="number" min="0" max="100" step="0.5" value="${esc(q.puntos)}">`;
  div.querySelector('input').addEventListener('input', ev => { q.puntos = Number(ev.target.value) || 0; cambio(false); });
  return div;
}

function exEditorOpcion(esp, q, cambio) {
  q.correctas = q.correctas || [];
  const letras = 'ABCDEF';
  esp.innerHTML = `
    <label class="ex-etq">Opciones <span class="ex-tenue">— marca la(s) correcta(s). Con más de una correcta, el estudiante debe marcarlas todas para ganar el punto.</span></label>
    <div class="ex-opciones">${(q.opciones || []).map((o, k) => `
      <div class="ex-opcion">
        <label class="ex-correcta" title="Correcta"><input type="checkbox" data-correcta="${k}" ${q.correctas.includes(k) ? 'checked' : ''}> ${letras[k]}</label>
        <input type="text" data-opcion="${k}" maxlength="500" value="${esc(o)}" placeholder="Opción ${letras[k]}">
        <button class="btn btn-secundario btn-mini" type="button" data-quitar-op="${k}" ${q.opciones.length <= 2 ? 'disabled' : ''} aria-label="Quitar opción ${letras[k]}">✕</button>
      </div>`).join('')}
    </div>
    <div class="ex-fila-fin">
      <button class="btn btn-secundario btn-mini" type="button" data-mas-op ${q.opciones.length >= 6 ? 'disabled' : ''}>+ Opción</button>
    </div>`;
  esp.querySelector('.ex-fila-fin').appendChild(exCampoPuntos(q, cambio));
  esp.querySelectorAll('[data-opcion]').forEach(inp => inp.addEventListener('input', () => { q.opciones[+inp.dataset.opcion] = inp.value; cambio(false); }));
  esp.querySelectorAll('[data-correcta]').forEach(chk => chk.addEventListener('change', () => {
    const k = +chk.dataset.correcta;
    q.correctas = chk.checked ? Array.from(new Set(q.correctas.concat([k]))).sort((a, b) => a - b) : q.correctas.filter(x => x !== k);
    cambio(false);
  }));
  esp.querySelectorAll('[data-quitar-op]').forEach(b => b.addEventListener('click', () => {
    const k = +b.dataset.quitarOp;
    q.opciones.splice(k, 1);
    q.correctas = q.correctas.filter(x => x !== k).map(x => (x > k ? x - 1 : x));
    cambio(true);
  }));
  esp.querySelector('[data-mas-op]').addEventListener('click', () => { q.opciones.push(''); cambio(true); });
}

function exEditorCorta(esp, q, cambio) {
  esp.innerHTML = `
    <div class="campo">
      <label>Respuestas aceptadas — una por línea</label>
      <textarea data-aceptadas style="min-height:70px;" placeholder="SKED&#10;Bogotá">${esc((q.aceptadas || []).join('\n'))}</textarea>
      <div class="ayuda">Se califica sola. No importan mayúsculas, tildes ni espacios de más. Si un estudiante escribe una variante válida que no previste, puedes darle el punto al calificar.</div>
    </div>
    <div class="ex-fila-fin"></div>`;
  esp.querySelector('.ex-fila-fin').appendChild(exCampoPuntos(q, cambio));
  esp.querySelector('[data-aceptadas]').addEventListener('input', ev => {
    q.aceptadas = ev.target.value.split('\n').map(x => x.trim()).filter(Boolean);
    cambio(false);
  });
}

function exEditorAbierta(esp, q, cambio) {
  q.criterios = q.criterios || [];
  const suma = q.criterios.reduce((s, c) => s + (Number(c.puntos) || 0), 0);
  esp.innerHTML = `
    <div class="campo">
      <label>Respuesta modelo (opcional)</label>
      <textarea data-modelo style="min-height:70px;" maxlength="4000" placeholder="Lo que esperas que responda. Te aparece al lado de cada respuesta cuando calificas, y el estudiante la ve al liberar las notas.">${esc(q.modelo || '')}</textarea>
    </div>
    <label class="ex-etq">Criterios de calificación (opcional) <span class="ex-tenue">— al calificar marcas los que cumple y los puntos se suman solos.</span></label>
    <div class="ex-criterios">${q.criterios.map((c, k) => `
      <div class="ex-criterio">
        <input type="text" data-crit-texto="${k}" maxlength="300" value="${esc(c.texto)}" placeholder="Identifica el fenómeno meteorológico">
        <input type="number" data-crit-pts="${k}" min="0" max="100" step="0.5" value="${esc(c.puntos)}" aria-label="Puntos del criterio">
        <button class="btn btn-secundario btn-mini" type="button" data-quitar-crit="${k}" aria-label="Quitar criterio">✕</button>
      </div>`).join('')}
    </div>
    <button class="btn btn-secundario btn-mini" type="button" data-mas-crit>+ Criterio</button>
    ${q.criterios.length && suma !== Number(q.puntos) ? `<p class="ex-aviso-campo">Los criterios suman ${evPuntosTexto(suma)} y la pregunta vale ${evPuntosTexto(q.puntos)}.</p>` : ''}
    <div class="ex-fila-fin">
      <div class="campo ex-puntos"><label>Límite de palabras</label><input type="number" min="0" max="5000" data-limite value="${esc(q.limite_palabras || '')}" placeholder="Sin límite"></div>
    </div>`;
  esp.querySelector('.ex-fila-fin').appendChild(exCampoPuntos(q, () => cambio(true)));
  esp.querySelector('[data-modelo]').addEventListener('input', ev => { q.modelo = ev.target.value; cambio(false); });
  esp.querySelector('[data-limite]').addEventListener('input', ev => { q.limite_palabras = Number(ev.target.value) || null; cambio(false); });
  esp.querySelectorAll('[data-crit-texto]').forEach(inp => inp.addEventListener('input', () => { q.criterios[+inp.dataset.critTexto].texto = inp.value; cambio(false); }));
  esp.querySelectorAll('[data-crit-pts]').forEach(inp => inp.addEventListener('change', () => { q.criterios[+inp.dataset.critPts].puntos = Number(inp.value) || 0; cambio(true); }));
  esp.querySelectorAll('[data-quitar-crit]').forEach(b => b.addEventListener('click', () => { q.criterios.splice(+b.dataset.quitarCrit, 1); cambio(true); }));
  esp.querySelector('[data-mas-crit]').addEventListener('click', () => { q.criterios.push({ texto: '', puntos: 1 }); cambio(true); });
}

// ---------- Editor de la pregunta de NOTAM ----------
function exEditorNotam(esp, q, cambio) {
  q.casillas = q.casillas || [];
  esp.innerHTML = `
    <div class="campo">
      <label>NOTAM completo</label>
      <textarea data-notam class="ex-mono" style="min-height:130px;" placeholder="(A0135/20 NOTAMN&#10;Q) EACC/QMRLC/IV/NBO/A/000/999/5129N00028W005&#10;A) EADD B) 2002110700 C) 2002141800EST&#10;E) RWY 09L/27R CLSD DUE WIP)">${esc(q.notam || '')}</textarea>
      <div class="acciones" style="margin-top:8px;">
        <button class="btn btn-primario btn-mini" type="button" data-analizar>${q.casillas.length ? 'Volver a analizar el NOTAM' : 'Analizar el NOTAM'}</button>
        <span class="ex-tenue">Propone la clave de cada casilla con el código NOTAM del Doc 8400 y los calificativos del Doc 8126. Revísala: tú tienes la última palabra.</span>
      </div>
    </div>
    <div data-avisos></div>
    <div data-tabla></div>`;

  const area = esp.querySelector('[data-notam]');
  area.addEventListener('input', () => { q.notam = area.value; cambio(false); });
  esp.querySelector('[data-analizar]').addEventListener('click', () => {
    if (q.casillas.length && !confirm('Se vuelven a generar las casillas desde el NOTAM. Pierdes las claves y puntos que hayas cambiado a mano. ¿Continuar?')) return;
    const parsed = evNotamParsear(q.notam);
    const r = evNotamCasillas(parsed);
    q.casillas = r.casillas;
    q._avisos = r.avisos;
    cambio(true);
  });

  const avisos = q._avisos || [];
  esp.querySelector('[data-avisos]').innerHTML = avisos.length
    ? `<div class="ex-avisos"><b>Revisa:</b><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';

  const tabla = esp.querySelector('[data-tabla]');
  if (!q.casillas.length) {
    tabla.innerHTML = '<div class="vacio">Pega el NOTAM y pulsa «Analizar el NOTAM» para armar las casillas que el estudiante debe decodificar.</div>';
    return;
  }
  const incluidas = q.casillas.filter(c => c.incluir !== false);
  tabla.innerHTML = `
    <div class="sub-titulo" style="margin-top:6px;">CASILLAS QUE DEBE DECODIFICAR (${incluidas.length} · ${evPuntosTexto(evMaxPregunta(Object.assign({}, q, { casillas: incluidas })))} pts)</div>
    <div class="ex-casillas">${q.casillas.map((c, k) => exFilaCasilla(c, k)).join('')}</div>
    <p class="ex-tenue" style="margin-top:8px;">«Automática» compara con la clave (sin importar mayúsculas ni tildes; las fechas exactas a minuto). «A mano» la calificas tú viendo la clave al lado; úsala para la casilla E) y para todo lo que admita varias redacciones.</p>`;

  tabla.querySelectorAll('[data-cas]').forEach(fila => {
    const c = q.casillas[+fila.dataset.cas];
    const incluir = fila.querySelector('[data-incluir]');
    incluir.addEventListener('change', () => { c.incluir = incluir.checked; cambio(true); });
    const pts = fila.querySelector('[data-pts]');
    pts.addEventListener('input', () => { c.puntos = Number(pts.value) || 0; cambio(false); });
    const modo = fila.querySelector('[data-modo]');
    if (modo) modo.addEventListener('change', () => { c.manual = modo.value === 'manual'; cambio(false); });
    const vari = fila.querySelector('[data-variantes]');
    if (vari) vari.addEventListener('input', () => { c.aceptadas = vari.value.split('|').map(x => x.trim()).filter(Boolean); cambio(false); });
    exEnlazarClaveCasilla(fila, c, () => cambio(false));
  });
}

function exFilaCasilla(c, k) {
  return `
    <div class="ex-casilla ${c.incluir === false ? 'excluida' : ''}" data-cas="${k}">
      <label class="ex-incluir"><input type="checkbox" data-incluir ${c.incluir !== false ? 'checked' : ''}> <b>${esc(c.etiqueta)}</b></label>
      <div class="ex-casilla-clave">${exControlClave(c)}</div>
      ${c.entrada === 'texto' ? `<input type="text" data-variantes value="${esc((c.aceptadas || []).join(' | '))}" placeholder="Otras respuestas válidas, separadas por |" aria-label="Variantes aceptadas">` : '<span></span>'}
      ${c.entrada === 'libre'
        ? '<span class="ex-tenue">A mano</span>'
        : `<select data-modo aria-label="Forma de calificar"><option value="auto" ${!c.manual ? 'selected' : ''}>Automática</option><option value="manual" ${c.manual ? 'selected' : ''}>A mano</option></select>`}
      <label class="ex-pts-casilla"><input type="number" data-pts min="0" max="100" step="0.5" value="${esc(c.puntos)}" aria-label="Puntos"> pt</label>
    </div>`;
}

function exControlClave(c) {
  const k = c.clave;
  if (c.entrada === 'opcion') {
    return `<select data-clave aria-label="Clave">${evGruposLista(c.lista).map(g => {
      const ops = g.opciones.map(o => `<option value="${esc(o.v)}" ${o.v === k ? 'selected' : ''}>${esc(o.v)} — ${esc(o.t)}</option>`).join('');
      return g.grupo ? `<optgroup label="${esc(g.grupo)}">${ops}</optgroup>` : ops;
    }).join('')}</select>`;
  }
  if (c.entrada === 'fecha') return `<input type="datetime-local" data-clave value="${esc(k || '')}" aria-label="Clave (UTC)">`;
  if (c.entrada === 'fecha_fin') {
    const f = k && typeof k === 'object' ? k : { perm: false, fecha: '', est: false };
    return `<div class="ex-fin">
      <label><input type="checkbox" data-clave-perm ${f.perm ? 'checked' : ''}> PERM</label>
      <input type="datetime-local" data-clave-fecha value="${esc(f.fecha || '')}" ${f.perm ? 'disabled' : ''} aria-label="Fecha de fin (UTC)">
      <label><input type="checkbox" data-clave-est ${f.est ? 'checked' : ''} ${f.perm ? 'disabled' : ''}> EST</label>
    </div>`;
  }
  if (c.entrada === 'libre') return `<textarea data-clave rows="2" placeholder="Interpretación correcta en lenguaje claro" aria-label="Clave">${esc(k || '')}</textarea>`;
  return `<input type="text" data-clave value="${esc(k || '')}" aria-label="Clave">${c.entrada === 'coord' ? `<small class="ex-tenue">${esc(evCoordLegible(k))}</small>` : ''}`;
}

function exEnlazarClaveCasilla(fila, c, alCambiar) {
  if (c.entrada === 'fecha_fin') {
    const perm = fila.querySelector('[data-clave-perm]');
    const fecha = fila.querySelector('[data-clave-fecha]');
    const est = fila.querySelector('[data-clave-est]');
    const leer = () => {
      fecha.disabled = perm.checked; est.disabled = perm.checked;
      c.clave = { perm: perm.checked, fecha: perm.checked ? '' : fecha.value, est: perm.checked ? false : est.checked };
      alCambiar();
    };
    [perm, est].forEach(x => x.addEventListener('change', leer));
    fecha.addEventListener('input', leer);
    return;
  }
  const campo = fila.querySelector('[data-clave]');
  if (campo) campo.addEventListener(c.entrada === 'opcion' ? 'change' : 'input', () => { c.clave = campo.value; alCambiar(); });
}

// ---------- Importar preguntas de los bancos ----------
function exMostrarBanco() {
  const zona = document.getElementById('exZonaBanco');
  if (zona.innerHTML) { zona.innerHTML = ''; return; }
  const banco = (typeof estado !== 'undefined' && estado.banco) || [];
  if (!banco.length) { zona.innerHTML = '<div class="vacio" style="margin-top:12px;">Tus bancos todavía no tienen preguntas.</div>'; return; }
  const bancos = (estado.bancos || []);
  zona.innerHTML = `
    <div class="sub-bloque" style="margin-top:14px;">
      <div class="fila-campos">
        <div class="campo"><label for="exBancoFiltro">Banco</label><select id="exBancoFiltro"><option value="">Todos</option>${bancos.map(b => `<option value="${esc(b.id)}">${esc(b.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="exBancoBuscar">Buscar</label><input type="text" id="exBancoBuscar" placeholder="Filtrar por enunciado o tema…"></div>
      </div>
      <div class="selector-preguntas" id="exBancoLista"></div>
      <div class="acciones" style="margin-top:10px;">
        <button class="btn btn-primario btn-mini" type="button" id="exBancoAgregar">Agregar las marcadas</button>
        <span class="ex-tenue">Se copian al examen: si después cambias la pregunta en el banco, el examen no cambia.</span>
      </div>
    </div>`;
  const marcadas = new Set();
  const pintar = () => {
    const b = document.getElementById('exBancoFiltro').value;
    const t = document.getElementById('exBancoBuscar').value.trim().toLowerCase();
    const lista = banco.filter(p => (!b || p.banco_id === b) && (!t || p.enunciado.toLowerCase().includes(t) || (p.tema || '').toLowerCase().includes(t)));
    document.getElementById('exBancoLista').innerHTML = lista.length ? lista.map(p => `
      <label class="pregunta-check"><input type="checkbox" value="${esc(p.id)}" ${marcadas.has(p.id) ? 'checked' : ''}><span>${esc(p.enunciado)}</span></label>`).join('')
      : '<div class="vacio" style="border:none;padding:10px;">Ninguna pregunta coincide.</div>';
    document.querySelectorAll('#exBancoLista input').forEach(chk => chk.addEventListener('change', () => {
      chk.checked ? marcadas.add(chk.value) : marcadas.delete(chk.value);
    }));
  };
  document.getElementById('exBancoFiltro').addEventListener('change', pintar);
  document.getElementById('exBancoBuscar').addEventListener('input', pintar);
  document.getElementById('exBancoAgregar').addEventListener('click', () => {
    const elegidas = banco.filter(p => marcadas.has(p.id));
    if (!elegidas.length) { aviso('Marca al menos una pregunta.', 'error'); return; }
    elegidas.forEach(p => ex.editando.contenido.preguntas.push({
      id: evNuevoId('p'), tipo: 'opcion', enunciado: p.enunciado,
      opciones: p.opciones.slice(), correctas: [p.correcta], puntos: 1
    }));
    zona.innerHTML = '';
    exProgramarGuardado();
    exPintarPreguntas();
    aviso(`${elegidas.length} pregunta${elegidas.length === 1 ? '' : 's'} agregada${elegidas.length === 1 ? '' : 's'}.`, 'ok');
  });
  pintar();
}

// ---------- Revisión antes de publicar ----------
function exProblemas(contenido) {
  const out = [];
  let n = 0;
  (contenido.preguntas || []).forEach(q => {
    if (q.tipo === 'seccion') return;
    n++;
    const p = `Pregunta ${n}`;
    if (q.tipo !== 'notam' && !(q.enunciado || '').trim()) out.push(`${p}: falta el enunciado.`);
    if (q.tipo !== 'notam' && !(Number(q.puntos) > 0)) out.push(`${p}: ponle puntos.`);
    if (q.tipo === 'opcion') {
      if ((q.opciones || []).filter(o => (o || '').trim()).length < (q.opciones || []).length) out.push(`${p}: hay opciones vacías.`);
      if (!(q.correctas || []).length) out.push(`${p}: marca la opción correcta.`);
    }
    if (q.tipo === 'corta' && !(q.aceptadas || []).length) out.push(`${p}: escribe al menos una respuesta aceptada.`);
    if (q.tipo === 'notam') {
      const inc = (q.casillas || []).filter(c => c.incluir !== false);
      if (!(q.notam || '').trim()) out.push(`${p}: falta el NOTAM.`);
      if (!inc.length) out.push(`${p}: analiza el NOTAM y deja al menos una casilla.`);
      inc.forEach(c => {
        const vacia = c.entrada === 'fecha_fin' ? !(c.clave && (c.clave.perm || c.clave.fecha)) : !String(c.clave || '').trim();
        if (vacia) out.push(`${p}, ${c.etiqueta}: falta la clave.`);
        if (!(Number(c.puntos) > 0)) out.push(`${p}, ${c.etiqueta}: ponle puntos.`);
      });
    }
  });
  if (n === 0) out.push('El examen no tiene preguntas.');
  return out;
}

function exPintarRevision() {
  const cont = document.getElementById('exRevision');
  if (!cont || !ex.editando) return;
  const prob = exProblemas(ex.editando.contenido);
  const total = evMaxExamen(exContenidoParaGuardar(ex.editando.contenido));
  cont.innerHTML = `
    <div class="resumen-preguntas ${prob.length ? 'vacia' : ''}">
      ${prob.length ? `Faltan ${prob.length} detalle${prob.length === 1 ? '' : 's'} antes de publicar` : 'Listo para publicar'} · ${exResumenContenido(exContenidoParaGuardar(ex.editando.contenido))}
      <span>${prob.length ? prob.slice(0, 6).map(esc).join(' · ') + (prob.length > 6 ? ' …' : '') : `Puntaje total: ${evPuntosTexto(total)}.`}</span>
    </div>`;
}

// ---------- Vista previa (como lo ve el estudiante) ----------
function exPintarPrevia() {
  const cont = document.getElementById('exPreviaCont');
  const e = ex.editando;
  const contenido = exContenidoParaGuardar(e.contenido);
  const preg = contenido.preguntas;
  const total = preg.filter(q => q.tipo !== 'seccion').length;
  cont.innerHTML = `
    <p class="ex-nota" style="margin-top:0;">Así lo verá el estudiante. Puedes probar a responder: aquí no se guarda nada.</p>
    ${e.descripcion ? `<div class="instrucciones-previa"><b>Instrucciones:</b> ${esc(e.descripcion)}</div>` : ''}
    <div class="ex-previa-preguntas"></div>`;
  const zona = cont.querySelector('.ex-previa-preguntas');
  let n = 0;
  preg.forEach(q => {
    if (q.tipo !== 'seccion') n++;
    zona.appendChild(evRenderPregunta(q, n, total, null, () => {}, false));
  });
  if (!preg.length) zona.innerHTML = '<div class="vacio">Todavía no hay preguntas.</div>';
}

// ---------- Publicar ----------
function exMostrarPublicar() {
  const zona = document.getElementById('exZonaPublicar');
  if (!zona) return;
  if (zona.innerHTML) { zona.innerHTML = ''; return; }
  const grupos = (typeof estado !== 'undefined' && estado.grupos) || [];
  const prob = exProblemas(ex.editando.contenido);
  zona.innerHTML = `
    <div class="panel-card ex-publicar">
      <h3>Publicar en un grupo</h3>
      <p class="card-sub">Se congela una copia del examen tal como está ahora. Para usarlo en otro grupo, vuelve a publicarlo: cada publicación lleva sus propias fechas, entregas y notas.</p>
      ${prob.length ? `<div class="ex-avisos"><b>Antes de publicar corrige:</b><ul>${prob.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      ${grupos.length ? `
      <div class="fila-campos">
        <div class="campo"><label for="exPubGrupo">Grupo</label><select id="exPubGrupo">${grupos.map(g => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="exPubIntentos">Intentos por estudiante</label><input type="number" id="exPubIntentos" min="1" max="20" value="1"><div class="ayuda">Vacío = ilimitados. Cuenta el mejor intento.</div></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="exPubAbre">Abre (opcional)</label><input type="datetime-local" id="exPubAbre"><div class="ayuda">Vacío = desde ya.</div></div>
        <div class="campo"><label for="exPubCierra">Cierra (opcional)</label><input type="datetime-local" id="exPubCierra"><div class="ayuda">Vacío = hasta que lo cierres o liberes las notas.</div></div>
      </div>
      <div class="check-linea"><input type="checkbox" id="exPubBarajar"><label for="exPubBarajar" style="margin:0;font-weight:500;">Barajar el orden de las preguntas (dentro de cada sección) para cada estudiante</label></div>
      <div class="acciones" style="margin-top:14px;">
        <button class="btn btn-primario" type="button" id="exPubConfirmar" ${prob.length ? 'disabled' : ''}>Publicar</button>
        <button class="btn btn-secundario" type="button" id="exPubCancelar">Cancelar</button>
      </div>` : '<div class="vacio">Primero crea un grupo en «Mis grupos».</div>'}
    </div>`;
  zona.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cancelar = zona.querySelector('#exPubCancelar');
  if (cancelar) cancelar.addEventListener('click', () => { zona.innerHTML = ''; });
  const confirmar = zona.querySelector('#exPubConfirmar');
  if (!confirmar) return;
  confirmar.addEventListener('click', async () => {
    const abre = document.getElementById('exPubAbre').value;
    const cierra = document.getElementById('exPubCierra').value;
    const intentos = document.getElementById('exPubIntentos').value;
    const grupoId = document.getElementById('exPubGrupo').value;
    const grupo = grupos.find(g => g.id === grupoId);
    if (cierra && new Date(cierra) <= new Date()) { aviso('La fecha de cierre ya pasó.', 'error'); return; }
    if (!confirm(`¿Publicar "${ex.editando.titulo}" en ${grupo ? grupo.nombre : 'el grupo'}?\n\nLos estudiantes del grupo lo verán ${abre ? 'desde el ' + new Date(abre).toLocaleString('es-CO') : 'de inmediato'}.`)) return;
    confirmar.disabled = true;
    confirmar.textContent = 'Publicando…';
    if (!(await exGuardarAhora()) && ex.sucio) { confirmar.disabled = false; confirmar.textContent = 'Publicar'; return; }
    const r = await exRpc('publicar_examen', {
      p_examen: ex.editando.id,
      p_grupo: grupoId,
      p_abre: abre ? new Date(abre).toISOString() : null,
      p_cierra: cierra ? new Date(cierra).toISOString() : null,
      p_intentos: intentos ? Number(intentos) : null,
      p_barajar: document.getElementById('exPubBarajar').checked
    });
    if (!r.ok) { aviso(r.error, 'error'); confirmar.disabled = false; confirmar.textContent = 'Publicar'; return; }
    aviso(r.data.version_nueva ? `Publicado. Se guardó como versión v${r.data.version}.` : `Publicado con la versión v${r.data.version} (sin cambios desde la anterior).`, 'ok');
    ex.editando = null;
    await exCargar();
    exAbrirPublicacion(r.data.publicacion_id);
  });
}

// ============================================================
// VISTA: PUBLICACIÓN (resultados, calificar, clave, historial)
// ============================================================
async function exAbrirPublicacion(pubId, pestana) {
  if (ex.sucio) await exGuardarAhora();
  ex.editando = null;
  ex.vista = 'publicacion';
  ex.pubActual = pubId;
  ex.pubPestana = pestana || 'resultados';
  ex.calPregunta = null;
  if (typeof mostrarSeccion === 'function' && !document.getElementById('seccion-examenes').classList.contains('activa')) mostrarSeccion('examenes');
  document.getElementById('exRaiz').innerHTML = '<div class="vacio">Cargando la publicación…</div>';
  await exCargarPublicacion();
  exPintarPublicacion();
  document.querySelector('.main-content').scrollTo({ top: 0 });
}

async function exCargarPublicacion() {
  const p = ex.publicaciones.find(x => x.id === ex.pubActual);
  if (!p) { ex.pubDatos = null; return; }
  const cli = obtenerClienteAuth();
  const [rVer, rEnt, rHist, rEst] = await Promise.all([
    cli.from('examen_versiones').select('id, numero, titulo, descripcion, contenido, puntaje_total, creado_en').eq('id', p.version_id).single(),
    cli.from('entregas_examen').select('*').eq('publicacion_id', p.id).order('enviado_en', { ascending: true }),
    cli.from('historial_examen').select('*').eq('publicacion_id', p.id).order('creado_en', { ascending: true }),
    p.grupo_id ? obtenerEstudiantesDeGrupo(p.grupo_id) : Promise.resolve({ ok: true, estudiantes: [] })
  ]);
  const err = rVer.error || rEnt.error || rHist.error;
  if (err) { aviso(err.message, 'error'); ex.pubDatos = null; return; }
  // Preguntas efectivas: la versión + las claves corregidas después.
  const ajustes = p.ajustes || { claves: {}, anuladas: {} };
  const preguntas = (rVer.data.contenido.preguntas || []).map(q => Object.assign({}, q, (ajustes.claves || {})[q.id] || {}));
  ex.pubDatos = {
    version: rVer.data,
    preguntas,
    anuladas: ajustes.anuladas || {},
    entregas: rEnt.data || [],
    historial: rHist.data || [],
    estudiantes: rEst.ok ? rEst.estudiantes : []
  };
  const c = { entregas: ex.pubDatos.entregas.length, pendientes: ex.pubDatos.entregas.reduce((s, e) => s + (e.pendientes || 0), 0) };
  ex.conteos[p.id] = c;
  exActualizarContadorNav();
}

async function exRefrescarPublicacion() {
  const { data } = await obtenerClienteAuth().from('publicaciones').select('*').eq('id', ex.pubActual).maybeSingle();
  if (data) {
    const i = ex.publicaciones.findIndex(x => x.id === data.id);
    if (i >= 0) ex.publicaciones[i] = data; else ex.publicaciones.unshift(data);
  } else {
    ex.publicaciones = ex.publicaciones.filter(x => x.id !== ex.pubActual);
  }
  await exCargarPublicacion();
  exPintarPublicacion();
}

function exPintarPublicacion() {
  const raiz = document.getElementById('exRaiz');
  const p = ex.publicaciones.find(x => x.id === ex.pubActual);
  const d = ex.pubDatos;
  if (!p || !d) {
    raiz.innerHTML = '<a href="#" class="ex-volver" id="exVolver">← Mis exámenes</a><div class="vacio">No encontramos esa publicación.</div>';
    raiz.querySelector('#exVolver').addEventListener('click', ev => { ev.preventDefault(); exPintarLista(); });
    return;
  }
  const est = exEstadoPublicacion(p);
  const liberada = p.estado === 'liberada';
  const pend = d.entregas.reduce((s, e) => s + (e.pendientes || 0), 0);
  const examen = ex.examenes.find(e => e.id === p.examen_id);
  const examenEliminado = examen && examen.eliminado_en;
  const sinEntregas = d.entregas.length === 0;
  const pestanas = [
    { id: 'resultados', t: 'Resultados' },
    { id: 'calificar', t: `Calificar${pend ? ` (${pend})` : ''}` },
    { id: 'clave', t: 'Clave y ajustes' },
    { id: 'historial', t: 'Historial' }
  ];

  raiz.innerHTML = `
    <a href="#" class="ex-volver" id="exVolver">← Mis exámenes</a>
    <div class="ex-editor-cab">
      <div>
        <span class="badge-estado ${est.clase}">${esc(est.texto)}</span>
        <h2 class="ex-pub-titulo">${esc(p.titulo)}</h2>
        <p class="ex-tenue">${esc(p.grupo_nombre)}${p.grupo_id ? '' : ' (grupo eliminado)'} · versión v${d.version.numero} · ${evPuntosTexto(d.version.puntaje_total)} pts ·
          ${p.abre_en ? 'abre el ' + fechaCorta(p.abre_en) + ' · ' : ''}${p.cierra_en ? 'cierra el ' + fechaCorta(p.cierra_en) : 'sin fecha de cierre'} ·
          ${p.intentos_max ? p.intentos_max + ' intento' + (p.intentos_max === 1 ? '' : 's') : 'intentos ilimitados'}${p.barajar ? ' · orden barajado' : ''}</p>
      </div>
      <div class="acciones">
        ${liberada ? `<span class="ex-tenue">Notas liberadas el ${fechaCorta(p.liberada_en)}</span>` : `
          <button class="btn btn-primario btn-mini" type="button" id="exLiberar">Examen terminado: liberar notas</button>`}
      </div>
    </div>

    ${liberada ? '' : `
    <div class="ex-acciones-pub acciones">
      <button class="btn btn-secundario btn-mini" type="button" id="exEditarFechas">Cambiar fechas o intentos</button>
      ${p.estado === 'abierta' ? '<button class="btn btn-secundario btn-mini" type="button" id="exCerrarPub">Cerrar entregas</button>' : ''}
      ${p.estado === 'cerrada' && !examenEliminado ? '<button class="btn btn-secundario btn-mini" type="button" id="exReabrirPub">Reabrir entregas</button>' : ''}
      ${sinEntregas && !examenEliminado ? '<button class="btn btn-secundario btn-mini" type="button" id="exActualizarVersion">Pasar a la última versión del examen</button>' : ''}
      ${sinEntregas ? '<button class="btn btn-peligro btn-mini" type="button" id="exRetirarPub">Retirar publicación</button>' : ''}
    </div>
    <div id="exZonaFechas"></div>`}

    <div class="ex-filtros" role="tablist">
      ${pestanas.map(t => `<button class="chip ${ex.pubPestana === t.id ? 'active' : ''}" type="button" data-pestana="${t.id}">${t.t}</button>`).join('')}
    </div>
    <div id="exPubContenido"></div>`;

  raiz.querySelector('#exVolver').addEventListener('click', async ev => { ev.preventDefault(); await exCargar(); exPintarLista(); });
  raiz.querySelectorAll('[data-pestana]').forEach(b => b.addEventListener('click', () => { ex.pubPestana = b.dataset.pestana; exPintarPublicacion(); }));

  const on = (id, fn) => { const el = raiz.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
  on('exLiberar', () => exLiberar(p, pend));
  on('exEditarFechas', () => exEditarFechas(p));
  on('exCerrarPub', () => exGestionar(p, 'cerrar', '¿Cerrar las entregas? Nadie más podrá presentar el examen. Puedes reabrirlo mientras no liberes las notas.'));
  on('exReabrirPub', () => exGestionar(p, 'reabrir', '¿Reabrir las entregas?'));
  on('exActualizarVersion', () => exGestionar(p, 'actualizar_version', '¿Cambiar esta publicación a la versión actual del examen? Nadie lo ha presentado todavía, así que no afecta ninguna nota.'));
  on('exRetirarPub', () => exGestionar(p, 'retirar', '¿Retirar esta publicación? Nadie la ha presentado: el grupo deja de verla y desaparece de tu lista. Queda constancia en el historial.'));

  const cont = raiz.querySelector('#exPubContenido');
  if (ex.pubPestana === 'resultados') exPintarResultados(cont, p);
  else if (ex.pubPestana === 'calificar') exPintarCalificar(cont, p);
  else if (ex.pubPestana === 'clave') exPintarClave(cont, p);
  else exPintarHistorial(cont, p);
}

async function exGestionar(p, accion, pregunta) {
  if (!confirm(pregunta)) return;
  const r = await exRpc('gestionar_publicacion', { p_pub: p.id, p_accion: accion });
  if (!r.ok) { aviso(r.error, 'error'); return; }
  if (accion === 'retirar') {
    aviso('Publicación retirada.', 'ok');
    await exCargar();
    exPintarLista();
    return;
  }
  aviso(accion === 'actualizar_version' ? `La publicación usa ahora la versión v${r.data.version}.` : 'Listo.', 'ok');
  await exRefrescarPublicacion();
}

function exEditarFechas(p) {
  const zona = document.getElementById('exZonaFechas');
  if (zona.innerHTML) { zona.innerHTML = ''; return; }
  const v = iso => iso ? aFormatoInput(iso) : '';
  zona.innerHTML = `
    <div class="panel-card">
      <div class="fila-campos">
        <div class="campo"><label for="exFAbre">Abre</label><input type="datetime-local" id="exFAbre" value="${v(p.abre_en)}"></div>
        <div class="campo"><label for="exFCierra">Cierra</label><input type="datetime-local" id="exFCierra" value="${v(p.cierra_en)}"></div>
        <div class="campo"><label for="exFIntentos">Intentos</label><input type="number" id="exFIntentos" min="1" max="20" value="${p.intentos_max || ''}" placeholder="Ilimitados"></div>
      </div>
      <button class="btn btn-primario btn-mini" type="button" id="exFGuardar">Guardar</button>
    </div>`;
  zona.querySelector('#exFGuardar').addEventListener('click', async () => {
    const a = document.getElementById('exFAbre').value, c = document.getElementById('exFCierra').value, n = document.getElementById('exFIntentos').value;
    const r = await exRpc('actualizar_publicacion', {
      p_pub: p.id, p_abre: a ? new Date(a).toISOString() : null, p_cierra: c ? new Date(c).toISOString() : null, p_intentos: n ? Number(n) : null
    });
    if (!r.ok) { aviso(r.error, 'error'); return; }
    aviso('Publicación actualizada.', 'ok');
    await exRefrescarPublicacion();
  });
}

async function exLiberar(p, pend) {
  let cero = false;
  if (pend > 0) {
    if (!confirm(`Quedan ${pend} respuesta${pend === 1 ? '' : 's'} por calificar.\n\nLo recomendable es calificarlas primero (pestaña «Calificar»).\n\n¿Quieres liberar de todas formas, poniendo esas respuestas en 0 puntos? Quedará registrado en el historial de cada entrega.`)) {
      ex.pubPestana = 'calificar';
      exPintarPublicacion();
      return;
    }
    cero = true;
  }
  const n = (ex.pubDatos.entregas || []).length;
  if (!confirm(`¿Dar el examen por terminado y liberar las notas?\n\n· Se cierran las entregas.\n· Tus ${n} estudiante${n === 1 ? '' : 's'} con entrega verán su nota, la clave completa y tus comentarios.\n· Podrás seguir corrigiendo, pero cada cambio exigirá un motivo y el estudiante lo verá.`)) return;
  const r = await exRpc('liberar_publicacion', { p_pub: p.id, p_cero_pendientes: cero });
  if (!r.ok) { aviso(r.error, 'error'); return; }
  aviso('Notas liberadas. Tus estudiantes ya pueden verlas.', 'ok');
  await exRefrescarPublicacion();
}

// ---------- Resultados ----------
function exMejoresPorEstudiante(entregas) {
  const porEst = {};
  entregas.forEach(e => {
    const k = e.estudiante_id || ('sin-cuenta-' + e.id);
    (porEst[k] = porEst[k] || []).push(e);
  });
  return porEst;
}

function exPintarResultados(cont, p) {
  const d = ex.pubDatos;
  const porEst = exMejoresPorEstudiante(d.entregas);
  const ids = new Set(Object.keys(porEst));
  const filas = [];
  Object.keys(porEst).forEach(k => {
    const lista = porEst[k];
    const mejor = lista.slice().sort((a, b) => (b.porcentaje - a.porcentaje) || b.enviado_en.localeCompare(a.enviado_en))[0];
    filas.push({ nombre: mejor.estudiante_nombre, correo: mejor.estudiante_correo, lista, mejor, sinCuenta: !lista[0].estudiante_id });
  });
  d.estudiantes.forEach(e => { if (!ids.has(e.id)) filas.push({ nombre: e.nombre, lista: [], mejor: null }); });
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const presentaron = filas.filter(f => f.mejor);
  const pend = d.entregas.reduce((s, e) => s + (e.pendientes || 0), 0);
  const prom = presentaron.length && pend === 0
    ? Math.round(presentaron.reduce((s, f) => s + f.mejor.porcentaje, 0) / presentaron.length) : null;

  // Acierto por pregunta y por casilla de NOTAM, sobre el mejor intento.
  const stats = exEstadisticas(presentaron.map(f => f.mejor));

  cont.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><span class="label">Presentaron</span><strong>${presentaron.length}${d.estudiantes.length ? ' / ' + d.estudiantes.length : ''}</strong></div>
      <div class="stat-card"><span class="label">Entregas</span><strong>${d.entregas.length}</strong></div>
      <div class="stat-card"><span class="label">Por calificar</span><strong>${pend}</strong></div>
      <div class="stat-card" title="Media del mejor intento de cada estudiante. Aparece cuando no queda nada por calificar."><span class="label">Promedio</span><strong class="pct ${clasePct(prom)}">${prom === null ? '—' : prom + '%'}</strong></div>
    </div>

    <div class="panel-card">
      <div class="card-cabecera">
        <div>
          <h3>Estudiantes</h3>
          <p class="card-sub">Cuenta el mejor intento. El «expediente» reconstruye exactamente lo que vio y respondió cada estudiante, con todas las correcciones: sirve para atender un reclamo y se puede guardar en PDF.</p>
        </div>
        <div class="acciones"><button class="btn btn-primario btn-mini" type="button" id="exCsv" ${d.entregas.length ? '' : 'disabled'}>Descargar (Excel)</button></div>
      </div>
      ${filas.length === 0 ? '<div class="vacio">Todavía no hay estudiantes ni entregas.</div>' : `
      <div class="tabla-scroll"><table class="tabla-datos">
        <thead><tr><th>Estudiante</th><th>Intentos</th><th>Mejor intento</th><th>Estado</th><th>Entregado</th><th></th></tr></thead>
        <tbody>${filas.map(f => {
          if (!f.mejor) return `<tr><td>${esc(f.nombre)}</td><td>0</td><td class="pct nulo">No presentó</td><td></td><td>—</td><td></td></tr>`;
          const m = f.mejor;
          return `<tr>
            <td>${esc(f.nombre)}${f.sinCuenta ? ' <span class="ex-tenue">(cuenta eliminada)</span>' : ''}${f.correo ? `<div class="ex-tenue">${esc(f.correo)}</div>` : ''}</td>
            <td>${f.lista.length}</td>
            <td><span class="pct ${m.pendientes ? 'nulo' : clasePct(m.porcentaje)}">${evPuntosTexto(m.puntaje)} / ${evPuntosTexto(m.puntaje_max)} · ${m.porcentaje}%</span></td>
            <td>${m.pendientes ? `<span class="badge-estado borrador">${m.pendientes} por calificar</span>` : '<span class="badge-estado publicada">Calificada</span>'}</td>
            <td>${fechaCorta(m.enviado_en)}</td>
            <td>${f.lista.slice().reverse().map(e => `<a class="btn btn-secundario btn-mini" href="evaluacion.html?entrega=${encodeURIComponent(e.id)}" target="_blank" rel="noopener">Expediente${f.lista.length > 1 ? ' · intento ' + e.intento : ''}</a>`).join(' ')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`}
    </div>

    <div class="panel-card">
      <h3>Qué falla más el grupo</h3>
      <p class="card-sub">Porcentaje de acierto sobre el mejor intento de cada estudiante. En los NOTAM se desglosa por casilla.</p>
      ${stats.length === 0 ? '<div class="vacio">Aparece cuando haya entregas calificadas.</div>' : `
      <div class="tabla-scroll"><table class="tabla-datos">
        <thead><tr><th>Pregunta</th><th>Respuestas</th><th>Acierto</th></tr></thead>
        <tbody>${stats.map(s => `<tr class="${s.sub ? 'ex-sub' : ''}"><td>${s.sub ? '↳ ' : ''}${esc(s.texto)}</td><td>${s.n}</td><td class="pct ${clasePct(s.pct)}">${s.pct === null ? '—' : s.pct + '%'}</td></tr>`).join('')}</tbody>
      </table></div>`}
    </div>`;

  const csv = cont.querySelector('#exCsv');
  if (csv) csv.addEventListener('click', () => exExportarCsv(p));
}

function exEstadisticas(entregas) {
  const d = ex.pubDatos;
  const out = [];
  let n = 0;
  d.preguntas.forEach(q => {
    if (q.tipo === 'seccion') return;
    n++;
    const items = entregas.map(e => (e.calificacion || {})[q.id]).filter(i => i && i.puntos !== null && i.puntos !== undefined && Number(i.max) > 0);
    const pct = items.length ? Math.round(100 * items.reduce((s, i) => s + Number(i.puntos) / Number(i.max), 0) / items.length) : null;
    out.push({ texto: `${n}. ${q.tipo === 'notam' ? 'NOTAM — ' : ''}${(q.enunciado || '').slice(0, 110)}${d.anuladas[q.id] ? ' (anulada)' : ''}`, n: items.length, pct });
    if (q.tipo === 'notam') {
      (q.casillas || []).forEach(c => {
        const cs = entregas.map(e => (((e.calificacion || {})[q.id] || {}).casillas || {})[c.id]).filter(x => x && x.puntos !== null && x.puntos !== undefined && Number(x.max) > 0);
        out.push({ sub: true, texto: c.etiqueta, n: cs.length, pct: cs.length ? Math.round(100 * cs.reduce((s, x) => s + Number(x.puntos) / Number(x.max), 0) / cs.length) : null });
      });
    }
  });
  return out;
}

function exExportarCsv(p) {
  const d = ex.pubDatos;
  const preg = d.preguntas.filter(q => q.tipo !== 'seccion');
  const enc = ['Estudiante', 'Correo', 'Intento', 'Entregado', 'Puntaje', 'Máximo', 'Porcentaje', 'Por calificar']
    .concat(preg.map((q, i) => `P${i + 1} (${evPuntosTexto(evMaxPregunta(q))})`));
  const filas = d.entregas.map(e => [
    e.estudiante_nombre, e.estudiante_correo || '', e.intento, _fechaLegible(e.enviado_en),
    Number(e.puntaje), Number(e.puntaje_max), e.porcentaje, e.pendientes
  ].concat(preg.map(q => {
    const i = (e.calificacion || {})[q.id];
    return i && i.puntos !== null && i.puntos !== undefined ? Number(i.puntos) : '';
  })));
  descargarCSV(`examen-${_nombreArchivoSeguro(p.titulo)}-${_nombreArchivoSeguro(p.grupo_nombre)}-${_fechaArchivo()}.csv`, construirCSV(enc, filas));
  aviso('Archivo descargado. Ábrelo con Excel.', 'ok');
}

// ---------- Calificar pregunta por pregunta ----------
function exPreguntasCalificables() {
  return ex.pubDatos.preguntas.filter(q => q.tipo !== 'seccion');
}

function exPintarCalificar(cont, p) {
  const d = ex.pubDatos;
  const preg = exPreguntasCalificables();
  if (!d.entregas.length) { cont.innerHTML = '<div class="vacio">Todavía nadie ha entregado.</div>'; return; }
  const pendientesDe = q => d.entregas.filter(e => (((e.calificacion || {})[q.id] || {}).pendientes || 0) > 0).length;
  if (!ex.calPregunta || !preg.some(q => q.id === ex.calPregunta)) {
    const conPend = preg.find(q => pendientesDe(q) > 0);
    ex.calPregunta = (conPend || preg[0]).id;
  }
  const q = preg.find(x => x.id === ex.calPregunta);
  const num = preg.indexOf(q) + 1;
  const liberada = p.estado === 'liberada';

  let entregas = d.entregas.slice();
  if (ex.calSoloPendientes) entregas = entregas.filter(e => (((e.calificacion || {})[q.id] || {}).pendientes || 0) > 0);

  cont.innerHTML = `
    <div class="panel-card">
      <div class="fila-campos">
        <div class="campo">
          <label for="exCalPreg">Pregunta</label>
          <select id="exCalPreg">${preg.map((x, i) => {
            const n = pendientesDe(x);
            return `<option value="${esc(x.id)}" ${x.id === q.id ? 'selected' : ''}>${i + 1}. ${esc(EX_TIPOS[x.tipo])} — ${esc((x.enunciado || '').slice(0, 70))}${n ? ` · ${n} por calificar` : ''}</option>`;
          }).join('')}</select>
        </div>
        <div class="campo" style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px;">
          <label class="check-linea" style="margin:0;"><input type="checkbox" id="exCalSoloPend" ${ex.calSoloPendientes ? 'checked' : ''}> Sólo las que faltan por calificar</label>
          <label class="check-linea" style="margin:0;"><input type="checkbox" id="exCalAnon" ${ex.calAnonimo ? 'checked' : ''}> Ocultar nombres mientras califico</label>
        </div>
      </div>
      ${liberada ? '<p class="ex-aviso-campo">Las notas ya se liberaron: cada cambio pide un motivo y el estudiante lo ve.</p>' : ''}
      <div class="ex-clave-ref">${exClaveReferencia(q, num)}</div>
    </div>
    <div id="exCalLista">${entregas.length ? '' : `<div class="vacio">${ex.calSoloPendientes ? 'Nada pendiente en esta pregunta. Desmarca «Sólo las que faltan» para revisar o ajustar las ya calificadas.' : 'Sin entregas.'}</div>`}</div>`;

  cont.querySelector('#exCalPreg').addEventListener('change', ev => { ex.calPregunta = ev.target.value; exPintarPublicacion(); });
  cont.querySelector('#exCalSoloPend').addEventListener('change', ev => { ex.calSoloPendientes = ev.target.checked; exPintarPublicacion(); });
  cont.querySelector('#exCalAnon').addEventListener('change', ev => { ex.calAnonimo = ev.target.checked; exPintarPublicacion(); });

  const lista = cont.querySelector('#exCalLista');
  const orden = d.entregas.slice();
  entregas.forEach(e => lista.appendChild(exTarjetaCalificar(e, q, orden.indexOf(e) + 1, liberada)));
}

function exClaveReferencia(q, num) {
  const pts = evPuntosTexto(evMaxPregunta(q));
  let html = `<div class="sub-titulo">PREGUNTA ${num} · ${pts} PTS</div>${q.enunciado ? `<p class="ex-enunciado">${esc(q.enunciado)}</p>` : ''}`;
  if (q.contexto) html += `<pre class="ex-pre">${esc(q.contexto)}</pre>`;
  if (q.tipo === 'opcion') html += `<p><b>Correcta${(q.correctas || []).length > 1 ? 's' : ''}:</b> ${(q.correctas || []).map(i => esc(q.opciones[i])).join(' · ')}</p>`;
  if (q.tipo === 'corta') html += `<p><b>Aceptadas:</b> ${(q.aceptadas || []).map(esc).join(' · ')}</p>`;
  if (q.tipo === 'abierta') {
    if (q.modelo) html += `<p><b>Respuesta modelo:</b> <span style="white-space:pre-wrap;">${esc(q.modelo)}</span></p>`;
    if ((q.criterios || []).length) html += `<p><b>Criterios:</b> ${q.criterios.map(c => `${esc(c.texto)} (${evPuntosTexto(c.puntos)})`).join(' · ')}</p>`;
  }
  if (q.tipo === 'notam') html += `<pre class="ex-pre">${esc(q.notam || '')}</pre>`;
  return html;
}

function exTarjetaCalificar(e, q, n, liberada) {
  const card = document.createElement('div');
  card.className = 'panel-card ex-cal';
  const item = (e.calificacion || {})[q.id] || {};
  const r = (e.respuestas || {})[q.id];
  const nombre = ex.calAnonimo ? `Entrega ${n}` : `${e.estudiante_nombre}${e.intento > 1 ? ' · intento ' + e.intento : ''}`;
  const pendiente = (item.pendientes || 0) > 0;
  const max = Number(item.max != null ? item.max : evMaxPregunta(q));
  const anulada = item.anulada;

  let cuerpo = '';
  if (q.tipo === 'opcion') {
    const el = Array.isArray(r) ? r : [];
    cuerpo = `<div class="ex-respuesta">${el.length ? el.map(i => esc(q.opciones[i])).join(' · ') : '<i>Sin responder</i>'}</div>`;
  } else if (q.tipo === 'corta' || q.tipo === 'abierta') {
    cuerpo = `<div class="ex-respuesta">${typeof r === 'string' && r.trim() ? esc(r) : '<i>Sin responder</i>'}</div>`;
  } else if (q.tipo === 'notam') {
    const resp = r && typeof r === 'object' ? r : {};
    const cas = item.casillas || {};
    cuerpo = `<div class="tabla-scroll"><table class="tabla-datos ex-tabla-cal">
      <thead><tr><th>Casilla</th><th>Respondió</th><th>Clave</th><th>Puntos</th></tr></thead>
      <tbody>${(q.casillas || []).map(c => {
        const ci = cas[c.id] || {};
        const valor = ci.puntos === null || ci.puntos === undefined ? '' : ci.puntos;
        const pendiente = ci.puntos === null || ci.puntos === undefined;
        const marca = pendiente ? '' : ci.ok ? '<span class="ex-ok">✓</span> ' : '<span class="ex-mal">✗</span> ';
        return `<tr class="${pendiente ? 'ex-fila-pend' : ci.ok ? '' : 'ex-fila-mal'}">
          <td>${esc(c.etiqueta)}${ci.manual ? ' <span class="ex-tenue">(a mano)</span>' : ''}</td>
          <td>${marca}${evRespuestaCasillaLegible(c, resp[c.id])}</td>
          <td>${esc(evClaveLegible(c))}</td>
          <td class="ex-celda-pts"><input type="number" class="ex-pts-in" data-casilla="${esc(c.id)}" min="0" max="${esc(ci.max != null ? ci.max : c.puntos)}" step="0.5" value="${esc(valor)}" data-original="${esc(valor)}" aria-label="Puntos de ${esc(c.etiqueta)}"> / ${evPuntosTexto(ci.max != null ? ci.max : c.puntos)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  const criterios = q.tipo === 'abierta' && (q.criterios || []).length
    ? `<div class="ex-rubrica">${q.criterios.map((c, k) => `<label class="check-linea"><input type="checkbox" data-crit="${k}"> ${esc(c.texto)} <span class="ex-tenue">(${evPuntosTexto(c.puntos)})</span></label>`).join('')}</div>` : '';

  card.innerHTML = `
    <div class="ex-cal-cab">
      <b>${esc(nombre)}</b>
      ${anulada ? `<span class="badge-estado borrador">Anulada (${anulada === 'excluir' ? 'no cuenta' : 'puntaje completo'})</span>`
        : pendiente ? '<span class="badge-estado borrador">Por calificar</span>'
        : `<span class="badge-estado publicada">${evPuntosTexto(item.puntos)} / ${evPuntosTexto(max)}${item.manual ? ' · a mano' : ' · automática'}</span>`}
      <a class="ex-tenue" href="evaluacion.html?entrega=${encodeURIComponent(e.id)}" target="_blank" rel="noopener">Ver expediente</a>
    </div>
    ${cuerpo}
    ${criterios}
    <div class="ex-cal-pie">
      ${q.tipo !== 'notam' ? `<div class="campo ex-puntos"><label>Puntos (de ${evPuntosTexto(max)})</label><input type="number" class="ex-pts-in" data-total min="0" max="${max}" step="0.5" value="${item.puntos === null || item.puntos === undefined ? '' : esc(item.puntos)}" data-original="${item.puntos === null || item.puntos === undefined ? '' : esc(item.puntos)}"></div>` : ''}
      <div class="campo" style="flex:1;min-width:220px;"><label>Comentario para el estudiante</label><textarea data-comentario rows="2" maxlength="2000" placeholder="Lo verá cuando liberes las notas.">${esc(item.comentario || '')}</textarea></div>
      ${liberada ? '<div class="campo" style="flex:1;min-width:200px;"><label>Motivo del cambio</label><textarea data-motivo rows="2" maxlength="500" placeholder="Obligatorio: las notas ya se liberaron."></textarea></div>' : ''}
      <div class="campo" style="align-self:flex-end;"><button class="btn btn-primario btn-mini" type="button" data-guardar ${anulada ? 'disabled' : ''}>Guardar</button></div>
    </div>`;

  card.querySelectorAll('[data-crit]').forEach(chk => chk.addEventListener('change', () => {
    const suma = Array.from(card.querySelectorAll('[data-crit]:checked')).reduce((s, x) => s + (Number(q.criterios[+x.dataset.crit].puntos) || 0), 0);
    card.querySelector('[data-total]').value = Math.min(suma, max);
  }));

  card.querySelector('[data-guardar]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const comentario = card.querySelector('[data-comentario]').value;
    const motivoEl = card.querySelector('[data-motivo]');
    let puntos = null, casillas = null;
    if (q.tipo === 'notam') {
      card.querySelectorAll('[data-casilla]').forEach(inp => {
        if (inp.value === '' || inp.value === inp.dataset.original) return;
        casillas = casillas || {};
        casillas[inp.dataset.casilla] = Number(inp.value);
      });
    } else {
      const inp = card.querySelector('[data-total]');
      if (inp.value !== '' && inp.value !== inp.dataset.original) puntos = Number(inp.value);
    }
    const cambioComentario = (comentario || '') !== (item.comentario || '');
    if (puntos === null && casillas === null && !cambioComentario) { aviso('No cambiaste nada.', 'error'); return; }
    btn.disabled = true;
    const r = await exRpc('calificar_respuesta', {
      p_entrega: e.id, p_pregunta: q.id, p_puntos: puntos, p_casillas: casillas,
      p_comentario: cambioComentario ? comentario : null,
      p_motivo: motivoEl ? motivoEl.value : null
    });
    btn.disabled = false;
    if (!r.ok) { aviso(r.error, 'error'); return; }
    aviso(`Guardado. Nota de la entrega: ${r.data.porcentaje}%${r.data.pendientes ? ` · faltan ${r.data.pendientes} por calificar` : ''}.`, 'ok');
    await exCargarPublicacion();
    // Si ya no queda nada pendiente en esta pregunta, se pasa sola a la
    // siguiente que tenga pendientes (sólo en el modo «Sólo las que faltan»).
    if (ex.calSoloPendientes && !ex.pubDatos.entregas.some(x => (((x.calificacion || {})[q.id] || {}).pendientes || 0) > 0)) {
      ex.calPregunta = null;
    }
    exPintarPublicacion();
  });
  return card;
}

// ---------- Clave y ajustes ----------
function exPintarClave(cont, p) {
  const d = ex.pubDatos;
  const preg = exPreguntasCalificables();
  const liberada = p.estado === 'liberada';
  cont.innerHTML = `
    <div class="panel-card">
      <h3>Clave y ajustes de esta publicación</h3>
      <p class="card-sub">Si una clave estaba mal, corrígela aquí: se recalcula la parte automática de todas las entregas de esta publicación (lo que calificaste a mano no se toca) y queda en el historial de cada estudiante afectado${liberada ? ', que además verá el aviso con tu motivo' : ''}. La versión publicada no cambia: la corrección se guarda aparte.</p>
    </div>
    <div id="exClaveLista"></div>`;
  const lista = cont.querySelector('#exClaveLista');
  preg.forEach((q, i) => lista.appendChild(exTarjetaClave(p, q, i + 1, d.anuladas[q.id])));
}

function exTarjetaClave(p, q, num, anulada) {
  const card = document.createElement('div');
  card.className = 'panel-card';
  const corregible = q.tipo === 'opcion' || q.tipo === 'corta' || q.tipo === 'notam';
  card.innerHTML = `
    <div class="ex-q-cab">
      <div><span class="module-badge">Pregunta ${num}</span> <span class="ex-tenue">${EX_TIPOS[q.tipo]} · ${evPuntosTexto(evMaxPregunta(q))} pts</span>
        ${anulada ? `<span class="badge-estado borrador">Anulada: ${anulada === 'excluir' ? 'no cuenta' : 'puntaje completo para todos'}</span>` : ''}</div>
    </div>
    <div class="ex-clave-ref">${exClaveReferencia(q, num)}</div>
    <div class="ex-editor-clave"></div>
    <div class="ex-cal-pie">
      <div class="campo" style="flex:1;min-width:220px;"><label>Motivo (obligatorio)</label><input type="text" data-motivo maxlength="500" placeholder="Por qué corriges o anulas"></div>
      ${corregible ? '<div class="campo" style="align-self:flex-end;"><button class="btn btn-secundario btn-mini" type="button" data-corregir>Corregir la clave</button></div>' : ''}
      <div class="campo" style="align-self:flex-end;">
        <select data-anular aria-label="Anular pregunta">
          <option value="">Anular…</option>
          <option value="completo">Anular: puntaje completo para todos</option>
          <option value="excluir">Anular: que no cuente</option>
          ${anulada ? '<option value="ninguno">Deshacer la anulación</option>' : ''}
        </select>
      </div>
    </div>`;
  const zona = card.querySelector('.ex-editor-clave');
  const motivo = () => card.querySelector('[data-motivo]').value.trim();

  const btn = card.querySelector('[data-corregir]');
  if (btn) btn.addEventListener('click', async () => {
    if (!zona.innerHTML) { zona.innerHTML = exFormularioClave(q); btn.textContent = 'Guardar la clave corregida'; return; }
    if (!motivo()) { aviso('Escribe el motivo de la corrección.', 'error'); return; }
    const clave = exLeerFormularioClave(q, zona);
    if (!clave) return;
    if (!confirm('¿Corregir la clave y recalcular todas las entregas de esta publicación?')) return;
    const r = await exRpc('corregir_clave_publicacion', { p_pub: p.id, p_pregunta: q.id, p_clave: clave, p_motivo: motivo() });
    if (!r.ok) { aviso(r.error, 'error'); return; }
    aviso(`Clave corregida. ${r.data.cambiaron} de ${r.data.entregas} entrega${r.data.entregas === 1 ? '' : 's'} cambiaron de nota.`, 'ok');
    await exRefrescarPublicacion();
  });

  card.querySelector('[data-anular]').addEventListener('change', async ev => {
    const modo = ev.target.value;
    if (!modo) return;
    if (!motivo()) { aviso('Escribe el motivo antes de anular.', 'error'); ev.target.value = ''; return; }
    const txt = { completo: 'todos recibirán el puntaje completo de esta pregunta', excluir: 'esta pregunta dejará de contar para la nota', ninguno: 'la pregunta vuelve a calificarse normalmente' }[modo];
    if (!confirm(`¿Seguro? ${txt[0].toUpperCase() + txt.slice(1)}. Se recalculan todas las entregas.`)) { ev.target.value = ''; return; }
    const r = await exRpc('anular_pregunta_publicacion', { p_pub: p.id, p_pregunta: q.id, p_modo: modo, p_motivo: motivo() });
    if (!r.ok) { aviso(r.error, 'error'); ev.target.value = ''; return; }
    aviso(`Listo. ${r.data.cambiaron} de ${r.data.entregas} entrega${r.data.entregas === 1 ? '' : 's'} cambiaron de nota.`, 'ok');
    await exRefrescarPublicacion();
  });
  return card;
}

function exFormularioClave(q) {
  if (q.tipo === 'opcion') {
    return `<div class="sub-bloque"><div class="sub-titulo">MARCA LA(S) CORRECTA(S)</div>${(q.opciones || []).map((o, i) => `
      <label class="check-linea"><input type="checkbox" data-op="${i}" ${(q.correctas || []).includes(i) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  }
  if (q.tipo === 'corta') {
    return `<div class="sub-bloque"><div class="sub-titulo">RESPUESTAS ACEPTADAS — UNA POR LÍNEA</div><textarea data-acept style="min-height:70px;">${esc((q.aceptadas || []).join('\n'))}</textarea></div>`;
  }
  return `<div class="sub-bloque"><div class="sub-titulo">CLAVE DE CADA CASILLA</div>${(q.casillas || []).map((c, k) => `
    <div class="ex-casilla" data-cas="${k}">
      <b>${esc(c.etiqueta)}</b>
      <div class="ex-casilla-clave">${exControlClave(c)}</div>
      ${c.entrada === 'texto' ? `<input type="text" data-variantes value="${esc((c.aceptadas || []).join(' | '))}" placeholder="Otras respuestas válidas, separadas por |">` : '<span></span>'}
    </div>`).join('')}</div>`;
}

function exLeerFormularioClave(q, zona) {
  if (q.tipo === 'opcion') {
    const correctas = Array.from(zona.querySelectorAll('[data-op]:checked')).map(x => +x.dataset.op);
    if (!correctas.length) { aviso('Marca al menos una opción correcta.', 'error'); return null; }
    return { correctas };
  }
  if (q.tipo === 'corta') {
    const aceptadas = zona.querySelector('[data-acept]').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!aceptadas.length) { aviso('Escribe al menos una respuesta aceptada.', 'error'); return null; }
    return { aceptadas };
  }
  const casillas = (q.casillas || []).map((c0, k) => {
    const c = JSON.parse(JSON.stringify(c0));
    const fila = zona.querySelector(`[data-cas="${k}"]`);
    if (c.entrada === 'fecha_fin') {
      const perm = fila.querySelector('[data-clave-perm]').checked;
      c.clave = { perm, fecha: perm ? '' : fila.querySelector('[data-clave-fecha]').value, est: perm ? false : fila.querySelector('[data-clave-est]').checked };
    } else {
      c.clave = fila.querySelector('[data-clave]').value;
    }
    const vari = fila.querySelector('[data-variantes]');
    const out = { id: c.id, clave: c.clave };
    if (vari) out.aceptadas = vari.value.split('|').map(x => x.trim()).filter(Boolean);
    return out;
  });
  return { casillas };
}

// ---------- Historial ----------
const EX_ACCIONES = {
  publicar: 'Publicación',
  actualizar_publicacion: 'Fechas o intentos cambiados',
  actualizar_version: 'Cambio de versión',
  cerrar: 'Entregas cerradas',
  reabrir: 'Entregas reabiertas',
  retirar: 'Publicación retirada',
  entrega: 'Entrega',
  calificar: 'Calificación',
  recalculo: 'Recálculo automático',
  corregir_clave: 'Clave corregida',
  anular: 'Pregunta anulada',
  liberar: 'Notas liberadas',
  eliminar_examen: 'Examen eliminado',
  restaurar_examen: 'Examen restaurado'
};

function exPintarHistorial(cont) {
  const d = ex.pubDatos;
  const nombreDe = id => {
    const e = d.entregas.find(x => x.id === id);
    return e ? `${e.estudiante_nombre}${e.intento > 1 ? ' (intento ' + e.intento + ')' : ''}` : '';
  };
  const numPreg = id => {
    const i = exPreguntasCalificables().findIndex(q => q.id === id);
    return i >= 0 ? `pregunta ${i + 1}` : '';
  };
  const detalle = h => {
    const x = h.detalle || {};
    const partes = [];
    if (x.pregunta) partes.push(numPreg(x.pregunta));
    if (x.version) partes.push('versión v' + x.version);
    if (x.modo) partes.push({ completo: 'puntaje completo', excluir: 'no cuenta', ninguno: 'anulación deshecha' }[x.modo] || x.modo);
    const antes = x.antes && (x.antes.totales ? x.antes.totales.porcentaje : x.antes.porcentaje);
    const despues = x.despues && (x.despues.totales ? x.despues.totales.porcentaje : x.despues.porcentaje);
    if (antes !== undefined && despues !== undefined && antes !== null) partes.push(`${antes}% → ${despues}%`);
    if (h.accion === 'entrega' && x.totales_automaticos) partes.push(`parte automática ${evPuntosTexto(x.totales_automaticos.puntaje)} pts`);
    if (x.tras_liberar) partes.push('después de liberar');
    return partes.filter(Boolean).join(' · ');
  };
  cont.innerHTML = `
    <div class="panel-card">
      <h3>Historial de esta publicación</h3>
      <p class="card-sub">Todo lo que pasó, en orden. Este registro no se puede editar ni borrar, ni siquiera eliminando el examen o el grupo.</p>
      ${d.historial.length === 0 ? '<div class="vacio">Sin movimientos.</div>' : `
      <div class="tabla-scroll"><table class="tabla-datos">
        <thead><tr><th>Fecha</th><th>Acción</th><th>Estudiante</th><th>Detalle</th><th>Motivo</th></tr></thead>
        <tbody>${d.historial.slice().reverse().map(h => `<tr>
          <td>${fechaCorta(h.creado_en)}</td>
          <td>${esc(EX_ACCIONES[h.accion] || h.accion)}</td>
          <td>${esc(h.entrega_id ? nombreDe(h.entrega_id) : '')}</td>
          <td>${esc(detalle(h))}</td>
          <td>${esc(h.motivo || '')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`}
    </div>`;
}
