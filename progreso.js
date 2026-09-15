// ============================================================
// PROGRESO DEL ESTUDIANTE — SoyAeronautico
// Si el estudiante inició sesión (Supabase), el progreso se guarda
// en la nube. Si no, funciona en modo invitado con localStorage,
// igual que antes. Pensado para no romper nada si Supabase no
// está configurado todavía (ver supabase-config.js).
// ============================================================

const AIS_PROGRESO_KEY = 'aisProgreso';
const AIS_NOMBRE_KEY = 'aisNombreEstudiante';
const AIS_APELLIDO_KEY = 'aisApellidoEstudiante';
const AIS_MIGRADO_KEY = 'aisProgresoMigrado';

function obtenerClienteAuth() {
  return (typeof sbClient !== 'undefined' && sbClient) ? sbClient : null;
}

// ------------------------------------------------------------------
// COMPROBACIÓN DE SESIÓN — robusta a bloqueos de supabase-js
//
// supabase-js v2 serializa el acceso al token con un lock del navegador
// (navigator.locks). Cuando varias llamadas a getSession() coinciden —y en
// estas páginas coinciden: auth-gate.js más cada render del panel— la promesa
// puede quedarse esperando el lock indefinidamente. El síntoma era exacto:
// el login respondía 200, pero la página siguiente se quedaba colgada en
// "Verificando acceso…" sin llegar a pedir ni un solo dato.
//
// Dos defensas:
//  1) Una sola llamada real a getSession() compartida por todos (single-flight),
//     en vez de una estampida de llamadas peleando por el mismo lock.
//  2) Un tiempo límite: si getSession() no responde, se lee la sesión que
//     supabase-js ya dejó guardada en localStorage, que no necesita el lock.
// ------------------------------------------------------------------
const AIS_TIMEOUT_SESION_MS = 4000;
let _sesionEnCurso = null;

function leerSesionGuardada() {
  // Formato de supabase-js v2: clave sb-<ref>-auth-token con el JSON de la sesión.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (!clave || !/^sb-.*-auth-token$/.test(clave)) continue;
      const guardado = JSON.parse(localStorage.getItem(clave));
      const sesion = (guardado && guardado.access_token) ? guardado
                   : (guardado && guardado.currentSession) ? guardado.currentSession
                   : null;
      if (!sesion || !sesion.access_token) continue;
      // expires_at viene en segundos desde epoch
      if (sesion.expires_at && sesion.expires_at * 1000 < Date.now()) continue;
      return sesion;
    }
  } catch (e) { /* localStorage bloqueado o JSON corrupto: se trata como "sin sesión" */ }
  return null;
}

async function obtenerSesionActual() {
  const cliente = obtenerClienteAuth();
  if (!cliente) return null;
  if (_sesionEnCurso) return _sesionEnCurso;

  _sesionEnCurso = (async function () {
    const conTiempoLimite = Promise.race([
      cliente.auth.getSession().then(({ data }) => (data && data.session) ? data.session : null),
      new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), AIS_TIMEOUT_SESION_MS))
    ]);

    let sesion;
    try {
      sesion = await conTiempoLimite;
    } catch (e) {
      sesion = 'TIMEOUT';
    }

    if (sesion === 'TIMEOUT') {
      console.warn('getSession() no respondió a tiempo; se usa la sesión guardada en el navegador.');
      sesion = leerSesionGuardada();
    }
    return sesion;
  })();

  // La respuesta se cachea sólo un instante: lo justo para que las llamadas
  // simultáneas del arranque compartan una sola consulta, sin dejar una sesión
  // obsoleta viva durante toda la visita.
  const resultado = await _sesionEnCurso;
  setTimeout(() => { _sesionEnCurso = null; }, 1500);
  return resultado;
}

function obtenerIntentosLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(AIS_PROGRESO_KEY));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// ---------- GUARDAR INTENTO ----------
// Devuelve { ok: true } o { ok: false, error } para que quien llama pueda
// mostrar un mensaje honesto en vez de asumir siempre éxito (ver bug real
// del 2026-08-29: los 2 quizzes de Navegación mostraban "guardado" mientras
// el insert fallaba en silencio por un constraint desactualizado).
// El 5º parámetro `detalle` es opcional y retrocompatible: las llamadas que
// solo pasan 4 argumentos siguen funcionando igual. Cuando viene, guarda qué
// preguntas se fallaron para que el panel pueda decir QUÉ repasar.
// Forma esperada: { v:1, preguntas:[{i, ok, tema}] } (usa construirDetalleIntento).
const AIS_DETALLE_MAX_BYTES = 20000;

