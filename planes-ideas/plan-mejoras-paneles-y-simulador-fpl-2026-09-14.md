# Mejoras: Panel de Profesor, Panel del Estudiante y Simulador de Plan de Vuelo

> **ESTADO: EJECUTADO el 2026-09-15.** Los 13 pasos del lote se implementaron y
> verificaron. Ver `comparacion-plan-vs-implementado-2026-09-15.pdf` para el
> detalle de lo planeado frente a lo entregado, incluidas las tres desviaciones.
> Los cambios están en el disco local; **no se ha hecho push a GitHub**.

## Contexto

Las tres herramientas funcionan y están en producción, pero cada una tiene un techo distinto:

- **Panel del profesor** califica bien y audita las correcciones de plan de vuelo, pero no tiene forma de **escribirle nada al alumno**. La única retroalimentación en texto que existe (`correcciones_resultado.motivo`) solo llega en plan de vuelo.
- **Panel del estudiante** mide cuánto ha hecho el alumno, pero no **qué falló**: la tabla `intentos` guarda únicamente agregados (`correctas/total/porcentaje`) y las preguntas de los quizzes no tienen campo de tema. Sin eso, ninguna recomendación de estudio es posible.
- **Simulador de plan de vuelo** es sólido en normativa (4 modos × 6 niveles, 20 revisiones OACI, calificación en servidor), pero **recargar pierde todo el formulario** y los 21 errores tipificados que ya tiene programados no son navegables ni se acumulan en ninguna estadística.

Decisiones tomadas por el usuario antes de escribir este plan:

- Se priorizan los cuatro ejes a la vez: valor didáctico, precisión aeronáutica, herramientas del profesor y robustez.
- **Racha e insignias del panel del estudiante NO se tocan.** Lo nuevo se suma aparte.
- En el simulador de plan de vuelo va primero **experiencia y flujo**; el rigor normativo adicional queda en el catálogo para una fase posterior.

Restricciones del proyecto: sitio en producción, sin git local, sin bundler, sin framework, sin tests. El SQL se aplica vía MCP de Supabase contra `yszcglcnbpnyteytpfyc` y **hay que anexar cada bloque a mano al final de `supabase-schema.sql`** — ese archivo es el libro mayor manual y el MCP no lo actualiza.

---

# Parte 1 — Catálogo de ideas

`★` = entra en el primer lote (Parte 2). Esfuerzo: S = horas, M = un día, L = varios días.

## Panel del Profesor

| Idea | Valor | Esf. |
|---|---|---|
| ★ **Comentario escrito y ajuste de nota en exámenes.** Hoy solo se puede corregir plan de vuelo. Generalizar la corrección auditada a examen y lectura. | Alto | M |
| **Un alumno en varios grupos.** `inscripciones.estudiante_id` es UNIQUE: un profesor con dos materias no puede tener al mismo alumno en ambas. Es el límite estructural más serio del sistema. | Alto | M |
| **Vista por estudiante en el tiempo.** Hoy solo existe la matriz estudiante × actividad. Falta el drill-down: evolución de un alumno, sus temas flojos, sus quizzes libres. | Alto | M |
| **Preguntas abiertas y verdadero/falso.** El constraint `cardinality(opciones)=4` obliga a opción múltiple de exactamente 4. | Alto | L |
| **Paginación.** `obtenerBancoPreguntas()` trae TODAS las preguntas y `obtenerResultadosDeGrupo()` TODOS los intentos con su `detalle` jsonb. Ni un `.limit()` en todo `profesor.js`. Con 3 grupos activos esto se cae. | Alto | S |
| **Vista previa / duplicar actividad de plan de vuelo.** Excluidas a propósito hoy (`panel-profesor.html:1499`). `obtenerPlanDeActividad()` (`profesor.js:833`) ya existe y **está muerta: cero llamadas en el repo**. | Medio | S |
| **Puntaje por pregunta.** Todas valen 1. Una pregunta de cálculo pesa igual que una de definición. | Medio | M |
| **Cronómetro por examen.** No existe límite de tiempo. | Medio | M |
| **Importar preguntas desde CSV real.** Hoy solo se pegan líneas con pipes. | Medio | S |
| **Archivar en vez de borrar.** Borrar un grupo arrastra actividades y resultados en cascada, sin papelera. | Medio | S |
| **Badge de entregas nuevas.** No hay ninguna señal de que algo esté pendiente de revisar. | Medio | S |
| **Estado en la URL.** Sin hash ni router: recargar siempre devuelve a "Resumen". Renombrar grupo usa `prompt()` y duplicar actividad **pide escribir el nombre del grupo destino a mano**. | Bajo | S |
| **Autogestión del rol `teacher`.** Hoy se activa a mano con un `update` en el SQL editor. | Bajo | M |
| ~~**Imágenes en las preguntas.**~~ **DESCARTADA (2026-09-14, decisión del usuario).** Requiere Supabase Storage y el proyecto está en plan gratuito: consumiría cuota de almacenamiento. No implementar. | — | — |

