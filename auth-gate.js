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
//
// Rol mínimo (opcional): una página puede exigir además un rol
// concreto de perfiles.rol con
//   <script src="auth-gate.js" data-rol-requerido="teacher"></script>
// Sin ese atributo el comportamiento es el de siempre (solo se exige
// que haya sesión iniciada), así que las páginas existentes no cambian.
// ============================================================
(function () {
  // Se lee aquí, de forma síncrona: document.currentScript deja de ser
  // válido en cuanto el script hace su primer await.
  const rolRequerido = (document.currentScript && document.currentScript.dataset.rolRequerido) || null;

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

  const textoOverlay = overlay.querySelector('span');

  // Si la comprobación falla y mandamos al login, el login podría devolvernos
  // aquí (ve la sesión guardada) y entrar en un ping-pong infinito. Este
  // contador corta el ciclo tras un intento y muestra una salida al usuario.
  const CLAVE_REBOTES = 'aisAuthGateRebotes';
  function rebotes() { try { return Number(sessionStorage.getItem(CLAVE_REBOTES)) || 0; } catch (e) { return 0; } }
  function anotarRebote() { try { sessionStorage.setItem(CLAVE_REBOTES, rebotes() + 1); } catch (e) {} }
  function limpiarRebotes() { try { sessionStorage.removeItem(CLAVE_REBOTES); } catch (e) {} }

  // acciones: HTML de los botones de salida. Si no se pasa nada, se usan
  // los de siempre (Reintentar / Ir al login).
  function mostrarSalida(mensaje, acciones) {
    const botonesPorDefecto =
      '<button id="authGateReintentar" style="background:#1657C6;color:#fff;border:none;padding:9px 18px;' +
        'border-radius:30px;font-weight:700;font-size:0.85rem;cursor:pointer;">Reintentar</button>' +
      '<a href="login.html" style="background:none;border:1px solid #E1E7EF;color:#5B6B7F;padding:9px 18px;' +
        'border-radius:30px;font-weight:600;font-size:0.85rem;text-decoration:none;">Ir al login</a>';
    overlay.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;max-width:340px;text-align:center;padding:24px;">' +
        '<svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" style="color:#1657C6;">' +
          '<circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
          '<path d="M20 6 L25.5 20 L14.5 20 Z" fill="currentColor"/>' +
          '<path d="M20 34 L25.5 20 L14.5 20 Z" fill="currentColor" opacity="0.4"/>' +
          '<circle cx="20" cy="20" r="2.6" fill="#FFFFFF" stroke="currentColor" stroke-width="1.3"/>' +
        '</svg>' +
        '<span style="line-height:1.5;">' + mensaje + '</span>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
          (acciones || botonesPorDefecto) +
        '</div>' +
      '</div>';
    const btn = document.getElementById('authGateReintentar');
    if (btn) btn.addEventListener('click', () => { limpiarRebotes(); window.location.reload(); });
  }

  (async function comprobarAcceso() {
    // El script de Supabase viene de un CDN: si aún no ha cargado, sbClient es
    // null y daríamos por "sin sesión" a alguien que sí ha iniciado sesión.
    // Se le da un margen corto para aparecer antes de decidir nada.
    for (let i = 0; i < 20 && (typeof sbClient === 'undefined' || !sbClient); i++) {
      await new Promise(r => setTimeout(r, 150));
    }

    if (typeof sbClient === 'undefined' || !sbClient) {
      mostrarSalida('No se pudo cargar el servicio de cuentas. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }

    let sesion = null;
    try {
      sesion = await obtenerSesionActual();
    } catch (e) {
      sesion = null;
    }

    if (sesion) {
      // Si la página exige un rol concreto, se comprueba contra perfiles.rol
      // antes de dejar pasar. Un rol insuficiente no manda al login (la
      // sesión es válida): se explica y se ofrece volver al panel.
      if (rolRequerido) {
        let rol = null;
        try {
          const { data } = await sbClient.from('perfiles').select('rol').eq('id', sesion.user.id).maybeSingle();
          rol = data ? data.rol : null;
        } catch (e) {
          rol = null;
        }
        if (rol !== rolRequerido) {
          limpiarRebotes();
          mostrarSalida(
            rolRequerido === 'teacher'
              ? 'Esta sección es solo para cuentas de profesor. Si eres instructor y necesitas acceso, escríbele al administrador del sitio.'
              : 'Tu cuenta no tiene permisos para ver esta sección.',
            '<a href="Panel_estudiante.html" style="background:#1657C6;color:#fff;border:none;padding:9px 18px;' +
              'border-radius:30px;font-weight:700;font-size:0.85rem;text-decoration:none;">Ir a mi panel</a>' +
            '<a href="index.html" style="background:none;border:1px solid #E1E7EF;color:#5B6B7F;padding:9px 18px;' +
              'border-radius:30px;font-weight:600;font-size:0.85rem;text-decoration:none;">Ir al inicio</a>'
          );
          return;
        }
      }
      limpiarRebotes();
      overlay.remove();
      return;
    }

    if (rebotes() >= 1) {
      // Ya volvimos del login una vez y seguimos sin ver la sesión: en vez de
      // rebotar otra vez, se lo explicamos en lugar de dejarlo en un bucle.
      mostrarSalida('No pudimos confirmar tu sesión. Vuelve a iniciar sesión para continuar.');
      return;
    }

    anotarRebote();
    if (textoOverlay) textoOverlay.textContent = 'Necesitas iniciar sesión…';
    const destino = location.pathname.split('/').pop() + location.search;
    window.location.replace('login.html?next=' + encodeURIComponent(destino));
  })();
})();
