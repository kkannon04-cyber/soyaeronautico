# GUIA PARA ELABORACIÓN DE LOS REPORTES METAR / SPECI
**CENTRO DE ESTUDIOS AERONÁUTICOS**

*[Descripción de imagen: Portada de la presentación con los logotipos de la Aeronáutica Civil (Unidad Administrativa Especial), el Centro de Estudios Aeronáuticos (CEA) - Institución Universitaria, y el emblema del Gobierno "Colombia Potencia de la Vida". El diseño tiene un fondo naranja con gruesas curvas blancas entrelazadas.]*

---

## PROPÓSITO
Estandarizar la codificación, emisión y transmisión de los informes meteorológicos aeronáuticos METAR y SPECI que se generan en un aeródromo controlado en el territorio colombiano; con el fin de cumplir con los lineamientos aeronáuticos nacionales e internacionales.

## JUSTIFICACIÓN
Enmarcados dentro de los Reglamentos Aeronáuticos de Colombia RAC 203, Manual de claves OMM-N.306, - Manual para la utilización de las claves OMM N.º 782 - Informes y Pronósticos de Aeródromo, el Anexo 3 OACI y con el Reglamento Técnico 049 OMM; se hace necesario que se establezca a nivel nacional los procedimientos técnicos para los reportes METAR y SPECI.

---

## ALCANCE
De acuerdo con el RAC 203 numeral 203.115 las dependencias AIS/AD, en conjunto con las oficinas ATS de torre, son asignadas por la Dirección de Operaciones de Navegación Aérea como **Estaciones Meteorológicas Aeronáuticas** que deben efectuar observaciones ordinarias y especiales.

**Estación Meteorológica Aeronáutica (EMA):** Unidad encargada de la observación y vigilancia de aeródromo, así como de la atención a los usuarios que operan en el mismo (gestor aeroportuario, dependencias TWR/AFIS, tripulaciones, etc.).

Este procedimiento inicia con la recopilación de datos, mediante el análisis de condiciones meteorológicas y finaliza con el suministro de la información a la comunidad aeronáutica nacional e internacional.

*[Descripción de imagen: Ilustración isométrica de un operador o meteorólogo sentado en una silla morada frente a un escritorio blanco. Está operando una computadora con tres monitores que muestran mapas, gráficos meteorológicos y datos atmosféricos.]*

---

## ESTRUCTURA DEL REPORTE
Los informes METAR y SPECI contendrán los siguientes elementos en el orden indicado:

*   Identificación del tipo de informe (METAR/SPECI).
*   Indicador de lugar (Ejemplo: SKBO).
*   Fecha y hora de la observación (seguido del indicador Z).
*   Dirección y velocidad del viento en superficie.
*   Visibilidad.
*   Alcance visual en pista (RVR) cuando proceda.
*   Tiempo presente (Fenómenos).
*   Nubosidad: Cantidad de nubes, altura de la base de las nubes y tipo de nubes (únicamente en el caso de nubes CB o TCU), o la visibilidad vertical (VV).
*   Temperatura del aire y temperatura punto de rocío.
*   Presión QNH.
*   Fenómenos recientes RE (Pasados) cuando proceda.
*   Cizalladura del viento (Wind Shear WS) cuando proceda.
*   Pronostico Tendencia Trend (AD que aplique).
*   RMK.

**Ejemplo:**
`METAR SKBO 102200Z 27010KT 6000 DZ SCT015CB 17/16 Q1023 WS R14L RETSRA NOSIG RMK CB VCSH/E/SW=`

---

## VIENTO
Indica la dirección media del viento en grados así como la velocidad media del viento durante los diez minutos previos a la observación.

*[Descripción de imagen: Captura de pantalla de un sistema de monitoreo meteorológico de aviación (MetConsole AWOS). Muestra las pistas "RWY 35 In Use" y "RWY 17", y una gran rosa de los vientos en el centro indicando dirección variable del viento, con valores de velocidad de 4 a 7 nudos fluctuando, e indicadores de presión de 1011.1 y 29.86]*

*   **VIENTO VARIABLE (VRB):**
    *   Se cifrará como VRB cuando la velocidad del viento sea inferior a 3 nudos (KT).
    *   **Ejemplo:** Se reporta VRB02KT (No cifrar 21002KT).
    *   Se indicará solamente cuando no sea posible notificar una sola dirección media.
    *   **Ejemplo:** VRB05KT (Variable a 5KT).

