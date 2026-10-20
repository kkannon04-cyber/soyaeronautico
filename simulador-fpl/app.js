// Supervisor AIM · Simulador FPL. El supervisor entrega planes; tú decides si los aceptas o los rechazas.
import * as supa from './supa.js';
import { pintarFormulario } from './formulario.js';
import { calificar, siguientePendiente, colaRepaso, resumen, elegirSimulacro, intentoSiguiente, ultimaPorPlan, coincideNombre, sinTildes } from './logica.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fecha = (iso) => `${iso.slice(8, 10)} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const TIPOS = { 'IFR-COM': 'IFR comercial', AG: 'Aviación general', 'VFR-D': 'VFR diurno', 'VFR-N': 'VFR nocturno', MIL: 'Militar o de Estado', HEL: 'Helicóptero' };
const AYUDA = {
  1: 'Existe en ALDIA y tiene chequeo vigente en este equipo', 2: 'Vigente a la fecha del vuelo', 3: 'Aeronavegable en ALDIA',
  4: 'P/ contra la capacidad del tipo; TBN solo S y M', 5: 'E/ contra EET + alterno + reserva', 6: 'Agua, selva, ELT, chalecos y botes',
  7: 'Par o impar, flujos de ENR 1.3, A185 y F190, directas', 8: 'Aerovías y puntos de ENR 3 y ENR 4.4', 9: 'Existe, está vigente, SUP y NOTAM',
  10: 'Salida, destino y alternos', 11: 'AD 2.3, salida y puesta del sol, VFR nocturno', 12: 'AD 2.20 y tipo de tránsito de AD 2.2', 13: 'Casillas 8, 10, 13, 16 y 18; antelación',
};
const estado = { planes: [], porId: new Map(), consultas: null, respuestas: [], motivos: {}, sim: null };
const nombreMotivo = (m) => estado.motivos[m] || `Motivo ${m}`;

