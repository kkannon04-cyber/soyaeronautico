// ============================================================
// PANEL DEL PROFESOR — acceso a datos (SoyAeronautico)
//
// Solo lo carga panel-profesor.html. No se agregó a progreso.js
// (que cargan 11+ páginas de estudiante) para no hacerles descargar
// código que nunca van a usar.
//
// Requiere supabase-js, supabase-config.js y progreso.js cargados
// antes (usa obtenerClienteAuth() y obtenerSesionActual() de ahí).
//
// Todas las funciones devuelven { ok:true, ... } o { ok:false, error }
// para que la interfaz pueda mostrar un mensaje honesto en vez de
// asumir éxito. No hay modo invitado: sin sesión, no hay profesor.
// ============================================================

async function _sesionProfesor() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return null;
  return sesion;
}

// ============================================================
// GRUPOS
// ============================================================

async function crearGrupo(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, error: 'Ponle un nombre al grupo.' };

  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('grupos')
    .insert({ profesor_id: sesion.user.id, nombre: limpio })
    .select('id, nombre, codigo, creado_en')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, grupo: data };
}

// Devuelve los grupos del profesor con cuántos estudiantes tiene cada uno.
async function obtenerMisGrupos() {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.', grupos: [] };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('grupos')
    .select('id, nombre, codigo, creado_en, inscripciones(count)')
    .eq('profesor_id', sesion.user.id)
    .order('creado_en', { ascending: true });

  if (error) return { ok: false, error: error.message, grupos: [] };

  const grupos = (data || []).map(g => ({
    id: g.id,
    nombre: g.nombre,
    codigo: g.codigo,
    creadoEn: g.creado_en,
    estudiantes: _leerConteo(g.inscripciones)
  }));
  return { ok: true, grupos };
}

// PostgREST devuelve los agregados como [{ count: n }] (o { count: n }
// según la versión); esta función tolera ambas formas y la ausencia.
function _leerConteo(valor) {
  if (!valor) return 0;
  if (Array.isArray(valor)) return valor.length ? (valor[0].count || 0) : 0;
  return valor.count || 0;
}