*   **VARIACIÓN DEL VIENTO (V):** Cuando el viento es igual o superior a 3 KT y la variación total de dirección está entre 60° y menos de 180° se incluirá la letra V con las dos direcciones de variación.
    *   `METAR SKTL 041300Z AUTO 04003KT 350V130 9999 BKN046/// 27/23 Q1010=`

*   En algunos casos si la velocidad del viento es inferior a un nudo (1KT) o si no se puede determinar la dirección del viento, se determina "Calma" y se cifrará como **00000KT**.
*   Si no se pueden determinar ni la dirección ni la velocidad del viento se cifrará **/////KT**.
*   Se reportarán ráfagas cuando la intensidad del viento aumente 10 nudos (KT) o más, e irán separadas las velocidades con la letra G.
    *   **Ejemplo:** `21009G20KT` (Aumentó 11KT), `13005KT G14KT`

---

## VISIBILIDAD
Se utilizará para informar sobre la visibilidad reinante.

*   Cuando la visibilidad horizontal no sea la misma en diferentes direcciones y cuando la visibilidad mínima sea diferente de la visibilidad reinante y menor del 50%, se deberá reportar una segunda visibilidad y su dirección en relación con el punto de referencia del aeródromo indicado por uno de los ocho puntos de la brújula. Si la visibilidad mínima se observa en más de un sector, se representará la dirección más significativa en términos operativos.

**Ejemplos:**
*   `METAR SKXX 280900Z 21009G19KT 190V280 5000 -RA FEW007 BKN014CB BKN070 04/M01 Q1001=`
*   `METAR SKXX 132000Z 29010KT 6000 2000SE TSRA FEW010CB BKN020 15/15 Q1026 NOSIG RMK CB/SE=`
*   `METAR SKXX 102200Z 27010KT 9999 VCSH SCT015CB 17/16 Q1023 NOSIG RMK CB VCSH/E/SW=`
*   `METAR SKXX 291200Z VRB02KT 6000 3000NW BCFG SCT012 10/10 Q1028=`

*[Descripción de imagen: Ilustración de una clásica rosa de los vientos (brújula) en tonos azules y blancos, mostrando los puntos cardinales principales (N, S, E, W) y los intermedios (NW, NE, SW, SE).]*

---

## NUBOSIDAD
Se observa y notifica la nubosidad, el tipo de nubes y la altura de la base de las nubes, según sea necesario, para describir las nubes significativas desde el punto de vista operativo. En circunstancias normales, los grupos de nubes constan de seis caracteres. Los tres primeros indican la cantidad de nubes en octas (octavas partes del cielo cubiertas):

*   1 a 2 octas notificado como **FEW** (nubes escasas).
*   3 a 4 octas notificado como **SCT** (nubes dispersas).
*   5 a 7 octas notificado como **BKN** (nubes fragmentadas).
*   8 octas notificado como **OVC** (cielo cubierto).

Es necesario notificar los tipos de nubes de desarrollo vertical, como Cumulonimbus (**CB**) o Torre Cúmulos (**TCU**), ya que se consideran significativas y deben ser informadas junto con la nubosidad y la base de las nubes. Si la nube se encuentra ubicada en la estación no se direcciona en el RMK.
*   **Ejemplo:** `METAR SKXX 132000Z 29010KT 6000 TSRA FEW010CB BKN015 15/15 Q1026 NOSIG RMK CB/E/SE=`

*   **VISIBILIDAD VERTICAL (VV).** Cuando el cielo esté oscurecido y no sea posible evaluar los detalles de las nubes, pero se disponga de información sobre la visibilidad vertical, el grupo de nubes será reemplazado por un conjunto de cinco caracteres. Los dos primeros serán 'VV', seguidos de la visibilidad vertical en unidades de 30 metros (100 ft), en relación con la base de las nubes.
    *   **Ejemplo:** `VV003` (visibilidad vertical de 300 ft). En caso de que el cielo esté oscurecido y no se pueda evaluar la visibilidad vertical, el grupo se representará como **VV///**.

*[Descripción de imagen: Figura 3D de una persona (gris) usando binoculares mirando hacia arriba, situada en el fondo de un gran cilindro translúcido azul claro que simula la columna de la atmósfera, con tres nubes ubicadas en la parte superior del cilindro.]*

---

## NUBOSIDAD (Gráficos explicativos)

