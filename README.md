# Roommate Ball Knowledge

A pick 'em stats site for a 2025-26 NFL season survey among roommates:
weekly picks, season standings, and per-person breakdowns.

- **League view** (`index.html`): season standings, week-by-week scores,
  final leaderboard, and most-picked/correct/missed teams across everyone.
- **Player Spotlight** (`player.html`): filter by name for individual KPIs,
  a weekly performance trend, and a full pick-by-pick log.

Static site, no backend -- data is exported from a season-tracking workbook
into the JSON files under `data/`, loaded client-side.