// Un detalle demasiado grande nunca debe costar la nota: se descarta el
// detalle, no el intento.
function _detalleSeguro(detalle) {
  if (!detalle) return null;
  try {
    const txt = JSON.stringify(detalle);
    if (txt.length > AIS_DETALLE_MAX_BYTES) {
      console.warn('Detalle del intento demasiado grande (' + txt.length + ' car.); se guarda el intento sin detalle.');
      return null;
    }
    return detalle;
  } catch (e) {
    console.warn('El detalle del intento no es serializable; se guarda sin detalle.', e);
    return null;
  }
}

async function guardarIntento(modulo, nombreModulo, correctas, total, detalle) {
  // Lista blanca en un solo sitio (modulos.js). Falla ruidosamente aquí en vez
  // de en silencio contra un constraint de la base, que es el bug que este
  // proyecto ya sufrió cuatro veces. La guarda de typeof permite que una
  // página que olvide cargar modulos.js degrade en vez de romperse.
  if (typeof esModuloValido === 'function' && !esModuloValido(modulo)) {
    const aviso = 'guardarIntento: el módulo "' + modulo + '" no está en MODULOS_CATALOGO (modulos.js). Añádelo ahí.';
    console.error(aviso);
    return { ok: false, error: aviso };
  }

  const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
  const sesion = await obtenerSesionActual();
  const detalleOk = _detalleSeguro(detalle);

  if (sesion) {
    const cliente = obtenerClienteAuth();
    const fila = {
      usuario_id: sesion.user.id,
      modulo,
      nombre_modulo: nombreModulo,
      correctas,
      total,
      porcentaje
    };
    if (detalleOk) fila.detalle = detalleOk;

    let { error } = await cliente.from('intentos').insert(fila);

    // Si falló y llevábamos detalle, reintentamos sin él: la nota del
    // estudiante nunca se pierde por culpa del payload nuevo.
    if (error && detalleOk) {
      console.warn('El insert con detalle falló (' + error.message + '); se reintenta sin detalle.');
      delete fila.detalle;
      ({ error } = await cliente.from('intentos').insert(fila));
    }

    if (error) {
      console.error('No se pudo guardar el intento en Supabase:', error.message);
      return { ok: false, error: error.message };
    }
    invalidarCacheIntentos();
    return { ok: true };
  }

  const intentos = obtenerIntentosLocal();
  intentos.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    modulo,
    nombreModulo,
    fecha: new Date().toISOString(),
    correctas,
    total,
    porcentaje,
    detalle: detalleOk
  });
  // localStorage puede lanzar QuotaExceededError (y con `detalle` el riesgo
  // sube). Antes esto tumbaba guardarIntento() entero.
  try {
    localStorage.setItem(AIS_PROGRESO_KEY, JSON.stringify(intentos));
  } catch (e) {
    console.error('No se pudo guardar el intento en este navegador:', e);
    return { ok: false, error: 'No hay espacio en el almacenamiento de este navegador.' };
  }
  invalidarCacheIntentos();
  return { ok: true };
}

// ---------- LECTURA DE INTENTOS ----------
// El Panel del Estudiante pedía esta misma tabla 5 veces por carga (panel,
// racha, logros y historial). Un memo de una carga lo deja en 1 sin cambiar
// ninguna firma: quien necesite datos frescos pasa { refrescar: true }.
let _intentosCache = null;

function invalidarCacheIntentos() {
  _intentosCache = null;
}

