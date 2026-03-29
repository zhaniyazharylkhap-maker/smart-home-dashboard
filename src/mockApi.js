const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const statusFromThreshold = (value, warning, danger) => {
  if (value >= danger) return "danger";
  if (value >= warning) return "warning";
  return "normal";
};

const randomInRange = (min, max, digits = 1) => {
  const raw = Math.random() * (max - min) + min;
  return Number(raw.toFixed(digits));
};

let settings = {
  temperatureThreshold: 30,
  smokeThreshold: 70,
};

let baseTemperature = 23;
let baseHumidity = 48;
let baseSmoke = 18;
let baseLight = 65;

let history = Array.from({ length: 24 }, (_, i) => {
  const ts = new Date(Date.now() - (23 - i) * 5 * 60 * 1000);
  const temperature = randomInRange(21, 28);
  const humidity = randomInRange(42, 58);
  const smoke = randomInRange(8, 35);
  const motion = Math.random() > 0.75 ? "Detected" : "None";
  const light = randomInRange(45, 90);

  return {
    timestamp: ts.toISOString(),
    temperature,
    humidity,
    smoke,
    motion,
    light,
  };
});

const devices = [
  { device_id: "hub-001", status: "online", last_update: new Date().toISOString() },
  { device_id: "temp-021", status: "online", last_update: new Date().toISOString() },
  { device_id: "smoke-045", status: "online", last_update: new Date().toISOString() },
  { device_id: "motion-011", status: "offline", last_update: new Date(Date.now() - 19 * 60 * 1000).toISOString() },
];

let alerts = [
  {
    id: "alt-001",
    type: "Smoke",
    message: "High smoke level detected",
    value: 74,
    timestamp: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    status: "danger",
  },
  {
    id: "alt-002",
    type: "Temperature",
    message: "Temperature nearing threshold",
    value: 29.3,
    timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    status: "warning",
  },
];

function maybeCreateAlert(latest) {
  const nextAlerts = [];

  if (latest.smoke >= settings.smokeThreshold) {
    nextAlerts.push({
      id: `alt-${Date.now()}`,
      type: "Smoke",
      message: "High smoke level detected",
      value: latest.smoke,
      timestamp: new Date().toISOString(),
      status: "danger",
    });
  } else if (latest.smoke >= settings.smokeThreshold - 8) {
    nextAlerts.push({
      id: `alt-${Date.now()}`,
      type: "Smoke",
      message: "Smoke level elevated",
      value: latest.smoke,
      timestamp: new Date().toISOString(),
      status: "warning",
    });
  }

  if (latest.temperature >= settings.temperatureThreshold) {
    nextAlerts.push({
      id: `alt-${Date.now() + 1}`,
      type: "Temperature",
      message: "High temperature detected",
      value: latest.temperature,
      timestamp: new Date().toISOString(),
      status: "danger",
    });
  }

  if (nextAlerts.length) {
    alerts = [...nextAlerts, ...alerts].slice(0, 20);
  }
}

function updateDevices() {
  devices.forEach((device) => {
    const flip = Math.random() > 0.93;
    if (flip) {
      device.status = device.status === "online" ? "offline" : "online";
    }
    device.last_update = new Date().toISOString();
  });
}

export async function getLatestData() {
  await delay();

  baseTemperature = Math.max(18, Math.min(38, baseTemperature + randomInRange(-1.2, 1.4)));
  baseHumidity = Math.max(25, Math.min(80, baseHumidity + randomInRange(-2.5, 2.2)));
  baseSmoke = Math.max(3, Math.min(95, baseSmoke + randomInRange(-4, 7)));
  baseLight = Math.max(0, Math.min(100, baseLight + randomInRange(-10, 8)));

  const latest = {
    timestamp: new Date().toISOString(),
    temperature: Number(baseTemperature.toFixed(1)),
    humidity: Number(baseHumidity.toFixed(1)),
    smoke: Number(baseSmoke.toFixed(1)),
    motion: Math.random() > 0.8 ? "Detected" : "None",
    light: Number(baseLight.toFixed(1)),
    deviceOnline: devices.filter((d) => d.status === "online").length,
    deviceTotal: devices.length,
  };

  maybeCreateAlert(latest);
  updateDevices();

  history = [...history.slice(-99), latest];

  return {
    ...latest,
    statuses: {
      temperature: statusFromThreshold(latest.temperature, settings.temperatureThreshold - 3, settings.temperatureThreshold),
      humidity: statusFromThreshold(latest.humidity, 65, 75),
      smoke: statusFromThreshold(latest.smoke, settings.smokeThreshold - 8, settings.smokeThreshold),
      motion: latest.motion === "Detected" ? "warning" : "normal",
      light: statusFromThreshold(100 - latest.light, 45, 70),
      device: latest.deviceOnline === latest.deviceTotal ? "normal" : "warning",
    },
  };
}

export async function getHistory() {
  await delay(420);
  return history.slice().reverse();
}

export async function getAlerts() {
  await delay(280);
  return alerts;
}

export async function getDeviceStatus() {
  await delay(280);
  return devices;
}

export async function getSettings() {
  await delay(200);
  return { ...settings };
}

export async function saveSettings(nextSettings) {
  await delay(300);
  settings = { ...settings, ...nextSettings };
  return { ...settings };
}
