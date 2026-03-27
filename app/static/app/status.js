// ── Theme toggle ────────────────────────────────────────────────────────────

function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  document.getElementById("theme-track").classList.toggle("on", isLight);
  document.getElementById("theme-lbl").textContent = isLight ? "light" : "dark";
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

(function restoreTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
    document.getElementById("theme-track").classList.add("on");
    document.getElementById("theme-lbl").textContent = "light";
  }
})();

// ── Compression ──────────────────────────────────────────────────────────────
// Graduated left-priority compression:
//   Start with raw bars (one per check).
//   If over MAX_BARS, repeatedly find the leftmost adjacent same-state pair
//   and merge them — until within MAX_BARS or no merges remain (fully RLE'd).
//   If still over MAX_BARS after full RLE, that's fine — it's real data.
//   A merged bar is red if ANY check in it was down — no outage is ever hidden.
// Override the target via window.STATUS_MAX_BARS before this script loads.

const MAX_BARS = window.STATUS_MAX_BARS ?? 60;

function compressBars(checks) {
  if (!checks.length) return { labels: [], upVals: [], upColors: [] };

  // Build one bar per check
  let bars = checks.map(c => ({ up: c.up, tStart: c.t, tEnd: c.t, count: 1 }));

  while (bars.length > MAX_BARS) {
    // Find leftmost adjacent same-state pair and merge
    let merged = false;
    for (let i = 0; i < bars.length - 1; i++) {
      if (bars[i].up === bars[i + 1].up) {
        bars.splice(i, 2, {
          up:     bars[i].up && bars[i + 1].up,
          tStart: bars[i].tStart,
          tEnd:   bars[i + 1].tEnd,
          count:  bars[i].count + bars[i + 1].count,
        });
        merged = true;
        break;
      }
    }
    if (!merged) break; // fully RLE'd, nothing left to merge
  }

  return barsToChart(bars);
}

function rawBars(checks) {
  return barsToChart(checks.map(c => ({ up: c.up, tStart: c.t, tEnd: c.t, count: 1 })));
}

function barsToChart(bars) {
  return {
    labels:   bars.map(b => {
      const t1 = new Date(b.tStart).toLocaleTimeString();
      const t2 = new Date(b.tEnd).toLocaleTimeString();
      return b.count > 1 ? `${t1} – ${t2} (${b.count})` : t1;
    }),
    upVals:   bars.map(b => b.up ? 1 : 0),
    upColors: bars.map(b => b.up ? "#22c55e" : "#ef4444"),
  };
}

// ── Chart setup ──────────────────────────────────────────────────────────────

const charts = {};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: true,
  animation: false,
  plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
  scales: {
    x: { display: false },
    y: { grid: { color: "#1e1e22" }, ticks: { color: "#6b6b7a", font: { family: "IBM Plex Mono", size: 10 } } }
  }
};

function mkCharts(id) {
  const upCtx = document.getElementById(`updown-${id}`);
  const rtCtx = document.getElementById(`rt-${id}`);

  charts[`up-${id}`] = new Chart(upCtx, {
    type: "bar",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 2, barThickness: 6 }] },
    options: {
      ...chartDefaults,
      scales: {
        ...chartDefaults.scales,
        y: {
          ...chartDefaults.scales.y,
          min: 0, max: 1,
          ticks: { ...chartDefaults.scales.y.ticks, callback: v => v === 1 ? "UP" : "DN", stepSize: 1 }
        }
      }
    }
  });

  charts[`rt-${id}`] = new Chart(rtCtx, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: "#6366f1", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: "rgba(99,102,241,0.06)" }] },
    options: { ...chartDefaults }
  });
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadDomain(id, hours) {
  const res = await fetch(`/api/domain/${id}/?hours=${hours}`);
  const data = await res.json();

  const dot      = document.getElementById(`dot-${id}`);
  const uptimeEl = document.getElementById(`uptime-${id}`);
  const msEl     = document.getElementById(`ms-${id}`);

  const last = data.checks.at(-1);
  if (last) {
    dot.className    = `status-dot ${last.up ? "up" : "down"}`;
    msEl.textContent = last.ms != null ? `${last.ms}ms` : "—";
    msEl.className   = "val";
  }
  if (data.uptime != null) {
    uptimeEl.textContent = `${data.uptime}%`;
    uptimeEl.className   = `val ${data.uptime > 90 ? "up" : "down"}`;
  }

  // Up/down chart
  const { labels, upVals, upColors } = useCompression
    ? compressBars(data.checks)
    : rawBars(data.checks);

  const upChart = charts[`up-${id}`];
  upChart.data.labels                      = labels;
  upChart.data.datasets[0].data            = upVals;
  upChart.data.datasets[0].backgroundColor = upColors;
  upChart.update();

  // Response-time chart — always raw (line chart handles density fine)
  const rtChart = charts[`rt-${id}`];
  rtChart.data.labels           = data.checks.map(c => new Date(c.t).toLocaleTimeString());
  rtChart.data.datasets[0].data = data.checks.map(c => c.ms);
  rtChart.update();

  // Incidents
  const incEl = document.getElementById(`incidents-${id}`);
  if (!data.incidents.length) { incEl.innerHTML = ""; return; }
  incEl.innerHTML = `<div class="incidents-section"><h3>Incidents</h3>${
    data.incidents.map(i => `
      <div class="incident">
        <span class="incident-badge ${i.resolved ? "resolved" : "open"}">${i.resolved ? "resolved" : "ongoing"}</span>
        <div>
          <div class="incident-title">${i.title}</div>
          ${i.description ? `<div class="incident-desc">${i.description}</div>` : ""}
          <div class="incident-time">${new Date(i.created_at).toLocaleString()}${i.resolved_at ? ` → ${new Date(i.resolved_at).toLocaleString()}` : ""}</div>
        </div>
      </div>`).join("")
  }</div>`;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

let useCompression = true;

async function refresh() {
  await Promise.all(DOMAINS.map(d => loadDomain(d.id, currentHours)));
  document.getElementById("last-updated").textContent =
    `updated ${new Date().toLocaleTimeString()}`;
}

DOMAINS.forEach(d => mkCharts(d.id));
refresh();
setInterval(refresh, REFRESH_INTERVAL * 1000);

// Window buttons — scoped to [data-h] only, never touches the compress button
document.querySelectorAll(".window-btn[data-h]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".window-btn[data-h]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentHours = parseInt(btn.dataset.h);
    refresh();
  });
});

// Compress toggle
// Default: compressed (active), label = "decompress" (what clicking will do)
const compressBtn = document.getElementById("compress-btn");
compressBtn.textContent = "decompress";

compressBtn.addEventListener("click", () => {
  useCompression = !useCompression;
  compressBtn.textContent = useCompression ? "decompress" : "compress";
  compressBtn.classList.toggle("active", useCompression);
  refresh();
});