*[Descripción de imagen 1: Dibujo a mano sobre una pizarra digital de un gráfico circular dividido mediante líneas rojas en 8 secciones triangulares que representan las "octas". Están numeradas del 1 al 8. Algunas secciones contienen dibujos de nubes azules, ilustrando cómo se agrupan las nubes en el cielo para la medición.]*

*[Descripción de imagen 2: Se repite la figura 3D de la persona con binoculares mirando hacia las nubes dentro del cilindro atmosférico azul translúcido.]*

**Resumen de medidas:**
*   Few - pocas 1 a 2 octas
*   Sct 3-4 octas
*   Bkn 5-7 octas
*   Ovc 8 octas

---

## NUBOSIDAD, CAVOK Y NSC
La palabra **CAVOK** se incluirá en lugar de los grupos de Visibilidad horizontal, fenómenos de tiempo presente y nubes, cuando en el momento de la observación se den simultáneamente las siguientes condiciones:
*   La visibilidad de 10 km o más.
*   Ninguna nube por debajo de 1500m (5000ft) o por debajo de la altitud mínima de sector más alta, de estas dos la que sea mayor, y no haya presencia de TCU o CB.
*   Ningún fenómeno de tiempo significativo presente.

Se comunicarán la nubosidad, el tipo de nubes y la altura de la base de las nubes para describir únicamente las nubes de importancia operativa, es decir, las nubes cuya altura de base se encuentre por debajo de 5000ft o por debajo de la MSA si éste es mayor, o los CB/TCU a cualquier altitud.

Si la abreviatura CAVOK no es apropiada, se utilizará la abreviatura **NSC**.

---

## FENÓMENOS PRESENTES - TIEMPO SIGNIFICATIVO
Pueden ir hasta 3 grupos de fenómenos, se construirán considerando consecutivamente de la intensidad, seguida de la descripción, seguida de los fenómenos meteorológicos.
*   **Ejemplo:** `+TSRA` (Tormenta con lluvia fuerte).

*   La forma más significativa de precipitación se enumera primero. **Ejemplo:** GSRA es más granizo que lluvia, RAGS es más lluvia que granizo.
*   La intensidad y si hay chubascos SH, solo se usa en combinación con el tipo de precipitación lluvia RA. **Por ejemplo:** `+SHRA`, `SHDZ`
*   Si no se menciona el signo de la intensidad, es porque el calificador del fenómeno es moderado (sin calificador). **Por ejemplo:** `DZ`.
*   Los descriptores MI, BC y PR solo se utilizan en la niebla para determinar que se presenta niebla baja, cobertura parcial por niebla o presencia de bancos de niebla en el aeródromo, respectivamente. `BR` NEBLINA - MIST.

*   Las diferencias de identificación de los fenómenos presentes son los siguientes:
    *   **Lluvia RA o llovizna DZ:** Por el grosor o diámetro de la gota.
    *   **Niebla FG o neblina BR:** la niebla tiene una visibilidad menor a 1000 metros.
    *   **Neblina BR o calima HZ:** el color del fenómeno, la humedad relativa y la influencia del entorno.
    *   **Granizo GR o granizo pequeño GS:** con granizo los granos son mayores de 5mm.

*[Descripción de imagen: Ilustración de un observador con binoculares de pie sobre el suelo, rodeado por un gran círculo azul sólido que representa un radio de observación del aeródromo. En la parte inferior está etiquetado con la distancia de "8km".]*

---

## FENÓMENOS DE OSCURECIMIENTO
Cuando la visibilidad reinante este reducida en 6000m o 7000m por presencia de humo, calima, polvo, arena o neblina (**FU, HZ, DU, SA y BR**), este se dará a conocer en la sección RMK. De este caso se excluyen las precipitaciones.
*   **Ejemplos:**
    *   `METAR SKXX 111200Z VRB02KT 6000 SCT008 SCT080 19/18 Q1016 RMK BR=`
    *   `METAR SKXX 111300Z 14003KT 7000 FEW017 BKN200 27/23 Q1009 RMK HZ=`

Cuando el fenómeno de oscurecimiento este reduciendo la visibilidad a 5000m o menos, se debe codificar en TIEMPO PRESENTE y no en el RMK.
*   **Ejemplos:**
    *   `METAR SKXX 111200Z VRB02KT 3000 BR SCT008 SCT080 19/19 Q1016=`
    *   `METAR SKXX 111400Z VRB02KT 5000 HZ SCT008 SCT080 23/19 Q1016=`

*[Descripción de imagen: Brújula circular en tonos grises oscuros, señalando los puntos cardinales. En la parte inferior de la brújula hay un texto en arco que dice "METEOROLOGÍA AERONÁUTICA AEROCIVIL".]*

