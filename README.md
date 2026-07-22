# Roommate Ball Knowledge

A pick 'em stats site for an NFL season survey among roommates: weekly
picks, season standings, and per-person breakdowns. Multi-season -- a
selector on both pages switches between years.

- **League view** (`index.html`): season standings, week-by-week scores,
  final leaderboard, and most-picked/correct/missed teams across everyone.
- **Player Spotlight** (`player.html`): filter by name for individual KPIs,
  a weekly performance trend, and a full pick-by-pick log.

Static site, no backend -- data is exported from a season-tracking workbook
into per-season JSON files under `data/<season>/`, loaded client-side.
`data/seasons.json` lists which seasons exist; add a new one there once its
export lands, no code changes needed.
