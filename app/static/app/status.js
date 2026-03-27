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

// ── RLE compression ──────────────────────────────────────────────────────────
// Collapses consecutive runs of identical up/down state into single bars.
// A run containing ANY down check is marked down — no outage is ever hidden.
// The response-time chart is left uncompressed (line chart handles density fine).

function rleCompress(checks) {
  if (!checks.length) return { labels: [], upVals: [], upColors: [] };

  const labels = [];
  const upVals = [];
  const upColors = [];

  let runStart = checks[0];
  let runUp = checks[0].up;   // false if ANY check in the run is down
  let runCount = 1;

  function pushRun(endCheck) {
    // Label: "HH:MM – HH:MM (n checks)" for multi-check runs, just time for singles
    const t1 = new Date(runStart.t).toLocaleTimeString();
    const t2 = new Date(endCheck.t).toLocaleTimeString();
    labels.push(runCount > 1 ? `${t1} – ${t2} (${runCount})` : t1);
    upVals.push(runUp ? 1 : 0);
    upColors.push(runUp ? "#22c55e" : "#ef4444");
  }

  for (let i = 1; i < checks.length; i++) {
    const c = checks[i];
    if (c.up === runStart.up && runUp === runStart.up) {
      // Same state — extend run (but if this check is down, taint the run)
      if (!c.up) runUp = false;
      runCount++;
    } else {
      // State boundary — flush current run
      pushRun(checks[i - 1]);
      runStart = c;
      runUp = c.up;
      runCount = 1;
    }
  }
  // Flush final run
  pushRun(checks[checks.length - 1]);

  return { labels, upVals, upColors };
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
    dot.className   = `status-dot ${last.up ? "up" : "down"}`;
    msEl.textContent = last.ms != null ? `${last.ms}ms` : "—";
    msEl.className  = "val";
  }
  if (data.uptime != null) {
    uptimeEl.textContent = `${data.uptime}%`;
    uptimeEl.className   = `val ${data.uptime > 90 ? "up" : "down"}`;
  }

  // Up/down chart — RLE compressed
  const { labels, upVals, upColors } = rleCompress(data.checks);
  const upChart = charts[`up-${id}`];
  upChart.data.labels                        = labels;
  upChart.data.datasets[0].data              = upVals;
  upChart.data.datasets[0].backgroundColor   = upColors;
  upChart.update();

  // Response-time chart — raw data (line chart handles density well)
  const rtChart = charts[`rt-${id}`];
  rtChart.data.labels                  = data.checks.map(c => new Date(c.t).toLocaleTimeString());
  rtChart.data.datasets[0].data        = data.checks.map(c => c.ms);
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

async function refresh() {
  await Promise.all(DOMAINS.map(d => loadDomain(d.id, currentHours)));
  document.getElementById("last-updated").textContent =
    `updated ${new Date().toLocaleTimeString()}`;
}

DOMAINS.forEach(d => mkCharts(d.id));
refresh();
setInterval(refresh, REFRESH_INTERVAL * 1000);

document.querySelectorAll(".window-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".window-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentHours = parseInt(btn.dataset.h);
    refresh();
  });
});