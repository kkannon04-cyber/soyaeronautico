// ============================================================
// modulos.js — Catálogo único de módulos y temas
// ============================================================
// Fuente única de verdad de los ids de módulo del sitio.
//
// Por qué existe: esta lista vivía duplicada en 3 sitios (la constante
// MODULOS de Panel_estudiante.html, el string que cada quiz pasa a
// guardarIntento(), y un CHECK en la tabla `intentos`). Cada vez que se
// añadía un quiz había que acordarse de los tres, y ya causó cuatro bugs de
// guardado silencioso: el insert fallaba por el constraint mientras la
// pantalla decía "guardado". Desde 2026-09-14 el CHECK de la base solo
// valida el FORMATO del slug y la lista blanca real es este archivo, donde
// guardarIntento() la comprueba ANTES de la red y avisa por consola.
//
// Cómo añadir un módulo nuevo:
//   1. Añádelo a MODULOS_CATALOGO con su id, nombre, url, tipo y sección.
//   2. Carga <script src="modulos.js"></script> en la página, ANTES de
//      progreso.js.
//   3. Ya está. No hay que tocar SQL ni el Panel del Estudiante.
//
// Debe cargarse entre supabase-config.js y progreso.js.

// ---------- MÓDULOS EVALUABLES (todo lo que guarda un intento) ----------
// `seccion` es EXPLÍCITA, no se deduce de `tipo`: simulador-metar se pinta
// históricamente entre los quizzes ("modulos") y los demás simuladores en su
// propia tarjeta ("simuladores"). Deducirla rompería el render y, peor, el
// logro "Políglota AIS", que exige haber hecho todos los de la sección
// "modulos" y se volvería inalcanzable si entrara un simulador nuevo ahí.
const MODULOS_CATALOGO = [
  { id: 'quiz-ats', nombre: 'Servicios de Tránsito Aéreo (ATS)', url: 'quiz-ats.html',
    tipo: 'quiz', seccion: 'modulos', badge: '50 preguntas', temaPorDefecto: 'ats' },

  { id: 'quiz-fpl', nombre: 'Plan de Vuelo', url: 'quiz-fpl.html',
    tipo: 'quiz', seccion: 'modulos', badge: '25 preguntas', temaPorDefecto: 'plan-de-vuelo' },

  { id: 'quiz-designadores', nombre: 'Designadores de Aeródromos', url: 'quiz-designadores.html',
    tipo: 'quiz', seccion: 'modulos', badge: 'Modo examen · 20 preguntas', temaPorDefecto: 'designadores' },

  { id: 'quiz-fraseologia', nombre: 'Fraseología Aeronáutica', url: 'quiz-fraseologia.html',
    tipo: 'quiz', seccion: 'modulos', badge: '50 preguntas', temaPorDefecto: 'fraseologia-fundamentos' },

  { id: 'simulador-metar', nombre: 'Simulador METAR', url: 'simulador-metar.html',
    tipo: 'simulador', seccion: 'modulos', badge: 'Modo examen · 20 reportes', temaPorDefecto: 'metar-taf' },

  { id: 'navegacion-quiz-tiempo-altimetria', nombre: 'Navegación · Quiz I — Tiempo y Altimetría',
    url: 'quiz-navegacion-tiempo-altimetria.html',
    tipo: 'quiz', seccion: 'modulos', badge: 'Nivel avanzado · 25 preguntas', temaPorDefecto: 'navegacion-tiempo' },

  { id: 'navegacion-quiz-radioayudas-viento', nombre: 'Navegación · Quiz II — Radioayudas y Viento',
    url: 'quiz-navegacion-radioayudas-viento.html',
    tipo: 'quiz', seccion: 'modulos', badge: 'Nivel avanzado · 25 preguntas', temaPorDefecto: 'navegacion-radioayudas' },

  { id: 'quiz-notam', nombre: 'NOTAM', url: 'quiz-notam.html',
    tipo: 'quiz', seccion: 'modulos', badge: '25 preguntas', temaPorDefecto: 'notam-fundamentos' },

  // Añadido 2026-09-16: banco de 173 preguntas del cuestionario básico AIS/COM;
  // el estudiante elige cantidad y orden. Mezcla COM/AIS/MET/cartas/AD, así
  // que no tiene una página teórica única: sin tema por defecto.
  { id: 'quiz-ais-com', nombre: 'Entrenamiento AIS/COM', url: 'quiz-ais-com.html',
    tipo: 'quiz', seccion: 'modulos', badge: '173 preguntas · a tu medida', temaPorDefecto: null },

  // Añadido 2026-09-25: examen de 194 preguntas de Meteorología Aeronáutica,
  // con la misma mecánica configurable del entrenamiento AIS/COM. Recorre los
  // tres ejes del módulo MET y además METAR/TAF/SIGMET, así que no apunta a una
  // sola página teórica: sin tema por defecto.
  { id: 'quiz-meteorologia', nombre: 'Quiz Meteorología', url: 'quiz-meteorologia.html',
    tipo: 'quiz', seccion: 'modulos', badge: '194 preguntas · a tu medida', temaPorDefecto: null },

  { id: 'simulador-plan-vuelo', nombre: 'Simulador Plan de Vuelo', url: 'simulador-plan-vuelo.html',
    tipo: 'simulador', seccion: 'simuladores',
    desc: 'Llenado de FPL campo por campo con validación.', temaPorDefecto: 'plan-de-vuelo' },

  { id: 'simulador-fraseologia', nombre: 'Fraseología — Simulador ATC', url: 'simulador-fraseologia.html',
    tipo: 'simulador', seccion: 'simuladores',
    desc: 'Practica por voz con mapa de ruta en vivo.', temaPorDefecto: 'fraseologia-fases' },

  // Añadido 2026-09-14: guardaba intentos desde hacía tiempo con este id, pero
  // no estaba en ninguna lista, así que se perdían en silencio.
  { id: 'simulador-nala', nombre: 'Simulador NALA — CWP', url: 'Simulador-NALA.html',
    tipo: 'simulador', seccion: 'simuladores',
    desc: 'Plan de vuelo, AFTN y radar en un puesto de trabajo real.', temaPorDefecto: null },

  // Añadido 2026-09-24: prueba de amplitud de memoria. No tiene página teórica
  // propia (entrena una destreza, no un contenido del AIP), por eso va sin tema.
  { id: 'simulador-memoria', nombre: 'Memoria y Agilidad Mental', url: 'simulador-memoria.html',
    tipo: 'simulador', seccion: 'simuladores',
    desc: 'Secuencias que crecen a cada acierto: memoria de trabajo bajo presión de tiempo.', temaPorDefecto: null }
];

