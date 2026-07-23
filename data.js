const PALETTE = {
  navy: "#0A1424", panel: "#15213A", gold: "#F2B84D", goldDim: "#A6803C",
  green: "#3DD68C", red: "#F06B70", blue: "#6C9BF5", text: "#F0F2F7", muted: "#92A0B5",
};

const PERSON_COLORS = {
  "Abe Stockwell": "#F2B84D",
  "Anthony Biancalana": "#3DD68C",
  "Jacob Dyce": "#6C9BF5",
  "Nick Kerkhoff": "#F06B70",
  "Noah Streveler": "#D4A5F5",
};

function toObjects({ fields, rows }) {
  return rows.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

async function loadSeasons() {
  return fetch("data/seasons.json").then(r => r.json());
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

function teamPickStats(picks, { person = null, questionType = "Game Pick" } = {}) {
  const filtered = picks.filter(p => p.questionType === questionType && (person ? p.person === person : true));
  const byPerson = {};
  for (const p of filtered) {
    byPerson[p.person] ??= { picked: {}, correct: {}, incorrect: {} };
    const bucket = byPerson[p.person];
    bucket.picked[p.team] = (bucket.picked[p.team] || 0) + 1;
    if (p.result === "Correct") bucket.correct[p.team] = (bucket.correct[p.team] || 0) + 1;
    if (p.result === "Incorrect") bucket.incorrect[p.team] = (bucket.incorrect[p.team] || 0) + 1;
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
  // competition ranking: ties share a rank (e.g. 1,2,2,4), not sequential position
  return 1 + board.filter(r => r.points > mine.points).length;
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
const BET_TIERS = [
  { label: "$1 game / $5 bonus", game: 1, bonus: 5 },
  { label: "$10 game / $50 bonus", game: 10, bonus: 50 },
  { label: "$100 game / $500 bonus", game: 100, bonus: 500 },
];

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
