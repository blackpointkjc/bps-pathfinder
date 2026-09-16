const { contextBridge, ipcRenderer } = require('electron');

let lastDesktopHeartbeatAt = Date.now();

function dispatch(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

contextBridge.exposeInMainWorld('bpsDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
}));

ipcRenderer.on('bps:desktop-heartbeat', (_event, detail = {}) => {
  const now = Number(detail.at) || Date.now();
  const previous = lastDesktopHeartbeatAt;
  lastDesktopHeartbeatAt = now;

  // Feed the same background tick consumed by Pathfinder's GPS/session heartbeat.
  dispatch('bps-background-location-tick', {
    at: now,
    desktop: true,
    source: 'electron_main',
  });

  // If the renderer missed several desktop heartbeats, force a full operational
  // catch-up rather than waiting for each page's normal polling interval.
  if (previous && now - previous > 90_000) {
    dispatch('bps-operational-resume', {
      reason: 'desktop_heartbeat_gap',
      at: now,
      inactive_ms: now - previous,
      desktop: true,
    });
  }
});

ipcRenderer.on('bps:operational-resume', (_event, detail = {}) => {
  dispatch('bps-operational-resume', {
    ...detail,
    desktop: true,
    at: Number(detail.at) || Date.now(),
  });
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.bpsDesktop = 'true';
  dispatch('bps-operational-resume', {
    reason: 'desktop_dom_ready',
    at: Date.now(),
    desktop: true,
  });
});
