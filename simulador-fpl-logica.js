// Lógica pura de la app (sin DOM): calificación, orden de la bandeja, repaso, avance y simulacro.

// Bien: decisión correcta y, si se rechaza, todos los motivos reales marcados (marcar de más no resta).
// Parcial: rechazó bien pero le faltó algún motivo. Mal: decisión equivocada.
export function calificar(plan, decision, motivos = []) {
  const reales = plan.clave.motivos;
  const marcados = [...new Set(motivos.map(Number))];
  const faltan = reales.filter((m) => !marcados.includes(m));
  const deMas = decision === 'RECHAZAR' ? marcados.filter((m) => !reales.includes(m)) : [];
  if (decision !== plan.clave.decision) return { resultado: 'mal', faltan: decision === 'ACEPTAR' ? reales : [], deMas };
  if (decision === 'ACEPTAR') return { resultado: 'bien', faltan: [], deMas: [] };
  return { resultado: faltan.length ? 'parcial' : 'bien', faltan, deMas };
}

// Última respuesta de cada plan entre los modos indicados.
export function ultimaPorPlan(respuestas, modos = ['practica', 'repaso']) {
  const m = new Map();
  for (const r of respuestas) if (modos.includes(r.modo)) m.set(r.plan_id, r);
  return m;
}

export function siguientePendiente(planes, respuestas) {
  const hechos = new Set(respuestas.filter((r) => r.modo === 'practica').map((r) => r.plan_id));
  return planes.find((p) => !hechos.has(p.id)) || null;
}

export function colaRepaso(planes, respuestas) {
  const ultima = ultimaPorPlan(respuestas);
  return planes.filter((p) => ultima.has(p.id) && ultima.get(p.id).resultado !== 'bien');
}

export function resumen(planes, respuestas) {
  const ultima = ultimaPorPlan(respuestas);
  const porId = new Map(planes.map((p) => [p.id, p]));
  const salida = { respondidos: 0, bien: 0, parcial: 0, mal: 0, aceptablesRechazados: 0, porMotivo: {} };
  for (const [id, r] of ultima) {
    const plan = porId.get(id);
    if (!plan) continue;
    salida.respondidos++;
    salida[r.resultado]++;
    if (r.resultado === 'bien') continue;
    if (plan.clave.decision === 'ACEPTAR') { salida.aceptablesRechazados++; continue; }
    const marcados = r.decision === 'RECHAZAR' ? (r.motivos || []).map(Number) : [];
    for (const m of plan.clave.motivos) if (!marcados.includes(m)) salida.porMotivo[m] = (salida.porMotivo[m] || 0) + 1;
  }
  return salida;
}

// n planes para el simulacro: primero los que nunca se han respondido en práctica; luego, al azar.
export function elegirSimulacro(planes, respuestas, n = 10, azar = Math.random) {
  const vistos = new Set(respuestas.filter((r) => r.modo === 'practica').map((r) => r.plan_id));
  const barajar = (l) => l.map((p) => [azar() + Math.random() * 1e-9, p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const nuevos = barajar(planes.filter((p) => !vistos.has(p.id)));
  const viejos = barajar(planes.filter((p) => vistos.has(p.id)));
  return [...nuevos, ...viejos].slice(0, n);
}

export function intentoSiguiente(respuestas, planId, modo) {
  return respuestas.filter((r) => r.plan_id === planId && r.modo === modo).length + 1;
}

export const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export function coincideNombre(nombre, consulta) {
  const palabras = sinTildes(nombre).match(/[A-Z0-9]+/g) || [];
  const buscadas = sinTildes(consulta).match(/[A-Z0-9]+/g) || [];
  return buscadas.length > 0 && buscadas.every((b) => palabras.some((p) => p.startsWith(b)));
}
