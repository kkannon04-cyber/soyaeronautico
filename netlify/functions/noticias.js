// netlify/functions/noticias.js
// Fetch y parseo server-side de feeds RSS aeronáuticos.
// Ruta: /.netlify/functions/noticias
// Query params opcionales:
//   ?source=avweb          → solo esa fuente
//   ?count=12              → máximo artículos totales (default 15)

const https = require("https");
const http  = require("http");

// ── Fuentes RSS ──────────────────────────────────────────────────────────────
const SOURCES = [
  { id: "avweb",        label: "AVweb",         url: "https://www.avweb.com/feed/" },
  { id: "aviationweek", label: "Aviation Week",  url: "https://aviationweek.com/rss.xml" },
  { id: "aopa",         label: "AOPA",           url: "https://www.aopa.org/news-and-media/all-news/rss-feed" },
  { id: "flightglobal", label: "Flight Global",  url: "https://www.flightglobal.com/rss/news" },
  { id: "aeronoticias", label: "Aeronoticias",   url: "https://www.aeronoticias.com.pe/aeronautica/feed/" },
];

const MAX_PER_SOURCE = 6;
const TIMEOUT_MS     = 8000;

// ── HTTP fetch con timeout ───────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib    = url.startsWith("https") ? https : http;
    const timer  = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SoyAeronautico-Bot/1.0; +https://soyaeronautico.com)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      },
      (res) => {
        // Sigue redirecciones (301/302)
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

// ── Extrae texto de una etiqueta XML ────────────────────────────────────────
function tag(xml, name) {
  // Prueba CDATA primero, luego texto plano
  const cdataRe = new RegExp(
    `<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${name}>`,
    "i"
  );
  const plainRe = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = xml.match(cdataRe) || xml.match(plainRe);
  return m ? m[1].trim() : "";
}

// ── Extrae valor de un atributo ─────────────────────────────────────────────
function attr(xml, tagName, attrName) {
  const re = new RegExp(`<${tagName}[^>]+${attrName}="([^"]*)"`, "i");
  const m  = xml.match(re);
  return m ? m[1] : "";
}

// ── Limpia HTML del excerpt ──────────────────────────────────────────────────
function stripHtml(str) {
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Intenta extraer la primera URL de imagen del contenido ──────────────────
function extractImage(itemXml) {
  // 1) <media:content url="...">
  let m = itemXml.match(/<media:content[^>]+url="([^"]+)"/i);
  if (m && /\.(jpe?g|png|webp|gif)/i.test(m[1])) return m[1];

  // 2) <media:thumbnail url="...">
  m = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (m && /\.(jpe?g|png|webp|gif)/i.test(m[1])) return m[1];

  // 3) <enclosure url="..." type="image/...">
  m = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image/i);
  if (m) return m[1];

  // 4) Primera <img src="..."> dentro del contenido o description
  m = itemXml.match(/<img[^>]+src="([^"]+)"/i);
  if (m && /\.(jpe?g|png|webp|gif)/i.test(m[1])) return m[1];

  return "";
}

// ── Parsea un feed RSS completo ──────────────────────────────────────────────
function parseFeed(xml, source) {
  // Parte el XML en bloques <item>…</item>
  const itemBlocks = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    itemBlocks.push(match[1]);
  }

  return itemBlocks.slice(0, MAX_PER_SOURCE).map((block) => {
    const title     = stripHtml(tag(block, "title"));
    const link      = tag(block, "link") || attr(block, "link", "href");
    const pubDate   = tag(block, "pubDate") || tag(block, "dc:date") || tag(block, "published");
    const descRaw   = tag(block, "description") || tag(block, "summary") || tag(block, "content:encoded");
    const excerpt   = stripHtml(descRaw).slice(0, 280);
    const thumbnail = extractImage(block);

    return {
      sourceId:    source.id,
      sourceLabel: source.label,
      title,
      link,
      pubDate,
      excerpt,
      thumbnail,
    };
  }).filter((item) => item.title && item.link);
}

// ── Handler principal ────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
    // Netlify Edge puede cachear la respuesta hasta 10 min para reducir fetches
    "Cache-Control":                "public, max-age=600, stale-while-revalidate=1800",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const params     = event.queryStringParameters || {};
  const sourceFilter = params.source || "all";
  const maxTotal   = Math.min(parseInt(params.count, 10) || 15, 30);

  // Filtra fuentes si se pidió una específica
  const sources = sourceFilter === "all"
    ? SOURCES
    : SOURCES.filter((s) => s.id === sourceFilter);

  if (!sources.length) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "source not found" }),
    };
  }

  // Fetch en paralelo — los que fallen simplemente no aportan artículos
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const xml   = await fetchUrl(src.url);
      return parseFeed(xml, src);
    })
  );

  const articles = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, maxTotal);

  // Fuentes que sí respondieron (para que el front construya los filtros)
  const activeSources = sources
    .filter((_, i) => results[i].status === "fulfilled" && results[i].value.length > 0)
    .map((s) => ({ id: s.id, label: s.label }));

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ articles, sources: activeSources }),
  };
};