async function obtenerIntentos(opciones) {
  const refrescar = !!(opciones && opciones.refrescar);
  if (!refrescar && _intentosCache) return _intentosCache;

  const sesion = await obtenerSesionActual();
  let resultado;

  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { data, error } = await cliente
      .from('intentos')
      .select('*')
      .eq('usuario_id', sesion.user.id)
      .order('fecha', { ascending: false });
    if (error) { console.error('No se pudieron leer los intentos:', error.message); return []; }
    resultado = data.map(i => ({
      id: i.id,
      modulo: i.modulo,
      nombreModulo: i.nombre_modulo,
      fecha: i.fecha,
      correctas: i.correctas,
      total: i.total,
      porcentaje: i.porcentaje,
      detalle: i.detalle || null
    }));
  } else {
    resultado = obtenerIntentosLocal();
  }

  _intentosCache = resultado;
  return resultado;
}

async function obtenerIntentosPorModulo(modulo) {
  const intentos = await obtenerIntentos();
  return intentos.filter(i => i.modulo === modulo);
}

async function obtenerUltimosIntentos(n = 5) {
  const intentos = await obtenerIntentos();
  return intentos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, n);
}

async function obtenerEstadisticas() {
  const intentos = await obtenerIntentos();
  if (intentos.length === 0) {
    return { totalIntentos: 0, promedioGeneral: null, ultimaActividad: null, porModulo: {} };
  }

  const porModulo = {};
  intentos.forEach(i => {
    if (!porModulo[i.modulo]) {
      porModulo[i.modulo] = {
        nombreModulo: i.nombreModulo,
        intentos: 0,
        mejor: 0,
        sumaPorcentaje: 0,
        ultimaFecha: i.fecha
      };
    }
    const m = porModulo[i.modulo];
    m.intentos++;
    m.mejor = Math.max(m.mejor, i.porcentaje);
    m.sumaPorcentaje += i.porcentaje;
    if (i.fecha > m.ultimaFecha) m.ultimaFecha = i.fecha;
  });
  Object.values(porModulo).forEach(m => {
    m.promedio = Math.round(m.sumaPorcentaje / m.intentos);
  });

  const promedioGeneral = Math.round(intentos.reduce((s, i) => s + i.porcentaje, 0) / intentos.length);
  const ultimaActividad = intentos.reduce((max, i) => (i.fecha > max ? i.fecha : max), intentos[0].fecha);

  return { totalIntentos: intentos.length, promedioGeneral, ultimaActividad, porModulo };
}

// ---------- MÓDULOS DE APRENDIZAJE COMPLETADOS ----------
// A diferencia de "intentos" (quizzes/simuladores con puntaje), esto
// registra que el estudiante respondió todos los chequeos rápidos de una
// página de contenido teórico (ats.html, plan-de-vuelo.html, o una
// subpágina de meteorología/fraseología). Se usa para el progreso por
// módulo y las insignias por temática en Panel_estudiante.html.
const AIS_MODULOS_KEY = 'aisModulosCompletados';

function obtenerModulosCompletadosLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(AIS_MODULOS_KEY));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

async function marcarModuloCompletado(pagina) {
  const sesion = await obtenerSesionActual();

  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { error } = await cliente
      .from('modulos_completados')
      .upsert({ usuario_id: sesion.user.id, pagina }, { onConflict: 'usuario_id,pagina', ignoreDuplicates: true });
    if (error) console.error('No se pudo guardar el módulo completado en Supabase:', error.message);
    return;
  }

  const modulos = obtenerModulosCompletadosLocal();
  if (!modulos.some(m => m.pagina === pagina)) {
    modulos.push({ pagina, fecha: new Date().toISOString() });
    localStorage.setItem(AIS_MODULOS_KEY, JSON.stringify(modulos));
  }
}

async function obtenerModulosCompletados() {
  const sesion = await obtenerSesionActual();
  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { data, error } = await cliente
      .from('modulos_completados')
      .select('pagina, fecha')
      .eq('usuario_id', sesion.user.id);
    if (error) { console.error('No se pudieron leer los módulos completados:', error.message); return []; }
    return data;
  }
  return obtenerModulosCompletadosLocal();
}