// ---------- TEMAS ----------
// El id de un tema ES el slug de su página teórica: así el mapeo
// tema -> página es la identidad (url = id + '.html') y no hay una segunda
// tabla que se pueda desincronizar. Estos slugs son exactamente los que ya
// valida el CHECK `modulos_completados_pagina_check` en la base de datos.
const TEMAS_CATALOGO = [
  { id: 'ats',                        nombre: 'Servicios de Tránsito Aéreo' },
  { id: 'plan-de-vuelo',              nombre: 'Plan de Vuelo' },
  { id: 'designadores',               nombre: 'Designadores de Aeródromos' },
  { id: 'metar-taf',                  nombre: 'METAR y TAF' },
  { id: 'meteorologia-generalidades', nombre: 'Meteorología · Generalidades' },
  { id: 'meteorologia-nubosidad',     nombre: 'Meteorología · Nubosidad' },
  { id: 'meteorologia-variables',     nombre: 'Meteorología · Variables' },
  { id: 'fraseologia-fundamentos',    nombre: 'Fraseología · Fundamentos' },
  { id: 'fraseologia-oaci',           nombre: 'Fraseología · Alfabeto y números OACI' },
  { id: 'fraseologia-fases',          nombre: 'Fraseología · Fases del vuelo' },
  { id: 'fraseologia-tierra',         nombre: 'Fraseología · Movimiento en tierra' },
  { id: 'fraseologia-emergencias',    nombre: 'Fraseología · Emergencias' },
  { id: 'navegacion-fundamentos',     nombre: 'Navegación · Fundamentos' },
  { id: 'navegacion-tiempo',          nombre: 'Navegación · Tiempo' },
  { id: 'navegacion-velocidad',       nombre: 'Navegación · Velocidad' },
  { id: 'navegacion-altimetria',      nombre: 'Navegación · Altimetría' },
  { id: 'navegacion-radioayudas',     nombre: 'Navegación · Radioayudas' },
  { id: 'navegacion-viento-unidades', nombre: 'Navegación · Viento y unidades' },
  { id: 'notam-fundamentos',          nombre: 'NOTAM · Fundamentos' },
  { id: 'notam-formato',              nombre: 'NOTAM · Formato' },
  { id: 'notam-codigo-q',             nombre: 'NOTAM · Código Q' },
  { id: 'notam-especiales',           nombre: 'NOTAM · NOTAM especiales' }
];

// ---------- HELPERS ----------

function moduloPorId(id) {
  return MODULOS_CATALOGO.find(m => m.id === id) || null;
}

function esModuloValido(id) {
  return MODULOS_CATALOGO.some(m => m.id === id);
}

function temaPorId(id) {
  return TEMAS_CATALOGO.find(t => t.id === id) || null;
}

// Nombre legible de un tema; si no está catalogado devuelve el propio slug
// para que la interfaz nunca quede en blanco.
function nombreDeTema(id) {
  const t = temaPorId(id);
  return t ? t.nombre : id;
}

// La página teórica de un tema. Es la identidad por diseño (ver arriba).
function urlDeTema(id) {
  return temaPorId(id) ? id + '.html' : null;
}

// Resuelve el tema de una pregunta en cascada:
//   1. `tema` explícito en la pregunta (quizzes anotados a mano)
//   2. `cat` de quiz-fraseologia, que ya clasificaba desde antes
//   3. `temaPorDefecto` del módulo (quizzes de un solo destino teórico)
function temaDePregunta(moduloId, pregunta) {
  if (pregunta && pregunta.tema) return pregunta.tema;
  if (pregunta && pregunta.cat && moduloId === 'quiz-fraseologia') return 'fraseologia-' + pregunta.cat;
  const m = moduloPorId(moduloId);
  return (m && m.temaPorDefecto) || null;
}

// Arma el payload de `intentos.detalle` a partir de las respuestas de un quiz.
// `respuestas` es un array de { ok, pregunta }.
function construirDetalleIntento(moduloId, respuestas) {
  if (!Array.isArray(respuestas) || respuestas.length === 0) return null;
  return {
    v: 1,
    preguntas: respuestas.map(function (r, i) {
      const item = { i: i, ok: !!r.ok };
      const tema = temaDePregunta(moduloId, r.pregunta);
      if (tema) item.tema = tema;
      return item;
    })
  };
}
