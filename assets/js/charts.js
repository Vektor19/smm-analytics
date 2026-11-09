// Chart.js wrappers. Colors come from CSS custom properties so charts follow the light/dark theme.
/* global Chart */

const charts = new Map();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const nf = new Intl.NumberFormat("uk-UA");
export const compact = new Intl.NumberFormat("uk-UA", { notation: "compact", maximumFractionDigits: 1 });

const shortDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });

function baseOptions() {
  const muted = css("--muted");
  const grid = css("--grid-line");
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = muted;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 16 } },
      tooltip: {
        backgroundColor: css("--surface"), titleColor: css("--text"), bodyColor: css("--text"),
        borderColor: css("--border"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 18 } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { callback: (v) => compact.format(v) } },
    },
  };
}

function draw(id, config) {
  charts.get(id)?.destroy();
  charts.set(id, new Chart(document.getElementById(id), config));
}

const withAlpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, "0");

export function followersChart({ labels, series }) {
  const opts = baseOptions();
  opts.plugins.legend.display = series.length > 1;
  opts.plugins.tooltip.callbacks = { title: (items) => shortDate(labels[items[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${nf.format(c.raw)}` };
  opts.scales.x.ticks.callback = (_, i) => shortDate(labels[i]);
  opts.scales.y.beginAtZero = false;
  draw("followersChart", {
    type: "line",
    data: {
      labels,
      datasets: series.map(({ account, values }) => ({
        label: account.platform, data: values, borderColor: account.color, backgroundColor: withAlpha(account.color, 0.12),
        fill: series.length === 1, tension: 0.35, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4,
      })),
    },
    options: opts,
  });
}

export function reachChart({ labels, reach, engagements, weekly }) {
  const accent = css("--accent");
  const opts = baseOptions();
  const fmt = (iso) => (weekly ? "тиж. " : "") + shortDate(iso);
  opts.scales.x.ticks.callback = (_, i) => fmt(labels[i]);
  opts.scales.y1 = { position: "right", grid: { display: false }, border: { display: false }, ticks: { callback: (v) => compact.format(v) } };
  opts.plugins.tooltip.callbacks = { title: (items) => fmt(labels[items[0].dataIndex]), label: (c) => ` ${c.dataset.label}: ${nf.format(c.raw)}` };
  draw("reachChart", {
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Охоплення", data: reach, backgroundColor: withAlpha(accent, 0.55), borderRadius: 4, maxBarThickness: 28, yAxisID: "y", order: 2 },
        { type: "line", label: "Взаємодії", data: engagements, borderColor: "#f08c2e", backgroundColor: "#f08c2e", tension: 0.35, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, yAxisID: "y1", order: 1 },
      ],
    },
    options: opts,
  });
}

export const ENGAGEMENT_COLORS = { likes: "#e5486f", comments: "#5b5bd6", shares: "#1fa38a", saves: "#f0a92e" };
export const ENGAGEMENT_LABELS = { likes: "Лайки", comments: "Коментарі", shares: "Репости", saves: "Збереження" };

export function engagementChart(breakdown) {
  const keys = Object.keys(ENGAGEMENT_LABELS);
  const total = keys.reduce((s, k) => s + breakdown[k], 0) || 1;
  draw("engagementChart", {
    type: "doughnut",
    data: {
      labels: keys.map((k) => ENGAGEMENT_LABELS[k]),
      datasets: [{ data: keys.map((k) => breakdown[k]), backgroundColor: keys.map((k) => ENGAGEMENT_COLORS[k]), borderColor: css("--surface"), borderWidth: 3, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%", animation: { duration: 350 },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12, color: css("--text"),
            generateLabels: (chart) => chart.data.labels.map((label, i) => ({
              text: `${label}  ${(chart.data.datasets[0].data[i] / total * 100).toFixed(1)}%`,
              fillStyle: chart.data.datasets[0].backgroundColor[i], strokeStyle: "transparent", fontColor: css("--text"), pointStyle: "circle", index: i,
            })),
          },
        },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${nf.format(c.raw)}` } },
      },
    },
    plugins: [{
      id: "centerText",
      afterDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0).data[0];
        if (!meta) return;
        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = css("--text");
        ctx.font = "700 17px Inter, sans-serif";
        ctx.fillText(compact.format(total), meta.x, meta.y + 1);
        ctx.fillStyle = css("--muted");
        ctx.font = "500 11px Inter, sans-serif";
        ctx.fillText("взаємодій", meta.x, meta.y + 17);
        ctx.restore();
      },
    }],
  });
}

export function platformChart(rows) {
  const opts = baseOptions();
  opts.indexAxis = "y";
  opts.plugins.legend.display = false;
  opts.scales.x = { grid: { color: css("--grid-line") }, border: { display: false }, ticks: { callback: (v) => v + "%" } };
  opts.scales.y = { grid: { display: false }, border: { display: false }, ticks: { color: css("--text"), font: { weight: 500 } } };
  opts.plugins.tooltip.callbacks = {
    label: (c) => ` ER: ${c.raw.toFixed(2)}%`,
    afterLabel: (c) => ` Публікацій: ${rows[c.dataIndex].posts} · охоплення: ${nf.format(rows[c.dataIndex].reach)}`,
  };
  draw("platformChart", {
    type: "bar",
    data: {
      labels: rows.map((r) => r.account.platform),
      datasets: [{ data: rows.map((r) => r.er), backgroundColor: rows.map((r) => withAlpha(r.account.color, 0.85)), borderRadius: 6, maxBarThickness: 26 }],
    },
    options: opts,
  });
}

export function weekdayChart(labels, rows) {
  const best = Math.max(...rows.map((r) => r.er));
  const accent = css("--accent");
  const opts = baseOptions();
  opts.plugins.legend.display = false;
  opts.scales.y.ticks.callback = (v) => v + "%";
  opts.plugins.tooltip.callbacks = { label: (c) => ` Середній ER: ${c.raw.toFixed(2)}%`, afterLabel: (c) => ` Публікацій: ${rows[c.dataIndex].count}` };
  draw("weekdayChart", {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: rows.map((r) => r.er),
        backgroundColor: rows.map((r) => (r.er === best && best > 0 ? "#f0a92e" : withAlpha(accent, 0.55))),
        borderRadius: 6, maxBarThickness: 46,
      }],
    },
    options: opts,
  });
}
