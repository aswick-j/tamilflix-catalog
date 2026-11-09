import fs from "node:fs/promises";
import path from "node:path";

const TOKEN = (process.env.TMDB_READ_ACCESS_TOKEN || "").trim();
const MDBLIST_API_KEY = (process.env.MDBLIST_API_KEY || "").trim();
const MDBLIST_USER = "abinan97";
const MDBLIST_SLUG = "tamil-movies-digital";
const MDBLIST_LATEST_USER = "prasanaramanaa";
const MDBLIST_LATEST_SLUG = "latest-tamil-movie-release";

if (!TOKEN) throw new Error("Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret.");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");
const TMDB = "https://api.themoviedb.org/3";
const MDBLIST = "https://api.mdblist.com";
const IMG = "https://image.tmdb.org/t/p/w500";
const BACKDROP = "https://image.tmdb.org/t/p/w1280";
let tmdbAuthFailed = false;

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.copyFile(path.join(ROOT, "manifest.json"), path.join(OUT, "manifest.json"));

async function tmdb(endpoint) {
  if (!TOKEN) throw new Error("Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret.");
  if (tmdbAuthFailed) throw new Error("TMDB requests skipped because authentication already failed.");

  const url = new URL(TMDB + endpoint);
  const headers = { accept: "application/json" };

  // TMDB's Read Access Token is a JWT sent as a Bearer token.
  // A legacy v3 API key is a plain string and must be sent as api_key.
  if (TOKEN.includes(".")) {
    headers.Authorization = "Bearer " + TOKEN;
  } else if (TOKEN) {
    url.searchParams.set("api_key", TOKEN);
  } else {
    throw new Error("Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret.");
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    if (response.status === 401 || response.status === 403) tmdbAuthFailed = true;
    throw new Error("TMDB " + response.status + " for " + endpoint + ": " + detail);
  }
  return response.json();
}

function numericId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validImdbId(value) {
  return typeof value === "string" && /^tt\d+$/.test(value);
}

function imageUrl(value) {
  if (!value) return undefined;
  if (typeof value === "object") {
    return imageUrl(value.url || value.src || value.path || value.full);
  }
  if (typeof value !== "string") return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return IMG + value;
  return undefined;
}

function normalizeMdblistMovie(item) {
  const ids = item.ids || {};
  const id = numericId(item.tmdbid || item.tmdb_id || ids.tmdb || item.id);
  const imdbId = item.imdbid || item.imdb_id || ids.imdb || null;
  const title = item.title || item.name;
  if (!id && !validImdbId(imdbId)) return null;
  if (!title) return null;

  const year = item.release_year || item.year;
  const releaseDate = item.released || item.release_date || (year ? String(year) + "-01-01" : "");
  const poster = imageUrl(item.poster || item.poster_url || item.poster_path);
  const backdrop = imageUrl(item.backdrop || item.backdrop_url || item.backdrop_path);

  return {
    id: id || undefined,
    imdb_id: validImdbId(imdbId) ? imdbId : undefined,
    title,
    release_date: releaseDate,
    overview: item.description || item.overview || "",
    poster: poster || undefined,
    backdrop: backdrop || undefined
  };
}

async function fetchMdblistMovies(username, slug, listLabel) {
  if (!MDBLIST_API_KEY) {
    throw new Error("Missing MDBLIST_API_KEY GitHub Actions secret. Add it to the dev environment before building TamilFlix.");
  }

  const pageSize = 1000;
  const allItems = [];
  let offset = 0;
  let hasMore = true;
  let pageNumber = 0;

  while (hasMore) {
    pageNumber += 1;
    if (pageNumber > 20) throw new Error("MDBList pagination exceeded the safety limit.");

    const url = new URL(
      MDBLIST + "/lists/" + encodeURIComponent(username) + "/" +
      encodeURIComponent(slug) + "/items/movie/"
    );
    url.searchParams.set("apikey", MDBLIST_API_KEY);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("append_to_response", "poster,description");

    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "TamilFlix-Catalog/1.3" }
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      throw new Error("MDBList returned HTTP " + response.status + " while reading " + listLabel + ": " + details);
    }

    const payload = await response.json();
    let pageItems;
    if (Array.isArray(payload)) {
      pageItems = payload;
    } else if (payload && typeof payload === "object") {
      pageItems = payload.movies || payload.items || payload.results || [];
    } else {
      throw new Error("MDBList returned an unexpected response format.");
    }

    if (!Array.isArray(pageItems)) {
      throw new Error("MDBList returned a non-array movie collection.");
    }

    allItems.push(...pageItems);
    offset += pageItems.length;

    const hasMoreHeader = response.headers.get("x-has-more");
    hasMore = hasMoreHeader !== null
      ? hasMoreHeader.toLowerCase() === "true"
      : pageItems.length === pageSize;

    if (pageItems.length === 0) hasMore = false;
  }

  const normalized = allItems.map(normalizeMdblistMovie).filter(Boolean);
  console.log(
    "MDBList source (" + listLabel + "): fetched " + allItems.length + " records, retained " +
    normalized.length + " records with a usable TMDB or IMDb ID."
  );
  return normalized;
}

