# Roommate Ball Knowledge

A pick 'em stats site for an NFL season survey among roommates: weekly
picks, season standings, per-person breakdowns, prediction contests, and
career stats. Multi-season -- a selector switches between years wherever
the page is season-scoped. Also tracks a separate, ongoing UFC
numbered-card pick contest (not season-scoped).

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
  history. "Total Points" is a grand total across every contest the
  house runs -- NFL pick 'em + Predictions + UFC, summed, with a
  per-contest breakdown -- not just the NFL season total.
- **Profile** (`profile.html`): everything about one person in one
  place -- career totals (same combined NFL + Predictions + UFC total
  as All-Time), this season's League/betting stats, and predictions
  performance, all behind a single name selector.
- **UFC** (`ufc.html`): a separate, never-resetting pick contest for
  numbered UFC cards -- Winner/Method/Round picks per fight, 1 point each.
  Cumulative standings across every card to date, plus a per-card fight-by-
  fight breakdown. Not season-scoped -- no season selector on this page.

Static site, no backend -- data is exported from a season-tracking workbook
into per-season JSON files under `data/<season>/` (`weekly_totals.json`,
`picks.json`, optionally `games.json` for betting odds and
`predictions.json` for that season's prediction contests), loaded
client-side. `data/seasons.json` lists which seasons exist; add a new one
there once its export lands, no code changes needed for the season-aware
pages -- All-Time and Profile's career section pick it up automatically too.

UFC's data lives separately under `data/ufc/` (`events.json`,
`weekly_totals.json`, `picks.json`, plus a `fights.json` per event) --
graded by `ufc-picks/grade.py` (see that folder's README), not
`export_json.py`.
