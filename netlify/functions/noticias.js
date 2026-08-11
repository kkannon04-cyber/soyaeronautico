// netlify/functions/noticias.js
// Noticias de aviación — SOLO TEXTO (sin imágenes), 5 artículos, fuente única:
// Aviación al Día (aviacionaldia.com), vía su RSS oficial.
// Ruta: /.netlify/functions/noticias
//
// ── Estrategia de caché (para no gastar créditos de Netlify) ────────────────
// 1) Cache-Control con max-age=24h + stale-while-revalidate: la CDN de Netlify
//    devuelve la respuesta cacheada directamente sin volver a invocar la
//    función durante 24 horas. Esta es la vía principal de ahorro.
// 2) Caché en memoria (variable de módulo): si el contenedor de la función
//    sigue "caliente" entre invocaciones, evita repetir el fetch/parseo al
//    feed aunque la CDN llegue a re-invocar la función.
// 3) Si el fetch a la fuente falla, se sirve la última copia buena guardada
//    en memoria (mejor mostrar noticias "viejas" que un error).

const https = require("https");
const zlib  = require("zlib");

// ── Fuente única: RSS real de Aviación al Día ────────────────────────────
const SOURCE = {
  id: "aviacionaldia",
  label: "Aviación al Día",
  url: "https://aviacionaldia.com/feed/",
};

const MAX_ARTICLES   = 5;
const TIMEOUT_MS     = 8000;
const CACHE_MS       = 24 * 60 * 60 * 1000; // 24 horas

// Caché en memoria del proceso (persiste mientras el contenedor esté vivo)
let memoryCache = { data: null, timestamp: 0 };

// ── HTTP GET con timeout + descompresión (gzip/deflate/br) ───────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, TIMEOUT_MS);
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
          "Accept-Language": "es-ES,es;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timer);
          req.destroy();
          const nextUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchUrl(nextUrl).then(resolve).catch(reject);
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
          try {
            const buf = Buffer.concat(chunks);
            const encoding = (res.headers["content-encoding"] || "").toLowerCase();
            let out;
            if (encoding.includes("br")) out = zlib.brotliDecompressSync(buf);
            else if (encoding.includes("gzip")) out = zlib.gunzipSync(buf);
            else if (encoding.includes("deflate")) out = zlib.inflateSync(buf);
            else out = buf;
            resolve(out.toString("utf-8"));
          } catch (e) {
            reject(e);
          }
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

// ── Arma un excerpt corto y prolijo a partir del <description> del feed ────
function buildExcerpt(html, maxLen = 180) {
  if (!html) return "";
  const text = decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : maxLen)}…`;
}

// ── Extrae el contenido de un tag (con o sin CDATA) dentro de un <item> ────
function extractTag(itemXml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = itemXml.match(re);
  if (!m) return "";
  const raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return (cdata ? cdata[1] : raw).trim();
}

// ── Parsea un feed RSS 2.0 estándar y devuelve hasta N artículos ──────────
function parseRss(xml, source, max) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const articles = [];

  for (const itemXml of items) {
    const title = decodeEntities(extractTag(itemXml, "title"));
    const link  = extractTag(itemXml, "link");
    const pubDateRaw = extractTag(itemXml, "pubDate");
    const description = extractTag(itemXml, "description");

    if (!title || !link) continue;

    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : null;
    const pubDate = parsedDate && !isNaN(parsedDate) ? parsedDate.toISOString() : null;

    articles.push({
      sourceId:    source.id,
      sourceLabel: source.label,
      title,
      link,
      pubDate,
      excerpt: buildExcerpt(description),
    });
  }

  // Más reciente primero; los que no traigan fecha válida van al final.
  articles.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });

  return articles.slice(0, max);
}

// ── Handler principal ────────────────────────────────────────────────────
exports.handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    // La CDN de Netlify puede servir esta respuesta durante 24h sin volver
    // a invocar la función (stale-while-revalidate da 12h extra de margen).
    "Cache-Control":
      "public, max-age=86400, stale-while-revalidate=43200",
  };

  const params = (event && event.queryStringParameters) || {};

  // ── Modo diagnóstico: /.netlify/functions/noticias?debug=1 ──────────────
  // Bypasea toda caché y devuelve datos crudos para ver qué está llegando
  // realmente del feed RSS, sin tener que adivinar a ciegas.
  if (params.debug) {
    try {
      const xml = await fetchUrl(SOURCE.url);
      const itemCount = (xml.match(/<item>/gi) || []).length;
      const articles = parseRss(xml, SOURCE, MAX_ARTICLES);
      return {
        statusCode: 200,
        headers: { ...CORS, "Cache-Control": "no-store" },
        body: JSON.stringify({
          debug: true,
          xmlLength: xml.length,
          itemMatches: itemCount,
          parsedCount: articles.length,
          parsedSample: articles,
        }, null, 2),
      };
    } catch (err) {
      return {
        statusCode: 200,
        headers: { ...CORS, "Cache-Control": "no-store" },
        body: JSON.stringify({ debug: true, error: err.message }, null, 2),
      };
    }
  }

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
    const xml = await fetchUrl(SOURCE.url);
    const articles = parseRss(xml, SOURCE, MAX_ARTICLES);

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