## Panel del Estudiante

| Idea | Valor | Esf. |
|---|---|---|
| ★ **Guardar qué preguntas se fallaron.** Columna `detalle jsonb` en `intentos`. Es el desbloqueo del que dependen casi todas las ideas didácticas de abajo. | Alto | M |
| ★ **Campo `tema` en las preguntas de los quizzes.** Sin esto no hay análisis por tema posible. | Alto | S |
| ★ **Tarjeta "Qué repasar".** Los 3 temas más fallados, con enlace directo a la página teórica que los cubre. | Alto | S |
| ★ **Ver la entrega corregida.** El alumno **ya tiene permiso RLS** para leer sus correcciones y `obtener_resultado_plan()` se las devuelve, pero el único enlace a `?resultado=` está en el panel del profesor. Hoy recibe una nota corregida que no puede abrir. | Alto | S |
| ★ **Caché de `obtenerIntentos()`.** El panel pide la misma tabla **5 veces por carga** sin caché, y arranca 100 % secuencial. | Alto | S |
| **Revisar intentos pasados.** El historial muestra los 5 últimos y no es clicable. `resultados_actividad.detalle` existe y el alumno nunca lo vuelve a ver. | Alto | M |
| **Gráfica de evolución de la nota.** Los datos ya están en `intentos.fecha`; solo falta pintarlos. | Medio | S |
| **"Continuar donde quedé".** El botón "Continuar" de los módulos teóricos enlaza al **inicio** del módulo, no a la página pendiente (`Panel_estudiante.html:780`). | Medio | S |
| **Próximos vencimientos.** Las `fecha_limite` solo aparecen dentro de cada tarjeta; no hay vista agregada de qué vence primero. | Medio | S |
| **Repaso espaciado.** Cola de repaso alimentada por los fallos. Depende de `detalle` + `tema`. | Medio | L |
| **Examen simulado global.** Mezcla cronometrada de todos los módulos. Hoy el "modo examen" existe pero encerrado en cada tema. | Medio | M |
| **Constancia descargable.** El alumno no puede exportar nada; CSV y PDF son exclusivos del profesor. | Medio | M |
| **Notificaciones.** Sin Realtime, sin correo, sin badge. Actividad nueva, vence mañana, nota corregida. | Medio | L |
| **Comparativa con el grupo.** Choca de frente con la RLS actual y con lo que el manual le promete al alumno ("tu progreso es tuyo"). Requiere decisión de producto antes que código. | Bajo | L |
| *(Opcional)* **Bug de la lista blanca.** `Simulador-NALA.html:6556` guarda con un id que no está en `intentos_modulo_valido`, así que esos intentos se pierden en silencio. Cuarto caso del mismo patrón; los otros tres están documentados dentro del propio SQL. Arreglo de una línea. | — | S |

## Simulador de Plan de Vuelo

**Fase A — experiencia y flujo** (elegida como prioridad)

