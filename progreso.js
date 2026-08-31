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
async function guardarIntento(modulo, nombreModulo, correctas, total) {
  const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
  const sesion = await obtenerSesionActual();

  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { error } = await cliente.from('intentos').insert({
      usuario_id: sesion.user.id,
      modulo,
      nombre_modulo: nombreModulo,
      correctas,
      total,
      porcentaje
    });
    if (error) {
      console.error('No se pudo guardar el intento en Supabase:', error.message);
      return { ok: false, error: error.message };
    }
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
    porcentaje
  });
  localStorage.setItem(AIS_PROGRESO_KEY, JSON.stringify(intentos));
  return { ok: true };
}

// ---------- LECTURA DE INTENTOS ----------
async function obtenerIntentos() {
  const sesion = await obtenerSesionActual();
  if (sesion) {
    const cliente = obtenerClienteAuth();
    const { data, error } = await cliente
      .from('intentos')
      .select('*')
      .eq('usuario_id', sesion.user.id)
      .order('fecha', { ascending: false });
    if (error) { console.error('No se pudieron leer los intentos:', error.message); return []; }
    return data.map(i => ({
      id: i.id,
      modulo: i.modulo,
      nombreModulo: i.nombre_modulo,
      fecha: i.fecha,
      correctas: i.correctas,
      total: i.total,
      porcentaje: i.porcentaje
    }));
  }
  return obtenerIntentosLocal();
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
      fecha: i.fecha
    }));
    const { error } = await cliente.from('intentos').insert(filas);
    if (!error) localStorage.removeItem(AIS_PROGRESO_KEY);
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
    .select('actividad_id, correctas, total, porcentaje, fecha')
    .eq('estudiante_id', sesion.user.id);

  const porActividad = {};
  (resultados || []).forEach(r => {
    const acc = porActividad[r.actividad_id] || { intentos: 0, mejor: 0, ultima: null };
    acc.intentos++;
    acc.mejor = Math.max(acc.mejor, r.porcentaje);
    if (!acc.ultima || r.fecha > acc.ultima) acc.ultima = r.fecha;
    porActividad[r.actividad_id] = acc;
  });

  const ahora = new Date();
  return actividades.map(a => {
    const estado = porActividad[a.id] || { intentos: 0, mejor: 0, ultima: null };
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
      completada: estado.intentos > 0,
      vencida,
      bloqueada: vencida || sinIntentos
    };
  });
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
