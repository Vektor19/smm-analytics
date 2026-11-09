import { loadData } from "./data.js";
import * as A from "./analytics.js";
import * as C from "./charts.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (iso, opts = { day: "numeric", month: "long", year: "numeric" }) =>
  new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso + "Z").toLocaleDateString("uk-UA", { ...opts, timeZone: "UTC" });

const state = {
  platform: store.get("smm-platform") || "all",
  days: Number(store.get("smm-days")) || 30,
  sortBy: "er",
  limit: 10,
};
let data;

const ICONS = {
  followers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  reach: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  likes: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  er: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  posts: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M8 8h8M8 16h5"/>',
};

function delta(current, previous, { percent = true, unit = "" } = {}) {
  if (previous === null || previous === undefined || current === null) return `<span class="kpi-delta flat">немає даних для порівняння</span>`;
  const diff = current - previous;
  const cls = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
  const arrow = cls === "up" ? "▲" : cls === "down" ? "▼" : "•";
  const text = percent
    ? (previous === 0 ? "—" : `${Math.abs(diff / previous * 100).toFixed(1)}%`)
    : `${Math.abs(diff).toFixed(2)}${unit}`;
  return `<span class="kpi-delta ${cls}">${arrow} ${text} <span class="vs">vs попер. ${state.days} дн.</span></span>`;
}

function kpiCard(key, label, value, deltaHtml, title = "") {
  return `<article class="card kpi" ${title ? `title="${esc(title)}"` : ""}>
    <div class="kpi-label"><span class="kpi-icon"><svg viewBox="0 0 24 24">${ICONS[key]}</svg></span>${label}</div>
    <div class="kpi-value">${value}</div>
    ${deltaHtml}
  </article>`;
}

function renderKpis() {
  const k = A.kpis(data, state.platform, state.days);
  const f = k.followers;
  const fCls = f.change > 0 ? "up" : f.change < 0 ? "down" : "flat";
  const fDelta = `<span class="kpi-delta ${fCls}">${f.change >= 0 ? "▲ +" : "▼ −"}${C.nf.format(Math.abs(f.change))}
    (${(Math.abs(f.change) / (f.base || 1) * 100).toFixed(1)}%) <span class="vs">за ${state.days} дн.</span></span>`;
  $("kpis").innerHTML = [
    kpiCard("followers", "Підписники", C.nf.format(f.value), fDelta),
    kpiCard("reach", "Охоплення", C.compact.format(k.reach.value), delta(k.reach.value, k.reach.previous), "Сума денного охоплення за період"),
    kpiCard("likes", "Лайки", C.compact.format(k.likes.value), delta(k.likes.value, k.likes.previous)),
    kpiCard("er", "Engagement rate", k.er.value === null ? "—" : `${k.er.value.toFixed(2)}%`,
      delta(k.er.value, k.er.previous, { percent: false, unit: " п.п." }), "Середній ER публікацій: (лайки + коментарі + репости + збереження) / підписники × 100"),
    kpiCard("posts", "Публікації", C.nf.format(k.posts.value), delta(k.posts.value, k.posts.previous)),
  ].join("");
}

function renderCharts() {
  C.followersChart(A.followersSeries(data, state.platform, state.days));
  const reach = A.reachSeries(data, state.platform, state.days);
  $("reachSubtitle").textContent = reach.weekly ? "Сума по тижнях: охоплення (стовпці) і взаємодії (лінія)" : "По днях: охоплення (стовпці) і взаємодії (лінія)";
  C.reachChart(reach);
  C.engagementChart(A.engagementBreakdown(data, state.platform, state.days));
  C.platformChart(A.platformComparison(data, state.days));
  C.weekdayChart(A.WEEKDAYS, A.weekdayEr(data, state.platform, state.days));
}

function initials(platform) {
  return { Instagram: "IG", TikTok: "TT", Facebook: "FB", YouTube: "YT" }[platform] || platform.slice(0, 2).toUpperCase();
}

