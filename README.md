# Soy Aeronáutico

Portal educativo interactivo para estudiantes de aviación con herramientas para consultar METAR, TAF y conceptos de ATS.

## 🎯 Características

- **Dashboard METAR/TAF**: Búsqueda en tiempo real de reportes meteorológicos de aeropuertos
- **ATS**: Módulo educativo de Servicios de Tráfico Aéreo con lecciones interactivas
- **Meteorología**: Conceptos y herramientas meteorológicas de aviación
- **Espacio Aéreo**: Información sobre estructuras del espacio aéreo

## 🚀 Cómo usar

1. Accede a [soyaeronautico.com](https://soyaeronautico.com)
2. Navega entre las secciones desde el menú principal
3. En METAR/TAF, ingresa un código ICAO (ej. SKBO) para obtener datos en tiempo real

## 🔧 Despliegue

El sitio se despliega automáticamente desde este repositorio a Netlify cada vez que se hace push a la rama `main`.

## 📦 Estructura

├── index.html           # Página principal
├── metar-taf.html       # Búsqueda avanzada de METAR/TAF
├── ats.html             # Módulo de ATS
├── ASSETS/              # Imágenes y estilos
└── netlify/functions/
    └── metar.js         # Función serverless con caché

## 📚 Tecnologías

- HTML5 + CSS3 + Vanilla JavaScript
- Netlify Functions (Node.js)
- API de aviationweather.gov (NOAA)

## 👤 Autor

Cristian
