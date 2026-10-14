// ============================================================
// CÓDIGO NOTAM — tabla de significados (OACI Doc 8400, "El código NOTAM
// - Descifrado"). ARCHIVO GENERADO desde
// documentos md/NOTAM/codigo_notam_doc_8400_65_83.md: no editar a mano.
//
// 179 asuntos (2.ª y 3.ª letras) y 78 condiciones (4.ª y 5.ª letras).
// Casos especiales del propio Doc 8400 (párrafos 3.3 a 3.5): XX como
// asunto o condición no listados, KKKK para la lista de verificación y
// TT como condición del NOTAM iniciador (trigger NOTAM).
// ============================================================
const NOTAM_CODIGOS = {
  fuente: 'OACI Doc 8400, El código NOTAM',
  asuntos: [
  {
    "grupo": "AGA - Instalaciones de iluminación (L)",
    "codigos": [
      {
        "c": "LA",
        "s": "Sistema de iluminación de aproximación (especificar pista y tipo)"
      },
      {
        "c": "LB",
        "s": "Faro de aeródromo"
      },
      {
        "c": "LC",
        "s": "Luces de eje de pista (especificar pista)"
      },
      {
        "c": "LD",
        "s": "Luces indicadoras de la dirección del aterrizaje"
      },
      {
        "c": "LE",
        "s": "Luces de borde de pista (especificar pista)"
      },
      {
        "c": "LF",
        "s": "Luces de destellos en orden consecutivo (especificar pista)"
      },
      {
        "c": "LG",
        "s": "Iluminación controlada por el piloto"
      },
      {
        "c": "LH",
        "s": "Luces de pista de alta intensidad (especificar pista)"
      },
      {
        "c": "LI",
        "s": "Luces identificadoras de extremo de pista (especificar pista)"
      },
      {
        "c": "LJ",
        "s": "Luces indicadoras de alineación con la pista (especificar pista)"
      },
      {
        "c": "LK",
        "s": "Componentes de la Categoría II del sistema de iluminación de aproximación (especificar pista)"
      },
      {
        "c": "LL",
        "s": "Luces de pista de baja intensidad (especificar pista)"
      },
      {
        "c": "LM",
        "s": "Luces de pista de intensidad mediana (especificar pista)"
      },
      {
        "c": "LP",
        "s": "Indicador de trayectoria de aproximación de precisión (especificar pista)"
      },
      {
        "c": "LR",
        "s": "Todas las instalaciones de iluminación del área de aterrizaje"
      },
      {
        "c": "LS",
        "s": "Luces de zona de parada (especificar pista)"
      },
      {
        "c": "LT",
        "s": "Luces de umbral (especificar pista)"
      },
      {
        "c": "LU",
        "s": "Indicador de trayectoria de aproximación de helicóptero"
      },
      {
        "c": "LV",
        "s": "Sistema visual indicador de pendiente de aproximación (especificar tipo y pista)"
      },
      {
        "c": "LW",
        "s": "Iluminación de helipuerto"
      },
      {
        "c": "LX",
        "s": "Luces de eje de calle de rodaje (especificar calle de rodaje)"
      },
      {
        "c": "LY",
        "s": "Luces de borde de calle de rodaje (especificar calle de rodaje)"
      },
      {
        "c": "LZ",
        "s": "Luces de zona de toma de contacto de la pista (especificar pista)"
      }
    ]
  },
  {
    "grupo": "AGA - Área de movimiento y aterrizaje (M)",
    "codigos": [
      {
        "c": "MA",
        "s": "Área de movimiento"
      },
      {
        "c": "MB",
        "s": "Carga admisible (especificar parte del área de aterrizaje o del área de movimiento)"
      },
      {
        "c": "MC",
        "s": "Zona libre de obstáculos (especificar pista)"
      },
      {
        "c": "MD",
        "s": "Distancias declaradas (especificar pista)"
      },
      {
        "c": "MG",
        "s": "Sistema de guía de rodaje"
      },
      {
        "c": "MH",
        "s": "Dispositivo de parada en la pista (especificar pista)"
      },
      {
        "c": "MK",
        "s": "Zona de estacionamiento"
      },
      {
        "c": "MM",
        "s": "Balizaje diurno (especificar umbral, eje, etc.)"
      },
      {
        "c": "MN",
        "s": "Plataforma"
      },
      {
        "c": "MO",
        "s": "Barra de parada (especificar calle de rodaje)"
      },
      {
        "c": "MP",
        "s": "Puestos de estacionamiento de aeronave (especificar)"
      },
      {
        "c": "MR",
        "s": "Pista (especificar pista)"
      },
      {
        "c": "MS",
        "s": "Zona de parada (especificar pista)"
      },
      {
        "c": "MT",
        "s": "Umbral (especificar pista)"
      },
      {
        "c": "MU",
        "s": "Apartadero de viraje de pista (especificar pista)"
      },
      {
        "c": "MW",
        "s": "Franja/margen (especificar pista)"
      },
      {
        "c": "MX",
        "s": "Calle o calles de rodaje (especificar)"
      },
      {
        "c": "MY",
        "s": "Calle de rodaje de salida rápida (especificar)"
      }
    ]
  },
  {
    "grupo": "AGA - Instalaciones y servicios (F)",
    "codigos": [
      {
        "c": "FA",
        "s": "Aeródromo"
      },
      {
        "c": "FB",
        "s": "Dispositivo de medición del rozamiento (especificar tipo)"
      },
      {
        "c": "FC",
        "s": "Equipo de medición de techo"
      },
      {
        "c": "FD",
        "s": "Sistema de atraque (especificar AGNIS, BOLDS, etc.)"
      },
      {
        "c": "FE",
        "s": "Oxígeno (especificar tipo)"
      },
      {
        "c": "FF",
        "s": "Extinción de incendio y salvamento"
      },
      {
        "c": "FG",
        "s": "Control de movimiento en tierra"
      },
      {
        "c": "FH",
        "s": "Zona/plataforma de aterrizaje de helicóptero"
      },
      {
        "c": "FI",
        "s": "Desengelamiento de aeronave (especificar)"
      },
      {
        "c": "FJ",
        "s": "Aceites (especificar tipo)"
      },
      {
        "c": "FL",
        "s": "Indicador de la dirección de aterrizaje"
      },
      {
        "c": "FM",
        "s": "Servicio meteorológico (especificar tipo)"
      },
      {
        "c": "FO",
        "s": "Equipo de dispersión de niebla"
      },
      {
        "c": "FP",
        "s": "Helipuerto"
      },
      {
        "c": "FS",
        "s": "Equipo de remoción de la nieve"
      },
      {
        "c": "FT",
        "s": "Transmisómetro (especificar pista y, cuando corresponda, indicativo o indicativos de los transmisómetros)"
      },
      {
        "c": "FU",
        "s": "Disponibilidad de combustible"
      },
      {
        "c": "FW",
        "s": "Indicador de la dirección del viento"
      },
      {
        "c": "FZ",
        "s": "Aduana/inmigración"
      }
    ]
  },
  {
    "grupo": "ATM - Gestión del espacio aéreo (A)",
    "codigos": [
      {
        "c": "AA",
        "s": "Altitud mínima (especificar en ruta/en la vertical/segura)"
      },
      {
        "c": "AC",
        "s": "Zona de control"
      },
      {
        "c": "AD",
        "s": "Zona de identificación de defensa aérea"
      },
      {
        "c": "AE",
        "s": "Área de control"
      },
      {
        "c": "AF",
        "s": "Región de información de vuelo"
      },
      {
        "c": "AH",
        "s": "Área superior de control"
      },
      {
        "c": "AL",
        "s": "Nivel de vuelo mínimo utilizable"
      },
      {
        "c": "AN",
        "s": "Ruta de navegación de área"
      },
      {
        "c": "AO",
        "s": "Área oceánica de control"
      },
      {
        "c": "AP",
        "s": "Punto de notificación (especificar nombre o designador cifrado)"
      },
      {
        "c": "AR",
        "s": "Ruta ATS (especificar)"
      },
      {
        "c": "AT",
        "s": "Área de control terminal"
      },
      {
        "c": "AU",
        "s": "Región superior de información de vuelo"
      },
      {
        "c": "AV",
        "s": "Área superior con servicio de asesoramiento"
      },
      {
        "c": "AX",
        "s": "Punto significativo"
      },
      {
        "c": "AZ",
        "s": "Zona de tránsito de aeródromo"
      }
    ]
  },
  {
    "grupo": "ATM - Servicios de tránsito aéreo y VOLMET (S)",
    "codigos": [
      {
        "c": "SA",
        "s": "Servicio automático de información terminal"
      },
      {
        "c": "SB",
        "s": "Oficina de notificación ATS"
      },
      {
        "c": "SC",
        "s": "Centro de control de área"
      },
      {
        "c": "SE",
        "s": "Servicio de información de vuelo"
      },
      {
        "c": "SF",
        "s": "Servicio de información de vuelo de aeródromo"
      },
      {
        "c": "SL",
        "s": "Centro de control de afluencia"
      },
      {
        "c": "SO",
        "s": "Centro de control de área oceánica"
      },
      {
        "c": "SP",
        "s": "Servicio de control de aproximación"
      },
      {
        "c": "SS",
        "s": "Estación de servicio de vuelo"
      },
      {
        "c": "ST",
        "s": "Torre de control de aeródromo"
      },
      {
        "c": "SU",
        "s": "Centro de control de área superior"
      },
      {
        "c": "SV",
        "s": "Radiodifusión VOLMET"
      },
      {
        "c": "SY",
        "s": "Servicio de asesoramiento de área superior (especificar)"
      }
    ]
  },
  {
    "grupo": "ATM - Procedimientos de tránsito aéreo (P)",
    "codigos": [
      {
        "c": "PA",
        "s": "Llegada normalizada por instrumentos (especificar designador de ruta)"
      },
      {
        "c": "PB",
        "s": "Llegada normalizada VFR"
      },
      {
        "c": "PC",
        "s": "Procedimientos de contingencia"
      },
      {
        "c": "PD",
        "s": "Salida normalizada por instrumentos (especificar designador de ruta)"
      },
      {
        "c": "PE",
        "s": "Salida normalizada VFR"
      },
      {
        "c": "PF",
        "s": "Procedimiento de control de afluencia"
      },
      {
        "c": "PH",
        "s": "Procedimiento de espera"
      },
      {
        "c": "PI",
        "s": "Procedimiento de aproximación por instrumentos (especificar tipo y pista)"
      },
      {
        "c": "PK",
        "s": "Procedimiento de aproximación VFR"
      },
      {
        "c": "PL",
        "s": "Procesamiento y presentación del plan de vuelo y contingencias conexas"
      },
      {
        "c": "PM",
        "s": "Mínimo de utilización de aeródromo (especificar procedimiento y mínimo enmendado)"
      },
      {
        "c": "PN",
        "s": "Restricciones de operación por ruido"
      },
      {
        "c": "PO",
        "s": "Altitud y altura de franqueamiento de obstáculos (especificar procedimiento)"
      },
      {
        "c": "PR",
        "s": "Procedimiento de falla de radio"
      },
      {
        "c": "PT",
        "s": "Altitud de transición o nivel de transición (especificar)"
      },
      {
        "c": "PU",
        "s": "Procedimiento de aproximación frustrada (especificar pista)"
      },
      {
        "c": "PX",
        "s": "Altitud mínima de espera (especificar punto de referencia)"
      },
      {
        "c": "PZ",
        "s": "Procedimiento ADIZ"
      }
    ]
  },
  {
    "grupo": "Avisos para la navegación - Restricciones del espacio aéreo (R)",
    "codigos": [
      {
        "c": "RA",
        "s": "Reserva de espacio aéreo (especificar)"
      },
      {
        "c": "RD",
        "s": "Zona peligrosa (especificar)"
      },
      {
        "c": "RM",
        "s": "Área de operaciones militares"
      },
      {
        "c": "RO",
        "s": "Sobrevuelo de... (especificar)"
      },
      {
        "c": "RP",
        "s": "Zona prohibida (especificar)"
      },
      {
        "c": "RR",
        "s": "Zona restringida (especificar)"
      },
      {
        "c": "RT",
        "s": "Zona restringida temporalmente (especificar zona)"
      }
    ]
  },
  {
    "grupo": "Avisos para la navegación - Avisos (W)",
    "codigos": [
      {
        "c": "WA",
        "s": "Exposición aérea"
      },
      {
        "c": "WB",
        "s": "Vuelos acrobáticos"
      },
      {
        "c": "WC",
        "s": "Globo cautivo o cometa"
      },
      {
        "c": "WD",
        "s": "Demolición de explosivos"
      },
      {
        "c": "WE",
        "s": "Ejercicios (especificar)"
      },
      {
        "c": "WF",
        "s": "Reabastecimiento aéreo"
      },
      {
        "c": "WG",
        "s": "Vuelo de planeadores"
      },
      {
        "c": "WH",
        "s": "Detonaciones"
      },
      {
        "c": "WJ",
        "s": "Remolque de banderolas/blancos"
      },
      {
        "c": "WL",
        "s": "Ascenso de globo libre"
      },
      {
        "c": "WM",
        "s": "Disparo de proyectiles, ejercicios de tiro o lanzamiento de cohetes"
      },
      {
        "c": "WP",
        "s": "Ejercicio de lanzamiento en paracaídas o parapente"
      },
      {
        "c": "WR",
        "s": "Materiales radiactivos o sustancias químicas tóxicas (especificar)"
      },
      {
        "c": "WS",
        "s": "Incendio o escape de gases"
      },
      {
        "c": "WT",
        "s": "Movimiento masivo de aeronaves"
      },
      {
        "c": "WU",
        "s": "Aeronaves no tripuladas"
      },
      {
        "c": "WV",
        "s": "Vuelo en formación"
      },
      {
        "c": "WW",
        "s": "Actividad volcánica importante"
      },
      {
        "c": "WY",
        "s": "Exploración aérea"
      },
      {
        "c": "WZ",
        "s": "Vuelo de modelos"
      }
    ]
  },
  {
    "grupo": "CNS - Instalaciones de comunicaciones y vigilancia (C)",
    "codigos": [
      {
        "c": "CA",
        "s": "Instalaciones aeroterrestres (especificar servicio y frecuencia)"
      },
      {
        "c": "CB",
        "s": "Vigilancia dependiente automática radiodifusión (detalles)"
      },
      {
        "c": "CC",
        "s": "Vigilancia dependiente automática contrato (detalles)"
      },
      {
        "c": "CD",
        "s": "Comunicaciones por enlace de datos controlador-piloto (detalles)"
      },
      {
        "c": "CE",
        "s": "Radar de vigilancia en ruta"
      },
      {
        "c": "CG",
        "s": "Sistema de aproximación dirigida desde tierra"
      },
      {
        "c": "CL",
        "s": "Sistema selectivo de llamada"
      },
      {
        "c": "CM",
        "s": "Radar de movimiento en la superficie"
      },
      {
        "c": "CP",
        "s": "Radar de aproximación de precisión (especificar pista)"
      },
      {
        "c": "CR",
        "s": "Elemento radar de vigilancia del sistema radar de aproximación de precisión (especificar longitud de onda)"
      },
      {
        "c": "CS",
        "s": "Radar secundario de vigilancia"
      },
      {
        "c": "CT",
        "s": "Radar de vigilancia de área terminal"
      }
    ]
  },
  {
    "grupo": "CNS - Operaciones GNSS (G)",
    "codigos": [
      {
        "c": "GA",
        "s": "Operaciones GNSS específicas del aeródromo (especificar operación)"
      },
      {
        "c": "GW",
        "s": "Operaciones GNSS de la zona en general (especificar operación)"
      }
    ]
  },
  {
    "grupo": "CNS - Sistemas de aterrizaje por instrumentos y microondas (I)",
    "codigos": [
      {
        "c": "IC",
        "s": "Sistema de aterrizaje por instrumentos (especificar pista)"
      },
      {
        "c": "ID",
        "s": "DME correspondiente al ILS"
      },
      {
        "c": "IG",
        "s": "Trayectoria de planeo (ILS) (especificar pista)"
      },
      {
        "c": "II",
        "s": "Radiobaliza interior (ILS) (especificar pista)"
      },
      {
        "c": "IL",
        "s": "Localizador (ILS) (especificar pista)"
      },
      {
        "c": "IM",
        "s": "Radiobaliza intermedia (ILS) (especificar pista)"
      },
      {
        "c": "IN",
        "s": "Localizador (no asociado con un ILS)"
      },
      {
        "c": "IO",
        "s": "Radiobaliza exterior (ILS) (especificar pista)"
      },
      {
        "c": "IS",
        "s": "ILS Categoría I (especificar pista)"
      },
      {
        "c": "IT",
        "s": "ILS Categoría II (especificar pista)"
      },
      {
        "c": "IU",
        "s": "ILS Categoría III (especificar pista)"
      },
      {
        "c": "IW",
        "s": "Sistema de aterrizaje por microondas (especificar pista)"
      },
      {
        "c": "IX",
        "s": "Radiofaro de localización exterior (ILS) (especificar pista)"
      },
      {
        "c": "IY",
        "s": "Radiofaro de localización intermedio (ILS) (especificar pista)"
      }
    ]
  },
  {
    "grupo": "CNS - Instalaciones y servicios de terminal y de navegación en ruta (N)",
    "codigos": [
      {
        "c": "NA",
        "s": "Todas las instalaciones de radionavegación (excepto...)"
      },
      {
        "c": "NB",
        "s": "Radiofaro no direccional"
      },
      {
        "c": "NC",
        "s": "DECCA"
      },
      {
        "c": "ND",
        "s": "Equipo radiotelemétrico"
      },
      {
        "c": "NF",
        "s": "Radiobaliza tipo de abanico"
      },
      {
        "c": "NL",
        "s": "Radiofaro de localización (especificar identificación)"
      },
      {
        "c": "NM",
        "s": "VOR/DME"
      },
      {
        "c": "NN",
        "s": "TACAN"
      },
      {
        "c": "NO",
        "s": "OMEGA"
      },
      {
        "c": "NT",
        "s": "VORTAC"
      },
      {
        "c": "NV",
        "s": "VOR"
      },
      {
        "c": "NX",
        "s": "Estación radiogoniométrica (especificar tipo y frecuencia)"
      }
    ]
  },
  {
    "grupo": "Otras informaciones (O)",
    "codigos": [
      {
        "c": "OA",
        "s": "Servicio de información aeronáutica"
      },
      {
        "c": "OB",
        "s": "Obstáculos (especificar detalles)"
      },
      {
        "c": "OE",
        "s": "Requisitos para la entrada de aeronaves"
      },
      {
        "c": "OL",
        "s": "Luces de obstáculos en... (especificar)"
      },
      {
        "c": "OR",
        "s": "Centro de coordinación de salvamento"
      }
    ]
  }
],
  condiciones: [
  {
    "grupo": "Disponibilidad (A)",
    "codigos": [
      {
        "c": "AC",
        "s": "Retirado para mantenimiento"
      },
      {
        "c": "AD",
        "s": "Disponible para operaciones diurnas"
      },
      {
        "c": "AF",
        "s": "Comprobado en vuelo y considerado digno de confianza"
      },
      {
        "c": "AG",
        "s": "Utilizable, pero se ha comprobado solamente en tierra, se espera comprobación en vuelo"
      },
      {
        "c": "AH",
        "s": "Las horas de servicio son ahora de... a... (especificar)"
      },
      {
        "c": "AK",
        "s": "Reanudada la operación normal"
      },
      {
        "c": "AL",
        "s": "Funcionando (o de nuevo funcionando) a reserva de limitaciones/ condiciones anteriormente publicadas"
      },
      {
        "c": "AM",
        "s": "Únicamente operaciones militares"
      },
      {
        "c": "AN",
        "s": "Disponible para operaciones nocturnas"
      },
      {
        "c": "AO",
        "s": "Operacional"
      },
      {
        "c": "AP",
        "s": "Disponible, se necesita un permiso previo"
      },
      {
        "c": "AR",
        "s": "Disponible a solicitud"
      },
      {
        "c": "AS",
        "s": "No utilizable"
      },
      {
        "c": "AU",
        "s": "No está disponible (especificar razones, si corresponde)"
      },
      {
        "c": "AW",
        "s": "Totalmente retirado"
      },
      {
        "c": "AX",
        "s": "Se ha cancelado el cierre previamente anunciado"
      }
    ]
  },
  {
    "grupo": "Cambios (C)",
    "codigos": [
      {
        "c": "CA",
        "s": "En actividad"
      },
      {
        "c": "CC",
        "s": "Completado"
      },
      {
        "c": "CD",
        "s": "Cese de actividades"
      },
      {
        "c": "CE",
        "s": "Montado"
      },
      {
        "c": "CF",
        "s": "La o las frecuencias de utilización han sido cambiadas a"
      },
      {
        "c": "CG",
        "s": "Se redujo a"
      },
      {
        "c": "CH",
        "s": "Cambiado"
      },
      {
        "c": "CI",
        "s": "Identificación o distintivo de llamada de radio cambiadas a"
      },
      {
        "c": "CL",
        "s": "Realineado"
      },
      {
        "c": "CM",
        "s": "Desplazado"
      },
      {
        "c": "CN",
        "s": "Cancelado"
      },
      {
        "c": "CO",
        "s": "En funcionamiento"
      },
      {
        "c": "CP",
        "s": "Funciona a potencia reducida"
      },
      {
        "c": "CR",
        "s": "Remplazado temporalmente por"
      },
      {
        "c": "CS",
        "s": "Instalado"
      },
      {
        "c": "CT",
        "s": "En prueba, no utilizar"
      }
    ]
  },
  {
    "grupo": "Condiciones de peligro (H)",
    "codigos": [
      {
        "c": "HA",
        "s": "La eficacia del frenado es... 1) deficiente, 2) mediana/deficiente, 3) mediana, 4) mediana/buena, 5) buena"
      },
      {
        "c": "HB",
        "s": "El coeficiente de rozamiento es... (especificar el dispositivo del rozamiento utilizado)"
      },
      {
        "c": "HC",
        "s": "Cubierta por una capa de nieve compacta de un espesor de"
      },
      {
        "c": "HD",
        "s": "Cubierta de nieve seca de un espesor de"
      },
      {
        "c": "HE",
        "s": "Cubierta de agua de... profundidad"
      },
      {
        "c": "HF",
        "s": "Completamente libre de nieve y hielo"
      },
      {
        "c": "HG",
        "s": "Se está cortando el césped"
      },
      {
        "c": "HH",
        "s": "Peligro debido a (especificar)"
      },
      {
        "c": "HI",
        "s": "Cubierta de hielo"
      },
      {
        "c": "HJ",
        "s": "Lanzamiento proyectado [especificar característica de identificación del vuelo del globo o nombre clave del proyecto, lugar de lanzamiento, período proyectado para el o los lanzamientos - fecha/hora, dirección de ascenso prevista, hora prevista en que pasará los 18 000 m (60 000 ft) o alcanzará el nivel de crucero si es de 18 000 m (60 000 ft), o inferior a esta cifra, así como el punto previsto en que esto sucederá]"
      },
      {
        "c": "HK",
        "s": "Migración de aves en curso (especificar el sentido)"
      },
      {
        "c": "HL",
        "s": "Se terminó de quitar la nieve"
      },
      {
        "c": "HM",
        "s": "Balizado por"
      },
      {
        "c": "HN",
        "s": "Cubierta de nieve mojada o fundente de un espesor de"
      },
      {
        "c": "HO",
        "s": "Disimulado/a por la nieve"
      },
      {
        "c": "HP",
        "s": "Se está quitando la nieve"
      },
      {
        "c": "HQ",
        "s": "Operación cancelada... (especificar característica de identificación del vuelo del globo o nombre clave del proyecto)"
      },
      {
        "c": "HR",
        "s": "Agua estancada"
      },
      {
        "c": "HS",
        "s": "Se está enarenando"
      },
      {
        "c": "HT",
        "s": "Aproximación de acuerdo con el área de señales únicamente"
      },
      {
        "c": "HU",
        "s": "Lanzamiento en marcha... [especificar características de identificación del vuelo del globo o nombre clave del proyecto, lugar de lanzamiento, fecha/hora del o de los lanzamientos, hora prevista en que pasará los 18 000 m (60 000 ft) o alcanzará el nivel de crucero si está a 18 000 m (60 000 ft) o por debajo de este nivel, junto con el punto previsto en que sucederá esto, fecha/hora prevista de terminación de vuelo, lugar proyectado en el que tocará tierra, si corresponde]"
      },
      {
        "c": "HV",
        "s": "Se ha terminado el trabajo"
      },
      {
        "c": "HW",
        "s": "Prosiguen los trabajos"
      },
      {
        "c": "HX",
        "s": "Concentración de aves"
      },
      {
        "c": "HY",
        "s": "Hay bancos de nieve (especificar altura)"
      },
      {
        "c": "HZ",
        "s": "Cubierto por surcos o crestas helados"
      }
    ]
  },
  {
    "grupo": "Limitaciones (L)",
    "codigos": [
      {
        "c": "LA",
        "s": "Funciona con fuente secundaria de energía"
      },
      {
        "c": "LB",
        "s": "Reservado para aeronaves locales"
      },
      {
        "c": "LC",
        "s": "Cerrado"
      },
      {
        "c": "LD",
        "s": "Inseguro"
      },
      {
        "c": "LE",
        "s": "Funciona sin fuente secundaria de energía"
      },
      {
        "c": "LF",
        "s": "Interferencia causada por"
      },
      {
        "c": "LG",
        "s": "Funciona sin identificación"
      },
      {
        "c": "LH",
        "s": "No pueden usarlo las aeronaves que pesen más de"
      },
      {
        "c": "LI",
        "s": "Cerrado para las operaciones IFR"
      },
      {
        "c": "LK",
        "s": "Funciona como luz fija"
      },
      {
        "c": "LL",
        "s": "Puede usarse en una longitud de... y un ancho de..."
      },
      {
        "c": "LN",
        "s": "Cerrado para toda clase de operaciones nocturnas"
      },
      {
        "c": "LP",
        "s": "Prohibido a"
      },
      {
        "c": "LR",
        "s": "Aeronaves restringidas a pistas y a calles de rodaje"
      },
      {
        "c": "LS",
        "s": "Sujeto a interrupción"
      },
      {
        "c": "LT",
        "s": "Limitado a"
      },
      {
        "c": "LV",
        "s": "Cerrado para operaciones VFR"
      },
      {
        "c": "LW",
        "s": "Se realizará"
      },
      {
        "c": "LX",
        "s": "Utilizable, pero se aconseja precaución por causa de lo siguiente"
      }
    ]
  },
  {
    "grupo": "Otros (XX)",
    "codigos": [
      {
        "c": "XX",
        "s": "Lenguaje claro"
      }
    ]
  }
],
  especiales: {
    asunto: [
      { c: 'XX', s: 'Asunto no incluido en el código NOTAM (Doc 8400, 3.3)' },
      { c: 'KK', s: 'Lista de verificación de NOTAM (código QKKKK, Doc 8400, 3.5)' }
    ],
    condicion: [
      { c: 'TT', s: 'NOTAM iniciador de una enmienda o suplemento AIP AIRAC (Doc 8400, 3.5)' },
      { c: 'KK', s: 'Lista de verificación de NOTAM (código QKKKK, Doc 8400, 3.5)' }
    ]
  }
};

function notamSignificadoAsunto(codigo) {
  const c = String(codigo || '').toUpperCase();
  for (const g of NOTAM_CODIGOS.asuntos) {
    const x = g.codigos.find(k => k.c === c);
    if (x) return x.s;
  }
  const e = NOTAM_CODIGOS.especiales.asunto.find(k => k.c === c);
  return e ? e.s : null;
}

function notamSignificadoCondicion(codigo) {
  const c = String(codigo || '').toUpperCase();
  for (const g of NOTAM_CODIGOS.condiciones) {
    const x = g.codigos.find(k => k.c === c);
    if (x) return x.s;
  }
  const e = NOTAM_CODIGOS.especiales.condicion.find(k => k.c === c);
  if (e) return e.s;
  return c === 'XX' ? 'Lenguaje claro' : null;
}
