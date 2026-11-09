// Pure functions that turn raw rows into dashboard numbers. No DOM access here.

const DAY_MS = 86400000;

export const engagements = (r) => r.likes + r.comments + r.shares + r.saves;

/** ER of a post: (likes + comments + shares + saves) / followers at publish time × 100. */
export const postEr = (p) => (engagements(p) / p.followersAtPublish) * 100;

const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** [from, to] inclusive ISO dates for the last `days` days ending at `end`, and the same-length period before it. */
export function periods(end, days) {
  const from = addDays(end, -(days - 1));
  return { current: [from, end], previous: [addDays(from, -days), addDays(from, -1)] };
}

const inRange = (date, [from, to]) => date >= from && date <= to;

export function filterRows(rows, platform, range) {
  return rows.filter((r) => (platform === "all" || r.accountId === platform) && inRange(r.date, range));
}

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Total followers on a given date across the selected accounts. */
function followersOn(daily, platform, date) {
  return sum(daily.filter((r) => r.date === date && (platform === "all" || r.accountId === platform)), "followers");
}

export function kpis(data, platform, days) {
  const { current, previous } = periods(data.meta.periodEnd, days);
  const hasPrevious = previous[0] >= data.meta.periodStart;

  const cur = filterRows(data.daily, platform, current);
  const prev = hasPrevious ? filterRows(data.daily, platform, previous) : [];
  const curPosts = filterRows(data.posts, platform, current);
  const prevPosts = hasPrevious ? filterRows(data.posts, platform, previous) : [];

  const followersEnd = followersOn(data.daily, platform, current[1]);
  const followersStart = followersOn(data.daily, platform, current[0]);

  const pick = (curVal, prevVal) => ({ value: curVal, previous: hasPrevious ? prevVal : null });
  return {
    followers: { value: followersEnd, change: followersEnd - followersStart, base: followersStart },
    reach: pick(sum(cur, "reach"), sum(prev, "reach")),
    likes: pick(sum(cur, "likes"), sum(prev, "likes")),
    er: pick(avg(curPosts.map(postEr)), avg(prevPosts.map(postEr))),
    posts: pick(curPosts.length, prevPosts.length),
  };
}

/** Followers per day, one series per account (or a single one when a platform is selected). */
export function followersSeries(data, platform, days) {
  const { current } = periods(data.meta.periodEnd, days);
  const accounts = data.accounts.filter((a) => platform === "all" || a.id === platform);
  const dates = [...new Set(filterRows(data.daily, "all", current).map((r) => r.date))].sort();
  return {
    labels: dates,
    series: accounts.map((a) => {
      const byDate = new Map(data.daily.filter((r) => r.accountId === a.id).map((r) => [r.date, r.followers]));
      return { account: a, values: dates.map((d) => byDate.get(d) ?? null) };
    }),
  };
}

/** Monday of the ISO week for a date. */
function weekStart(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -shift);
}

/** Reach and engagements per day (≤ 31 days) or per week (longer periods). */
export function reachSeries(data, platform, days) {
  const { current } = periods(data.meta.periodEnd, days);
  const rows = filterRows(data.daily, platform, current);
  const weekly = days > 31;
  const buckets = new Map();
  for (const r of rows) {
    const key = weekly ? weekStart(r.date) : r.date;
    const b = buckets.get(key) || { reach: 0, engagements: 0 };
    b.reach += r.reach;
    b.engagements += engagements(r);
    buckets.set(key, b);
  }
  const labels = [...buckets.keys()].sort();
  return { weekly, labels, reach: labels.map((k) => buckets.get(k).reach), engagements: labels.map((k) => buckets.get(k).engagements) };
}

export function engagementBreakdown(data, platform, days) {
  const rows = filterRows(data.daily, platform, periods(data.meta.periodEnd, days).current);
  return { likes: sum(rows, "likes"), comments: sum(rows, "comments"), shares: sum(rows, "shares"), saves: sum(rows, "saves") };
}

export function platformComparison(data, days) {
  const range = periods(data.meta.periodEnd, days).current;
  return data.accounts.map((a) => {
    const posts = filterRows(data.posts, a.id, range);
    return { account: a, er: avg(posts.map(postEr)) ?? 0, posts: posts.length, reach: sum(filterRows(data.daily, a.id, range), "reach") };
  });
}

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export function weekdayEr(data, platform, days) {
  const posts = filterRows(data.posts, platform, periods(data.meta.periodEnd, days).current);
  const groups = WEEKDAYS.map(() => []);
  for (const p of posts) groups[(new Date(p.date + "T00:00:00Z").getUTCDay() + 6) % 7].push(postEr(p));
  return groups.map((g) => ({ er: avg(g) ?? 0, count: g.length }));
}

export function topPosts(data, platform, days, sortBy, limit) {
  const posts = filterRows(data.posts, platform, periods(data.meta.periodEnd, days).current).map((p) => ({ ...p, er: postEr(p) }));
  posts.sort((a, b) => b[sortBy] - a[sortBy]);
  return { total: posts.length, items: posts.slice(0, limit) };
}
