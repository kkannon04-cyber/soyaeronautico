// Genera los datos mundiales de aeródromos y radioayudas que dibuja el Simulador NALA.
//
// Fuente: OurAirports (https://ourairports.com/data/), publicado en dominio público.
// No es una fuente oficial AIP: sirve para situar aeródromos y radioayudas en el mapa y para
// estudio. Los datos de Colombia que usa el simulador para operar siguen siendo los del eAIP
// (dentro de Simulador-NALA.html), y tienen prioridad sobre estos.
//
// Uso (Node 18 o superior, sin dependencias):
//   node BasesDeDatos/nav/generar-nav.mjs            -> descarga los CSV de OurAirports
//   node BasesDeDatos/nav/generar-nav.mjs <carpeta>  -> usa CSV ya descargados en <carpeta>
//
// Escribe aerodromos.json y radioayudas.json junto a este script. Cada archivo lleva su
// procedencia, la fecha de generación, el filtro aplicado y el orden de las columnas.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://davidmegginson.github.io/ourairports-data/';

async function leerCsv(nombre){
  const carpeta = process.argv[2];
  if(carpeta) return fs.readFileSync(path.join(carpeta, nombre), 'utf8');
  const r = await fetch(BASE_URL + nombre);
  if(!r.ok) throw new Error(`${nombre}: HTTP ${r.status}`);
  return r.text();
}

// CSV con comillas dobles y comillas escapadas (""), el formato de OurAirports.
function parseCsv(txt){
  const filas = []; let fila = [], campo = '', entreComillas = false;
  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    if(entreComillas){
      if(c === '"'){ if(txt[i+1] === '"'){ campo += '"'; i++; } else entreComillas = false; }
      else campo += c;
    } else if(c === '"') entreComillas = true;
    else if(c === ','){ fila.push(campo); campo = ''; }
    else if(c === '\n'){ fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if(c !== '\r') campo += c;
  }
  if(campo || fila.length){ fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter(f => f.length > 1).map(f => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

const num = (v, dec) => { const n = parseFloat(v); return Number.isFinite(n) ? +n.toFixed(dec) : null; };
const ent = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

// Solo aeródromos con un indicador OACI real de 4 letras en la columna icao_code. La columna
// ident es un identificador local (hay miles tipo "US-0123" o códigos FAA de 3 letras) y no
// sirve como indicador de lugar OACI.
const OACI = /^[A-Z]{4}$/;
const CLASE = { large_airport: 'L', medium_airport: 'M', small_airport: 'S' };

const [csvAd, csvPistas, csvNav] = await Promise.all(['airports.csv', 'runways.csv', 'navaids.csv'].map(leerCsv));
const aeropuertos = parseCsv(csvAd), pistas = parseCsv(csvPistas), navaids = parseCsv(csvNav);

const pistasPorAd = new Map();
pistas.forEach(p => {
  if(p.closed === '1') return;
  const lista = pistasPorAd.get(p.airport_ref) || [];
  const id = [p.le_ident, p.he_ident].filter(Boolean).join('/');
  lista.push([id || '—', ent(p.length_ft), ent(p.width_ft), (p.surface || '').toUpperCase().trim().slice(0, 12)]);
  pistasPorAd.set(p.airport_ref, lista);
});

const hoy = new Date().toISOString().slice(0, 10);

const ad = aeropuertos
  .filter(a => CLASE[a.type] && OACI.test(a.icao_code))
  .map(a => {
    const rw = (pistasPorAd.get(a.id) || []).sort((x, y) => (y[1] || 0) - (x[1] || 0));
    return [a.icao_code, a.iata_code || '', a.name, a.municipality || '', a.iso_country,
            num(a.latitude_deg, 5), num(a.longitude_deg, 5), ent(a.elevation_ft), CLASE[a.type], rw];
  })
  .filter(r => r[5] != null && r[6] != null)
  .sort((x, y) => x[0].localeCompare(y[0]));

const nav = navaids
  .map(n => [n.ident, n.name, n.type, ent(n.frequency_khz), num(n.latitude_deg, 5), num(n.longitude_deg, 5),
             n.iso_country, num(n.magnetic_variation_deg, 1), n.dme_channel || ''])
  .filter(r => r[0] && r[4] != null && r[5] != null)
  .sort((x, y) => x[0].localeCompare(y[0]) || x[6].localeCompare(y[6]));

const cabecera = (extra) => ({
  fuente: 'OurAirports — ourairports.com/data (dominio público)',
  aviso: 'Datos comunitarios con fines educativos: no sustituyen al AIP de cada Estado.',
  generado: hoy,
  ...extra,
});

fs.writeFileSync(path.join(AQUI, 'aerodromos.json'), JSON.stringify({
  ...cabecera({
    filtro: 'Aeródromos grandes, medianos y pequeños con indicador OACI de 4 letras; excluidos cerrados, helipuertos, hidroaeródromos y globos. Pistas cerradas excluidas.',
    cols: ['icao', 'iata', 'nombre', 'ciudad', 'pais', 'lat', 'lon', 'elevFt', 'clase(L/M/S)', 'pistas[[id, largoFt, anchoFt, superficie]]'],
  }),
  datos: ad,
}));
fs.writeFileSync(path.join(AQUI, 'radioayudas.json'), JSON.stringify({
  ...cabecera({
    filtro: 'Todas las radioayudas publicadas (VOR, VOR-DME, VORTAC, TACAN, DME, NDB, NDB-DME).',
    cols: ['ident', 'nombre', 'tipo', 'frecKHz', 'lat', 'lon', 'pais', 'varMag°', 'canalDME'],
  }),
  datos: nav,
}));

const kb = f => (fs.statSync(path.join(AQUI, f)).size / 1024).toFixed(0) + ' KB';
console.log(`aerodromos.json: ${ad.length} aeródromos (${kb('aerodromos.json')})`);
console.log(`radioayudas.json: ${nav.length} radioayudas (${kb('radioayudas.json')})`);