| Idea | Valor | Esf. |
|---|---|---|
| ★ **Borrador persistente.** Recargar pierde el formulario entero. `localStorage` hoy solo guarda el tema visual. | Alto | S |
| ★ **Importar un FPL crudo.** Pegar `(FPL-HK1234-IS-...)` y que se vuelque al formulario. | Alto | M |
| ★ **Biblioteca de errores frecuentes.** Los 21 fallos tipificados (`FALLOS`, línea 3166) ya tienen explicación escrita y no son navegables. | Alto | S |
| ★ **"Practicar este error".** Hoy la inyección del modo "detectar el error" es aleatoria. Poder elegir el fallo concreto es el mayor salto didáctico del lote por ~15 líneas. | Alto | S |
| ★ **Estadística persistente por casilla.** El resumen del modo examen (línea 3325) se calcula y se tira al cerrar. | Alto | S |
| **Descubribilidad.** `plan-de-vuelo.html` **no enlaza al simulador** y el nav "Módulos" tampoco lo lista. La herramienta más completa del sitio es la más escondida. | Alto | S |
| **Reportar todos los errores de una casilla.** `validarPlan()` es una cadena `if/else if` monolítica de ~200 líneas: solo informa del **primer** problema de cada casilla. | Medio | M |
| **Autonomía vs EET con mensaje útil.** La comprobación existe (línea 2929) pero está *después* de la comparación con la clave, así que el alumno recibe "se esperaba X" en vez de la explicación. | Medio | S |

**Fase B — rigor normativo** (para después)

| Idea | Valor | Esf. |
|---|---|---|
| **Validar la ruta contra aerovías reales.** Hoy la casilla 15 se compara como cadena de texto. Existe ya una base con 202 aerovías, 545 puntos y 199 segmentos con distancia y MEA que podría reutilizarse en vez de duplicarse a mano. | Alto | L |
| **Mensajes ATS de verdad.** El selector de casilla 3 ofrece CHG/CNL/DLA pero no hay escenario, ni campo 22, ni validación. DEP, ARR, CPL, RQP no existen. | Alto | L |
| ★ **Coherencia velocidad / nivel / aeronave.** Un C172 a N0480/F390 pasa el formato sin protestar. **SUBIDA AL LOTE (2026-09-14, a petición del usuario) → Paso 11.** Ojo: NO es una regla OACI, es un chequeo de plausibilidad contra el catálogo de aeronaves del simulador; debe etiquetarse como tal. | Alto | M |
| **Cálculo de combustible.** La autonomía es un HHMM sorteado. Sin taxi, trip, contingencia, alterno ni reserva final. | Medio | M |
| ★ **Validar el formato de los valores de la 18.** `DOF/AAMMDD`, `SEL/`, `CODE/` hexadecimal: hoy solo se comparan contra la clave. **SUBIDA AL LOTE (2026-09-14) → Paso 12.** Normativa: Doc 4444 Apéndice 2. | Medio | M |
| ★ **`ZZZZ` exige `DEP/`/`DEST/`, `AFIL` exige `DEP/`.** Regla real que no se comprueba. **SUBIDA AL LOTE (2026-09-14) → Paso 13.** Normativa: Doc 4444 Apéndice 2. | Medio | S |
| **Ruta en mapa.** Sin coordenadas ni distancias en el simulador FPL. | Medio | L |
| **Plazos y validez** (30 min antes de EOBT, ACK/REJ). Están en la teoría y en el quiz, no en el motor. | Bajo | M |
| **Plan de vuelo repetitivo (RPL).** Solo se menciona como pregunta teórica. | Bajo | L |

---

# Parte 2 — Primer lote ejecutable

Diez pasos en orden. Las dependencias duras son: **4 depende de 2 y 3**; **6b depende de 5**; **8b depende de 2**. Los pasos 9 y 10 son independientes de todo y pueden hacerse en cualquier momento.

## Paso 0 (opcional) — Bug de la lista blanca

Solo si quieres cerrarlo. SQL + una línea:

