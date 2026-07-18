// netlify/functions/noticias.js
// Noticias de aviación — SOLO TEXTO (sin imágenes), 8 artículos, fuente única:
// Aviacionline.com (sección "Aviación Comercial").
// Ruta: /.netlify/functions/noticias
//
// ── Estrategia de caché (para no gastar créditos de Netlify) ────────────────
// 1) Cache-Control con max-age=48h + stale-while-revalidate: la CDN de Netlify
//    devuelve la respuesta cacheada directamente sin volver a invocar la
//    función durante 48 horas. Esta es la vía principal de ahorro.
// 2) Caché en memoria (variable de módulo): si el contenedor de la función
//    sigue "caliente" entre invocaciones, evita repetir el fetch/parseo a
//    aviacionline.com aunque la CDN llegue a re-invocar la función.
// 3) Si el fetch a la fuente falla, se sirve la última copia buena guardada
//    en memoria (mejor mostrar noticias "viejas" que un error).

const https = require("https");

// ── Fuente única ──────────────────────────────────────────────────────────
const SOURCE = {
  id: "aviacionline",
  label: "Aviacionline",
  url: "https://www.aviacionline.com/espanol/aviacion-comercial_c68cdfd44a0ea712e1fb00314",
};

const MAX_ARTICLES   = 8;
const TIMEOUT_MS     = 8000;
const CACHE_MS       = 48 * 60 * 60 * 1000; // 48 horas

// Caché en memoria del proceso (persiste mientras el contenedor esté vivo)
let memoryCache = { data: null, timestamp: 0 };

// ── HTTP GET con timeout ─────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, TIMEOUT_MS);
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SoyAeronautico-Bot/1.0; +https://soyaeronautico.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timer);
          req.destroy();
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          clearTimeout(timer);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        res.on("error", (e) => { clearTimeout(timer); reject(e); });
      }
    );
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Decodifica entidades HTML básicas ────────────────────────────────────
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&#x?([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, code[0] && /^[0-9]+$/.test(code) ? 10 : 16))
    );
}

// ── Detecta un prefijo de fecha en español: "sábado 18/7/2026" ──────────────
const DIAS_RE = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

function parseSpanishDateToISO(str) {
  const m = str.match(DIAS_RE);
  if (!m) return null;
  const [, , dd, mm, yyyy] = m;
  const pad = (n) => n.toString().padStart(2, "0");
  return `${yyyy}-${pad(mm)}-${pad(dd)}T00:00:00-05:00`;
}

// ── Convierte el HTML interno de una tarjeta en bloques de texto limpios ───
function extractTextBlocks(innerHtml) {
  let html = innerHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<img[^>]*>/gi, "");

  // Marca un separador después de cada cierre de bloque de texto típico
  html = html.replace(/<\/(h[1-6]|p|li|time|small|span|div)>/gi, (m) => `${m}\u0001`);

  const text = decodeEntities(html.replace(/<[^>]+>/g, ""));

  return text
    .split("\u0001")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((s) => !/^no disponible sin conexi[oó]n\.?$/i.test(s))
    .filter((s, i, arr) => i === 0 || s !== arr[i - 1]); // sin duplicados consecutivos
}

// ── Arma un excerpt corto y prolijo ─────────────────────────────────────────
function buildExcerpt(text, maxLen = 180) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : maxLen)}…`;
}

// ── Parsea la página de listado y devuelve hasta N artículos ────────────────
function parseListing(html, source, max) {
  const ANCHOR_RE =
    /<a\s+[^>]*href="(https:\/\/www\.aviacionline\.com\/(?:espanol|english)\/[^"?#]+_a[0-9a-f]{15,})[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const seen = new Set();
  const articles = [];
  let match;

  while ((match = ANCHOR_RE.exec(html)) !== null && articles.length < max) {
    const link = match[1];
    if (seen.has(link)) continue;

    const blocks = extractTextBlocks(match[2]);
    if (!blocks.length) continue;

    let title, excerptParts, pubDate = null;

    const isDateLine = DIAS_RE.test(blocks[0]);
    if (isDateLine) {
      pubDate = parseSpanishDateToISO(blocks[0]);
      title = blocks[1];
      excerptParts = blocks.slice(2);
    } else {
      title = blocks[0];
      excerptParts = blocks.slice(1);
    }

    if (!title || title.length < 8 || title.length > 220) continue;

    seen.add(link);
    articles.push({
      sourceId:    source.id,
      sourceLabel: source.label,
      title,
      link,
      pubDate,
      excerpt: buildExcerpt(excerptParts.join(" ")),
    });
  }

  return articles;
}

// ── Handler principal ────────────────────────────────────────────────────
exports.handler = async () => {
  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    // La CDN de Netlify puede servir esta respuesta durante 48h sin volver
    // a invocar la función (stale-while-revalidate da 24h extra de margen).
    "Cache-Control":
      "public, max-age=172800, stale-while-revalidate=86400",
  };

  const now = Date.now();

  // 1) Caché en memoria todavía vigente → no se hace ningún fetch externo.
  if (memoryCache.data && now - memoryCache.timestamp < CACHE_MS) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        articles: memoryCache.data,
        sources: [{ id: SOURCE.id, label: SOURCE.label }],
        cached: true,
      }),
    };
  }

  // 2) Toca refrescar: se intenta el fetch a la fuente.
  try {
    const html = await fetchUrl(SOURCE.url);
    const articles = parseListing(html, SOURCE, MAX_ARTICLES);

    if (articles.length) {
      memoryCache = { data: articles, timestamp: now };
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          articles,
          sources: [{ id: SOURCE.id, label: SOURCE.label }],
          cached: false,
        }),
      };
    }
    throw new Error("sin artículos parseados");
  } catch (err) {
    // 3) Falló el fetch/parseo: si hay una copia vieja en memoria, se sirve
    //    igual (mejor noticias desactualizadas que un error en pantalla).
    if (memoryCache.data) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          articles: memoryCache.data,
          sources: [{ id: SOURCE.id, label: SOURCE.label }],
          cached: true,
          stale: true,
        }),
      };
    }
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: "No se pudo obtener noticias", detail: err.message }),
    };
  }
};

