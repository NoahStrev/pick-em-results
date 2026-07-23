# Roommate Ball Knowledge

A pick 'em stats site for an NFL season survey among roommates: weekly
picks, season standings, per-person breakdowns, prediction contests, and
career stats. Multi-season -- a selector switches between years wherever
the page is season-scoped.

- **League** (`index.html`): season standings, week-by-week scores, final
  leaderboard, most-picked/correct/missed teams, and hypothetical betting
  P/L across everyone.
- **Player Spotlight** (`player.html`): filter by name for individual
  KPIs, a weekly performance trend, betting P/L, and a full pick-by-pick
  log.
- **Predictions** (`predictions.html`): graded preseason and midseason
  prediction contests (NFL/NCAA awards, playoff results, Carroll
  University-specific questions), both surveys shown together -- a
  leaderboard, a question-by-question grid grouped by category, and a
  per-person breakdown.
- **All-Time** (`alltime.html`): career leaderboard and season-by-season
  history, aggregated across every season on record.
- **Profile** (`profile.html`): everything about one person in one
  place -- career totals, this season's League/betting stats, and
  predictions performance, all behind a single name selector.

Static site, no backend -- data is exported from a season-tracking workbook
into per-season JSON files under `data/<season>/` (`weekly_totals.json`,
`picks.json`, optionally `games.json` for betting odds and
`predictions.json` for that season's prediction contests), loaded
client-side. `data/seasons.json` lists which seasons exist; add a new one
there once its export lands, no code changes needed for the season-aware
pages -- All-Time and Profile's career section pick it up automatically too.