```sql
alter table public.intentos drop constraint if exists intentos_modulo_valido;
alter table public.intentos add constraint intentos_modulo_valido
  check (modulo in ('quiz-ats','quiz-fpl','quiz-designadores','quiz-fraseologia',
                    'simulador-metar','simulador-plan-vuelo','simulador-fraseologia',
                    'navegacion-quiz-tiempo-altimetria','navegacion-quiz-radioayudas-viento',
                    'quiz-notam','simulador-nala'));
```

`Panel_estudiante.html:791`: `{ id: null, ... }` → `{ id: 'simulador-nala', ... }`. Seguro porque la línea 991 ya hace `s.id ? stats.porModulo[s.id] : null`.

## Paso 1 — Enlace del alumno a su entrega corregida

Independiente, ~10 líneas, valor inmediato. **No falta nada en el servidor**: la RLS (`supabase-schema.sql:1286`) y `obtener_resultado_plan()` (línea 1419) ya lo permiten.

Lo que falta es el id del resultado en el cliente. En `progreso.js:439`, `obtenerActividadesAsignadas()` selecciona `actividad_id, correctas, total, porcentaje, fecha` — **sin `id`**:

```js
.select('id, actividad_id, correctas, total, porcentaje, fecha')
```

Guardar el `id` del `fecha` más reciente en el acumulador `porActividad` y exponerlo como `ultimoResultadoId`. En `Panel_estudiante.html:1173`, para `plan_vuelo` completada, añadir un botón "Ver mi entrega" a `simulador-plan-vuelo.html?resultado=<id>`.

**Archivos:** `progreso.js`, `Panel_estudiante.html`.

## Paso 2 — Catálogo único de módulos (`modulos.js`)

La lista blanca vive hoy en tres sitios: la constante `MODULOS` de `Panel_estudiante.html:740`, el string que cada quiz pasa a `guardarIntento()`, y el CHECK de SQL. Ya causó tres bugs de guardado silencioso documentados en el propio schema.

**Descartado:** tabla catálogo con FK. Reproduce el mismo fallo (el insert se rechaza por FK en vez de por CHECK) y añade un sitio más que mantener.

El CHECK pasa a validar **formato**, y la lista se valida en cliente donde puede fallar ruidosamente:

```sql
alter table public.intentos drop constraint if exists intentos_modulo_valido;
alter table public.intentos add constraint intentos_modulo_valido
  check (modulo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(modulo) between 3 and 60);
```

Verificar **antes**: `select distinct modulo from public.intentos;` — todos deben cumplir el regex. Si alguno no, parar.

Nuevo `modulos.js`, cargado entre `supabase-config.js` y `progreso.js`:

```js
const MODULOS_CATALOGO = [
  { id:'quiz-ats', nombre:'Servicios de Tránsito Aéreo (ATS)', url:'quiz-ats.html',
    tipo:'quiz', seccion:'modulos', badge:'50 preguntas', temaPorDefecto:'ats' },
  // ...
];
const TEMAS_CATALOGO = [ { id:'notam-formato', nombre:'Formato NOTAM', url:'notam-formato.html' }, ... ];
```

`seccion` debe ser **explícita, no inferida de `tipo`**: hoy `simulador-metar` se pinta en `MODULOS` y los otros simuladores en `SIMULADORES`. Inferirlo rompería el render y, peor, el logro de `Panel_estudiante.html:904` (`MODULOS.every(...)`), que quedaría inalcanzable.

En `Panel_estudiante.html`, sustituir las constantes literales de las líneas 740 y 789 por filtros sobre el catálogo. En `guardarIntento()` (`progreso.js:103`), rechazar y avisar por consola si el id no está en el catálogo, con guarda `typeof MODULOS_CATALOGO !== 'undefined'` para que una página que olvide el `<script>` degrade en vez de romperse.

**Archivos:** `modulos.js` (nuevo), `progreso.js`, `Panel_estudiante.html`, + etiqueta `<script>` en las 12 páginas que ya cargan `progreso.js`.

## Paso 3 — Guardar el detalle de los intentos

