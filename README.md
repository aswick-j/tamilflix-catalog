# TamilFlix — Nuvio Tamil catalog addon

A static, catalog-only Stremio-protocol addon intended for compatible clients such as Nuvio. It lists Tamil-original movies and series, manually curated Tamil-dubbed titles, and a manually curated Tamil live-TV **directory**.

**TamilFlix does not provide video streams, torrent links, playback URLs, or copyrighted media.** Playback for movies and series comes from separate, compatible stream addons or providers installed in Nuvio. Live TV entries are directory metadata only.

## Features

- Tamil movies combining the MDBList **Tamil Movies Digital** community list and TMDB Tamil-language discovery
- Popular Tamil movie catalog from TMDB
- Latest Tamil Releases: MDBList latest-release list merged with TMDB Tamil releases from the last 365 days, sorted newest release date first
- Popular Tamil series from TMDB
- Manually curated Tamil-dubbed movies and series using TMDB IDs
- Tamil live-TV channel directory
- IMDb IDs where available, with TMDB ID fallback so titles are not discarded
- Static JSON endpoints; no runtime server, database, or VPS
- GitHub Actions refreshes the generated catalog daily

## Catalog sources

The main **Tamil Movies** catalog merges the public MDBList list [Tamil Movies Digital](https://mdblist.com/lists/abinan97/tamil-movies-digital) with TMDB's Tamil-original-language discovery results. MDBList items are kept in the curator's order, and duplicate titles are merged by TMDB ID (or IMDb ID if TMDB ID is unavailable). TMDB discovery fills gaps and adds metadata.

The build reads both MDBList lists by username and slug and follows its pagination headers. The **Latest Tamil Releases** catalog combines [Latest Tamil Movie Release](https://mdblist.com/lists/prasanaramanaa/latest-tamil-movie-release) with TMDB Tamil-original-language releases from the last 365 days. Upcoming titles and items without full release dates are excluded, and results are sorted by exact release date descending (newest first). It does not publish your MDBList API key.

## Playback and ID compatibility

TamilFlix is a catalog and metadata addon, not a stream provider. To play movies or series, install and enable a compatible stream provider in Nuvio.

Catalog IDs prefer IMDb IDs (for example, \`tt1234567\`) because many Stremio providers use them. When TMDB has no IMDb mapping, TamilFlix keeps the title using its TMDB ID format (for example, \`tmdb:12345\`) rather than dropping it. MediaFusion's published ElfHosted manifest has advertised both \`tt\` and \`tmdb:\` stream ID prefixes; other providers may support different ID formats. Playback still depends on the provider's content coverage and configuration.

The live-TV catalog is a channel directory only. It does not contain channel stream URLs and cannot play live channels.

## Required GitHub Actions secrets

In this repository, open **Settings → Environments → dev → Environment secrets** and add:

- \`TMDB_READ_ACCESS_TOKEN\` — your TMDB API Read Access Token
- \`MDBLIST_API_KEY\` — your MDBList API key from [MDBList Preferences](https://mdblist.com/preferences)

Do not paste either key into source code, commit it, or send it in chat. Both secrets are required for a complete TamilFlix build. The TMDB secret can contain the Read Access Token (recommended) or the v3 API key; the build detects the format automatically. The workflow will stop rather than silently publish a catalogue without the MDBList-curated source.

MDBList's free API tier currently allows 1,000 API requests per day. TamilFlix fetches the list in pages, so a normal build uses only a small number of MDBList requests.

## Enable GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions**.
3. Open **Actions → Build TamilFlix catalog → Run workflow**.
4. Wait for the workflow to finish successfully.

The manifest URL for this repository is:

\`https://aswick-j.github.io/tamilflix-catalog/manifest.json\`

## Install in Nuvio

1. Open the manifest URL in a browser and verify it returns JSON.
2. In Nuvio, open **Settings → Addons** (or **Addons → Add Addon**, depending on app version).
3. Paste the manifest URL and install.
4. Refresh the catalog or Discover page.
5. Install/enable a separate compatible stream provider for playback.

## Add Tamil-dubbed titles

Edit \`data/tamil-dubbed.json\`:

\`\`\`json
{
  "movies": [12345, 67890],
  "series": [24680]
}
\`\`\`

Replace the example numbers with actual TMDB movie and TV IDs after verifying each title has Tamil audio. These example IDs are placeholders. Commit the change and run the workflow again.

## Add live-TV directory entries

Edit \`data/live-tv.json\`:

\`\`\`json
[
  {
    "id": "your-channel-id",
    "name": "Channel name",
    "category": "Entertainment",
    "description": "Short channel description",
    "website": "https://official-channel-website.example"
  }
]
\`\`\`

Use official/authorized logos and links only. The website is informational, not a stream URL. Verify current channel branding, status, and official websites before publishing the directory. Commit and rerun the workflow.

## Refresh schedule

The GitHub Actions workflow runs daily and can also be started manually. After editing curated data, use **Actions → Build TamilFlix catalog → Run workflow**.

## Troubleshooting

- **Titles appear but no streams:** Install and enable a compatible stream provider in Nuvio. TamilFlix itself has no stream endpoint.
- **A title has no stream:** Check whether your provider supports that title's IMDb or TMDB ID and whether it has a matching source.
- **MDBList source skipped:** Add the \`MDBLIST_API_KEY\` secret to the \`dev\` environment and rerun the workflow.
- **404 on manifest:** Check Pages is enabled with GitHub Actions and the workflow completed successfully.
- **Build fails:** Check the Actions log for an invalid secret, MDBList API error, or TMDB API error.
- **Dubbed catalogs empty:** Add verified TMDB IDs to \`data/tamil-dubbed.json\`.

## License and attribution

MDBList data is retrieved through its API and remains subject to MDBList's terms. TMDB data and images are subject to TMDB's terms and attribution requirements. TamilFlix is not endorsed or certified by MDBList or TMDB.
