// ============================================================
// graficas-panel.js — Gráficas y recorrido guiado de los paneles
// ============================================================
// Lo usan Panel_estudiante.html y panel-profesor.html. Envuelve dos
// librerías que cada panel carga por CDN ANTES de este archivo:
//   - Frappe Charts 1.6.2 (MIT): calendario de estudio, barras y líneas.
//   - driver.js 1.10.2 (MIT): recorrido guiado de la primera visita.
// Autorizadas por el usuario el 2026-10-26.
//
// Todo cuelga de un solo objeto global, GraficasPanel. Si una librería no
// cargó (sin red, bloqueador), las funciones no hacen nada y el panel
// sigue funcionando sin la gráfica.
//
// Frappe Charts no trae español: los textos del calendario y la etiqueta
// flotante se traducen después de dibujar (ver traducir()).

(function () {
  'use strict';

  const raiz = document.documentElement;
  const oscuro = () => raiz.getAttribute('data-theme') === 'dark';
  const variable = (nombre) => getComputedStyle(raiz).getPropertyValue(nombre).trim();
  const hayGraficas = () => typeof window.frappe !== 'undefined' && typeof window.frappe.Chart === 'function';

  // ---------- Traducción ----------
  const TEXTOS = { jan: 'Ene', apr: 'Abr', aug: 'Ago', dec: 'Dic', mon: 'Lun', wed: 'Mié', fri: 'Vie', less: 'Poco', more: 'Mucho' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function traducir() {
    // Barras: el nombre completo va en los datos (lo muestra la etiqueta
    // flotante) y bajo cada barra se escribe el corto, que Frappe no recorta.
    document.querySelectorAll('.graficas-barras[data-cortas]').forEach((c) => {
      const cortas = JSON.parse(c.dataset.cortas);
      const textos = c.querySelectorAll('.x.axis text');
      if (textos.length !== cortas.length) return;
      textos.forEach((t, i) => { if (t.textContent !== cortas[i]) t.textContent = cortas[i]; });
      // Si no caben derechos (teléfono, muchas barras), se inclinan.
      const marcas = [...textos].map((t) => t.parentNode.querySelector('line') || t);
      let chocan = false;
      for (let i = 1; i < textos.length && !chocan; i++) {
        const espacio = marcas[i].getBoundingClientRect().left - marcas[i - 1].getBoundingClientRect().left;
        chocan = (textos[i].getComputedTextLength() + textos[i - 1].getComputedTextLength()) / 2 + 6 > espacio;
      }
      if (c.classList.contains('etiquetas-inclinadas') !== chocan) c.classList.toggle('etiquetas-inclinadas', chocan);
    });
    document.querySelectorAll('.graficas-calendario text').forEach((t) => {
      const original = t.textContent.trim();
      const es = TEXTOS[original.toLowerCase()];
      if (es) t.textContent = original === original.toUpperCase() ? es.toUpperCase() : es;
    });
    // «<strong>3 intentos</strong> on May 2026, 06» → «3 intentos · 06 may 2026»
    document.querySelectorAll('.graph-svg-tip .title').forEach((el) => {
      const m = el.textContent.match(/^\s*(\d+) (.+?) on ([A-Za-z]+) (\d{4}), (\d+)\s*$/);
      if (!m) return;
      const mes = MESES[MESES_EN.indexOf(m[3].slice(0, 3).toLowerCase())] || m[3];
      const calendario = el.closest('.graficas-calendario');
      const uno = calendario && calendario.dataset.etiquetaUno;
      const etiqueta = uno && m[1] === '1' ? uno : m[2];
      el.innerHTML = '';
      const fuerte = document.createElement('strong');
      fuerte.textContent = `${m[1]} ${etiqueta}`;
      el.append(fuerte, ` · ${m[5]} ${mes} ${m[4]}`);
    });
  }
  let traduccionPendiente = false;
  new MutationObserver(() => {
    if (traduccionPendiente) return;
    traduccionPendiente = true;
    requestAnimationFrame(() => { traduccionPendiente = false; traducir(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // ---------- Estilos ----------
  // Se inyectan una vez, como hace progreso.js con la foto de perfil, para
  // que cada panel no tenga que repetirlos.
  function estilos() {
    if (document.getElementById('graficasPanelEstilos')) return;
    const s = document.createElement('style');
    s.id = 'graficasPanelEstilos';
    s.textContent = `
      .graficas-lienzo .chart-container { font-family: var(--font-main); }
      .graficas-lienzo .chart-container .axis, .graficas-lienzo .chart-container .chart-label { fill: var(--text-muted); font-size: 11px; }
      .graficas-lienzo .chart-container .axis line, .graficas-lienzo .chart-container .chart-label line { stroke: var(--border-color) !important; }
      .graficas-lienzo .chart-container .y-markers line { stroke: var(--text-muted) !important; stroke-dasharray: 4 4; }
      .graficas-barras.etiquetas-inclinadas { padding-bottom: 34px; }
      .graficas-barras.etiquetas-inclinadas svg { overflow: visible; }
      .graficas-barras.etiquetas-inclinadas .x.axis text { text-anchor: end; transform-box: fill-box; transform-origin: 100% 0; transform: rotate(-40deg); }
      .graficas-calendario .chart-container .domain-name,
      .graficas-calendario .chart-container .subdomain-name { fill: var(--text-muted); font-family: var(--font-mono); font-size: 10px; }
      .graficas-calendario .chart-container .heatmap-legend text { fill: var(--text-muted); font-size: 11px; }
      .graph-svg-tip { font-family: var(--font-main); border-radius: 8px; }
      .graph-svg-tip .title { font-family: var(--font-main); }
      .driver-popover { font-family: var(--font-main); border-radius: 12px; max-width: 320px; }
      .driver-popover-title { font-family: var(--font-heading); font-size: 1.05rem; }
      .driver-popover-description { line-height: 1.5; }
      .driver-popover-footer button { font-family: var(--font-main); border-radius: 6px; text-shadow: none; }
      [data-theme="dark"] .driver-popover { background: var(--card-bg); color: var(--text-main); border: 1px solid var(--border-color); }
      [data-theme="dark"] .driver-popover-arrow-side-left { border-left-color: var(--card-bg); }
      [data-theme="dark"] .driver-popover-arrow-side-right { border-right-color: var(--card-bg); }
      [data-theme="dark"] .driver-popover-arrow-side-top { border-top-color: var(--card-bg); }
      [data-theme="dark"] .driver-popover-arrow-side-bottom { border-bottom-color: var(--card-bg); }
      [data-theme="dark"] .driver-popover-footer button { background: var(--bg-main); color: var(--text-main); border-color: var(--border-color); }
      [data-theme="dark"] .driver-popover-close-btn, [data-theme="dark"] .driver-popover-progress-text { color: var(--text-muted); }
    `;
    document.head.appendChild(s);
  }

  // ---------- Repintado al cambiar de tema ----------
  // Frappe fija los colores al dibujar: al pasar a oscuro hay que volver a
  // pintar cada gráfica con la paleta nueva.
  const repintes = new Map();
  new MutationObserver(() => repintes.forEach((fn) => fn()))
    .observe(raiz, { attributes: true, attributeFilter: ['data-theme'] });

  function dibujar(contenedor, clase, fn) {
    if (!contenedor || !hayGraficas()) return false;
    estilos();
    contenedor.classList.add('graficas-lienzo');
    if (clase) contenedor.classList.add(clase);
    const pintar = () => { contenedor.innerHTML = ''; fn(); };
    repintes.set(contenedor, pintar);
    pintar();
    return true;
  }

  // Día local 'AAAA-MM-DD' → segundos UNIX de su medianoche local.
  function segundosDeDia(clave) {
    const [a, m, d] = clave.split('-').map(Number);
    return Math.floor(new Date(a, m - 1, d).getTime() / 1000);
  }

  const GraficasPanel = {
    disponible: hayGraficas,

    // conteo: Map o objeto { 'AAAA-MM-DD': n }. Devuelve false si no dibujó.
    calendario(contenedor, conteo, { desde, hasta, etiqueta = 'intentos', etiquetaUno = 'intento' } = {}) {
      const puntos = {};
      const entradas = conteo instanceof Map ? conteo.entries() : Object.entries(conteo || {});
      for (const [dia, n] of entradas) if (n > 0) puntos[segundosDeDia(dia)] = n;
      if (contenedor) contenedor.dataset.etiquetaUno = etiquetaUno;
      return dibujar(contenedor, 'graficas-calendario', () => {
        new window.frappe.Chart(contenedor, {
          type: 'heatmap',
          height: 190,
          data: { dataPoints: puntos, start: desde, end: hasta },
          countLabel: etiqueta,
          discreteDomains: 1,
          colors: oscuro()
            ? ['#2A3548', 'rgba(16,185,129,0.35)', 'rgba(16,185,129,0.6)', 'rgba(16,185,129,0.8)', '#10b981']
            : ['#e2e8f0', 'rgba(16,185,129,0.3)', 'rgba(16,185,129,0.55)', 'rgba(16,185,129,0.8)', '#0e9f6e']
        });
      });
    },

    // Barras con la línea punteada del umbral (70 % por defecto, el mismo que
    // pinta las barras de progreso en verde o amarillo). `cortas` (opcional)
    // son los nombres que se leen bajo cada barra; `etiquetas`, los completos.
    barras(contenedor, { etiquetas, cortas, valores, serie = 'Mejor nota', umbral = 70, alto = 240, sufijo = ' %', color } = {}) {
      if (contenedor && cortas) contenedor.dataset.cortas = JSON.stringify(cortas);
      return dibujar(contenedor, 'graficas-barras', () => {
        new window.frappe.Chart(contenedor, {
          type: 'bar',
          height: alto,
          data: Object.assign(
            { labels: etiquetas, datasets: [{ name: serie, values: valores }] },
            umbral != null ? { yMarkers: [{ label: '', value: umbral }] } : {}
          ),
          colors: [color || variable('--primary')],
          barOptions: { spaceRatio: valores.length < 4 ? 1.2 : 0.5 },
          axisOptions: { xAxisMode: 'tick', yAxisMode: 'span', xIsSeries: false },
          tooltipOptions: { formatTooltipY: (v) => `${v}${sufijo}` }
        });
      });
    },

    linea(contenedor, { etiquetas, valores, serie = 'Nota general', alto = 220, sufijo = ' %' } = {}) {
      return dibujar(contenedor, 'graficas-linea', () => {
        new window.frappe.Chart(contenedor, {
          type: 'line',
          height: alto,
          data: { labels: etiquetas, datasets: [{ name: serie, values: valores }] },
          colors: [variable('--primary')],
          lineOptions: { regionFill: 1, dotSize: 4, hideDotBorder: 1 },
          axisOptions: { xAxisMode: 'tick', yAxisMode: 'span', xIsSeries: true },
          tooltipOptions: { formatTooltipY: (v) => `${v}${sufijo}` }
        });
      });
    },

    // pasos: [{ elemento: '#id' | Element, titulo, texto }]. Se saltan los
    // que no existen o están ocultos. clave: localStorage para mostrarlo una
    // sola vez; con forzar se muestra siempre (botón «Ver recorrido»).
    recorrido(pasos, { clave, forzar = false } = {}) {
      const lib = window.driver && window.driver.js && window.driver.js.driver;
      if (typeof lib !== 'function') return false;
      if (!forzar && clave && localStorage.getItem(clave)) return false;
      const visibles = pasos
        .map((p) => ({ el: typeof p.elemento === 'string' ? document.querySelector(p.elemento) : p.elemento, p }))
        .filter(({ el }) => {
          if (!el || !el.getClientRects().length) return false;
          // Fuera de pantalla a los lados = oculto (p. ej. la barra lateral
          // plegada como cajón en el teléfono).
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
        });
      if (!visibles.length) return false;
      estilos();
      const guia = lib({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Listo',
        allowClose: true,
        smoothScroll: true,
        steps: visibles.map(({ el, p }) => ({ element: el, popover: { title: p.titulo, description: p.texto } })),
        onDestroyed: () => { if (clave) localStorage.setItem(clave, '1'); }
      });
      guia.drive();
      return true;
    }
  };

  window.GraficasPanel = GraficasPanel;
})();