// ---------- PERFIL DEL ESTUDIANTE (nombre y apellido) ----------
// Devuelve { nombre, apellido, nombreCompleto, esEmail }. esEmail=true
// significa que todavía no hay nombre guardado y se está usando el
// correo como respaldo temporal (ver Panel_estudiante.html).
async function obtenerPerfilEstudiante() {
  const sesion = await obtenerSesionActual();
  let nombre = '';
  let apellido = '';
  let esEmail = false;

  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { data } = await cliente.from('perfiles').select('nombre, apellido').eq('id', sesion.user.id).maybeSingle();
    nombre = (data && data.nombre) ? data.nombre.trim() : '';
    apellido = (data && data.apellido) ? data.apellido.trim() : '';
    if (!nombre && !apellido) {
      nombre = sesion.user.email || 'Estudiante';
      esEmail = true;
    }
  } else {
    nombre = localStorage.getItem(AIS_NOMBRE_KEY) || 'Cristian Arcila';
    apellido = localStorage.getItem(AIS_APELLIDO_KEY) || '';
  }

  const nombreCompleto = esEmail ? nombre : [nombre, apellido].filter(Boolean).join(' ');
  return { nombre, apellido, nombreCompleto, esEmail };
}

async function guardarPerfilEstudiante(nombre, apellido) {
  const nombreLimpio = (nombre || '').trim();
  const apellidoLimpio = (apellido || '').trim();
  if (!nombreLimpio) return;

  const sesion = await obtenerSesionActual();
  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { error } = await cliente.from('perfiles').upsert({ id: sesion.user.id, nombre: nombreLimpio, apellido: apellidoLimpio });
    if (error) console.error('No se pudo guardar el perfil en Supabase:', error.message);
    return;
  }
  localStorage.setItem(AIS_NOMBRE_KEY, nombreLimpio);
  localStorage.setItem(AIS_APELLIDO_KEY, apellidoLimpio);
}

// ---------- MIGRACIÓN: progreso local -> nube, al iniciar sesión ----------
async function migrarProgresoLocalSiHaceFalta() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return;
  if (localStorage.getItem(AIS_MIGRADO_KEY) === 'true') return;

  const cliente = obtenerClienteAuth();
  const locales = obtenerIntentosLocal();

  if (locales.length > 0) {
    const filas = locales.map(i => ({
      usuario_id: sesion.user.id,
      modulo: i.modulo,
      nombre_modulo: i.nombreModulo,
      correctas: i.correctas,
      total: i.total,
      porcentaje: i.porcentaje,
      fecha: i.fecha,
      detalle: i.detalle || null
    }));
    const { error } = await cliente.from('intentos').insert(filas);
    if (!error) { localStorage.removeItem(AIS_PROGRESO_KEY); invalidarCacheIntentos(); }
    else console.error('No se pudo migrar el progreso local:', error.message);
  }

  const nombreLocal = localStorage.getItem(AIS_NOMBRE_KEY);
  const apellidoLocal = localStorage.getItem(AIS_APELLIDO_KEY) || '';
  if (nombreLocal) {
    const { data } = await cliente.from('perfiles').select('nombre, apellido').eq('id', sesion.user.id).maybeSingle();
    if (!data || (!data.nombre && !data.apellido)) {
      await cliente.from('perfiles').upsert({ id: sesion.user.id, nombre: nombreLocal, apellido: apellidoLocal });
    }
  }

  const modulosLocales = obtenerModulosCompletadosLocal();
  if (modulosLocales.length > 0) {
    const filas = modulosLocales.map(m => ({
      usuario_id: sesion.user.id,
      pagina: m.pagina,
      fecha: m.fecha
    }));
    const { error } = await cliente
      .from('modulos_completados')
      .upsert(filas, { onConflict: 'usuario_id,pagina', ignoreDuplicates: true });
    if (!error) localStorage.removeItem(AIS_MODULOS_KEY);
    else console.error('No se pudieron migrar los módulos completados:', error.message);
  }

  localStorage.setItem(AIS_MIGRADO_KEY, 'true');
}

// ============================================================
// SISTEMA DE PROFESORES — lado del estudiante
//
// A diferencia del resto de este archivo, estas funciones NO tienen
// modo invitado: un grupo, un profesor y una actividad calificada
// existen solo asociados a una cuenta real. Si no hay sesión devuelven
// { ok:false, error } en vez de caer a localStorage.
//
// La calificación de las actividades ocurre en el servidor (funciones
// obtener_actividad / calificar_actividad de Supabase), así que desde
// aquí nunca se ven las respuestas correctas antes de terminar.
// ============================================================

