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

---

## Regla importante

Si una solicitud puede realizarse modificando un único archivo, no modificar varios archivos innecesariamente.

Antes de realizar cambios importantes, explicar brevemente qué archivos serán modificados y por qué.

Nunca eliminar una funcionalidad existente para implementar una nueva.