function renderTable() {
  const { total, items } = A.topPosts(data, state.platform, state.days, state.sortBy, state.limit);
  const colors = Object.fromEntries(data.accounts.map((a) => [a.id, a.color]));
  const maxEr = Math.max(...items.map((p) => p.er), 1);
  $("postsSubtitle").textContent = `Топ-${Math.min(state.limit, total)} з ${total} публікацій за обраний період`;
  $("postsBody").innerHTML = items.length ? items.map((p, i) => `
    <tr>
      <td class="num"><span class="rank ${i < 3 ? "r" + (i + 1) : ""}">${i + 1}</span></td>
      <td>
        <div class="post-cell">
          <span class="thumb" style="background:${colors[p.accountId]}">${initials(p.platform)}</span>
          <div>
            <div class="post-title">${esc(p.title)}</div>
            <div class="post-meta">${esc(p.type)} · ${fmtDate(p.publishedAt, { day: "numeric", month: "short" })}, ${p.publishedAt.slice(11, 16)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge"><span class="pdot" style="background:${colors[p.accountId]}"></span>${esc(p.platform)}</span></td>
      <td class="num">${C.nf.format(p.reach)}</td>
      <td class="num">${C.nf.format(p.likes)}</td>
      <td class="num">${C.nf.format(p.comments)}</td>
      <td class="num">${C.nf.format(p.shares)}</td>
      <td class="num">${C.nf.format(p.saves)}</td>
      <td class="num er-cell"><span class="er-bar" style="width:${Math.round(p.er / maxEr * 48)}px"></span>${p.er.toFixed(2)}%</td>
    </tr>`).join("") : `<tr><td colspan="9" class="muted" style="text-align:center;padding:28px">Немає публікацій за цей період</td></tr>`;
}

function renderHeader() {
  const { current } = A.periods(data.meta.periodEnd, state.days);
  $("periodLabel").textContent = `${fmtDate(current[0])} — ${fmtDate(current[1])}`;
  for (const btn of $("platformFilter").children) btn.setAttribute("aria-checked", String(btn.dataset.value === state.platform));
  $("periodFilter").value = String(state.days);
}

function render() {
  renderHeader();
  renderKpis();
  renderCharts();
  renderTable();
}

function exportCsv() {
  const { items } = A.topPosts(data, state.platform, state.days, state.sortBy, state.limit);
  const head = ["rank", "platform", "type", "title", "publishedAt", "reach", "likes", "comments", "shares", "saves", "er"];
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = items.map((p, i) => [i + 1, p.platform, p.type, p.title, p.publishedAt, p.reach, p.likes, p.comments, p.shares, p.saves, p.er.toFixed(2)].map(quote).join(","));
  const blob = new Blob(["﻿" + [head.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `top-posts-${state.platform}-${state.days}d.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  store.set("smm-theme", root.dataset.theme);
  renderCharts();
}

function bindEvents() {
  $("platformFilter").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.platform = btn.dataset.value;
    store.set("smm-platform", state.platform);
    render();
  });
  $("periodFilter").addEventListener("change", (e) => {
    state.days = Number(e.target.value);
    store.set("smm-days", state.days);
    render();
  });
  $("sortSelect").addEventListener("change", (e) => { state.sortBy = e.target.value; renderTable(); });
  $("limitSelect").addEventListener("change", (e) => { state.limit = Number(e.target.value); renderTable(); });
  $("exportCsv").addEventListener("click", exportCsv);
  $("themeToggle").addEventListener("click", toggleTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) renderCharts(); });
}

async function main() {
  try {
    data = await loadData();
  } catch (err) {
    const el = $("error");
    el.hidden = false;
    el.textContent = `${err.message}. Відкрийте сайт через вебсервер (наприклад, python -m http.server), а не як файл.`;
    return;
  }

  // URL parameters (?platform=tt&days=90) override saved filters, so a filtered view can be shared as a link.
  const params = new URLSearchParams(location.search);
  if (params.has("platform")) state.platform = params.get("platform");
  if (params.has("days")) state.days = Number(params.get("days"));
  if (![7, 30, 90, 180].includes(state.days)) state.days = 30;
  if (state.platform !== "all" && !data.accounts.some((a) => a.id === state.platform)) state.platform = "all";

  $("brandName").textContent = `${data.accounts[0].name} · ${data.accounts.length} акаунти`;
  $("platformFilter").innerHTML = [`<button type="button" role="radio" data-value="all">Усі</button>`,
    ...data.accounts.map((a) => `<button type="button" role="radio" data-value="${a.id}"><span class="pdot" style="background:${a.color}"></span>${esc(a.platform)}</button>`)].join("");
  $("dataInfo").textContent = `Дані оновлено ${fmtDate(data.meta.generatedAt)} · ${data.posts.length} публікацій, ${data.daily.length} денних записів`;

  bindEvents();
  render();
}

main();
