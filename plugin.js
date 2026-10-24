/**
 * Kino Plugin: Frikiseries
 * Series retro, anime clásico de los 80s y 90s, dibujos animados y películas.
 */

const BASE_URL = "https://www.frikiserie.com";
const HOME_DATA_URL = `${BASE_URL}/assets/data/home.json`;
const INFO_DATA_URL = `${BASE_URL}/assets/data/info.json`;

const QUALITY_ORDER = ["full", "hd", "sd", "low", "lowest", "mobile"];

const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const OKRU_REFERER = "https://ok.ru/";

// In-memory cache for the session
let cachedInfo = null;

/**
 * Normaliza cadenas de texto para búsqueda (minúsculas, sin acentos ni diacríticos).
 */
function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Sanitiza identificadores para que cumplan con ^[A-Za-z0-9._-]{1,100}$
 */
function sanitizeId(str, prefix = "") {
  const safe = (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return `${prefix}${safe || "unknown"}`.slice(0, 100);
}

/**
 * Desescapa entidades HTML comunes en atributos (como data-options en OKRU).
 */
function unescapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Convierte un item crudo del catálogo a un KinoItem válido.
 */
function toKinoItem(item) {
  const isMovie = item.tipo === "pelicula";
  const kind = isMovie ? "movie" : "series";
  const prefix = isMovie ? "m_" : "s_";
  const slug = item.slug || item.titulo || "item";
  const id = sanitizeId(slug, prefix);
  const title = (item.titulo || "Sin título").trim();

  let year;
  if (item.fecha) {
    const y = parseInt(item.fecha, 10);
    if (!isNaN(y) && y >= 1900 && y <= 2099) {
      year = y;
    }
  }

  // Ref almacena los datos clave para resolver o listar episodios
  const ref = JSON.stringify({
    kind,
    slug,
    title,
    video: item.video || null,
    irAListaVideo: item.irAListaVideo === true
  });

  const poster = item.imagen && item.imagen.startsWith("http") ? item.imagen : undefined;
  const overview = item.descripcion && item.descripcion !== title ? item.descripcion.trim() : undefined;

  return {
    id,
    kind,
    title,
    ref,
    ...(year ? { year } : {}),
    ...(poster ? { poster } : {}),
    ...(overview ? { overview } : {})
  };
}

/**
 * Descarga y almacena en caché la base de datos completa de series y películas (info.json).
 */
async function getInfoDatabase() {
  if (cachedInfo && Array.isArray(cachedInfo) && cachedInfo.length > 0) {
    return cachedInfo;
  }
  try {
    const res = await kino.fetch(INFO_DATA_URL, {
      headers: { "Accept": "application/json" }
    });
    const data = res.json();
    const list = Array.isArray(data?.info) ? data.info : (Array.isArray(data) ? data : []);
    cachedInfo = list;
    return list;
  } catch (err) {
    if (cachedInfo) return cachedInfo;
    throw kino.error("network", `No se pudo obtener el catálogo de Frikiseries: ${err.message}`);
  }
}

/**
 * Catálogo del Home organizado en filas por categorías.
 */
export async function home() {
  let homeData;
  try {
    const res = await kino.fetch(HOME_DATA_URL, {
      headers: { "Accept": "application/json" }
    });
    homeData = res.json();
  } catch (err) {
    throw kino.error("network", `Error al cargar la página principal de Frikiseries: ${err.message}`);
  }

  const rawRows = Array.isArray(homeData?.home) ? homeData.home : [];
  const rows = [];

  for (let i = 0; i < rawRows.length && rows.length < 20; i++) {
    const r = rawRows[i];
    const catName = r.categoria || r.titulo || `Fila ${i + 1}`;
    const rawItems = Array.isArray(r.home) ? r.home : [];
    if (!rawItems.length) continue;

    const items = [];
    for (const rawItem of rawItems) {
      items.push(toKinoItem(rawItem));
    }

    if (items.length > 0) {
      const rowId = sanitizeId(catName, "row_");
      rows.push({
        id: rowId,
        title: catName,
        ref: catName,
        items
      });
    }
  }

  return rows.slice(0, 20);
}

/**
 * Exploración de categorías en profundidad ("Ver más").
 */
export async function browse(ref, cursor) {
  const catTarget = (ref || "").trim();
  const allInfo = await getInfoDatabase();

  let matches = [];
  if (catTarget) {
    const normTarget = normalizeText(catTarget);
    // Filtrar por coincidencia en género, categoría o descripción
    matches = allInfo.filter((item) => {
      const matchCat = item.categoria && normalizeText(item.categoria).includes(normTarget);
      const matchDesc = item.descripcion && normalizeText(item.descripcion).includes(normTarget);
      return matchCat || matchDesc;
    });
  }

  if (matches.length === 0) {
    matches = allInfo;
  }

  const items = matches.slice(0, 100).map(toKinoItem);
  return { items };
}

/**
 * Búsqueda de series y películas por título o descripción.
 */
export async function search(query) {
  let rawQ = "";
  if (typeof query === "string") {
    rawQ = query;
  } else if (query && typeof query === "object") {
    rawQ = query.q || query.query || "";
  }
  const q = normalizeText(rawQ);
  if (!q) {
    return [];
  }

  const allInfo = await getInfoDatabase();
  const hits = [];

  for (const item of allInfo) {
    const title = normalizeText(item.titulo);
    const desc = normalizeText(item.descripcion);

    if (title.includes(q) || desc.includes(q)) {
      hits.push(toKinoItem(item));
      if (hits.length >= 60) break;
    }
  }

  return hits;
}

/**
 * Lista de episodios para series.
 * Si es un maratón de un único archivo largo, devuelve un solo episodio llamado "Maratón completo".
 */
export async function episodes(ref) {
  let data;
  try {
    data = JSON.parse(ref);
  } catch {
    data = { video: ref, title: "Maratón completo" };
  }

  const videoUrl = data.video;
  if (!videoUrl || videoUrl === "xxx" || videoUrl === "xxxx") {
    throw kino.error(
      "not_found",
      `Video no disponible para ${data.title || "esta serie"}`,
      { userMessage: "Este título no tiene video disponible actualmente en el sitio." }
    );
  }

  // Devolver el maratón completo como un único episodio
  const episodeRef = JSON.stringify({
    url: videoUrl,
    title: data.title || "Maratón completo"
  });

  return {
    episodes: [
      {
        season: 1,
        number: 1,
        title: "Maratón completo",
        ref: episodeRef
      }
    ]
  };
}

/**
 * Extrae streams MP4 desde el reproductor OKRU (ok.ru/videoembed/...).
 */
async function resolveOkru(videoUrl) {
  let embedUrl = videoUrl;
  if (videoUrl.includes("/video/")) {
    embedUrl = videoUrl.replace("/video/", "/videoembed/");
  }

  let html;
  try {
    const res = await kino.fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });
    html = res.text();
  } catch (err) {
    throw kino.error("network", `Fallo al conectar con OKRU: ${err.message}`);
  }

  // Comprobar si el video fue borrado o bloqueado en OKRU
  if (html.includes("vp_video_stub_txt") || html.includes("userNotFound")) {
    throw kino.error(
      "source_unavailable",
      "El video en OKRU fue eliminado o bloqueado por el autor",
      { userMessage: "El video en OKRU no se encuentra disponible (posiblemente eliminado)." }
    );
  }

  // Extraer el JSON data-options del reproductor
  const match = html.match(/data-options="([^"]+)"/) || html.match(/data-options='([^']+)'/);
  if (!match) {
    throw kino.error(
      "source_unavailable",
      "No se encontró data-options en la página de OKRU",
      { userMessage: "No se pudo extraer el reproductor de OKRU." }
    );
  }

  let options;
  try {
    const rawJson = unescapeHtml(match[1]);
    options = JSON.parse(rawJson);
  } catch (err) {
    throw kino.error("source_unavailable", `JSON de OKRU inválido: ${err.message}`);
  }

  const flashvars = options.flashvars || {};
  let metadata = flashvars.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }

  if (!metadata) {
    throw kino.error("source_unavailable", "Falta metadata en data-options de OKRU");
  }

  if (metadata.error) {
    throw kino.error("source_unavailable", `Error devuelto por OKRU: ${metadata.error}`, {
      userMessage: "OKRU indica que el video no se puede reproducir."
    });
  }

  const rawVideos = Array.isArray(metadata.videos) ? metadata.videos : [];
  if (rawVideos.length === 0 && !metadata.hlsManifestUrl) {
    throw kino.error("not_found", "No hay enlaces de video en la metadata de OKRU");
  }

  // Ordenar videos por orden de calidad deseada
  const sortedVideos = [...rawVideos].sort((a, b) => {
    const ia = QUALITY_ORDER.indexOf(a.name);
    const ib = QUALITY_ORDER.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const streamHeaders = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Referer": OKRU_REFERER
  };

  let primaryUrl = "";
  const alternatives = [];

  if (sortedVideos.length > 0) {
    primaryUrl = sortedVideos[0].url;
    for (let i = 1; i < sortedVideos.length && alternatives.length < 7; i++) {
      if (sortedVideos[i].url) {
        const qName = (sortedVideos[i].name || "MP4").toUpperCase();
        alternatives.push({
          url: sortedVideos[i].url,
          mime: "video/mp4",
          headers: streamHeaders,
          label: `OKRU (${qName})`
        });
      }
    }
  } else if (metadata.hlsManifestUrl) {
    primaryUrl = metadata.hlsManifestUrl;
  }

  if (metadata.hlsManifestUrl && primaryUrl !== metadata.hlsManifestUrl && alternatives.length < 8) {
    alternatives.push({
      url: metadata.hlsManifestUrl,
      mime: "application/x-mpegURL",
      headers: streamHeaders,
      label: "OKRU (HLS)"
    });
  }

  return {
    url: primaryUrl,
    mime: primaryUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
    headers: streamHeaders,
    ...(alternatives.length > 0 ? { alternatives } : {})
  };
}

