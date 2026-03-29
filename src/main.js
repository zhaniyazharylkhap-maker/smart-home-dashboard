import {
  getAlerts,
  getDeviceStatus,
  getHistory,
  getLatestData,
  getSettings,
  saveSettings,
} from "./mockApi.js";
import {
  createAlertItem,
  createDeviceRow,
  createHistoryRow,
  createNavbar,
  createSensorCard,
} from "./components.js";

const app = document.getElementById("app");

let route = "dashboard";
let refreshTimer = null;
let charts = {
  temperature: null,
  humidity: null,
  smoke: null,
};

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function bindNavigation() {
  app.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const next = e.currentTarget.dataset.route;
      if (next !== route) {
        route = next;
        render();
      }
    });
  });
}

function shell(content) {
  app.innerHTML = `
    ${createNavbar(route)}
    <main class="page">${content}</main>
  `;
  bindNavigation();
}

function createChart(canvasId, label, points, color) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new window.Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      datasets: [
        {
          label,
          data: points.map((p) => p.value),
          borderColor: color,
          backgroundColor: `${color}22`,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false, grid: { color: "#edf2f7" } },
        x: { grid: { display: false } },
      },
      plugins: { legend: { display: true, labels: { boxWidth: 12 } } },
    },
  });
}

function destroyCharts() {
  Object.values(charts).forEach((chart) => chart?.destroy());
  charts = { temperature: null, humidity: null, smoke: null };
}

async function renderDashboard() {
  shell(`
    <section class="section">
      <h2>Live Sensors</h2>
      <div id="sensor-grid" class="sensor-grid"></div>
    </section>

    <section class="section">
      <h2>Real-Time Charts</h2>
      <div class="charts-grid">
        <article class="chart-card"><h3>Temperature</h3><div class="chart-wrap"><canvas id="tempChart"></canvas></div></article>
        <article class="chart-card"><h3>Humidity</h3><div class="chart-wrap"><canvas id="humChart"></canvas></div></article>
        <article class="chart-card"><h3>Smoke</h3><div class="chart-wrap"><canvas id="smokeChart"></canvas></div></article>
      </div>
    </section>

    <section class="split">
      <article class="section">
        <h2>Alerts</h2>
        <ul id="alerts-list" class="alerts-list"></ul>
      </article>
      <article class="section">
        <h2>Device Status</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Device ID</th><th>Status</th><th>Last Update</th></tr></thead>
            <tbody id="device-table"></tbody>
          </table>
        </div>
      </article>
    </section>
  `);

  const loadData = async () => {
    const [latest, alertRows, devices, historyRows] = await Promise.all([
      getLatestData(),
      getAlerts(),
      getDeviceStatus(),
      getHistory(),
    ]);

    const sensors = [
      { label: "Temperature", value: latest.temperature, unit: "°C", keyName: "temperature", status: latest.statuses.temperature },
      { label: "Humidity", value: latest.humidity, unit: "%", keyName: "humidity", status: latest.statuses.humidity },
      { label: "Smoke / Gas", value: latest.smoke, unit: "", keyName: "smoke", status: latest.statuses.smoke },
      { label: "Motion", value: latest.motion, unit: "", keyName: "motion", status: latest.statuses.motion },
      { label: "Light Level", value: latest.light, unit: "%", keyName: "light", status: latest.statuses.light },
      {
        label: "Device Status",
        value: `${latest.deviceOnline}/${latest.deviceTotal} Online`,
        unit: "",
        keyName: "device",
        status: latest.statuses.device,
      },
    ];

    const sensorGrid = document.getElementById("sensor-grid");
    sensorGrid.innerHTML = sensors.map(createSensorCard).join("");

    const alertsList = document.getElementById("alerts-list");
    alertsList.innerHTML = alertRows.length
      ? alertRows.map(createAlertItem).join("")
      : `<li class="empty-state">No active alerts.</li>`;

    document.getElementById("device-table").innerHTML = devices.map(createDeviceRow).join("");

    const chartPoints = historyRows.slice(0, 16).reverse();
    const tempPoints = chartPoints.map((r) => ({ timestamp: r.timestamp, value: r.temperature }));
    const humPoints = chartPoints.map((r) => ({ timestamp: r.timestamp, value: r.humidity }));
    const smokePoints = chartPoints.map((r) => ({ timestamp: r.timestamp, value: r.smoke }));

    if (!charts.temperature) {
      charts.temperature = createChart("tempChart", "Temperature (°C)", tempPoints, "#2563eb");
      charts.humidity = createChart("humChart", "Humidity (%)", humPoints, "#0ea5e9");
      charts.smoke = createChart("smokeChart", "Smoke Level", smokePoints, "#ef4444");
      return;
    }

    const update = (chart, points) => {
      chart.data.labels = points.map((p) =>
        new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      chart.data.datasets[0].data = points.map((p) => p.value);
      chart.update();
    };

    update(charts.temperature, tempPoints);
    update(charts.humidity, humPoints);
    update(charts.smoke, smokePoints);
  };

  await loadData();
  stopAutoRefresh();
  refreshTimer = setInterval(loadData, 5000);
}

async function renderHistory() {
  stopAutoRefresh();
  destroyCharts();

  shell(`
    <section class="section">
      <h2>History Data</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Temperature</th>
              <th>Humidity</th>
              <th>Smoke</th>
              <th>Motion</th>
              <th>Light</th>
            </tr>
          </thead>
          <tbody id="history-table"></tbody>
        </table>
      </div>
    </section>
  `);

  const rows = await getHistory();
  document.getElementById("history-table").innerHTML = rows.map(createHistoryRow).join("");
}

async function renderAlerts() {
  stopAutoRefresh();
  destroyCharts();

  shell(`
    <section class="section">
      <h2>Alert Center</h2>
      <ul id="alerts-page-list" class="alerts-list"></ul>
    </section>
  `);

  const rows = await getAlerts();
  document.getElementById("alerts-page-list").innerHTML = rows.length
    ? rows.map(createAlertItem).join("")
    : `<li class="empty-state">No alerts detected.</li>`;
}

async function renderSettings() {
  stopAutoRefresh();
  destroyCharts();

  shell(`
    <section class="section settings">
      <h2>Threshold Settings</h2>
      <form id="settings-form" class="settings-form">
        <label>
          Temperature Threshold (°C)
          <input name="temperatureThreshold" type="number" min="0" step="0.1" required />
        </label>
        <label>
          Smoke Threshold
          <input name="smokeThreshold" type="number" min="0" step="0.1" required />
        </label>
        <button type="submit">Save Settings</button>
        <p id="settings-status" class="settings-status"></p>
      </form>
    </section>
  `);

  const form = document.getElementById("settings-form");
  const statusEl = document.getElementById("settings-status");
  const current = await getSettings();
  form.temperatureThreshold.value = current.temperatureThreshold;
  form.smokeThreshold.value = current.smokeThreshold;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Saving...";

    const next = {
      temperatureThreshold: Number(form.temperatureThreshold.value),
      smokeThreshold: Number(form.smokeThreshold.value),
    };

    await saveSettings(next);
    statusEl.textContent = "Saved successfully.";
  });
}

async function render() {
  if (route === "dashboard") {
    await renderDashboard();
    return;
  }
  if (route === "history") {
    await renderHistory();
    return;
  }
  if (route === "alerts") {
    await renderAlerts();
    return;
  }
  await renderSettings();
}

render();
