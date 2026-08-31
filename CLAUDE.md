# SoyAeronautico

## Descripción del proyecto

SoyAeronautico es una plataforma web educativa enfocada en estudiantes y profesionales de aviación.

El proyecto contiene material educativo, herramientas, simuladores, ejercicios, cuestionarios y utilidades relacionadas con aviación.

El proyecto está desarrollado principalmente con HTML, CSS y JavaScript y se publica mediante GitHub y Netlify.

---

## Reglas generales

1. No eliminar funcionalidades existentes.
2. No modificar funcionalidades que no estén relacionadas con la solicitud actual.
3. No cambiar el diseño visual existente sin autorización explícita.
4. Mantener la compatibilidad con dispositivos móviles.
5. Mantener la estructura actual del proyecto siempre que sea posible.
6. Antes de modificar un archivo, revisar su contenido y sus dependencias.
7. No crear archivos duplicados cuando pueda reutilizarse uno existente.
8. No cambiar nombres de archivos existentes sin autorización.
9. No eliminar código simplemente porque parezca innecesario.
10. Priorizar cambios pequeños y controlados.

---

## Diseño

El diseño actual de SoyAeronautico debe considerarse establecido.

No modificar:

- colores principales
- tipografías
- navegación
- encabezado
- pie de página
- estructura general
- tarjetas
- botones
- responsive design

salvo que el usuario lo solicite explícitamente.

Cuando se agregue una nueva funcionalidad, debe integrarse visualmente con el diseño existente.

---

## HTML

Mantener HTML semántico y organizado.

No duplicar IDs.

Mantener los enlaces existentes funcionando.

No modificar `index.html` salvo que el usuario lo solicite explícitamente.

---

## CSS

Antes de crear nuevos estilos, revisar si ya existe un estilo reutilizable.

Evitar estilos inline cuando sea posible.

No sobrescribir estilos globales innecesariamente.

Los nuevos componentes deben ser responsive.

---

## JavaScript

No eliminar funciones existentes.

Evitar variables globales innecesarias.

Antes de modificar JavaScript existente, comprobar qué páginas utilizan ese código.

No introducir dependencias externas sin autorización.

---

## Nuevas funcionalidades

Cuando el usuario solicite una nueva funcionalidad:

1. Revisar primero la estructura existente.
2. Identificar qué archivos necesitan modificarse.
3. Reutilizar componentes existentes cuando sea posible.
4. Hacer el menor número de modificaciones necesarias.
5. No modificar funcionalidades no relacionadas.
6. Comprobar que la funcionalidad funciona en escritorio y móvil.

---

## Simuladores y herramientas de aviación

Los simuladores y herramientas deben priorizar:

- precisión técnica
- facilidad de uso
- diseño intuitivo
- funcionamiento en dispositivos móviles
- retroalimentación clara al usuario

Cuando una función esté relacionada con procedimientos aeronáuticos, utilizar terminología aeronáutica correcta.

No inventar procedimientos, normas o datos aeronáuticos.

Si una función depende de normativa OACI, RAC o documentación aeronáutica específica, indicarlo claramente.

---

## Cuestionarios

Los cuestionarios deben:

- mostrar claramente las preguntas
- permitir seleccionar respuestas
- calcular correctamente la puntuación
- mostrar el resultado final
- funcionar correctamente en móvil
- evitar revelar las respuestas antes de finalizar

La puntuación debe calcularse de forma consistente.

---

## METAR / TAF / SIGMET

Las herramientas meteorológicas deben utilizar correctamente la estructura y terminología aeronáutica.

No modificar la lógica existente de METAR, TAF o SIGMET sin revisar primero cómo funciona.

---

## Netlify / GitHub

El proyecto utiliza GitHub como repositorio y Netlify para publicación.

Evitar generar cambios innecesarios que provoquen despliegues adicionales.

No modificar configuraciones de Netlify salvo que el usuario lo solicite.

### Automatización con Claude Code (MCP) — agregado 2026-08-26

Claude Code está conectado directamente a Supabase, Netlify y GitHub vía MCP (ver `.mcp.json`), y puede editar archivos, subirlos a GitHub y disparar el deploy en Netlify sin que el usuario tenga que hacerlo manualmente.

- **Repositorio real**: `kkannon04-cyber/soyaeronautico`, rama `main`. **Sitio Netlify**: `soyaeronautico` (siteId `b4a0433e-a990-422e-bb59-5ee775d4b457`), en vivo en `https://soyaeronautico.com`. **Supabase**: proyecto `yszcglcnbpnyteytpfyc`.
- El usuario no tiene `git` instalado localmente — antes de esta automatización subía archivos a mano por la interfaz web de GitHub. El token de GitHub vive como variable de entorno de Windows (`GITHUB_PAT`), referenciado en `.mcp.json` como `${GITHUB_PAT}` — **nunca escribir el token literal en `.mcp.json` ni en ningún archivo del repo**.
- **Cómo subir cambios**: agrupar todo el lote de una tarea/sesión en **un solo commit atómico** vía la Git Data API de GitHub (blobs → tree → commit → actualizar ref), ejecutado desde PowerShell leyendo los archivos directo del disco — nunca retipear contenido de archivos grandes a mano (riesgo real de error de transcripción sobre el sitio en producción). Subir archivo por archivo generaría un commit — y posiblemente un deploy — por archivo.
- **Regla explícita del usuario (2026-08-26): nunca hacer push a GitHub ni disparar un deploy por iniciativa propia.** Claude edita archivos locales libremente sin pedir permiso (no toca GitHub/Netlify, es reversible), pero antes de cada push hay que mostrarle al usuario qué archivos cambiaron y esperar su confirmación explícita — cada vez, no solo la primera. Un lote de varios cambios se sube junto en un solo push cuando el usuario lo autorice, no uno por uno.
- **Estado actual de "Stopped builds" (Netlify): ACTIVO/auto-deploy encendido** (el usuario lo desactivó el 2026-08-26 tras la primera prueba). Esto significa que un push autorizado a `main` dispara un build automático de inmediato — ya no hay una pausa de por medio como respaldo. La confirmación explícita antes de cada push (regla de arriba) es ahora el único filtro real contra gastar créditos sin que el usuario lo sepa. El MCP de Netlify no expone una herramienta para activar/desactivar ese interruptor — solo se hace manualmente en el dashboard (Project configuration → Build & deploy → Continuous deployment → Build settings). Si el usuario pide varios cambios seguidos y prefiere volver a pausar los builds como respaldo mientras tanto, es decisión suya, no asumirlo.
- **Disparar un deploy manualmente**: la herramienta `deploy-site` del MCP de Netlify no ejecuta el build ella misma — devuelve un comando `npx @netlify/mcp@latest --site-id ... --proxy-path ...` para correr localmente, que normalmente bloquea el clasificador de seguridad de Claude Code (parece ejecución arbitraria con token en la URL). No intentar sortear ese bloqueo. La alternativa simple: pedirle al usuario que entre al dashboard de Netlify y le dé clic a "Trigger deploy" él mismo (relevante sobre todo si "Stopped builds" vuelve a activarse en el futuro).

---

## Regla importante

Si una solicitud puede realizarse modificando un único archivo, no modificar varios archivos innecesariamente.

Antes de realizar cambios importantes, explicar brevemente qué archivos serán modificados y por qué.

Nunca eliminar una funcionalidad existente para implementar una nueva.
