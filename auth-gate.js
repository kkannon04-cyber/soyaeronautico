// ============================================================
// CONTROL DE ACCESO — Quizzes y simuladores (SoyAeronautico)
// Bloquea visualmente el contenido de la página hasta confirmar
// que hay una sesión iniciada (Supabase). Si no la hay, redirige
// a login.html guardando la página de origen en "next" para volver
// aquí automáticamente después de iniciar sesión.
//
// Requiere que supabase-js, supabase-config.js y progreso.js ya
// estén cargados (van en <head>). Este script debe ser el primer
// elemento dentro de <body> para evitar que el contenido se vea
// antes de comprobar la sesión.
// ============================================================
(function () {
  const overlay = document.createElement('div');
  overlay.id = 'authGateOverlay';
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
    'background:#FFFFFF;color:#5B6B7F;font-family:\'IBM Plex Sans\',Arial,sans-serif;font-size:0.9rem;'
  );
  // Logo del sitio (mismo SVG estático usado en el resto de páginas) en vez de
  // solo texto plano, para que el salto a login.html se sienta parte del sitio.
  overlay.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">' +
      '<svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" style="color:#1657C6;">' +
        '<circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M20 6 L25.5 20 L14.5 20 Z" fill="currentColor"/>' +
        '<path d="M20 34 L25.5 20 L14.5 20 Z" fill="currentColor" opacity="0.4"/>' +
        '<circle cx="20" cy="20" r="2.6" fill="#FFFFFF" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>' +
      '<span>Verificando acceso…</span>' +
    '</div>';
  document.body.appendChild(overlay);

  (async function comprobarAcceso() {
    const sesion = await obtenerSesionActual();
    if (!sesion) {
      const destino = location.pathname.split('/').pop() + location.search;
      window.location.replace('login.html?next=' + encodeURIComponent(destino));
      return;
    }
    overlay.remove();
  })();
})();
