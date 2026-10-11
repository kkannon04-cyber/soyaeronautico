/* =====================================================================
   CIELO — fondo animado de los héroes azules (inicio y Quiénes somos)

   Aeronaves vistas desde arriba cruzan el fondo de un lado a otro, a
   distintas «alturas» (las cercanas son más grandes, rápidas y nítidas, y
   dejan doble estela; las lejanas, pequeñas y tenues). Cada una deja una
   estela que se desvanece en ~4 s. Si el puntero se acerca, la aeronave
   se aparta con suavidad.

   Uso: <canvas class="cielo" data-cielo aria-hidden="true"></canvas> como
   primer hijo de un contenedor con position:relative y fondo azul. El
   lienzo no recibe clics (pointer-events:none en su CSS); el puntero se lee
   en el contenedor.

   · Se pausa fuera de pantalla y con la pestaña oculta.
   · Con «reducir movimiento» dibuja un solo cuadro quieto.
   · Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  var COLOR_AVION = '226,236,250';   // casi blanco azulado
  var COLOR_ESTELA = '143,182,242';  // azul claro de la marca
  var MUESTRA_MS = 60;               // cada cuánto se guarda un punto de estela
  var PUNTOS_ESTELA = 70;            // ~4,2 s de estela
  var RADIO_PUNTERO = 140;

  // Silueta en planta (nariz hacia +x), mitad superior; se refleja en y.
  var MITAD = [
    [1.00, 0.00], [0.62, 0.09], [0.18, 0.10], [-0.06, 0.78], [-0.24, 0.78],
    [-0.12, 0.10], [-0.66, 0.08], [-0.84, 0.34], [-0.96, 0.34], [-0.92, 0.05], [-1.00, 0.00]
  ];
  var SILUETA = MITAD.concat(MITAD.slice(1, -1).reverse().map(function (p) { return [p[0], -p[1]]; }));

  function azar(a, b) { return a + Math.random() * (b - a); }

  function iniciar(canvas) {
    var cont = canvas.parentElement;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ancho = 0, alto = 0, dpr = 1;
    var aviones = [];
    var puntero = null;
    var visible = true, activo = false, ultimo = 0, rafId = 0;

    function nuevoAvion(entrando) {
      var z = azar(0.3, 1);                         // profundidad: 1 = cerca
      var dir = Math.random() < 0.5 ? 1 : -1;
      var tam = 6 + 10 * z;
      return {
        z: z,
        tam: tam,
        vel: 16 + 48 * z,
        base: dir > 0 ? 0 : Math.PI,
        rumbo: dir > 0 ? 0 : Math.PI,
        x: entrando ? (dir > 0 ? -40 : ancho + 40) : azar(0, ancho),
        y: azar(alto * 0.08, alto * 0.92),
        fase: azar(0, Math.PI * 2),
        onda: azar(0.15, 0.4),                      // ritmo del serpenteo
        amp: azar(0.06, 0.16),                      // amplitud del serpenteo (rad)
        desvio: 0,                                  // giro acumulado por el puntero
        estela: [],
        reloj: 0
      };
    }

    function cuantos() { return Math.max(4, Math.min(9, Math.round(ancho / 170))); }

    function medir() {
      var r = cont.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = Math.max(1, r.width); alto = Math.max(1, r.height);
      canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr);
      canvas.style.width = ancho + 'px'; canvas.style.height = alto + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = cuantos();
      while (aviones.length < n) aviones.push(nuevoAvion(false));
      if (aviones.length > n) aviones.length = n;
      aviones.forEach(function (a) { if (a.y > alto) a.y = azar(alto * 0.08, alto * 0.92); });
    }

    function avanzar(a, dt, t) {
      // Serpenteo suave alrededor del rumbo base + desvío por el puntero.
      if (puntero) {
        var dx = a.x - puntero.x, dy = a.y - puntero.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < RADIO_PUNTERO) {
          var lado = (Math.sin(a.rumbo) * dx - Math.cos(a.rumbo) * dy) > 0 ? -1 : 1;
          a.desvio += lado * 1.6 * dt * (1 - d / RADIO_PUNTERO);
        }
      }
      a.desvio *= Math.pow(0.55, dt);               // vuelve poco a poco a su rumbo
      a.rumbo = a.base + Math.sin(t * a.onda + a.fase) * a.amp + a.desvio;
      a.x += Math.cos(a.rumbo) * a.vel * dt;
      a.y += Math.sin(a.rumbo) * a.vel * dt;

      a.reloj += dt * 1000;
      if (a.reloj >= MUESTRA_MS) {
        a.reloj = 0;
        a.estela.push([a.x, a.y, a.rumbo]);
        if (a.estela.length > PUNTOS_ESTELA) a.estela.shift();
      }

      var margen = 60 + a.vel * 4.5;               // deja salir también la estela
      if (a.x < -margen || a.x > ancho + margen || a.y < -margen || a.y > alto + margen) {
        var n = nuevoAvion(true);
        for (var k in n) a[k] = n[k];
      }
    }

    function dibujarEstela(a, lateral) {
      var e = a.estela, n = e.length;
      if (n < 2) return;
      var maxA = (0.06 + 0.2 * a.z) * (lateral ? 0.7 : 1);
      ctx.lineWidth = lateral ? 0.8 + 0.6 * a.z : 1 + 1.2 * a.z;
      ctx.lineCap = 'round';
      for (var i = 1; i < n; i++) {
        var p0 = e[i - 1], p1 = e[i];
        var o0x = 0, o0y = 0, o1x = 0, o1y = 0;
        if (lateral) {
          var off = a.tam * 0.6 * lateral;
          o0x = -Math.sin(p0[2]) * off; o0y = Math.cos(p0[2]) * off;
          o1x = -Math.sin(p1[2]) * off; o1y = Math.cos(p1[2]) * off;
        }
        ctx.strokeStyle = 'rgba(' + COLOR_ESTELA + ',' + (maxA * i / n).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(p0[0] + o0x, p0[1] + o0y);
        ctx.lineTo(p1[0] + o1x, p1[1] + o1y);
        ctx.stroke();
      }
    }

    function dibujarAvion(a) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rumbo);
      ctx.scale(a.tam, a.tam);
      ctx.beginPath();
      SILUETA.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + COLOR_AVION + ',' + (0.22 + 0.42 * a.z).toFixed(3) + ')';
      ctx.fill();
      ctx.restore();
    }

    function dibujar() {
      ctx.clearRect(0, 0, ancho, alto);
      // Lejanos primero, cercanos encima.
      aviones.slice().sort(function (p, q) { return p.z - q.z; }).forEach(function (a) {
        if (a.z > 0.7) { dibujarEstela(a, 1); dibujarEstela(a, -1); }
        else dibujarEstela(a, 0);
        dibujarAvion(a);
      });
    }

    // Simula unos segundos sin dibujar para que al cargar ya haya estelas.
    function precalentar(seg) {
      var t = 0, paso = 1 / 30;
      for (; t < seg; t += paso) aviones.forEach(function (a) { avanzar(a, paso, t); });
      return t;
    }

    var tiempo = 0;
    function cuadro(ahora) {
      if (!activo) return;
      var dt = Math.min(0.05, (ahora - (ultimo || ahora)) / 1000);
      ultimo = ahora;
      tiempo += dt;
      aviones.forEach(function (a) { avanzar(a, dt, tiempo); });
      dibujar();
      rafId = requestAnimationFrame(cuadro);
    }

    function arrancar() {
      if (activo || reducido || !visible || document.hidden) return;
      activo = true; ultimo = 0;
      rafId = requestAnimationFrame(cuadro);
    }
    function parar() { activo = false; cancelAnimationFrame(rafId); }

    medir();
    tiempo = precalentar(5);
    dibujar();
    canvas.classList.add('listo');

    if (reducido) {
      // Un cuadro quieto; sólo se vuelve a dibujar si cambia el tamaño.
      if (window.ResizeObserver) new ResizeObserver(function () { medir(); dibujar(); }).observe(cont);
      return;
    }

    if (window.ResizeObserver) new ResizeObserver(function () { medir(); }).observe(cont);
    else window.addEventListener('resize', medir);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entradas) {
        visible = entradas[0].isIntersecting;
        if (visible) arrancar(); else parar();
      }).observe(cont);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) parar(); else arrancar(); });

    cont.addEventListener('pointermove', function (e) {
      var r = cont.getBoundingClientRect();
      puntero = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    cont.addEventListener('pointerleave', function () { puntero = null; });

    arrancar();
  }

  function todos() {
    var lienzos = document.querySelectorAll('canvas[data-cielo]');
    for (var i = 0; i < lienzos.length; i++) iniciar(lienzos[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', todos);
  else todos();
})();