// ── navegación ───────────────────────────────────────────────────────────────
function mostrar(vista) {
  $$('.vista').forEach((v) => { v.hidden = v.id !== `vista-${vista}`; });
  $$('#pestanas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
}
function ir() {
  const h = location.hash.replace('#', '') || 'bandeja';
  if (h.startsWith('plan/')) return verPlan(h.slice(5));
  const vistas = { bandeja: verBandeja, simulacro: verSimulacro, repaso: verRepaso, avance: verAvance, documentos: verDocumentos };
  (vistas[h] || verBandeja)();
  window.scrollTo({ top: 0 });
}
function actualizarCabecera() {
  const s = resumen(estado.planes, estado.respuestas);
  const mini = $('#avance-mini');
  mini.hidden = false;
  mini.innerHTML = `<b>${s.respondidos}</b> de ${estado.planes.length} planes`;
  $('#cuenta-repaso').textContent = colaRepaso(estado.planes, estado.respuestas).length;
}

// ── la mesa: hoja + decisión + corrección ────────────────────────────────────
function mesa(cont, plan, op) {
  const t0 = Date.now();
  let respondido = null;
  cont.className = 'vista mesa';
  cont.innerHTML = `
    <div class="columna-hoja">
      ${op.encabezado || ''}
      <p class="recibido"><span class="id">${plan.id}</span><span>${TIPOS[plan.tipo] || plan.tipo}</span>
        <span>Recibido en la sala AIS de <b>${esc(plan.recibido.lugar)}</b> el <b>${fecha(plan.recibido.fecha)}</b> a las <b>${esc(plan.recibido.hora)} UTC</b>.</span></p>
      <div class="marco"><div class="hoja llega"></div></div>
      <p class="ayuda-hoja"><span class="pista">Desliza la hoja a la derecha para pasar al siguiente plan.</span><button type="button" class="enlace ampliar">Ampliar la hoja</button></p>
    </div>
    <aside class="panel" aria-live="polite"></aside>`;
  const hoja = $('.hoja', cont);
  const marco = $('.marco', cont);
  const panel = $('.panel', cont);
  pintarFormulario(plan, hoja);

  const sellar = (decision) => {
    const s = document.createElement('div');
    s.className = `sello ${decision === 'ACEPTAR' ? 'ok' : 'no'} cae`;
    s.innerHTML = `${decision === 'ACEPTAR' ? 'ACEPTADO' : 'RECHAZADO'}<small>AIM ${esc(plan.recibido.lugar)} · ${esc(plan.recibido.hora)} UTC</small>`;
    hoja.appendChild(s);
  };
  const pasar = () => {
    if (!respondido) {
      $('.pista', cont).textContent = 'Primero decide si aceptas o rechazas el plan.';
      hoja.style.setProperty('--dx', '0px');
      return;
    }
    op.alSiguiente();
  };

  const decidir = () => {
    panel.innerHTML = `
      ${op.extraPanel || ''}
      <div class="decision flotante">
        <button type="button" class="boton aceptar" data-d="ACEPTAR">Aceptar el plan</button>
        <button type="button" class="boton rechazar" data-d="RECHAZAR">Rechazar el plan</button>
      </div>
      <p class="suave">Revisa la hoja contra el AIP, los NOTAM y los reportes de ALDIA. Los reportes y los NOTAM están en la pestaña Documentos.</p>`;
    $('[data-d="ACEPTAR"]', panel).onclick = () => cerrar('ACEPTAR', [], '');
    $('[data-d="RECHAZAR"]', panel).onclick = elegirMotivos;
  };
  const elegirMotivos = () => {
    const lista = Object.keys(estado.motivos).map((m) => `
      <label class="motivo"><input type="checkbox" name="motivo" value="${m}"><span>${esc(nombreMotivo(m))}<small>${esc(AYUDA[m] || '')}</small></span></label>`).join('');
    panel.innerHTML = `
      <form class="motivos">
        <fieldset><legend>¿Por qué lo rechazas? Marca todos los motivos que encuentres.</legend>${lista}</fieldset>
        <label>Norma que citarías (opcional)<textarea name="nota" placeholder="Por ejemplo: SKBO AD 2.20 §3, NOTAM C4382/26"></textarea></label>
        <div class="acciones">
          <button type="submit" class="boton rechazar" disabled>Rechazar con estos motivos</button>
          <button type="button" class="boton volver">Volver</button>
        </div>
      </form>`;
    const form = $('form', panel);
    const enviar = $('[type=submit]', form);
    form.onchange = () => { enviar.disabled = !$$('input[name=motivo]:checked', form).length; };
    $('.volver', form).onclick = decidir;
    form.onsubmit = (e) => {
      e.preventDefault();
      cerrar('RECHAZAR', $$('input[name=motivo]:checked', form).map((x) => Number(x.value)), form.nota.value.trim());
    };
    if (window.innerWidth < 980) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const cerrar = async (decision, motivos, nota) => {
    const cal = calificar(plan, decision, motivos);
    const fila = { plan_id: plan.id, intento: intentoSiguiente(estado.respuestas, plan.id, op.modo), modo: op.modo, decision, motivos, nota, resultado: cal.resultado, segundos: Math.round((Date.now() - t0) / 1000), creado: new Date().toISOString() };
    estado.respuestas.push(fila);
    respondido = fila;
    sellar(decision);
    actualizarCabecera();
    if (op.mostrarCorreccion === false) {
      panel.innerHTML = `<div class="correccion"><p>Respuesta guardada. Las correcciones se ven al terminar el simulacro.</p><button type="button" class="boton principal siguiente">Siguiente plan</button><p class="aviso-guardado suave" role="status"></p></div>`;
    } else {
      panel.innerHTML = `${htmlCorreccion(plan, fila, cal)}<button type="button" class="boton principal siguiente">Siguiente plan</button><p class="aviso-guardado suave" role="status"></p>`;
    }
    $('.siguiente', panel).onclick = pasar;
    $('.pista', cont).textContent = 'Desliza la hoja a la derecha o usa la flecha → para el siguiente plan.';
    if (window.innerWidth < 980) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ok = await supa.guardarRespuesta(fila);
    const aviso = $('.aviso-guardado', panel);
    if (aviso) aviso.textContent = ok ? '' : 'Sin conexión: la respuesta quedó en este equipo y se guardará cuando vuelva la red.';
    op.alResponder?.(fila);
  };

  if (op.previa) {
    respondido = op.previa;
    sellar(op.previa.decision);
    panel.innerHTML = `${htmlCorreccion(plan, op.previa, calificar(plan, op.previa.decision, op.previa.motivos || []))}<a class="boton principal" href="#repaso">Ir al repaso</a>`;
  } else decidir();

  // Deslizar a la derecha (solo hacia la derecha; el desplazamiento vertical sigue funcionando).
  let x0 = null; let dx = 0;
  marco.onpointerdown = (e) => { if (marco.classList.contains('ampliada') || e.button > 0) return; x0 = e.clientX; dx = 0; marco.setPointerCapture(e.pointerId); hoja.classList.add('arrastrando'); };
  marco.onpointermove = (e) => { if (x0 === null) return; dx = Math.max(0, e.clientX - x0); hoja.style.setProperty('--dx', `${dx}px`); };
  marco.onpointerup = marco.onpointercancel = () => {
    if (x0 === null) return;
    x0 = null; hoja.classList.remove('arrastrando');
    if (dx > 80) {
      if (respondido && !op.previa) { hoja.style.setProperty('--dx', '110%'); setTimeout(pasar, 170); return; }
      pasar();
    }
    hoja.style.setProperty('--dx', '0px');
  };
  const ampliar = $('.ampliar', cont);
  ampliar.onclick = () => { const a = marco.classList.toggle('ampliada'); ampliar.textContent = a ? 'Reducir la hoja' : 'Ampliar la hoja'; };
  hoja.ondblclick = () => ampliar.click();
  cont._teclaDerecha = () => { if (respondido && !op.previa) pasar(); };
}

function htmlCorreccion(plan, fila, cal) {
  const r = cal.resultado;
  const lista = (ms) => ms.map(nombreMotivo).join(', ');
  let frase;
  if (r === 'bien') frase = plan.clave.decision === 'ACEPTAR' ? 'El plan cumplía todo y lo aceptaste.' : 'Encontraste todos los motivos de rechazo.';
  else if (r === 'parcial') frase = `Rechazaste bien, pero te faltó: ${lista(cal.faltan)}.`;
  else frase = plan.clave.decision === 'ACEPTAR' ? 'Este plan sí se podía aceptar.' : 'Este plan no se podía aceptar.';
  const deMas = cal.deMas.length ? `<p class="suave">Marcaste de más: ${esc(lista(cal.deMas))}. En este plan no había fallas de ese tipo.</p>` : '';
  const fallas = plan.clave.fallas.map((f) => `
    <article class="falla"><h4>${esc(nombreMotivo(f.motivo))}</h4><p>${esc(f.texto)}</p>
      <p class="cita">Fuente: <b>${esc(f.cita)}</b></p><blockquote class="literal">${esc(f.literal)}</blockquote></article>`).join('');
  const revisar = plan.clave.revisar.map((x) => `<li><b>${esc(x.cita)}</b><br>${esc(x.literal)}${x.nota ? `<br><span class="nota">${esc(x.nota)}</span>` : ''}</li>`).join('');
  const tu = !fila.decision ? 'No respondiste este plan.' : fila.decision === 'ACEPTAR' ? 'Aceptaste el plan.' : `Rechazaste el plan por: ${esc(lista(fila.motivos || []))}.`;
  return `<div class="correccion">
    <div class="resultado"><span class="marca-res res-${r}">${{ bien: 'Bien', parcial: 'Parcial', mal: 'Mal' }[r]}</span><p>${esc(frase)}</p></div>
    ${deMas}
    ${fallas || '<p>No tenía fallas: se podía aceptar.</p>'}
    <details ${plan.clave.decision === 'ACEPTAR' ? 'open' : ''}><summary>Qué había que revisar</summary><ul class="revisar">${revisar}</ul></details>
    <p class="tu-respuesta">${tu}${fila.nota ? ` Norma citada: ${esc(fila.nota)}.` : ''}</p>
  </div>`;
}

// ── vistas ───────────────────────────────────────────────────────────────────
function verBandeja() {
  mostrar('bandeja');
  const cont = $('#vista-bandeja');
  const plan = siguientePendiente(estado.planes, estado.respuestas);
  if (!plan) {
    cont.className = 'vista';
    cont.innerHTML = `<div class="vacio"><h1>Respondiste los ${estado.planes.length} planes</h1><p>Ahora repasa los que no quedaron bien o haz un simulacro con tiempo.</p><p><a class="boton principal" href="#repaso">Ir al repaso</a> <a class="boton" href="#simulacro">Hacer un simulacro</a></p></div>`;
    return;
  }
  mesa(cont, plan, { modo: 'practica', alSiguiente: verBandeja });
}

function verRepaso() {
  mostrar('repaso');
  const cont = $('#vista-repaso');
  const cola = colaRepaso(estado.planes, estado.respuestas);
  if (!cola.length) {
    cont.className = 'vista';
    cont.innerHTML = `<div class="vacio"><h1>Nada que repasar</h1><p>Los planes que respondas mal o a medias aparecen aquí hasta que los resuelvas bien.</p><p><a class="boton principal" href="#bandeja">Volver a la bandeja</a></p></div>`;
    return;
  }
  mesa(cont, cola[0], { modo: 'repaso', alSiguiente: verRepaso, encabezado: `<p class="suave">Repaso: ${cola.length} ${cola.length === 1 ? 'plan pendiente' : 'planes pendientes'}.</p>` });
}

function verPlan(id) {
  mostrar('bandeja');
  const plan = estado.porId.get(id);
  const previa = ultimaPorPlan(estado.respuestas, ['practica', 'repaso', 'simulacro']).get(id);
  const cont = $('#vista-bandeja');
  if (!plan) { location.hash = '#avance'; return; }
  if (!previa) { mesa(cont, plan, { modo: 'practica', alSiguiente: () => { location.hash = '#bandeja'; } }); return; }
  mesa(cont, plan, { modo: 'repaso', previa, alSiguiente: () => { location.hash = '#avance'; } });
}

function verSimulacro() {
  mostrar('simulacro');
  const cont = $('#vista-simulacro');
  const sim = estado.sim;
  if (!sim) {
    cont.className = 'vista';
    cont.innerHTML = `<div class="simulacro-inicio">
      <h1>Simulacro</h1>
      <p>Diez planes en 30 minutos, como en la sala AIS. Las respuestas se ven al terminar, salvo que marques la casilla.</p>
      <label class="check"><input type="checkbox" id="ver-al-responder"> Ver la respuesta al responder</label>
      <p><button type="button" class="boton principal" id="empezar">Empezar el simulacro</button></p>
    </div>`;
    $('#empezar').onclick = () => {
      estado.sim = { planes: elegirSimulacro(estado.planes, estado.respuestas, 10), i: 0, filas: [], ver: $('#ver-al-responder').checked, fin: Date.now() + 30 * 60000, terminado: false };
      clearInterval(estado.relojSim);
      estado.relojSim = setInterval(() => {
        const r = $('#reloj');
        const quedan = estado.sim.fin - Date.now();
        if (quedan <= 0) { terminarSimulacro(); return; }
        if (r) r.textContent = `${Math.floor(quedan / 60000)}:${String(Math.floor((quedan % 60000) / 1000)).padStart(2, '0')}`;
      }, 1000);
      verSimulacro();
    };
    return;
  }
  if (sim.terminado) return resultadosSimulacro(cont);
  const plan = sim.planes[sim.i];
  const extra = `<p class="suave">Plan ${sim.i + 1} de ${sim.planes.length} · quedan <span class="reloj" id="reloj">30:00</span> · <button type="button" class="enlace" id="terminar">Terminar el simulacro</button></p>`;
  mesa(cont, plan, {
    modo: 'simulacro', mostrarCorreccion: sim.ver, extraPanel: extra,
    alResponder: (fila) => sim.filas.push(fila),
    alSiguiente: () => { sim.i++; if (sim.i >= sim.planes.length) terminarSimulacro(); else verSimulacro(); },
  });
  const t = $('#terminar', cont);
  if (t) t.onclick = terminarSimulacro;
}
function terminarSimulacro() {
  clearInterval(estado.relojSim);
  if (estado.sim) estado.sim.terminado = true;
  if (location.hash !== '#simulacro') location.hash = '#simulacro'; else verSimulacro();
}
function resultadosSimulacro(cont) {
  const sim = estado.sim;
  const bien = sim.filas.filter((f) => f.resultado === 'bien').length;
  cont.className = 'vista';
  cont.innerHTML = `<h1>Resultado del simulacro</h1>
    <p>${bien} de ${sim.planes.length} bien. ${sim.filas.length < sim.planes.length ? `Quedaron ${sim.planes.length - sim.filas.length} sin responder.` : ''}</p>
    ${sim.planes.map((p) => {
    const f = sim.filas.find((x) => x.plan_id === p.id);
    if (!f) return `<details class="ficha"><summary>${p.id}: sin responder</summary>${htmlCorreccion(p, { decision: '', motivos: [] }, { resultado: 'mal', faltan: p.clave.motivos, deMas: [] })}</details>`;
    return `<details class="ficha"><summary>${p.id}: ${{ bien: 'bien', parcial: 'parcial', mal: 'mal' }[f.resultado]}</summary>${htmlCorreccion(p, f, calificar(p, f.decision, f.motivos))}</details>`;
  }).join('')}
    <p><button type="button" class="boton principal" id="otro">Hacer otro simulacro</button></p>`;
  $('#otro').onclick = () => { estado.sim = null; verSimulacro(); };
}

function verAvance() {
  mostrar('avance');
  const cont = $('#vista-avance');
  const s = resumen(estado.planes, estado.respuestas);
  const ultima = ultimaPorPlan(estado.respuestas);
  const pct = (n) => (s.respondidos ? Math.round((n / s.respondidos) * 100) : 0);
  const motivos = Object.entries(s.porMotivo).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...motivos.map((m) => m[1]));
  const sims = estado.respuestas.filter((r) => r.modo === 'simulacro');
  cont.className = 'vista';
  cont.innerHTML = `<h1>Tu avance</h1>
    <div class="cifras">
      <div class="cifra"><b>${s.respondidos}</b><span>de ${estado.planes.length} planes respondidos</span></div>
      <div class="cifra"><b>${pct(s.bien)} %</b><span>bien (${s.bien})</span></div>
      <div class="cifra"><b>${pct(s.parcial)} %</b><span>parcial (${s.parcial})</span></div>
      <div class="cifra"><b>${pct(s.mal)} %</b><span>mal (${s.mal})</span></div>
      <div class="cifra"><b>${sims.length}</b><span>planes en simulacros</span></div>
    </div>
    <h2>Lo que más se te escapa</h2>
    ${motivos.length || s.aceptablesRechazados ? `<div class="barras">${motivos.map(([m, n]) => `<div class="barra-motivo"><span>${esc(nombreMotivo(m))}</span><span class="pista"><span class="lleno" style="width:${(n / max) * 100}%"></span></span><span class="num">${n}</span></div>`).join('')}</div>
    ${s.aceptablesRechazados ? `<p class="suave">Además rechazaste ${s.aceptablesRechazados} ${s.aceptablesRechazados === 1 ? 'plan que se podía aceptar' : 'planes que se podían aceptar'}.</p>` : ''}` : '<p class="suave">Todavía nada: responde planes en la bandeja.</p>'}
    <h2>Todos los planes</h2>
    <div class="leyenda"><span>Verde: bien</span><span>Ámbar: parcial</span><span>Rojo: mal</span><span>Gris: sin responder</span></div>
    <div class="rejilla">${estado.planes.map((p) => { const u = ultima.get(p.id); return `<button type="button" data-id="${p.id}" class="${u ? u.resultado : ''}" title="${p.id}${u ? `: ${u.resultado}` : ''}">${p.id.slice(1)}</button>`; }).join('')}</div>`;
  $$('.rejilla button', cont).forEach((b) => { b.onclick = () => { location.hash = `#plan/${b.dataset.id}`; }; });
}

function verDocumentos() {
  mostrar('documentos');
  const cont = $('#vista-documentos');
  const c = estado.consultas;
  if (cont.dataset.listo) return;
  cont.dataset.listo = '1';
  const ESTADOS = { AERONAVEGABLE: ['Aeronavegable', 'bien'], VIGENTE: ['Matrícula vigente', 'ojo'], SUSPENDIDA: ['Suspendida o no aeronavegable', 'mal'], CANCELADA: ['Cancelada', 'mal'] };
  cont.innerHTML = `<h1>Documentos</h1>
    <p>Las mismas fuentes que tienes en papel: reportes ALDIA del 13-OCT-26, resumen de NOTAM del 19-OCT-26 y los SUP. El AIP se busca en el <a href="https://eaip-colombia.atnaerocivil.gov.co/eaip/" target="_blank" rel="noopener">eAIP oficial</a> (AMDT 73/26).</p>
    <div class="buscadores">
      <label>Chequeos de vuelo (nombre)<input type="search" id="b-piloto" placeholder="Apellido o nombre"></label>
      <label>Certificado médico (nombre)<input type="search" id="b-medico" placeholder="Apellido o nombre"></label>
      <label>Matrícula<input type="search" id="b-matricula" placeholder="HK1634"></label>
      <label>NOTAM (OACI o texto)<input type="search" id="b-notam" placeholder="SKBO"></label>
    </div>
    <div id="r-docs" aria-live="polite"></div>
    <details class="ficha"><summary>Capacidad de las aeronaves (personas a bordo)</summary><div class="envoltura-tabla"><table class="tabla"><thead><tr><th>Tipo</th><th>Aeronave</th><th>Personas</th><th>Fuente</th></tr></thead><tbody>
      ${Object.entries(c.aeronaves).filter(([, a]) => a.plazas).map(([k, a]) => `<tr><td>${k}</td><td>${esc(a.nombre)}</td><td>${a.plazas}</td><td><a href="${esc(a.fuente.url)}" target="_blank" rel="noopener">${esc(a.fuente.literal)}</a></td></tr>`).join('')}
    </tbody></table></div></details>
    <details class="ficha"><summary>Suplementos (SUP) vigentes</summary><div class="envoltura-tabla"><table class="tabla"><thead><tr><th>SUP</th><th>Lugar</th><th>Asunto</th><th>Desde</th><th>Qué cambia</th></tr></thead><tbody>
      ${(c.sup || []).map((s) => `<tr><td>${esc(s.sup)}</td><td>${esc(s.lugar)}</td><td>${esc(s.asunto)}</td><td>${esc((s.desde || '').slice(0, 10))}</td><td>${esc(s.cambio)}</td></tr>`).join('')}
    </tbody></table></div></details>`;
  const salida = $('#r-docs', cont);
  const tabla = (cab, filas) => `<div class="envoltura-tabla"><table class="tabla"><thead><tr>${cab.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`;
  const buscadores = {
    'b-piloto': (q) => {
      const r = c.pilotos.filter((p) => coincideNombre(p.nombre, q)).slice(0, 15);
      return r.length ? r.map((p) => `<div class="ficha"><b>${esc(p.nombre)}</b>${tabla(['Licencia', 'Número', 'Equipo', 'Vence', 'Estado'], p.chequeos.map((x) => `<tr>${x.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`))}</div>`).join('') : '<p class="suave">No aparece en el reporte de chequeos de vuelo.</p>';
    },
    'b-medico': (q) => {
      const r = c.medicos.filter((m) => coincideNombre(m[0], q)).slice(0, 20);
      return r.length ? tabla(['Nombre', 'Clase', 'Vence', 'Estado'], r.map((m) => `<tr>${m.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)) : '<p class="suave">No aparece en el reporte de certificados médicos.</p>';
    },
    'b-matricula': (q) => {
      const k = sinTildes(q).replace(/[^A-Z0-9]/g, '');
      const est = c.matriculas.estados[k] || c.matriculas.estados[k.replace(/[GX]$/, '')];
      const ext = c.matriculas.extranjeras[k];
      const ul = c.matriculas.ultralivianos.includes(k);
      if (!est && !ext && !ul) return '<p class="suave">No figura en los reportes de matrículas.</p>';
      return `<div class="ficha"><b>${esc(k)}</b> ${(est || []).map((e) => `<span class="etiqueta ${ESTADOS[e]?.[1] || 'ojo'}">${ESTADOS[e]?.[0] || e}</span>`).join(' ')}${ul ? ' <span class="etiqueta ojo">Ultraliviano</span>' : ''}
        ${ext ? tabla(['Modelo', 'Permiso desde', 'Hasta', 'Estado'], ext.map((x) => `<tr><td>${esc(x.modelo)}</td><td>${x.desde}</td><td>${x.hasta}</td><td>${esc(x.estado)}</td></tr>`)) : ''}</div>`;
    },
    'b-notam': (q) => {
      const t = sinTildes(q).trim();
      const r = c.notam.filter((n) => n.oaci === t || (t.length > 4 && sinTildes(n.texto).includes(t))).slice(0, 60);
      return r.length ? r.map((n) => `<div class="ficha"><b>${n.id}</b> · ${esc(n.lugar)} (${n.oaci})<br><span class="suave">${n.desde.replace('T', ' ')} a ${n.hasta.replace('T', ' ')}${n.horario ? ` · ${n.horario}` : ''}</span><p>${esc(n.texto)}</p></div>`).join('') : '<p class="suave">Sin NOTAM para esa búsqueda en el resumen del 19-OCT-26.</p>';
    },
  };
  for (const [idInput, fn] of Object.entries(buscadores)) {
    let t;
    $(`#${idInput}`, cont).oninput = (e) => {
      clearTimeout(t);
      const q = e.target.value.trim();
      t = setTimeout(() => { salida.innerHTML = q.length >= 2 ? fn(q) : ''; }, 150);
    };
  }
}

// ── arranque ─────────────────────────────────────────────────────────────────
async function cargar() {
  mostrar('cargando');
  try {
    const [banco, consultas, respuestas] = await Promise.all([supa.bajarJSON('banco.json'), supa.bajarJSON('consultas.json'), supa.leerRespuestas()]);
    estado.planes = banco.planes;
    estado.porId = new Map(banco.planes.map((p) => [p.id, p]));
    estado.consultas = consultas;
    estado.motivos = consultas.motivos;
    const clave = (r) => `${r.plan_id}|${r.modo}|${r.intento}`;
    const enServidor = new Set(respuestas.map(clave));
    estado.respuestas = [...respuestas, ...supa.colaLocal().filter((r) => !enServidor.has(clave(r)))];
    supa.vaciarCola();
    $('#pestanas').hidden = false;
    $('#salir').hidden = false;
    actualizarCabecera();
    ir();
  } catch (e) {
    if (e.sinSesion) return pedirEntrada();
    if (e.privado) return pedirEntrada('Los planes todavía no están disponibles. Intenta de nuevo más tarde.');
    pedirEntrada(`No se pudieron cargar los planes: ${e.message} Revisa la conexión y vuelve a entrar.`);
  }
}

function pedirEntrada(mensaje = '') {
  mostrar('entrar');
  $('#aviso-entrar').textContent = mensaje;
}

async function iniciar() {
  const q = new URLSearchParams(location.search);
  if (q.get('prueba') === 'formulario') {
    for (let i = 0; i < 50 && !window.__PLAN_PRUEBA; i++) await new Promise((r) => setTimeout(r, 50));
    pintarFormulario(window.__PLAN_PRUEBA, $('#hoja-prueba'));
    mostrar('prueba');
    return;
  }
  $$('#pestanas button').forEach((b) => { b.onclick = () => { if (location.hash === `#${b.dataset.vista}`) ir(); else location.hash = `#${b.dataset.vista}`; }; });
  window.addEventListener('hashchange', () => { if (estado.planes.length) ir(); });
  window.addEventListener('online', () => supa.vaciarCola());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' || /input|textarea/i.test(e.target.tagName)) return;
    const v = $$('.vista').find((x) => !x.hidden);
    v?._teclaDerecha?.();
  });
  $('#salir').onclick = () => { supa.salir(); location.hash = ''; location.reload(); };
  $('#form-entrar').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    $('#aviso-entrar').textContent = '';
    try { await supa.entrar(f.correo.value.trim(), f.clave.value); await cargar(); } catch (err) { $('#aviso-entrar').textContent = err.message; }
  };
  if (await supa.sesion()) await cargar(); else pedirEntrada();
}

iniciar();