**Decisión: columna `detalle jsonb` en `intentos`, no tabla aparte.** Una tabla aparte exige policies nuevas, un segundo insert (con riesgo de media entrega) y una lectura extra por carga. La columna viaja en el mismo insert y la misma migración de invitado. 50 preguntas ≈ 2,5 KB; Postgres lo TOASTea.

```sql
alter table public.intentos add column if not exists detalle jsonb;
alter table public.intentos drop constraint if exists intentos_detalle_objeto;
alter table public.intentos add constraint intentos_detalle_objeto
  check (detalle is null or jsonb_typeof(detalle) = 'object');
```

**No añadir** ningún CHECK que ate la longitud del detalle a `total`: `simulador-metar.html:1578` llama `guardarIntento(..., notaFinal, 100)` con 20 reportes. Ese constraint rompería METAR al instante.

Firma retrocompatible — quinto argumento opcional, los 11 call sites actuales siguen funcionando sin tocarse:

```js
async function guardarIntento(modulo, nombreModulo, correctas, total, detalle)
// detalle = { v:1, preguntas:[ {i:0, ok:true, tema:'notam-formato'}, ... ] }
```

Tres blindajes obligatorios en `progreso.js`, porque este proyecto ya perdió notas tres veces por esta vía:

1. **Reintento sin detalle** si el insert falla. La nota nunca se pierde por culpa del payload nuevo.
2. **Tope de 20 KB** al `JSON.stringify(detalle)`; si se pasa, se descarta el detalle y se registra en consola.
3. **`try/catch` en el `setItem`** de modo invitado (~línea 325): hoy está desnudo, y con `detalle` sube el riesgo de `QuotaExceededError`, que tumbaría `guardarIntento()` entero.

Añadir `detalle` al `map` de `migrarProgresoLocalSiHaceFalta()` (línea 300) y al mapeo de salida de `obtenerIntentos()`.

**Archivos:** `progreso.js`, los 7 `quiz-*.html`, `simulador-metar.html`, `simulador-fraseologia.html`, `simulador-plan-vuelo.html`. Una línea por quiz.

## Paso 4 — Campo `tema` en las preguntas

**El id del tema ES el id de la página teórica**, así el mapeo tema → página es la identidad (`url = tema + '.html'`) y no hay una segunda tabla que desincronizar. Los 20 slugs ya existen y ya están validados por `modulos_completados_pagina_check`.

Cuatro de los siete archivos no necesitan edición manual:

| Archivo | Trabajo | Esfuerzo |
|---|---|---|
| `quiz-fraseologia.html` | **Ya tiene `cat:`** (línea 420+). Solo mapear `'fraseologia-'+cat` | 0 ediciones |
| `quiz-ats.html`, `quiz-fpl.html` | Destino teórico único | 0 ediciones (`temaPorDefecto`) |
| `quiz-designadores.html` | No es banco: genera desde `AERODROMOS` y ya guarda `cat` | 0 ediciones |
| `quiz-notam.html` | 4 valores | 25 líneas |
| `quiz-navegacion-tiempo-altimetria.html` | 3 valores | 25 líneas |
| `quiz-navegacion-radioayudas-viento.html` | 3 valores | 25 líneas |

**Total: 75 líneas en 3 archivos.** Patrón: `{ tema:'notam-formato', q:"...", options:[...], correct:0 }`, con `tema` primero para que la revisión sea legible. Resolución en `modulos.js` con una función `temaDePregunta(moduloId, pregunta)` que cae en cascada: `pregunta.tema` → `cat` de fraseología → `temaPorDefecto` del catálogo.

## Paso 5 — Tarjeta "Qué repasar" + caché de intentos

**Decisión: cálculo en cliente, sin RPC.** Un RPC de agregación añadiría una sexta lectura de red para calcular sobre datos que el panel **ya está descargando**.

Aprovechar para meter un memo de una carga en `progreso.js` — 5 lecturas de `intentos` pasan a 1, sin cambiar ninguna firma pública:

```js
let _intentosCache = null;
async function obtenerIntentos({ refrescar = false } = {}) { ... }
function invalidarCacheIntentos(){ _intentosCache = null; }
```