/**
 * Resuelve un stream para películas o episodios.
 */
export async function resolve(ref) {
  let targetUrl = ref;

  try {
    const parsed = JSON.parse(ref);
    targetUrl = parsed.url || parsed.video || ref;
  } catch {
    // Si no es JSON, se usa ref directamente como URL
  }

  if (!targetUrl || typeof targetUrl !== "string") {
    throw kino.error("not_found", "Referencia de video vacía");
  }

  // 1. Alojamiento OKRU
  if (targetUrl.includes("ok.ru")) {
    return await resolveOkru(targetUrl);
  }

  // 2. Alojamiento VK Video
  if (targetUrl.includes("vk.com") || targetUrl.includes("vkvideo.ru")) {
    throw kino.error(
      "source_unavailable",
      "VK Video no proporciona stream directo",
      { userMessage: "Los videos alojados en VK Video requieren navegación interactiva y no se pueden reproducir directamente." }
    );
  }

  // 3. Alojamiento Archive.org
  if (targetUrl.includes("archive.org")) {
    return {
      url: targetUrl,
      mime: targetUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
      headers: { "User-Agent": DEFAULT_USER_AGENT }
    };
  }

  // 4. Archivo directo MP4 / HLS
  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    return {
      url: targetUrl,
      mime: targetUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
      headers: { "User-Agent": DEFAULT_USER_AGENT }
    };
  }

  throw kino.error("not_found", `Alojador de video no reconocido: ${targetUrl}`);
}