// ---------- ROL DEL USUARIO (student | teacher | admin) ----------
async function obtenerRolUsuario() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return null;
  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.from('perfiles').select('rol').eq('id', sesion.user.id).maybeSingle();
  if (error) { console.error('No se pudo leer el rol del usuario:', error.message); return null; }
  return data ? data.rol : null;
}

// ---------- UNIRSE A UN GRUPO CON EL CÓDIGO DEL PROFESOR ----------
async function unirseAGrupo(codigo) {
  const limpio = (codigo || '').trim();
  if (!limpio) return { ok: false, error: 'Escribe el código que te dio tu profesor.' };

  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión para unirte a un grupo.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.rpc('unirse_a_grupo', { p_codigo: limpio });
  if (error) return { ok: false, error: error.message };

  const fila = Array.isArray(data) ? data[0] : data;
  return { ok: true, grupo: fila ? { id: fila.grupo_id, nombre: fila.grupo_nombre } : null };
}

// ---------- GRUPO ACTUAL DEL ESTUDIANTE ----------
async function obtenerMiGrupo() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Sin sesión', grupo: null };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente
    .from('inscripciones')
    .select('grupo_id, fecha, grupos(nombre, codigo)')
    .eq('estudiante_id', sesion.user.id)
    .maybeSingle();

  if (error) { console.error('No se pudo leer el grupo:', error.message); return { ok: false, error: error.message, grupo: null }; }
  if (!data) return { ok: true, grupo: null };

  return {
    ok: true,
    grupo: {
      id: data.grupo_id,
      nombre: data.grupos ? data.grupos.nombre : 'Mi grupo',
      codigo: data.grupos ? data.grupos.codigo : '',
      desde: data.fecha
    }
  };
}

async function salirDeMiGrupo() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Sin sesión' };
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('inscripciones').delete().eq('estudiante_id', sesion.user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- ACTIVIDADES ASIGNADAS POR EL PROFESOR ----------
// Devuelve cada actividad publicada del grupo con el estado del propio
// estudiante (intentos hechos, mejor puntaje, último intento).
async function obtenerActividadesAsignadas() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return [];

  const cliente = obtenerClienteAuth();
  const { data: actividades, error } = await cliente
    .from('actividades')
    .select('id, titulo, descripcion, tipo, fecha_limite, intentos_max, creado_en')
    .order('creado_en', { ascending: false });

  if (error) { console.error('No se pudieron leer las actividades asignadas:', error.message); return []; }
  if (!actividades || actividades.length === 0) return [];

  const { data: resultados } = await cliente
    .from('resultados_actividad')
    .select('id, actividad_id, correctas, total, porcentaje, fecha')
    .eq('estudiante_id', sesion.user.id);

  const porActividad = {};
  (resultados || []).forEach(r => {
    const acc = porActividad[r.actividad_id] || { intentos: 0, mejor: 0, ultima: null, ultimoId: null };
    acc.intentos++;
    acc.mejor = Math.max(acc.mejor, r.porcentaje);
    // Guardamos tambien el id del intento mas reciente para que el estudiante
    // pueda abrir su propia entrega corregida desde el panel.
    if (!acc.ultima || r.fecha > acc.ultima) { acc.ultima = r.fecha; acc.ultimoId = r.id; }
    porActividad[r.actividad_id] = acc;
  });

  const ahora = new Date();
  return actividades.map(a => {
    const estado = porActividad[a.id] || { intentos: 0, mejor: 0, ultima: null, ultimoId: null };
    const vencida = !!a.fecha_limite && new Date(a.fecha_limite) < ahora;
    const sinIntentos = a.intentos_max !== null && a.intentos_max !== undefined && estado.intentos >= a.intentos_max;
    return {
      id: a.id,
      titulo: a.titulo,
      descripcion: a.descripcion,
      tipo: a.tipo,
      fechaLimite: a.fecha_limite,
      intentosMax: a.intentos_max,
      intentos: estado.intentos,
      mejor: estado.mejor,
      ultima: estado.ultima,
      ultimoResultadoId: estado.ultimoId,
      completada: estado.intentos > 0,
      vencida,
      bloqueada: vencida || sinIntentos
    };
  });
}

