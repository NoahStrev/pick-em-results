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
  const [weeklyTotalsRaw, picksRaw] = await Promise.all([
    fetch(`data/${season}/weekly_totals.json`).then(r => r.json()),
    fetch(`data/${season}/picks.json`).then(r => r.json()),
  ]);
  const weeklyTotals = toObjects(weeklyTotalsRaw);
  const people = [...new Set(weeklyTotals.map(r => r.person))].sort();
  return { weeklyTotals, picks: toObjects(picksRaw), people };
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