Nueva `renderQueRepasar(intentos)` en `Panel_estudiante.html`:

1. Filtrar intentos con `detalle.v === 1` de los últimos 90 días.
2. Acumular por tema `{respondidas, fallos}`.
3. Descartar temas con `respondidas < 5` (una pregunta mala no es un tema flojo).
4. Ordenar por tasa de fallo, tomar 3, y solo si el acierto es `< 70 %`.
5. Pintar nombre del tema, "X de Y falladas", enlace a la teoría y enlace de vuelta al quiz.

Estados degradados obligatorios: si ningún intento trae `detalle` (todo el histórico anterior a este cambio), **ocultar la tarjeta**, no mostrarla vacía. Si todos los temas van ≥ 70 %, mensaje positivo sin enlaces.

**No se toca `renderRacha()`, ni `renderLogros()`, ni `LOGROS`.**

## Paso 6 — Comentario y ajuste de nota en exámenes

**Decisión: función nueva + `corregir_plan_vuelo` convertida en envoltorio.** No se renombra ni se migra nada; la firma vieja sobrevive intacta y `profesor.js:863` y `simulador-plan-vuelo.html` no se tocan. El historial ya escrito en `correcciones_resultado` no se altera.

**El examen debe seguir guardando `detalle` como ARRAY** aunque se corrija. La corrección muta los elementos in situ añadiendo `ok_auto` y `corregida`. Si se convirtiera en objeto, se romperían `profesor.js:660` y la estadística por pregunta del panel del profesor.

```sql
create or replace function public.corregir_resultado(
  p_resultado_id uuid,
  p_cambios      jsonb   default '[]'::jsonb,
  p_motivo       text    default null,
  p_correctas    integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$ ... $$;

create or replace function public.corregir_plan_vuelo(
  p_resultado_id uuid, p_cambios jsonb, p_motivo text default null
) returns jsonb language sql security definer set search_path = public as $$
  select public.corregir_resultado(p_resultado_id, p_cambios, p_motivo, null);
$$;
```

Tres modos mutuamente excluyentes, con las mismas guardas de autoría que hoy:

- **`comentario`** — `p_cambios` vacío y `p_correctas` null. Exige `p_motivo`. **No toca `resultados_actividad`.** Es lo que habilita la retroalimentación escrita sin cambiar la nota.
- **`casillas`** — recorre los items, escribe `ok`/`ok_auto`/`corregida`, recuenta. Para plan de vuelo `jsonb_set(detalle,'{casillas}',...)`; para examen `detalle = v_items` (array).
- **`nota`** — ajuste global, valida `0 <= p_correctas <= total`, exige motivo, no toca `detalle`.

`p_cambios` y `p_correctas` juntos → excepción. Recalcular `porcentaje = round(correctas*100.0/total)` para no violar `resultados_actividad_valores_coherentes`. `search_path` fijado en ambas funciones es imprescindible por el `security definer` anidado.

Único cambio en `profesor.js` fuera de lo nuevo — `_tieneCorreccion` (línea 584) hoy devuelve `false` para arrays:

```js
if (Array.isArray(detalle)) return detalle.some(d => d && d.corregida);
```

**Cliente:** `profesor.js` gana `corregirResultado(resultadoId, {cambios, motivo, correctas})`; `panel-profesor.html` gana un botón "Corregir / comentar" en la tabla de resultados para `tipo === 'examen'`, con las preguntas conmutables, textarea de comentario y campo de nota global.

## Paso 7 — El alumno revisa su examen

El alumno **no puede** leer `public.preguntas` (policy `supabase-schema.sql:774`; por diseño, vería la respuesta correcta) y su `detalle` solo trae uuids. Hace falta un RPC:

```sql
create or replace function public.obtener_resultado_examen(p_resultado_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$ ... $$;
```

Devuelve enunciado y opciones uniendo con `preguntas`, pero **`correcta` solo si el usuario es el profesor o la actividad ya está cerrada** (no activa, o vencida, o sin intentos restantes). Es el mismo criterio que ya aplica `obtener_resultado_plan()` con la clave: sin él, la revisión se convierte en la chuleta del siguiente intento.

