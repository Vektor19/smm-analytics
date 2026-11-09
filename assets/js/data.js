// Data access layer. In the MVP the "database" is three JSON files that mirror the SQL tables in
// db/schema.sql. To move to a real backend, only these loaders need to change (e.g. fetch("/api/posts")).

const DATA_URL = "data";

async function getJson(name) {
  const res = await fetch(`${DATA_URL}/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Не вдалося завантажити ${name}.json (${res.status})`);
  return res.json();
}

export async function loadData() {
  const [accounts, daily, posts] = await Promise.all([getJson("accounts"), getJson("daily_stats"), getJson("posts")]);
  return {
    meta: accounts.meta,
    accounts: accounts.items,
    daily: daily.items,
    posts: posts.items.map((p) => ({ ...p, date: p.publishedAt.slice(0, 10) })),
  };
}