---

## FENÓMENOS PROXIMIDADES O VECINDADES (VC)
El calificador **VC** se utilizará para indicar los siguientes fenómenos meteorológicos significativos observados en las proximidades del aeródromo: **TS, FG, SH y VA**.

Se reportarán en TIEMPO PRESENTE y en el RMK con máximo dos (2) direcciones hacia donde se encuentren los fenómenos meteorológicos ubicados en las proximidades del aeródromo. En caso de que la presencia de estos fenómenos abarque más de dos direcciones, se reportarán las dos más significativas desde el punto de vista operativo.
*   **Ejemplo:** `METAR SKXX 102200Z 29008KT 9999 VCSH SCT017 BKN070 17/15 Q1023 NOSIG RMK VCSH/NE/NW=`
*   *Otros ejemplos para RMK:* `RMK VCSH/N ... RMK VCFG/SW... RMK CB VCTS/SE/S... RMK CB/N VCSH/SE/S...`

**Nota:** Tales fenómenos meteorológicos deben indicarse con el calificador VC solamente cuando se observen a una distancia de entre **8km y hasta 16 km** aproximadamente desde el punto de referencia del aeródromo. Es decir, con visibilidad de 8000m o más.

*[Descripción de imagen: Diagrama de anillos concéntricos. El anillo interior de fondo blanco tiene un límite en los 8km. El anillo exterior de fondo azul claro se extiende desde los 8km hasta los 16km. Fuera del gráfico están escritas las siglas: VCSH, VCTS, VCFG, VCVA, indicando que estos reportes aplican en la franja azul (entre 8 y 16km).]*

---

## FENÓMENOS PROXIMIDADES O VECINDADES (VC) (Continuación)
**Nota:** Para el caso de las precipitaciones se reportará:
*   Cuando las precipitaciones ocurran dentro del perímetro de los **8 km** de radio desde el punto de referencia del aeródromo, se reportará con su respectiva tipología e intensidad. Si no se puede identificar la tipología de la precipitación, se reportará lluvia (RA).
*   Cuando las precipitaciones se presentan en el intervalo comprendido entre **8 km hasta 16 km**, se codificarán utilizando el código **VCSH**, dando a entender que es cualquier tipo de precipitación ubicada en dicho intervalo.

*[Descripción de imagen: Diagrama similar de anillos concéntricos. En el círculo blanco central (0 a 8km) hay una figura de un observador con binoculares junto al texto "DZ - RA - SHRA", indicando los fenómenos que se reportan si caen en esa zona. En el anillo exterior azul (8km a 16km) está escrito el texto "VCSH".]*

---

## TORMENTAS
En lo que respecta a las tormentas eléctricas, su codificación estará sujeta a la ubicación de la nube cumulonimbos (**CB**) que la genere.
*   Si dicha nube está ubicada en el perímetro de **8 km** de radio desde el punto de referencia del aeródromo y se detectan truenos o descargas eléctricas, entonces se debe reportar **TS**.
*   Si por defecto, la nube se encuentra ubicada entre los **8 km y los 16 km** y se detectan truenos o descargas eléctricas, se codificará **VCTS**.

Se codificarán las nubes cumulonimbos (**CB**) hasta una distancia de **16 km** respecto a la referencia del aeródromo.

**NOTA:** Todo reporte con fenómeno de TORMENTA (TS - TSRA - VCTS) debe ir codificado en una capa de nubosidad baja (únicamente) que incluya la nube convectiva CB. Se prioriza codificar la nube CB que TCU, en caso de presentarse ambas.
*   **Ejemplo:** `METAR SKXX 101800Z 32012KT 5000 TSRA SCT015CB BKN020 14/14 Q1022 NOSIG RMK CB /NE=`

*[Descripción de imagen: Diagrama de anillos concéntricos. En el círculo azul central (0 a 8km) aparece el observador, un dibujo de una nube cumulonimbus "CB" y las siglas "TS", junto con la imagen de un avión volando cerca de un rayo (tormenta). En el anillo blanco exterior (8 a 16km) hay otro dibujo de una nube cumulonimbus "CB" y las siglas "VCTS".]*

---