// Prefer IMDb IDs for broad provider compatibility. If no IMDb ID exists,
// use the TMDB ID instead of dropping the title.
const imdbIdCache = new Map();

function getImdbId(item, type) {
  const mediaType = type === "movie" ? "movie" : "tv";
  const itemId = numericId(item.id);
  if (!itemId || tmdbAuthFailed) return Promise.resolve(null);

  const cacheKey = mediaType + ":" + itemId;
  if (!imdbIdCache.has(cacheKey)) {
    const request = tmdb("/" + mediaType + "/" + itemId + "/external_ids")
      .then((data) => data.imdb_id || null)
      .catch((error) => {
        console.warn("Could not resolve IMDb ID for " + cacheKey + ": " + error.message);
        return null;
      });
    imdbIdCache.set(cacheKey, request);
  }
  return imdbIdCache.get(cacheKey);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function toMeta(item, type) {
  const directImdbId = item.imdb_id || item.imdbid || (item.ids && item.ids.imdb);
  const resolvedImdbId = validImdbId(directImdbId)
    ? directImdbId
    : await getImdbId(item, type);
  const imdbId = validImdbId(resolvedImdbId) ? resolvedImdbId : null;
  const tmdbId = numericId(item.id);
  const id = imdbId || (tmdbId ? "tmdb:" + tmdbId : null);

  if (!id) {
    console.warn("Skipping " + type + " item without a usable IMDb or TMDB ID: " + (item.title || item.name || "Untitled"));
    return null;
  }

  if (!imdbId) {
    console.warn("Using TMDB fallback ID for " + type + " TMDB ID " + tmdbId + ".");
  }

  const name = item.title || item.name || "Untitled";
  const release = item.release_date || item.first_air_date || "";
  const poster = imageUrl(item.poster) || imageUrl(item.poster_path);
  const background = imageUrl(item.backdrop) || imageUrl(item.backdrop_path);
  const meta = {
    id,
    type,
    name,
    poster,
    background,
    description: item.overview || item.description || "",
    releaseInfo: release ? String(release).slice(0, 10) : undefined
  };
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
}

function itemKey(item) {
  const tmdbId = numericId(item.id || item.tmdbid || item.tmdb_id);
  if (tmdbId) return "tmdb:" + tmdbId;
  const imdbId = item.imdb_id || item.imdbid || (item.ids && item.ids.imdb);
  if (validImdbId(imdbId)) return "imdb:" + imdbId;
  const title = item.title || item.name;
  const year = item.release_year || item.year || (item.release_date || "").slice(0, 4);
  return title ? "title:" + title.toLowerCase() + ":" + year : null;
}

function mergeCatalogItems(primaryItems, supplementalItems) {
  const merged = new Map();
  for (const item of [...primaryItems, ...supplementalItems]) {
    const key = itemKey(item);
    if (!key) continue;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    // Keep MDBList's curation/order and IDs while filling any missing metadata
    // from TMDB discovery.
    merged.set(key, {
      ...item,
      ...previous,
      poster: previous.poster || item.poster,
      poster_path: previous.poster_path || item.poster_path,
      backdrop: previous.backdrop || item.backdrop,
      backdrop_path: previous.backdrop_path || item.backdrop_path,
      overview: previous.overview || item.overview,
      description: previous.description || item.description,
      release_date: previous.release_date || item.release_date,
      imdb_id: previous.imdb_id || item.imdb_id
    });
  }
  return [...merged.values()];
}

async function writeJson(relative, value) {
  const full = path.join(OUT, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(value, null, 2) + "\n");
}

async function discover(kind, params, pages) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const query = new URLSearchParams({
      include_adult: "false",
      include_video: "false",
      page: String(page),
      ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
    });
    const data = await tmdb("/discover/" + kind + "?" + query);
    all.push(...(data.results || []));
  }
  return all;
}

async function discoverOrEmpty(kind, params, pages, catalogLabel) {
  try {
    return await discover(kind, params, pages);
  } catch (error) {
    console.warn("TMDB source unavailable for " + catalogLabel + ": " + error.message);
    return [];
  }
}

const today = new Date().toISOString().slice(0, 10);
const mdblistTamilMovies = await fetchMdblistMovies(MDBLIST_USER, MDBLIST_SLUG, "Tamil Movies Digital");
const discoveredTamilMovies = await discoverOrEmpty("movie", {
  with_original_language: "ta",
  sort_by: "popularity.desc"
}, 3, "Tamil Movies");
const mergedTamilMovies = mergeCatalogItems(mdblistTamilMovies, discoveredTamilMovies);