// ---------- CORRECCIONES QUE ME HIZO EL PROFESOR ----------
// La RLS ya permite al estudiante leer las correcciones de sus propias
// entregas; lo que faltaba era traerlas al panel. Se usa para avisarle de que
// su nota cambió o de que tiene un comentario esperando.
async function obtenerMisCorrecciones() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return [];

  const cliente = obtenerClienteAuth();

  // Primero los ids de mis entregas; sin esto la consulta de correcciones no
  // tiene por dónde filtrar (la policy la haría vacía de todos modos).
  const { data: mios, error: e1 } = await cliente
    .from('resultados_actividad')
    .select('id, actividad_id')
    .eq('estudiante_id', sesion.user.id);
  if (e1 || !mios || mios.length === 0) {
    if (e1) console.error('No se pudieron leer mis entregas:', e1.message);
    return [];
  }

  const porResultado = {};
  mios.forEach(r => { porResultado[r.id] = r.actividad_id; });

  const { data, error } = await cliente
    .from('correcciones_resultado')
    .select('id, resultado_id, motivo, correctas_antes, correctas_despues, porcentaje_antes, porcentaje_despues, fecha')
    .in('resultado_id', mios.map(r => r.id))
    .order('fecha', { ascending: false });

  if (error) { console.error('No se pudieron leer las correcciones:', error.message); return []; }

  return (data || []).map(c => ({
    id: c.id,
    resultadoId: c.resultado_id,
    actividadId: porResultado[c.resultado_id] || null,
    motivo: c.motivo,
    cambioNota: c.correctas_antes !== c.correctas_despues,
    porcentajeAntes: c.porcentaje_antes,
    porcentajeDespues: c.porcentaje_despues,
    fecha: c.fecha
  }));
}

// ---------- RESOLVER UNA ACTIVIDAD ----------
// Trae la actividad y sus preguntas SIN las respuestas correctas.
async function obtenerActividadParaResolver(actividadId) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.rpc('obtener_actividad', { p_actividad_id: actividadId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, actividad: data };
}

// Envía las respuestas ({ preguntaId: índiceElegido }) y recibe la
// calificación ya hecha en el servidor, con el detalle por pregunta.
async function calificarActividad(actividadId, respuestas) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.rpc('calificar_actividad', {
    p_actividad_id: actividadId,
    p_respuestas: respuestas
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, resultado: data };
}

// ---------- MODO SEGURO DE EXAMEN: incidentes ----------
// Registra que el estudiante cambió de pestaña (u ocultó la ventana)
// mientras presentaba un examen asignado. Silencioso ante fallos: un
// incidente que no se pudo guardar no debe interrumpir el examen del
// estudiante (ver tomar-actividad.html, que ya avisa en pantalla aunque
// esto falle).
async function registrarIncidenteActividad(actividadId, tipo) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false };
  const cliente = obtenerClienteAuth();
  const { error } = await cliente.from('incidentes_actividad').insert({
    actividad_id: actividadId,
    estudiante_id: sesion.user.id,
    tipo
  });
  if (error) { console.error('No se pudo registrar el incidente:', error.message); return { ok: false, error: error.message }; }
  return { ok: true };
}

// ---------- ACTIVIDADES DE PLAN DE VUELO ----------
// El estudiante entrega el formulario OACI completo y el servidor lo
// califica casilla por casilla contra la clave del profesor, que nunca
// llega al navegador antes de entregar (ver calificar_plan_vuelo en
// supabase-schema.sql). La respuesta trae la clave para que el simulador
// pueda explicar cada error, igual que hace calificarActividad() con la
// opción correcta de cada pregunta.
async function calificarPlanDeVuelo(actividadId, valores) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.rpc('calificar_plan_vuelo', {
    p_actividad_id: actividadId,
    p_valores: valores
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, resultado: data };
}

// Trae una entrega ya calificada para verla o descargarla en PDF. Sirve
// tanto al profesor (cualquier entrega de sus actividades) como al propio
// estudiante (sólo las suyas); el servidor decide qué devuelve.
async function obtenerPlanEntregado(resultadoId) {
  const sesion = await obtenerSesionActual();
  if (!sesion) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const cliente = obtenerClienteAuth();
  const { data, error } = await cliente.rpc('obtener_resultado_plan', { p_resultado_id: resultadoId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, entrega: data };
}
