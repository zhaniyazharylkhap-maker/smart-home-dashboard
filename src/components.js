const iconMap = {
  temperature: "🌡️",
  humidity: "💧",
  smoke: "💨",
  motion: "🏃",
  light: "💡",
  device: "📡",
};

const statusText = {
  normal: "Normal",
  warning: "Warning",
  danger: "Danger",
};

export function createNavbar(activePage) {
  return `
    <header class="topbar">
      <div class="title-wrap">
        <span class="title-icon">🏠</span>
        <h1>Smart Home Monitoring Platform</h1>
      </div>
      <nav class="menu">
        ${["dashboard", "history", "alerts", "settings"]
          .map(
            (key) => `
            <button class="menu-item ${activePage === key ? "active" : ""}" data-route="${key}">
              ${key[0].toUpperCase() + key.slice(1)}
            </button>
          `
          )
          .join("")}
      </nav>
    </header>
  `;
}

export function createSensorCard({ label, value, unit, status, keyName }) {
  return `
    <article class="sensor-card">
      <div class="sensor-head">
        <span class="sensor-icon">${iconMap[keyName] ?? "•"}</span>
        <span class="chip ${status}">${statusText[status] ?? status}</span>
      </div>
      <div class="sensor-body">
        <p class="sensor-label">${label}</p>
        <h3 class="sensor-value">${value}${unit ? `<small>${unit}</small>` : ""}</h3>
      </div>
    </article>
  `;
}

export function createAlertItem(alert) {
  return `
    <li class="alert-item ${alert.status}">
      <div class="alert-main">
        <p class="alert-title">${alert.message}</p>
        <small>${alert.type} • ${new Date(alert.timestamp).toLocaleString()}</small>
      </div>
      <div class="alert-meta">
        <strong>${alert.value}</strong>
        <span class="chip ${alert.status}">${alert.status.toUpperCase()}</span>
      </div>
    </li>
  `;
}

export function createDeviceRow(device) {
  return `
    <tr>
      <td>${device.device_id}</td>
      <td><span class="chip ${device.status === "online" ? "normal" : "danger"}">${device.status}</span></td>
      <td>${new Date(device.last_update).toLocaleString()}</td>
    </tr>
  `;
}

export function createHistoryRow(row) {
  return `
    <tr>
      <td>${new Date(row.timestamp).toLocaleString()}</td>
      <td>${row.temperature} °C</td>
      <td>${row.humidity} %</td>
      <td>${row.smoke}</td>
      <td>${row.motion}</td>
      <td>${row.light}</td>
    </tr>
  `;
}