const oneYearAgo = new Date();
oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 365);
const releaseWindowStart = oneYearAgo.toISOString().slice(0, 10);
const mdblistLatestTamilMovies = await fetchMdblistMovies(
  MDBLIST_LATEST_USER,
  MDBLIST_LATEST_SLUG,
  "Latest Tamil Movie Release"
);
const tmdbLatestTamilMovies = await discoverOrEmpty("movie", {
  with_original_language: "ta",
  sort_by: "primary_release_date.desc",
  "primary_release_date.gte": releaseWindowStart,
  "primary_release_date.lte": today
}, 5, "Latest Tamil Releases");

function releaseDateOf(item) {
  const value = item.release_date || item.released || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : "";
}

const mergedLatestTamilMovies = mergeCatalogItems(
  mdblistLatestTamilMovies,
  tmdbLatestTamilMovies
)
  .filter((item) => {
    const releaseDate = releaseDateOf(item);
    return releaseDate && releaseDate <= today;
  })
  .sort((a, b) => {
    const dateCompare = releaseDateOf(b).localeCompare(releaseDateOf(a));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""));
  });

console.log(
  "Latest Tamil releases: " + mergedLatestTamilMovies.length +
  " unique titles dated " + releaseWindowStart + " through " + today +
  ", sorted newest release date first."
);

console.log(
  "Tamil movie catalog: " + mergedTamilMovies.length +
  " unique titles after merging MDBList and TMDB discovery."
);

const catalogDefs = [
  { id: "tamil_movies", type: "movie", items: mergedTamilMovies },
  { id: "tamil_popular_movies", type: "movie", items: await discoverOrEmpty("movie", { with_original_language: "ta", sort_by: "vote_count.desc", "vote_count.gte": 10 }, 2, "Popular Tamil Movies") },
  { id: "tamil_latest_movies", type: "movie", items: mergedLatestTamilMovies },
  { id: "tamil_series", type: "series", items: await discoverOrEmpty("tv", { with_original_language: "ta", sort_by: "popularity.desc" }, 3, "Tamil Series") },
  { id: "tamil_popular_series", type: "series", items: await discoverOrEmpty("tv", { with_original_language: "ta", sort_by: "vote_count.desc", "vote_count.gte": 10 }, 2, "Popular Tamil Series") }
];

const dubbed = JSON.parse(await fs.readFile(path.join(ROOT, "data/tamil-dubbed.json"), "utf8"));
for (const [type, ids] of [["movie", dubbed.movies || []], ["series", dubbed.series || []]]) {
  const valid = [];
  for (const rawId of ids) {
    const id = numericId(rawId);
    if (!id) continue;
    try {
      valid.push(await tmdb("/" + (type === "movie" ? "movie" : "tv") + "/" + id));
    } catch (error) {
      console.warn("Skipping invalid dubbed " + type + " TMDB ID " + rawId + ": " + error.message);
    }
  }
  catalogDefs.push({
    id: type === "movie" ? "tamil_dubbed_movies" : "tamil_dubbed_series",
    type,
    items: valid
  });
}

const allMeta = new Map();
for (const def of catalogDefs) {
  const uniqueByKey = new Map();
  for (const item of def.items) {
    const key = itemKey(item);
    if (key && !uniqueByKey.has(key)) uniqueByKey.set(key, item);
  }
  const unique = [...uniqueByKey.values()];
  const resolvedMetas = await mapWithConcurrency(unique, 4, (item) => toMeta(item, def.type));
  const metas = resolvedMetas.filter(Boolean);
  await writeJson("catalog/" + def.type + "/" + def.id + ".json", { metas });
  for (const meta of metas) {
    allMeta.set(def.type + "/" + meta.id, meta);
  }
}

const channels = JSON.parse(await fs.readFile(path.join(ROOT, "data/live-tv.json"), "utf8"));
const channelMetas = channels.map((channel) => ({
  id: "tamilflix_channel_" + String(channel.id).replace(/[^a-zA-Z0-9_-]/g, "_"),
  type: "channel",
  name: channel.name,
  description: channel.description || "",
  genres: channel.category ? [channel.category] : undefined,
  poster: channel.logo || undefined,
  website: channel.website || undefined
})).map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)));

await writeJson("catalog/channel/tamil_live_tv.json", { metas: channelMetas });
for (const meta of channelMetas) allMeta.set("channel/" + meta.id, meta);

for (const [key, meta] of allMeta.entries()) {
  const separator = key.indexOf("/");
  const type = key.slice(0, separator);
  const id = key.slice(separator + 1);
  await writeJson("meta/" + type + "/" + id + ".json", { meta });
}

console.log("TamilFlix build complete: " + (catalogDefs.length + 1) + " catalogs, " + allMeta.size + " metadata records.");