**Página nueva `revision-actividad.html`, no reutilizar `tomar-actividad.html`.** Ese archivo tiene anticopia activa (`visibilitychange` → `registrarIncidenteActividad()`, y `beforeunload`); en modo revisión dispararía incidentes falsos contra el alumno. ~200 líneas, mismo `<head>` y mismos scripts.

## Paso 8 — Simulador FPL: borrador persistente

Reutilizar el patrón que ya existe en `tomar-actividad.html:228-251` (`guardarBorrador`/`leerBorrador`/`borrarBorrador` con `try/catch`), no inventar otro.

| Modo | ¿Borrador? | Motivo |
|---|---|---|
| `diligenciar`, `decodificar` | Sí | Caso principal |
| `?actividad=` | Sí | Donde más duele perderlo; el formulario solo contiene respuestas del alumno |
| `?crear=` | **No** | Ahí el formulario **es la clave del profesor**; persistirla deja la clave en el disco de un PC posiblemente compartido |
| `?resultado=` | **No** | Solo lectura; guardar aquí contaminaría la entrega |
| `examen`, `error` | **No** | La situación se regenera por ronda; un borrador rehidratado descuadra la partida |

Claves siguiendo la convención existente: `aisFplBorrador_<modo>_<userId|'invitado'>` y `aisFplBorrador_act_<actividadId>_<userId>`.

Contenido `{ v:1, modo, situacion: currentSituation, valores: leerForm(), ts }`. Hay que persistir `currentSituation` porque se genera al azar; sin ella el formulario restaurado no se puede validar.

Reglas: guardar con `input` + debounce 800 ms y en `visibilitychange`; descartar borradores de más de 24 h; **nunca restaurar en silencio** (banner "Encontramos un borrador del <fecha>. ¿Restaurar o empezar de cero?"); borrar en "nuevo ejercicio" y tras entrega exitosa. La bandera `puedeGuardarBorrador()` se evalúa **una sola vez** donde ya se deciden los modos (`simulador-plan-vuelo.html:3366-3372`); eso es lo que impide la contaminación entre modos.

## Paso 9 — Simulador FPL: importar un FPL crudo

`msgFPL(v)` (línea 2649) es el serializador, así que el parser es su inverso exacto — lo que da una prueba trivial: `parseFPL(msgFPL(v)) ≈ v` para cualquier situación generada.

Gramática: quitar paréntesis, unir líneas, partir por `-` a nivel superior → `FPL` (f3), `AVA123` (f7), `IS` (f8r+f8t), `[n]A320/M` (f9), `SDE2E3FGHIRWY/LB1D1` (f10a/f10b), `SKBO1430` (f13), `N0450F350 DCT UPN…` (f15), `SKCL0115 SKPE SKBQ` (f16), resto (f18).

Lo importante es qué hace con lo que no entiende:

- **Nunca lanza.** Devuelve `{ok, valores, noEntendido:[{campo, texto, motivo}]}`.
- Rellena lo que reconoce y **deja intacto** lo que no; no borra campos.
- Muestra un panel con la lista literal de los fragmentos no interpretados. Nada se descarta en silencio.
- Si el formulario ya tiene datos: "Reemplazar todo" / "Solo rellenar vacíos" / "Cancelar".

**Restricción:** el botón solo se habilita en `diligenciar` y `crear`. En `decodificar` la tarea *es* traducir el mensaje crudo al formulario — ahí el importador sería el botón de hacer trampa. Deshabilitado también en `examen`, `error`, `resolver` y `revisar`.

## Paso 10 — Simulador FPL: biblioteca de errores y estadística

`registrarRondaExamen` (línea 3306) ya acumula `examen.detalle = {cas: nFallos}` y `cerrarExamen` (3320) ya lo pinta ordenado… y luego lo tira.

**Persistencia en los dos sitios que ya existen, sin inventar un tercero:**