## NIEBLA - NEBLINA - BANCOS DE NIEBLA
*   **FG**. Se reporta cuando la visibilidad reinante (general) este reducida en menos de 1000m.
*   **BR**. Se reporta cuando la visibilidad este reducida entre 1000m hasta 5000m en tiempo presente. Con visibilidad de 6000m o 7000m en el RMK.
    *   **Ejemplos:**
        *   `METAR SKXX 291200Z VRB02KT 2000 BR SCT012 10/10 Q1028=`
        *   `METAR SKXX 291200Z VRB02KT 6000 SCT012 10/10 Q1028 RMK BR=`
*   **PRFG**. Cuando se presente reducción significativa en un sector y se deban reportar dos visibilidades, una reinante y una sectorizada, ya que la niebla cubre parcialmente el aeródromo, es decir cuando el banco de niebla esté tocando pista.
    *   **Ejemplo:** `METAR SKXX 291200Z VRB02KT 8000 1000NW PRFG SCT012 10/10 Q1028=`
*   **BCFG**. Cuando los bancos de niebla se presenten de forma general o sectorizada, se reportará en tiempo presente con visibilidad de más de 2000m, es decir, cuando el BCFG no este tocando pista, dependiendo el aeródromo (distancia de la pista).
    *   **Ejemplos:**
        *   `METAR SKXX 291200Z VRB02KT 3000 BCFG SCT012 10/10 Q1028=`
        *   `METAR SKXX 291200Z VRB02KT 6000 3000NW BCFG SCT012 10/10 Q1028=`
        *   `METAR SKXX 291200Z 36003KT 9999 BCFG BKN008 11/11 Q1028 RMK 6000SE=`
        *   `METAR SKXX 291200Z 36003KT 6000 BCFG BKN008 11/11 Q1028 =`
*   **MIFG**. Se reporta cuando se presenta niebla baja alrededor del aeródromo y esta no reduce significativamente la visibilidad.
    *   **Ejemplo:** `METAR SKXX 291200Z 36003KT 9000 MIFG SCT020 11/11 Q1028=`

---

## NIEBLA - NEBLINA - BANCOS DE NIEBLA (Esquema Visual)

*[Descripción de imagen: Diagrama que ilustra un perfil de las inmediaciones de una pista de aterrizaje (cabeceras marcadas con 12 y 23) y un "Punto de Observación" (cámara o estación). Muestra visualmente la distribución de los fenómenos de reducción de visibilidad horizontal según la distancia: "FG" directamente sobre la pista e instrumentos; "MIFG" como pequeñas nubes bajas flotando sobre la pista; "PRFG" tocando una zona sectorizada de la pista y cruzando la barrera aproximada de los 2000m; "BR" como una nube neblinosa general y "BCFG" como bancos definidos de nubes a mediana distancia; finalmente, "VCFG" representada por bancos de niebla ubicados después de la línea punteada que demarca el perímetro de los 8000m.]*

---

## RMK
*   Para indicar la dirección hacia la que se observan las nubes significativas **CB y TCU**, se reportarán como máximo 2 direcciones.
    *   **Ejemplo:** `METAR SKXX 102200Z 27010KT 9999 FEW020TCU 17/11 Q1023 NOSIG RMK TCU/E=`
*   Para indicar la visibilidad y dirección de los bancos de niebla **BCFG**, cuando estén ubicados entre más de 5000 metros y menos de 8000 metros respecto a la referencia del aeródromo.
    *   **Ejemplo:** `METAR SKXX 291200Z 36003KT 9999 BCFG BKN008 11/11 Q1028 NOSIG RMK 6000SE=`
*   Para indicar la dirección hacia la cual se observan los fenómenos ubicados en las proximidades del aeródromo. Se reportarán como máximo 2 direcciones hacia donde se encuentren los fenómenos meteorológicos.
*   Para indicar la presencia de fenómenos de oscurecimiento (**FU, HZ, DU, SA y BR**) que reduzcan la visibilidad entre 6000m y 7000 metros.
*   Cuando dos elementos estén ubicados hacia las mismas direcciones, estos se separarán con un espacio entre sí y luego se colocarán las respectivas barras sin espacios para indicar las direcciones.
    *   **Ejemplo:** `METAR SKXX 291200Z 36003KT 8000 VCSH SCT020TCU 11/11 Q1028 NOSIG RMK TCU VCSH/E=`

---
*[Descripción de imagen: Diapositiva final de cierre con los logotipos de la Aeronáutica Civil (Unidad Administrativa Especial), el Centro de Estudios Aeronáuticos (CEA) y el escudo de armas nacional para el eslogan del Gobierno de Colombia ("Colombia Potencia de la Vida").]*
