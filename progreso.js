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

async function obtenerSesionActual() {
  const cliente = obtenerClienteAuth();
  if (!cliente) return null;
  const { data } = await cliente.auth.getSession();
  return (data && data.session) ? data.session : null;
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
    if (error) console.error('No se pudo guardar el intento en Supabase:', error.message);
    return;
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

  localStorage.setItem(AIS_MIGRADO_KEY, 'true');
}