async function renombrarGrupo(grupoId, nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, error: 'El nombre no puede quedar vacío.' };

  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('grupos').update({ nombre: limpio }).eq('id', grupoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function borrarGrupo(grupoId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('grupos').delete().eq('id', grupoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function obtenerEstudiantesDeGrupo(grupoId) {
  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('inscripciones')
    .select('estudiante_id, fecha, perfiles(nombre, apellido)')
    .eq('grupo_id', grupoId)
    .order('fecha', { ascending: true });

  if (error) return { ok: false, error: error.message, estudiantes: [] };

  const estudiantes = (data || []).map(i => ({
    id: i.estudiante_id,
    nombre: _nombreCompleto(i.perfiles),
    desde: i.fecha
  }));
  return { ok: true, estudiantes };
}

function _nombreCompleto(perfil) {
  if (!perfil) return 'Estudiante';
  const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim();
  return nombre || 'Estudiante';
}

async function retirarEstudiante(grupoId, estudianteId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente
    .from('inscripciones')
    .delete()
    .eq('grupo_id', grupoId)
    .eq('estudiante_id', estudianteId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================
// BANCOS DE PREGUNTAS
//
// Un profesor puede tener tantos bancos como quiera ("ATS básico",
// "Meteorología parcial 1"…). Cada pregunta vive en un banco, y al
// armar un examen se elige de qué bancos salen las preguntas.
// ============================================================

async function crearBanco(nombre, descripcion) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, error: 'Ponle un nombre al banco.' };

  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('bancos')
    .insert({
      profesor_id: sesion.user.id,
      nombre: limpio,
      descripcion: (descripcion || '').trim() || null
    })
    .select('id, nombre, descripcion, creado_en')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, banco: data };
}

async function obtenerMisBancos() {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.', bancos: [] };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('bancos')
    .select('id, nombre, descripcion, creado_en, preguntas(count)')
    .eq('profesor_id', sesion.user.id)
    .order('creado_en', { ascending: true });

  if (error) return { ok: false, error: error.message, bancos: [] };

  const bancos = (data || []).map(b => ({
    id: b.id,
    nombre: b.nombre,
    descripcion: b.descripcion,
    creadoEn: b.creado_en,
    preguntas: _leerConteo(b.preguntas)
  }));
  return { ok: true, bancos };
}

async function actualizarBanco(bancoId, nombre, descripcion) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, error: 'El nombre del banco no puede quedar vacío.' };

  const cliente = obtenerClienteAuth();
  const { error } = await cliente
    .from('bancos')
    .update({ nombre: limpio, descripcion: (descripcion || '').trim() || null })
    .eq('id', bancoId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function borrarBanco(bancoId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('bancos').delete().eq('id', bancoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Toma n preguntas al azar de una lista (Fisher-Yates sobre una copia,
// para no alterar el orden del banco original).
function elegirPreguntasAlAzar(preguntas, n) {
  const copia = (preguntas || []).slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, Math.max(0, Math.min(n, copia.length)));
}

// ============================================================
// PREGUNTAS
// ============================================================

async function crearPregunta({ bancoId, enunciado, opciones, correcta, tema }) {
  if (!bancoId) return { ok: false, error: 'Elige a qué banco va la pregunta.' };

  const validacion = _validarPregunta(enunciado, opciones, correcta);
  if (!validacion.ok) return validacion;

  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('preguntas')
    .insert({
      profesor_id: sesion.user.id,
      banco_id: bancoId,
      enunciado: enunciado.trim(),
      opciones: opciones.map(o => o.trim()),
      correcta: Number(correcta),
      tema: (tema || '').trim() || null
    })
    .select('id, banco_id, enunciado, opciones, correcta, tema, creado_en')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, pregunta: data };
}

function _validarPregunta(enunciado, opciones, correcta) {
  if (!enunciado || !enunciado.trim()) return { ok: false, error: 'Escribe el enunciado de la pregunta.' };
  if (!Array.isArray(opciones) || opciones.length !== 4) return { ok: false, error: 'Cada pregunta necesita exactamente 4 opciones.' };
  if (opciones.some(o => !o || !o.trim())) return { ok: false, error: 'Ninguna de las 4 opciones puede quedar vacía.' };
  const idx = Number(correcta);
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) return { ok: false, error: 'Marca cuál de las 4 opciones es la correcta.' };
  return { ok: true };
}

// Importación en lote: una pregunta por línea, con este formato
//   enunciado | opción 1 | opción 2 | opción 3 | opción 4 | número correcto (1-4) | tema (opcional)
// Devuelve cuántas se crearon y qué líneas fallaron, sin abortar todo
// el lote por un error de formato en una sola línea.
async function importarPreguntasEnLote(texto, bancoId) {
  if (!bancoId) return { ok: false, error: 'Elige a qué banco van las preguntas importadas.' };

  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const lineas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) return { ok: false, error: 'No hay ninguna línea para importar.' };

  const filas = [];
  const errores = [];

  lineas.forEach((linea, i) => {
    const partes = linea.split('|').map(p => p.trim());
    if (partes.length < 6) {
      errores.push(`Línea ${i + 1}: faltan campos (se esperan al menos 6 separados por "|").`);
      return;
    }
    const enunciado = partes[0];
    const opciones = partes.slice(1, 5);
    const correcta = Number(partes[5]) - 1; // el profesor escribe 1-4, la base guarda 0-3
    const tema = partes[6] || null;

    const validacion = _validarPregunta(enunciado, opciones, correcta);
    if (!validacion.ok) {
      errores.push(`Línea ${i + 1}: ${validacion.error}`);
      return;
    }
    filas.push({
      profesor_id: sesion.user.id,
      banco_id: bancoId,
      enunciado,
      opciones,
      correcta,
      tema: tema || null
    });
  });

  if (filas.length === 0) return { ok: false, error: 'Ninguna línea tenía el formato correcto.', errores };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.from('preguntas').insert(filas).select('id');
  if (error) return { ok: false, error: error.message, errores };

  return { ok: true, creadas: data ? data.length : filas.length, errores };
}

// Devuelve TODAS las preguntas del profesor, de todos sus bancos. El
// filtrado por banco se hace en la interfaz, que ya las tiene en memoria.
async function obtenerBancoPreguntas() {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.', preguntas: [] };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('preguntas')
    .select('id, banco_id, enunciado, opciones, correcta, tema, creado_en')
    .eq('profesor_id', sesion.user.id)
    .order('creado_en', { ascending: false });

  if (error) return { ok: false, error: error.message, preguntas: [] };
  return { ok: true, preguntas: data || [] };
}

// bancoId permite además mover una pregunta de un banco a otro.
async function actualizarPregunta(preguntaId, { bancoId, enunciado, opciones, correcta, tema }) {
  if (!bancoId) return { ok: false, error: 'Elige a qué banco pertenece la pregunta.' };

  const validacion = _validarPregunta(enunciado, opciones, correcta);
  if (!validacion.ok) return validacion;

  const cliente = obtenerClienteAuth();
  const { error } = await cliente
    .from('preguntas')
    .update({
      banco_id: bancoId,
      enunciado: enunciado.trim(),
      opciones: opciones.map(o => o.trim()),
      correcta: Number(correcta),
      tema: (tema || '').trim() || null
    })
    .eq('id', preguntaId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function borrarPregunta(preguntaId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('preguntas').delete().eq('id', preguntaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================
// ACTIVIDADES
// ============================================================

async function crearActividad(datos) {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const validacion = _validarActividad(datos);
  if (!validacion.ok) return validacion;

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('actividades')
    .insert({
      profesor_id: sesion.user.id,
      grupo_id: datos.grupoId,
      tipo: datos.tipo,
      titulo: datos.titulo.trim(),
      descripcion: (datos.descripcion || '').trim() || null,
      texto_lectura: datos.tipo === 'texto' ? (datos.textoLectura || '').trim() : null,
      activa: datos.activa !== false,
      fecha_limite: datos.fechaLimite || null,
      intentos_max: datos.intentosMax || null,
      barajar: !!datos.barajar
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  const vinculo = await _guardarPreguntasDeActividad(data.id, datos.preguntas);
  if (!vinculo.ok) return vinculo;

  return { ok: true, actividadId: data.id };
}

function _validarActividad(datos) {
  if (!datos.grupoId) return { ok: false, error: 'Elige a qué grupo va dirigida la actividad.' };
  if (!datos.titulo || !datos.titulo.trim()) return { ok: false, error: 'Ponle un título a la actividad.' };
  if (datos.tipo !== 'examen' && datos.tipo !== 'texto') return { ok: false, error: 'Tipo de actividad no válido.' };
  if (datos.tipo === 'texto' && (!datos.textoLectura || !datos.textoLectura.trim())) {
    return { ok: false, error: 'Una actividad de texto necesita el material de lectura.' };
  }
  if (!Array.isArray(datos.preguntas) || datos.preguntas.length === 0) {
    return { ok: false, error: 'Selecciona al menos una pregunta del banco.' };
  }
  if (datos.tipo === 'texto' && datos.preguntas.length !== 1) {
    return { ok: false, error: 'Una actividad de texto lleva exactamente 1 pregunta de comprensión.' };
  }
  return { ok: true };
}

async function _guardarPreguntasDeActividad(actividadId, preguntaIds) {
  const cliente = obtenerClienteAuth();

  // Al editar, se reemplaza el conjunto completo: es más simple y más
  // predecible que intentar calcular altas/bajas una por una.
  const { error: errorBorrado } = await cliente
    .from('actividad_preguntas')
    .delete()
    .eq('actividad_id', actividadId);
  if (errorBorrado) return { ok: false, error: errorBorrado.message };

  const filas = (preguntaIds || []).map((pid, i) => ({
    actividad_id: actividadId,
    pregunta_id: pid,
    orden: i
  }));
  if (filas.length === 0) return { ok: true };

  const { error } = await cliente.from('actividad_preguntas').insert(filas);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function obtenerActividadesProfesor(grupoId) {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.', actividades: [] };

  const cliente = obtenerClienteAuth();
  let consulta = cliente
    .from('actividades')
    .select('id, grupo_id, tipo, titulo, descripcion, texto_lectura, activa, fecha_limite, intentos_max, barajar, creado_en, actividad_preguntas(count), grupos(nombre)')
    .eq('profesor_id', sesion.user.id)
    .order('creado_en', { ascending: false });

  if (grupoId) consulta = consulta.eq('grupo_id', grupoId);

  const { data, error } = await consulta;
  if (error) return { ok: false, error: error.message, actividades: [] };

  const actividades = (data || []).map(a => ({
    id: a.id,
    grupoId: a.grupo_id,
    grupoNombre: a.grupos ? a.grupos.nombre : '',
    tipo: a.tipo,
    titulo: a.titulo,
    descripcion: a.descripcion,
    textoLectura: a.texto_lectura,
    activa: a.activa,
    fechaLimite: a.fecha_limite,
    intentosMax: a.intentos_max,
    barajar: a.barajar,
    creadoEn: a.creado_en,
    numPreguntas: _leerConteo(a.actividad_preguntas)
  }));
  return { ok: true, actividades };
}

async function obtenerPreguntasDeActividad(actividadId) {
  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('actividad_preguntas')
    .select('pregunta_id, orden')
    .eq('actividad_id', actividadId)
    .order('orden', { ascending: true });

  if (error) return { ok: false, error: error.message, ids: [] };
  return { ok: true, ids: (data || []).map(f => f.pregunta_id) };
}

async function actualizarActividad(actividadId, datos) {
  const validacion = _validarActividad(datos);
  if (!validacion.ok) return validacion;

  const cliente = obtenerClienteAuth();
  const { error } = await cliente
    .from('actividades')
    .update({
      grupo_id: datos.grupoId,
      tipo: datos.tipo,
      titulo: datos.titulo.trim(),
      descripcion: (datos.descripcion || '').trim() || null,
      texto_lectura: datos.tipo === 'texto' ? (datos.textoLectura || '').trim() : null,
      activa: datos.activa !== false,
      fecha_limite: datos.fechaLimite || null,
      intentos_max: datos.intentosMax || null,
      barajar: !!datos.barajar
    })
    .eq('id', actividadId);

  if (error) return { ok: false, error: error.message };

  const vinculo = await _guardarPreguntasDeActividad(actividadId, datos.preguntas);
  if (!vinculo.ok) return vinculo;

  return { ok: true };
}

// Publicar / despublicar sin abrir el formulario completo.
async function cambiarEstadoActividad(actividadId, activa) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('actividades').update({ activa: !!activa }).eq('id', actividadId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Copia una actividad (con sus preguntas) a otro grupo, sin arrastrar
// los resultados del original. Útil para repetir el mismo parcial con
// otro curso sin volver a armarlo.
async function duplicarActividad(actividadId, grupoDestinoId) {
  const sesion = await _sesionProfesor();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data: original, error } = await cliente
    .from('actividades')
    .select('grupo_id, tipo, titulo, descripcion, texto_lectura, fecha_limite, intentos_max, barajar')
    .eq('id', actividadId)
    .single();

  if (error) return { ok: false, error: error.message };

  const preguntas = await obtenerPreguntasDeActividad(actividadId);
  if (!preguntas.ok) return preguntas;

  return crearActividad({
    grupoId: grupoDestinoId || original.grupo_id,
    tipo: original.tipo,
    titulo: `${original.titulo} (copia)`,
    descripcion: original.descripcion,
    textoLectura: original.texto_lectura,
    activa: false, // la copia nace sin publicar, para revisarla antes
    fechaLimite: original.fecha_limite,
    intentosMax: original.intentos_max,
    barajar: original.barajar,
    preguntas: preguntas.ids
  });
}

async function borrarActividad(actividadId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('actividades').delete().eq('id', actividadId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================
// RESULTADOS
// ============================================================

// Todos los intentos de todas las actividades de un grupo, con el
// nombre del estudiante y el detalle por pregunta.
async function obtenerResultadosDeGrupo(grupoId) {
  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('resultados_actividad')
    .select('id, actividad_id, estudiante_id, correctas, total, porcentaje, fecha, detalle, actividades!inner(id, titulo, tipo, grupo_id), perfiles(nombre, apellido)')
    .eq('actividades.grupo_id', grupoId)
    .order('fecha', { ascending: false });

  if (error) return { ok: false, error: error.message, resultados: [] };

  const resultados = (data || []).map(r => ({
    id: r.id,
    actividadId: r.actividad_id,
    actividadTitulo: r.actividades ? r.actividades.titulo : '',
    actividadTipo: r.actividades ? r.actividades.tipo : '',
    estudianteId: r.estudiante_id,
    estudiante: _nombreCompleto(r.perfiles),
    correctas: r.correctas,
    total: r.total,
    porcentaje: r.porcentaje,
    fecha: r.fecha,
    detalle: r.detalle || []
  }));
  return { ok: true, resultados };
}

async function borrarResultado(resultadoId) {
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('resultados_actividad').delete().eq('id', resultadoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Resumen estudiante × actividad: intentos, mejor, promedio y último.
// Incluye a los estudiantes inscritos que todavía no han presentado
// (fila con 0 intentos), que es justo lo que el profesor necesita ver.
function resumirResultados(estudiantes, actividades, resultados) {
  const filas = [];
  estudiantes.forEach(est => {
    actividades.forEach(act => {
      const propios = resultados.filter(r => r.estudianteId === est.id && r.actividadId === act.id);
      if (propios.length === 0) {
        filas.push({
          estudiante: est.nombre, estudianteId: est.id,
          actividad: act.titulo, actividadId: act.id, tipo: act.tipo,
          intentos: 0, mejor: null, promedio: null, ultimo: null, ultimaFecha: null
        });
        return;
      }
      const porcentajes = propios.map(r => r.porcentaje);
      const ordenados = propios.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      filas.push({
        estudiante: est.nombre, estudianteId: est.id,
        actividad: act.titulo, actividadId: act.id, tipo: act.tipo,
        intentos: propios.length,
        mejor: Math.max(...porcentajes),
        promedio: Math.round(porcentajes.reduce((s, p) => s + p, 0) / porcentajes.length),
        ultimo: ordenados[0].porcentaje,
        ultimaFecha: ordenados[0].fecha
      });
    });
  });
  return filas;
}

// Qué preguntas está fallando más el grupo. Sale del campo "detalle"
// que guarda calificar_actividad() con la respuesta de cada pregunta.
function estadisticaPorPregunta(resultados, banco) {
  const porPregunta = {};
  resultados.forEach(r => {
    (r.detalle || []).forEach(d => {
      const acc = porPregunta[d.pregunta_id] || { respuestas: 0, aciertos: 0 };
      acc.respuestas++;
      if (d.ok) acc.aciertos++;
      porPregunta[d.pregunta_id] = acc;
    });
  });

  const porId = {};
  (banco || []).forEach(p => { porId[p.id] = p; });

  return Object.keys(porPregunta).map(id => {
    const acc = porPregunta[id];
    const pregunta = porId[id];
    return {
      id,
      enunciado: pregunta ? pregunta.enunciado : '(pregunta eliminada del banco)',
      tema: pregunta ? pregunta.tema : null,
      respuestas: acc.respuestas,
      aciertos: acc.aciertos,
      porcentajeAcierto: Math.round((acc.aciertos / acc.respuestas) * 100)
    };
  }).sort((a, b) => a.porcentajeAcierto - b.porcentajeAcierto);
}

// ============================================================
// EXPORTACIÓN A EXCEL (CSV)
//
// Se genera un CSV en vez de un .xlsx real para no agregar ninguna
// librería externa al proyecto: Excel lo abre directamente. Se usa el
// punto y coma como separador y se antepone el BOM UTF-8, que es lo
// que Excel en español espera para respetar tildes y columnas.
// ============================================================

function _celdaCSV(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function construirCSV(encabezados, filas) {
  const lineas = [encabezados.map(_celdaCSV).join(';')];
  filas.forEach(fila => lineas.push(fila.map(_celdaCSV).join(';')));
  return String.fromCharCode(0xFEFF) + lineas.join('\r\n');
}

function descargarCSV(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _fechaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function _fechaArchivo() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Una fila por estudiante y actividad (con quienes no han presentado).
function exportarResumenCSV(nombreGrupo, filasResumen) {
  const contenido = construirCSV(
    ['Estudiante', 'Actividad', 'Tipo', 'Intentos', 'Mejor %', 'Promedio %', 'Último %', 'Última entrega'],
    filasResumen.map(f => [
      f.estudiante, f.actividad, f.tipo === 'examen' ? 'Examen' : 'Texto',
      f.intentos,
      f.mejor === null ? 'Sin presentar' : f.mejor,
      f.promedio === null ? '' : f.promedio,
      f.ultimo === null ? '' : f.ultimo,
      _fechaLegible(f.ultimaFecha)
    ])
  );
  descargarCSV(`resumen-${_nombreArchivoSeguro(nombreGrupo)}-${_fechaArchivo()}.csv`, contenido);
}

// Una fila por intento individual.
function exportarDetalleCSV(nombreGrupo, resultados) {
  const contenido = construirCSV(
    ['Estudiante', 'Actividad', 'Tipo', 'Fecha', 'Correctas', 'Total', 'Porcentaje'],
    resultados.map(r => [
      r.estudiante, r.actividadTitulo, r.actividadTipo === 'examen' ? 'Examen' : 'Texto',
      _fechaLegible(r.fecha), r.correctas, r.total, r.porcentaje
    ])
  );
  descargarCSV(`detalle-${_nombreArchivoSeguro(nombreGrupo)}-${_fechaArchivo()}.csv`, contenido);
}

function _nombreArchivoSeguro(texto) {
  return (texto || 'grupo')
    .normalize('NFD').split('').filter(c => c.charCodeAt(0) < 128).join('')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'grupo';
}
