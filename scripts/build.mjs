import fs from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
if (!TOKEN) throw new Error("Missing TMDB_READ_ACCESS_TOKEN repository secret.");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";
const BACKDROP = "https://image.tmdb.org/t/p/w1280";

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.copyFile(path.join(ROOT, "manifest.json"), path.join(OUT, "manifest.json"));

async function tmdb(endpoint) {
  const response = await fetch(`${TMDB}${endpoint}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`TMDB ${response.status} for ${endpoint}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

// Resolve TMDB IDs to IMDb IDs so separately installed Stremio/Nuvio stream
// providers that match "tt" IDs can recognize TamilFlix catalog entries.
const imdbIdCache = new Map();

function getImdbId(item, type) {
  const mediaType = type === "movie" ? "movie" : "tv";
  const cacheKey = `${mediaType}:${item.id}`;
  if (!imdbIdCache.has(cacheKey)) {
    const request = tmdb(`/${mediaType}/${item.id}/external_ids`)
      .then((data) => data.imdb_id || null)
      .catch((error) => {
        console.warn(`Could not resolve IMDb ID for ${cacheKey}: ${error.message}`);
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
  const imdbId = await getImdbId(item, type);
  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    console.warn(`Skipping ${type} TMDB ID ${item.id}: no valid IMDb ID for provider matching.`);
    return null;
  }

  const name = item.title || item.name || "Untitled";
  const release = item.release_date || item.first_air_date || "";
  const meta = {
    id: imdbId,
    type,
    name,
    poster: item.poster_path ? `${IMG}${item.poster_path}` : undefined,
    background: item.backdrop_path ? `${BACKDROP}${item.backdrop_path}` : undefined,
    description: item.overview || "",
    releaseInfo: release ? release.slice(0, 4) : undefined
  };
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
}

async function writeJson(relative, value) {
  const full = path.join(OUT, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(value, null, 2) + "\n");
}

async function discover(kind, params, pages = 2) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const query = new URLSearchParams({
      include_adult: "false",
      include_video: "false",
      page: String(page),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    });
    const data = await tmdb(`/discover/${kind}?${query}`);
    all.push(...(data.results || []));
  }
  return all;
}

const today = new Date().toISOString().slice(0, 10);
const catalogDefs = [
  { id: "tamil_movies", type: "movie", items: await discover("movie", { with_original_language: "ta", sort_by: "popularity.desc" }, 3) },
  { id: "tamil_popular_movies", type: "movie", items: await discover("movie", { with_original_language: "ta", sort_by: "vote_count.desc", "vote_count.gte": 10 }, 2) },
  { id: "tamil_latest_movies", type: "movie", items: await discover("movie", { with_original_language: "ta", sort_by: "primary_release_date.desc", "release_date.lte": today }, 2) },
  { id: "tamil_series", type: "series", items: await discover("tv", { with_original_language: "ta", sort_by: "popularity.desc" }, 3) },
  { id: "tamil_popular_series", type: "series", items: await discover("tv", { with_original_language: "ta", sort_by: "vote_count.desc", "vote_count.gte": 10 }, 2) }
];

const dubbed = JSON.parse(await fs.readFile(path.join(ROOT, "data/tamil-dubbed.json"), "utf8"));
for (const [type, ids] of [["movie", dubbed.movies || []], ["series", dubbed.series || []]]) {
  const valid = [];
  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    try {
      valid.push(await tmdb(`/${type === "movie" ? "movie" : "tv"}/${id}`));
    } catch (error) {
      console.warn(`Skipping invalid dubbed ${type} TMDB ID ${rawId}: ${error.message}`);
    }
  }
  catalogDefs.push({ id: type === "movie" ? "tamil_dubbed_movies" : "tamil_dubbed_series", type, items: valid });
}

const allMeta = new Map();
for (const def of catalogDefs) {
  const unique = [...new Map(def.items.map(item => [item.id, item])).values()];
  const resolvedMetas = await mapWithConcurrency(unique, 4, (item) => toMeta(item, def.type));
  const metas = resolvedMetas.filter(Boolean);
  await writeJson(`catalog/${def.type}/${def.id}.json`, { metas });
  for (const meta of metas) {
    allMeta.set(`${def.type}/${meta.id}`, meta);
  }
}

const channels = JSON.parse(await fs.readFile(path.join(ROOT, "data/live-tv.json"), "utf8"));
const channelMetas = channels.map(channel => ({
  id: `tamilflix_channel_${String(channel.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
  type: "channel",
  name: channel.name,
  description: channel.description || "",
  genres: channel.category ? [channel.category] : undefined,
  poster: channel.logo || undefined,
  website: channel.website || undefined
})).map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)));

await writeJson("catalog/channel/tamil_live_tv.json", { metas: channelMetas });
for (const meta of channelMetas) allMeta.set(`channel/${meta.id}`, meta);

for (const [key, meta] of allMeta.entries()) {
  const [type, id] = key.split("/");
  await writeJson(`meta/${type}/${id}.json`, { meta });
}
console.log(`TamilFlix build complete: ${catalogDefs.length + 1} catalogs, ${allMeta.size} metadata records.`);