- **Supabase** — pasar el 5º argumento del Paso 3 desde `cerrarExamen`: `{ v:1, tipoSim:'fpl-examen', casillas:[{cas:'15', fallos:3, revisiones:5}], tiempoSeg }`. Una línea. Sobrevive al cambio de dispositivo.
- **`localStorage aisFplStats`** — camino de invitado, y además permite alimentar la estadística desde **todos** los modos, no solo el examen: `pintarResultado` (línea 2989) ya recibe `blocks` con `b.cas` y `b.ok`.

Al array `FALLOS` (línea 3166, 21 entradas con `cas` y `expl` ya escritas) añadir `id` estable y `ref` normativa. 21 ediciones mecánicas en el mismo archivo.

Panel nuevo **"Errores frecuentes"** junto a las pestañas de modo, con dos vistas:

1. **Catálogo** — los 21 fallos por casilla, con su explicación y un botón **"Practicar este error"** que fuerza ese fallo en la siguiente ronda de "detectar el error". Hoy la inyección es aleatoria; son ~15 líneas y es el mayor salto didáctico del lote.
2. **Mis casillas flojas** — `obtenerIntentosPorModulo('simulador-plan-vuelo')` (ya existe en `progreso.js`) + `aisFplStats`, ordenado por tasa de fallo, enlazando a la explicación y a la sección correspondiente de `plan-de-vuelo.html`.

---

# Verificación

Nada se da por bueno sin comprobarlo en el navegador. Las pruebas locales usan el servidor + shim de funciones Netlify y Chrome por CDP; recordar que el overlay de `auth-gate.js` tapa las capturas.

| Paso | Cómo se verifica |
|---|---|
| 0, 2 | `select distinct modulo from public.intentos;` antes de tocar el CHECK. Consola limpia en las 12 páginas que cargan `progreso.js`. El panel muestra las mismas 8 tarjetas de módulo y 3 de simulador que antes. |
| 1 | Con cuenta de alumno: entregar un plan de vuelo, que el profesor lo corrija, y comprobar que "Ver mi entrega" abre la revisión con el historial de correcciones. |
| 3 | Hacer un quiz con sesión → `select modulo, jsonb_array_length(detalle->'preguntas') from intentos order by fecha desc limit 3;`. Repetir en incógnito, iniciar sesión, comprobar que la fila migrada trae detalle. Forzar un fallo del insert y comprobar que **el reintento guarda la nota igual**. |
| 4, 5 | Fallar a propósito 4 de 5 preguntas de un tema en `quiz-notam.html`, recargar el panel, comprobar que aparece ese tema con enlace a su página teórica. En la pestaña Red, `intentos?select=*` debe pedirse **una sola vez**. |
| 6 | Dos cuentas. Probar los tres modos y revisar `select * from correcciones_resultado order by fecha desc limit 5;` tras cada uno. Comprobar que corregir un plan de vuelo desde `panel-profesor.html:1665` **sigue funcionando sin haber tocado ese archivo**, y que la estadística por pregunta refleja la nota corregida. |
| 7 | Comprobar en Red que la respuesta del RPC **no contiene `correcta`** mientras la actividad sigue abierta, y que sí aparece al cerrarla. Comprobar que `incidentes_actividad` no gana filas al revisar. |
| 8 | Llenar medio formulario, recargar, aceptar el banner. Verificar que en `?crear=` y `?resultado=` **no se escribe ninguna clave** en `localStorage`. |
| 9 | `parseFPL(msgFPL(v))` sobre situaciones generadas de los 6 niveles. Pegar un FPL con basura y comprobar que aparece en "no entendido" en vez de perderse. Comprobar que el botón está deshabilitado en `decodificar` y `examen`. |
| 10 | Completar un examen de 5 rondas, cerrar, recargar y comprobar que "Mis casillas flojas" conserva los datos. "Practicar este error" debe inyectar el fallo elegido. |

**Despliegue:** todo se prueba en local primero. El push a GitHub se hace en **un solo commit atómico por lote**, mostrando antes la lista de archivos y esperando confirmación explícita — el auto-deploy de Netlify está activo, así que un push dispara build de inmediato.
