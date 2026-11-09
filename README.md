# TamilFlix — Nuvio Tamil catalog addon

A static, catalog-only Stremio-protocol addon intended for compatible clients such as Nuvio. It lists Tamil-original movies and series, manually curated Tamil-dubbed titles, and a manually curated Tamil live-TV **directory**.

**It does not provide video streams, torrent links, playback URLs, or copyrighted media.** Live TV entries are directory metadata only.

## Features

- Tamil-original movies and series (TMDB original-language metadata)
- Popular and recent Tamil movie catalogs
- Popular Tamil series
- Manually curated Tamil-dubbed movies and series using TMDB IDs
- Tamil live-TV channel directory
- Static JSON endpoints; no runtime server, database, or VPS
- GitHub Actions refreshes the generated catalog daily

## Important limitations

1. TMDB does not reliably identify every dubbed audio track. Add only titles you have verified are available with Tamil audio to `data/tamil-dubbed.json`.
2. The live-TV catalog is a channel directory only. It contains no stream URLs or playback functionality.
3. A TMDB API Read Access Token is required for catalog generation. It is used only by GitHub Actions and is not published in generated files.
4. Nuvio may display channel cards, but resolving playback sources from other addons depends on Nuvio's channel-provider matching behavior and is not guaranteed by this catalog addon.

## Setup

### 1. Add your TMDB API token

Create a TMDB account and generate an **API Read Access Token** in your account's API settings.

In this repository, open **Settings → Secrets and variables → Actions** and create a repository secret named:

`TMDB_READ_ACCESS_TOKEN`

Paste the TMDB API Read Access Token as its value. Do not put the token in source code or commit it.

### 2. Enable GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions**.
3. Add the `TMDB_READ_ACCESS_TOKEN` secret before running the workflow.
4. Open **Actions → Build TamilFlix catalog → Run workflow**.
5. Wait for the workflow to finish successfully.

The manifest URL for this repository is:

`https://aswick-j.github.io/tamilflix-catalog/manifest.json`

### 3. Install in Nuvio

1. Open the manifest URL in a browser and verify it returns JSON.
2. In Nuvio, open **Settings → Addons** (or **Addons → Add Addon**, depending on app version).
3. Paste the manifest URL and install.
4. Refresh the catalog or Discover page.

The addon declares catalog and metadata resources only; it does not declare a stream resource.

## Add Tamil-dubbed titles

Edit `data/tamil-dubbed.json`:

```json
{
  "movies": [12345, 67890],
  "series": [24680]
}
```

Replace the example numbers with actual TMDB movie and TV IDs after verifying each title has Tamil audio. These example IDs are placeholders. Commit the change and run the workflow again.

## Add live-TV directory entries

Edit `data/live-tv.json`:

```json
[
  {
    "id": "your-channel-id",
    "name": "Channel name",
    "category": "Entertainment",
    "description": "Short channel description",
    "website": "https://official-channel-website.example"
  }
]
```

Use official/authorized logos and links only. The website is informational, not a stream URL. Verify current channel branding, status, and official websites before publishing the directory. Commit and rerun the workflow.

## Refresh schedule

The GitHub Actions workflow runs daily and can also be started manually. After editing curated data, use **Actions → Build TamilFlix catalog → Run workflow**.

## Troubleshooting

- **404 on manifest:** Check Pages is enabled with GitHub Actions and the workflow completed successfully.
- **Build fails:** Check the Actions log for a missing/invalid `TMDB_READ_ACCESS_TOKEN` or TMDB API errors.
- **Dubbed catalogs empty:** Add verified TMDB IDs to `data/tamil-dubbed.json`.
- **Nuvio does not show the addon:** Confirm the HTTPS manifest URL returns JSON and your Nuvio version supports Stremio-protocol catalog addons.

## License and attribution

TMDB data and images are subject to TMDB's terms and attribution requirements. This product uses the TMDB API but is not endorsed or certified by TMDB. Review TMDB's current branding and attribution requirements before public use.
