const PALETTE = {
  navy: "#0A1424", panel: "#15213A", gold: "#F2B84D",
  green: "#3DD68C", red: "#F06B70", blue: "#6C9BF5", text: "#F0F2F7", muted: "#92A0B5",
};

const PERSON_COLORS = {
  "Abe Stockwell": "#F2B84D",
  "Anthony Biancalana": "#3DD68C",
  "Jacob Dyce": "#6C9BF5",
  "Nick Kerkhoff": "#F06B70",
  "Noah Streveler": "#D4A5F5",
};

// Shared Chart.js defaults -- identical on every page that renders a chart
// (League, Player Spotlight, Predictions, All-Time).
function initChartDefaults() {
  Chart.defaults.color = PALETTE.muted;
  Chart.defaults.borderColor = "#2B3D5E";
  Chart.defaults.font.family = "-apple-system, Segoe UI, Arial, sans-serif";
}

function toObjects({ fields, rows }) {
  return rows.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

async function loadSeasons() {
  return fetch("data/seasons.json").then(r => r.json());
}

function populateSeasonSelect(seasonSelect, seasons) {
  seasonSelect.innerHTML = seasons.map(s => `<option value="${s}">${s}</option>`).join("");
}

// Season from the ?season= URL param if it's one of the known seasons,
// otherwise the manifest's default.
function resolveSeason(seasons, defaultSeason) {
  const season = new URLSearchParams(location.search).get("season");
  return season && seasons.includes(season) ? season : defaultSeason;
}

function setSeasonInURL(season) {
  const url = new URL(location.href);
  url.searchParams.set("season", season);
  history.replaceState(null, "", url);
}

// Shared across every season-aware page's nav (League/Player Spotlight/
// Predictions/Profile) -- All-Time and UFC's links are intentionally
// static, both are season-agnostic (All-Time spans every season; UFC
// isn't season-scoped at all).
function updateNavLinks(season) {
  document.getElementById("navLeague").href = `index.html?season=${season}`;
  document.getElementById("navPlayer").href = `player.html?season=${season}`;
  document.getElementById("navPredictions").href = `predictions.html?season=${season}`;
  document.getElementById("navProfile").href = `profile.html?season=${season}`;
}

async function loadPredictions(season) {
  const res = await fetch(`data/${season}/predictions.json`);
  return res.ok ? await res.json() : { surveys: [] };
}

// Optional per-season file (site/data/<season>/predictions_odds.json) -- a
// season with no hand-compiled odds just means the Predictions page's
// betting section doesn't render, same "gracefully missing" pattern as
// games.json for the NFL side.
async function loadPredictionsOdds(season) {
  const res = await fetch(`data/${season}/predictions_odds.json`);
  return res.ok ? await res.json() : { textOdds: {}, winTotals: {} };
}

// Competition ranking: ties share a rank (e.g. 1,2,2,4), not sequential
// position -- 1 + how many rows strictly beat `value` on `key`.
function competitionRank(rows, value, key) {
  return 1 + rows.filter(r => r[key] > value).length;
}

function predictionsRank(survey, person) {
  const resp = survey.responses.find(r => r.person === person);
  if (!resp) return null;
  return { rank: competitionRank(survey.responses, resp.total, "total"), total: resp.total, possible: resp.possible };
}

// -- Predictions hypothetical betting --
// Treats each prediction question with a real, sourced sportsbook odds
// entry (predictions_odds.json) as a flat futures bet -- pick the right
// outcome and it pays like a real moneyline bet, same math as the NFL
// betting feature (decimalOdds/pickUnitProfit). A question with no real
// odds found simply doesn't participate, same as Carroll questions never
// having odds at all -- not an error, not a fabricated number.

// Mirrors predictions-survey/grade.py's norm() -- strip a trailing
// "(...)" annotation, lowercase, trim -- so "Mike Vrabel (Patriots)"
// matches an odds key of "mike vrabel".
function normalizePickName(s) {
  return String(s || "").replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

// "11-6" -> 11, "9-7-1" -> 9 -- the wins component of a guessed record,
// for grading a Packers/Bears "what will their record be" question as an
// Over/Under bet against the real preseason win-total line.
function parseWinsFromRecord(s) {
  const m = String(s || "").match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function winTotalPickProfit(givenRecord, wt) {
  const wins = parseWinsFromRecord(givenRecord);
  if (wins === null) return null;
  const pickedOver = wins > wt.line;
  const actualOver = wt.actual_wins > wt.line;
  const odds = pickedOver ? wt.over_odds : wt.under_odds;
  return pickedOver === actualOver ? decimalOdds(odds) - 1 : -1;
}

// { person -> total profit/loss } for one survey at a given flat bet size.
function predictionsBettingTotals(survey, oddsData, betAmount) {
  const textOdds = (oddsData.textOdds && oddsData.textOdds[survey.id]) || {};
  const winTotals = (oddsData.winTotals && oddsData.winTotals[survey.id]) || {};
  const out = {};
  for (const resp of survey.responses) {
    let total = 0;
    for (const q of survey.questions) {
      const given = resp.answers[q.id];
      if (given == null || Array.isArray(given)) continue; // no odds for multi-select questions
      let unitProfit = null;
      if (winTotals[q.id]) {
        unitProfit = winTotalPickProfit(given, winTotals[q.id]);
      } else if (textOdds[q.id]) {
        const odds = textOdds[q.id][normalizePickName(given)];
        if (odds !== undefined) {
          const correct = resp.scores[q.id] >= q.points;
          unitProfit = correct ? decimalOdds(odds) - 1 : -1;
        }
      }
      if (unitProfit !== null) total += unitProfit * betAmount;
    }
    out[resp.person] = total;
  }
  return out;
}

// How many questions in a survey actually had a real odds entry -- shown
// in the UI so "N of M questions" is honest about partial coverage
// instead of implying every question was bettable.
function predictionsBettableQuestionCount(survey, oddsData) {
  const textOdds = (oddsData.textOdds && oddsData.textOdds[survey.id]) || {};
  const winTotals = (oddsData.winTotals && oddsData.winTotals[survey.id]) || {};
  return survey.questions.filter(q => textOdds[q.id] || winTotals[q.id]).length;
}

async function loadData(season) {
  const [weeklyTotalsRaw, picksRaw, gamesRaw] = await Promise.all([
    fetch(`data/${season}/weekly_totals.json`).then(r => r.json()),
    fetch(`data/${season}/picks.json`).then(r => r.json()),
    fetch(`data/${season}/games.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const weeklyTotals = toObjects(weeklyTotalsRaw);
  const people = [...new Set(weeklyTotals.map(r => r.person))].sort();
  const games = gamesRaw ? toObjects(gamesRaw) : [];
  return { weeklyTotals, picks: toObjects(picksRaw), people, games };
}

function uniqueWeeksSorted(rows) {
  const seen = new Map();
  for (const r of rows) seen.set(r.week, r.weekOrder);
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([week]) => week);
}

function seasonStandingsSeries(weeklyTotals, people) {
  const weeks = uniqueWeeksSorted(weeklyTotals);
  return people.map(person => {
    const rows = weeklyTotals.filter(r => r.person === person);
    const byWeek = new Map(rows.map(r => [r.week, r.cumulativeEarned]));
    let last = null;
    const data = weeks.map(w => {
      if (byWeek.has(w)) { last = byWeek.get(w); return last; }
      return last; // carry forward through a missed week
    });
    return { person, data };
  });
}

function weekOverWeekGrid(weeklyTotals, people) {
  const weeks = uniqueWeeksSorted(weeklyTotals);
  const grid = people.map(person => {
    const rows = new Map(weeklyTotals.filter(r => r.person === person).map(r => [r.week, r.totalEarned]));
    return weeks.map(w => (rows.has(w) ? rows.get(w) : null));
  });
  // per-week winner (max), ties included
  const winners = weeks.map((_, j) => {
    const col = grid.map(row => row[j]).filter(v => v !== null);
    return col.length ? Math.max(...col) : null;
  });
  return { weeks, grid, winners };
}

function finalLeaderboard(weeklyTotals, people) {
  const finalWeekOrder = Math.max(...weeklyTotals.map(r => r.weekOrder));
  const rows = weeklyTotals.filter(r => r.weekOrder === finalWeekOrder);
  return rows
    .map(r => ({ person: r.person, points: r.cumulativeEarned }))
    .sort((a, b) => b.points - a.points);
}

// `field` is the property holding the picked value -- "team" for NFL Game/
// Guaranteed picks, "pick" for UFC Winner/Method/Round picks (fighter name,
// method, or round are all just "the value picked" under a different name).
function teamPickStats(picks, { person = null, questionType = "Game Pick", field = "team" } = {}) {
  const filtered = picks.filter(p => p.questionType === questionType && (person ? p.person === person : true));
  const byPerson = {};
  for (const p of filtered) {
    byPerson[p.person] ??= { picked: {}, correct: {}, incorrect: {} };
    const bucket = byPerson[p.person];
    const val = p[field];
    bucket.picked[val] = (bucket.picked[val] || 0) + 1;
    if (p.result === "Correct") bucket.correct[val] = (bucket.correct[val] || 0) + 1;
    if (p.result === "Incorrect") bucket.incorrect[val] = (bucket.incorrect[val] || 0) + 1;
  }
  function topOf(counts) {
    const entries = Object.entries(counts);
    if (!entries.length) return null;
    const maxCount = Math.max(...entries.map(([, c]) => c));
    const teams = entries.filter(([, c]) => c === maxCount).map(([t]) => t).sort();
    return { teams, count: maxCount, tie: teams.length > 1 };
  }
  const out = {};
  for (const [p, b] of Object.entries(byPerson)) {
    out[p] = { picked: topOf(b.picked), correct: topOf(b.correct), incorrect: topOf(b.incorrect) };
  }
  return out;
}

function pickAccuracy(picks, person) {
  const rows = picks.filter(p => p.person === person && p.result !== "Ungraded");
  if (!rows.length) return null;
  const correct = rows.filter(p => p.result === "Correct").length;
  return correct / rows.length;
}

function weeklyWinsCount(weeklyTotals, person) {
  const weeks = uniqueWeeksSorted(weeklyTotals);
  let wins = 0;
  for (const w of weeks) {
    const rows = weeklyTotals.filter(r => r.week === w);
    const max = Math.max(...rows.map(r => r.totalEarned));
    const mine = rows.find(r => r.person === person);
    if (mine && mine.totalEarned === max) wins++;
  }
  return wins;
}

function bestWeekScore(weeklyTotals, person) {
  const rows = weeklyTotals.filter(r => r.person === person);
  return rows.length ? Math.max(...rows.map(r => r.totalEarned)) : null;
}

function seasonRank(weeklyTotals, people, person) {
  const board = finalLeaderboard(weeklyTotals, people);
  const mine = board.find(r => r.person === person);
  if (!mine) return null;
  return competitionRank(board, mine.points, "points");
}

function seasonPoints(weeklyTotals, person) {
  return weeklyTotals.filter(r => r.person === person).reduce((s, r) => s + r.totalEarned, 0);
}

// -- All-Time / career stats (cross-season) --

async function loadAllSeasonsData(seasons) {
  const results = await Promise.all(seasons.map(s => loadData(s)));
  return seasons.map((season, i) => ({ season, ...results[i] }));
}

// Per-person career totals plus a season-by-season history, sorted by
// total career points descending. Missing a season entirely (not on that
// season's roster) is distinct from playing and scoring 0 -- history
// entries record `played: false` for the former.
function careerLeaderboard(allSeasonsData) {
  const people = [...new Set(allSeasonsData.flatMap(d => d.people))].sort();
  return people
    .map(person => {
      let totalPoints = 0, totalWins = 0, seasonsPlayed = 0;
      const history = allSeasonsData.map(({ season, weeklyTotals, people: seasonPeople }) => {
        if (!seasonPeople.includes(person)) return { season, played: false };
        const points = seasonPoints(weeklyTotals, person);
        const rank = seasonRank(weeklyTotals, seasonPeople, person);
        const wins = weeklyWinsCount(weeklyTotals, person);
        totalPoints += points;
        totalWins += wins;
        seasonsPlayed += 1;
        return { season, played: true, points, rank, wins };
      });
      return { person, totalPoints, totalWins, seasonsPlayed, history };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

async function loadAllPredictionsData(seasons) {
  return Promise.all(seasons.map(s => loadPredictions(s)));
}

// "All-time total points" per the user's own definition -- everything ever
// earned across every contest this house runs, not just the NFL pick 'em:
// NFL weekly pick 'em (careerLeaderboard's totalPoints) + every season's
// Predictions surveys (preseason/midseason, summed) + UFC's cumulative
// total to date. Three genuinely different point systems added together,
// not normalized -- a straight sum, since that's what was asked for.
// Returns careerRows enriched with nflPoints/predictionsPoints/ufcPoints/
// grandTotal, re-sorted by grandTotal descending (can reorder relative to
// NFL-only rank -- e.g. someone who skipped a Predictions survey another
// person took will fall behind on grandTotal even with a higher NFL total).
function grandCareerTotals(careerRows, allPredictionsData, ufcWeeklyTotals) {
  return careerRows
    .map(row => {
      let predictionsPoints = 0;
      for (const data of allPredictionsData) {
        for (const survey of data.surveys) {
          const resp = survey.responses.find(r => r.person === row.person);
          if (resp) predictionsPoints += resp.total;
        }
      }
      const ufcPoints = ufcWeeklyTotals
        .filter(r => r.person === row.person)
        .reduce((s, r) => s + r.totalEarned, 0);
      return {
        ...row,
        nflPoints: row.totalPoints,
        predictionsPoints,
        ufcPoints,
        grandTotal: row.totalPoints + predictionsPoints + ufcPoints,
      };
    })
    .sort((a, b) => b.grandTotal - a.grandTotal);
}

// Whole numbers print bare; anything with Predictions' fractional partial
// credit rounds to 2 decimals instead of showing a long float artifact.
function formatPoints(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function weeklyPerformanceSeries(weeklyTotals, weeks, person) {
  const personByWeek = new Map(weeklyTotals.filter(r => r.person === person).map(r => [r.week, r.totalEarned]));
  const personData = weeks.map(w => (personByWeek.has(w) ? personByWeek.get(w) : null));
  const avgData = weeks.map(w => {
    const rows = weeklyTotals.filter(r => r.week === w);
    if (!rows.length) return null;
    return rows.reduce((sum, r) => sum + r.totalEarned, 0) / rows.length;
  });
  return { personData, avgData };
}

// -- Hypothetical betting --
// Every Game Pick is treated as a flat moneyline bet on the picked team.
// Every Guaranteed Winner/Loser pick is treated as a flat moneyline "bonus" bet --
// a Guaranteed Loser bet is graded on the *opponent's* moneyline, since betting a
// team loses is the same wager as betting whoever they're playing wins. A pick on
// either side of a game that ended in a tie pushes (0 profit) regardless of how
// the pick 'em survey itself graded it, matching how real sportsbooks settle ties.
// Every pick (game or bonus) is graded and paid out independently -- there is no
// parlay logic anywhere in this file; pickUnitProfit() runs once per pick and the
// results are summed, never multiplied together across picks.

// Reads the two custom bet-amount <input>s (ids are the same on every page
// that has a betting section). Blank/negative/non-numeric input reads as 0
// rather than throwing, so a mid-typing empty field just shows $0 briefly.
function readBetAmounts() {
  const game = Math.max(0, Number(document.getElementById("gameAmountInput").value) || 0);
  const bonus = Math.max(0, Number(document.getElementById("bonusAmountInput").value) || 0);
  return { game, bonus };
}

function wireBetAmountInputs(onChange) {
  document.getElementById("gameAmountInput").addEventListener("input", onChange);
  document.getElementById("bonusAmountInput").addEventListener("input", onChange);
}

function formatMoney(n) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// green/red stat-value class for a signed dollar amount (win/loss/push)
function moneyClass(n) {
  return n > 0 ? "green" : n < 0 ? "red" : "";
}

// "Team, Team (count)" for a teamPickStats() top-of entry, or "--" if none
function formatTeamStat(s) {
  return s ? `${s.teams.join(", ")} (${s.count})` : "--";
}

// Renders a teamPickStats() result into a 3-column Roommate/<label>/Count
// table -- identical between League's team stats and UFC's fighter/method/
// round stats except for the middle column's header text.
function renderPickStatTable(id, statsObj, key, people, columnLabel) {
  const el = document.getElementById(id);
  el.innerHTML = `<tr><th>Roommate</th><th>${columnLabel}</th><th>Count</th></tr>` +
    people.map(p => {
      const s = statsObj[p]?.[key];
      return `<tr><td>${p}</td><td>${s ? s.teams.join(", ") : "--"}</td><td>${s ? s.count : "--"}</td></tr>`;
    }).join("");
}

// Shared season-stats block: KPI row (rank/points/accuracy/wins/best week) plus
// team-pick-stat rows (Game Pick, Guaranteed Winner, Guaranteed Loser) -- same
// DOM ids/markup on Player Spotlight and Profile's "this season" section.
function renderSeasonStats(weeklyTotals, picks, people, person) {
  document.getElementById("kpiRank").textContent = "#" + seasonRank(weeklyTotals, people, person);
  document.getElementById("kpiPoints").textContent = seasonPoints(weeklyTotals, person);
  const acc = pickAccuracy(picks, person);
  document.getElementById("kpiAccuracy").textContent = acc === null ? "--" : Math.round(acc * 100) + "%";
  document.getElementById("kpiWins").textContent = weeklyWinsCount(weeklyTotals, person);
  document.getElementById("kpiBest").textContent = bestWeekScore(weeklyTotals, person);

  const stats = teamPickStats(picks, { person })[person] || {};
  document.getElementById("mostPickedOut").textContent = formatTeamStat(stats.picked);
  document.getElementById("mostCorrectOut").textContent = formatTeamStat(stats.correct);
  document.getElementById("mostMissedOut").textContent = formatTeamStat(stats.incorrect);

  const gwStats = teamPickStats(picks, { person, questionType: "Weekly Winner Prediction" })[person] || {};
  document.getElementById("mostPickedGWOut").textContent = formatTeamStat(gwStats.picked);
  document.getElementById("mostWrongGWOut").textContent = formatTeamStat(gwStats.incorrect);

  const glStats = teamPickStats(picks, { person, questionType: "Weekly Loser Prediction" })[person] || {};
  document.getElementById("mostPickedGLOut").textContent = formatTeamStat(glStats.picked);
  document.getElementById("mostWrongGLOut").textContent = formatTeamStat(glStats.incorrect);
}

// Shared betting-KPI stat-row rendering (betGameOut/betBonusOut/betTotalOut) --
// identical on Player Spotlight and Profile; each page builds its own totals
// (and, on Player Spotlight, its own cumulative chart) around this.
function renderBettingStatRows(gameTotal, bonusTotal, total) {
  const gameEl = document.getElementById("betGameOut");
  gameEl.textContent = formatMoney(gameTotal);
  gameEl.className = "stat-value " + moneyClass(gameTotal);
  const bonusEl = document.getElementById("betBonusOut");
  bonusEl.textContent = formatMoney(bonusTotal);
  bonusEl.className = "stat-value " + moneyClass(bonusTotal);
  const totalEl = document.getElementById("betTotalOut");
  totalEl.textContent = formatMoney(total);
  totalEl.className = "stat-value " + moneyClass(total);
}

function decimalOdds(moneyline) {
  return moneyline < 0 ? 1 + 100 / Math.abs(moneyline) : 1 + moneyline / 100;
}

function buildGameLookup(games) {
  const m = new Map();
  for (const g of games) {
    const tie = g.winner === "TIE";
    m.set(`${g.week}|${g.teamA}`, { own: g.moneylineA, opp: g.moneylineB, tie });
    m.set(`${g.week}|${g.teamB}`, { own: g.moneylineB, opp: g.moneylineA, tie });
  }
  return m;
}

function pickUnitProfit(lookup, pick) {
  const entry = lookup.get(`${pick.week}|${pick.team}`);
  if (!entry || entry.tie) return 0;
  if (pick.result === "Incorrect") return -1;
  if (pick.result !== "Correct") return 0; // defensive: no ungraded picks expected
  const ml = pick.questionType === "Weekly Loser Prediction" ? entry.opp : entry.own;
  return decimalOdds(ml) - 1;
}

// Returns { person -> { game: unitProfit, bonus: unitProfit } } summed across the whole season.
function bettingUnitTotals(games, picks, people) {
  const lookup = buildGameLookup(games);
  const out = {};
  for (const p of people) out[p] = { game: 0, bonus: 0 };
  for (const pk of picks) {
    if (!out[pk.person]) continue;
    const up = pickUnitProfit(lookup, pk);
    const key = pk.questionType === "Game Pick" ? "game" : "bonus";
    out[pk.person][key] += up;
  }
  return out;
}

// Season-long profit/loss per person at a given bet-size tier, sorted descending by total.
function bettingLeaderboard(games, picks, people, tier) {
  const units = bettingUnitTotals(games, picks, people);
  return people
    .map(person => {
      const gameDollars = units[person].game * tier.game;
      const bonusDollars = units[person].bonus * tier.bonus;
      return { person, game: gameDollars, bonus: bonusDollars, total: gameDollars + bonusDollars };
    })
    .sort((a, b) => b.total - a.total);
}

// Cumulative total profit/loss by week for one person at a given tier -- for a running chart.
function bettingCumulativeSeries(games, picks, weeks, person, tier) {
  const lookup = buildGameLookup(games);
  const gameByWeek = new Map(weeks.map(w => [w, 0]));
  const bonusByWeek = new Map(weeks.map(w => [w, 0]));
  for (const pk of picks) {
    if (pk.person !== person) continue;
    const up = pickUnitProfit(lookup, pk);
    const map = pk.questionType === "Game Pick" ? gameByWeek : bonusByWeek;
    if (map.has(pk.week)) map.set(pk.week, map.get(pk.week) + up);
  }
  let running = 0;
  return weeks.map(w => {
    running += gameByWeek.get(w) * tier.game + bonusByWeek.get(w) * tier.bonus;
    return running;
  });
}

// -- UFC (numbered-card pick contest) --
// Modeled as one continuous, never-resetting competition rather than a
// per-season one -- "week"/"weekOrder" in weekly_totals.json and picks.json
// hold the event's label ("UFC 300") and chronological order, so every
// function above that's already generic over those field names
// (uniqueWeeksSorted, seasonStandingsSeries, weekOverWeekGrid,
// finalLeaderboard, weeklyWinsCount, bestWeekScore, seasonRank, seasonPoints,
// teamPickStats via its `field` option) works here unmodified. Only the
// loading and per-event fight-card pieces below are UFC-specific.

async function loadUfcEvents() {
  const res = await fetch("data/ufc/events.json");
  return res.ok ? (await res.json()).events : [];
}

async function loadUfcData() {
  const [weeklyTotalsRaw, picksRaw] = await Promise.all([
    fetch("data/ufc/weekly_totals.json").then(r => r.json()),
    fetch("data/ufc/picks.json").then(r => r.json()),
  ]);
  const weeklyTotals = toObjects(weeklyTotalsRaw);
  const people = [...new Set(weeklyTotals.map(r => r.person))].sort();
  return { weeklyTotals, picks: toObjects(picksRaw), people };
}

// One event's fight card (matchups + actual results), keyed by event id.
// Not present until that event has been graded -- a missing file just means
// "not graded yet", not an error.
async function loadUfcFights(eventId) {
  const res = await fetch(`data/ufc/${eventId}/fights.json`);
  return res.ok ? await res.json() : [];
}
