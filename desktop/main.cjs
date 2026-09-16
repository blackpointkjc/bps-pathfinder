const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, powerMonitor, powerSaveBlocker, shell } = require('electron');

const PATHFINDER_URL = process.env.PATHFINDER_URL || 'https://pathfinderbps.base44.app';
const BACKGROUND_START_ARG = '--background-start';
const HEARTBEAT_INTERVAL_MS = 30_000;
const UNRESPONSIVE_RELOAD_MS = 60_000;

let mainWindow = null;
let quitting = false;
let powerBlockerId = null;
let desktopHeartbeat = null;
let unresponsiveTimer = null;

// Keep Chromium from lowering the renderer process priority when the Pathfinder
// window is minimized. The BrowserWindow also disables background throttling.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function isTrustedPathfinderOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'pathfinderbps.base44.app'
      || host.endsWith('.pathfinderbps.base44.app');
  } catch {
    return false;
  }
}

function permissionOrigin(webContents, requestingOrigin, details = {}) {
  return requestingOrigin
    || details.requestingUrl
    || details.securityOrigin
    || webContents?.getURL?.()
    || '';
}

function configurePermissions(win) {
  const ses = win.webContents.session;

  // Base44's hosted response may omit or restrict the Web Serial feature in its
  // Permissions-Policy header. Chromium enforces that policy before Electron's
  // permission handlers run, so a normal setPermissionRequestHandler alone is not
  // enough. For the trusted Pathfinder origin only, replace the document policy
  // with a narrow same-origin policy that explicitly allows Serial + Geolocation.
  // This does not grant a device automatically; the user still chooses the GPS
  // receiver through Electron's select-serial-port flow below.
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (!isTrustedPathfinderOrigin(details.url || '')) {
      callback({ cancel: false, responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...(details.responseHeaders || {}) };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'permissions-policy') delete responseHeaders[key];
    }
    responseHeaders['Permissions-Policy'] = [
      'camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=(self), serial=(self), magnetometer=(), gyroscope=()'
    ];
    callback({ cancel: false, responseHeaders });
  });
  const allowedPermissions = new Set([
    'geolocation',
    'geolocation-approximate',
    'notifications',
    'serial',
    'media',
    'background-sync',
    'periodic-background-sync',
    'persistent-storage',
    'system-wake-lock',
    'screen-wake-lock',
  ]);

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = permissionOrigin(webContents, requestingOrigin, details);
    return isTrustedPathfinderOrigin(origin) && allowedPermissions.has(permission);
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = permissionOrigin(webContents, details?.requestingUrl, details);
    callback(isTrustedPathfinderOrigin(origin) && allowedPermissions.has(permission));
  });

  // Pathfinder's approved external GPS can be accessed through Web Serial. This
  // handler lets the trusted Pathfinder origin see an already-connected GPS after
  // the desktop app restarts, instead of losing the permission every session.
  ses.setDevicePermissionHandler(details => {
    return details.deviceType === 'serial' && isTrustedPathfinderOrigin(details.origin);
  });

  ses.on('select-serial-port', async (event, portList, webContents, callback) => {
    if (!isTrustedPathfinderOrigin(webContents?.getURL?.() || '')) {
      callback('');
      return;
    }

    event.preventDefault();
    const ports = Array.isArray(portList) ? portList : [];
    if (!ports.length) {
      callback('');
      return;
    }

    const gpsPattern = /(gps|gnss|nmea|globalsat|u-blox|ublox|prolific|cp210|silicon labs|usb serial)/i;
    const preferred = ports.filter(port => gpsPattern.test(`${port.displayName || ''} ${port.portName || ''}`));
    const candidates = preferred.length ? preferred : ports;

    if (candidates.length === 1) {
      callback(candidates[0].portId);
      return;
    }

    const buttons = candidates.slice(0, 8).map(port => port.displayName || port.portName || `Serial ${port.portId}`);
    buttons.push('Cancel');
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Select Pathfinder GPS Receiver',
      message: 'Choose the GPS / serial receiver Pathfinder should use.',
      detail: 'Pathfinder Desktop keeps this serial permission available while the desktop runtime is running.',
      buttons,
      cancelId: buttons.length - 1,
      defaultId: 0,
      noLink: true,
    });
    const selected = candidates[result.response];
    callback(selected?.portId || '');
  });
}

function sendOperationalResume(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('bps:operational-resume', {
    reason,
    at: Date.now(),
    desktop: true,
  });
}

function startDesktopHeartbeat() {
  if (desktopHeartbeat) clearInterval(desktopHeartbeat);
  desktopHeartbeat = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('bps:desktop-heartbeat', { at: Date.now() });
  }, HEARTBEAT_INTERVAL_MS);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(false);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  sendOperationalResume('desktop_window_shown');
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open Pathfinder', accelerator: 'Ctrl+Shift+O', click: showMainWindow },
        { label: 'Reload Pathfinder', accelerator: 'Ctrl+R', click: () => mainWindow?.webContents?.reload() },
        { type: 'separator' },
        {
          label: 'Quit Pathfinder',
          accelerator: 'Ctrl+Q',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Pathfinder Web Portal',
          click: () => shell.openExternal(PATHFINDER_URL),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function createMainWindow(startMinimized = false) {
  mainWindow = new BrowserWindow({
    title: 'BPS Pathfinder',
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: !startMinimized,
    autoHideMenuBar: false,
    backgroundColor: '#050a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      partition: 'persist:bps-pathfinder',
    },
  });

  configurePermissions(mainWindow);
  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedPathfinderOrigin(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 820,
          backgroundColor: '#050a12',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
            partition: 'persist:bps-pathfinder',
          },
        },
      };
    }
    shell.openExternal(url).catch(() => null);
    return { action: 'deny' };
  });

  mainWindow.on('close', event => {
    if (quitting) return;
    // Closing the window behaves like minimize so CAD/GPS does not silently stop.
    event.preventDefault();
    mainWindow.minimize();
  });

  mainWindow.on('minimize', () => {
    sendOperationalResume('desktop_minimized');
  });

  mainWindow.on('restore', () => {
    sendOperationalResume('desktop_restored');
  });

  mainWindow.on('focus', () => {
    sendOperationalResume('desktop_focus');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendOperationalResume('desktop_page_loaded');
  });

  mainWindow.webContents.on('unresponsive', () => {
    clearTimeout(unresponsiveTimer);
    unresponsiveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    }, UNRESPONSIVE_RELOAD_MS);
  });

  mainWindow.webContents.on('responsive', () => {
    clearTimeout(unresponsiveTimer);
    unresponsiveTimer = null;
    sendOperationalResume('desktop_renderer_responsive');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (quitting) return;
    console.error('[BPS Desktop] Renderer exited:', details?.reason || 'unknown');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      else createMainWindow(false);
    }, 1500);
  });

  mainWindow.loadURL(PATHFINDER_URL);
  if (startMinimized) mainWindow.minimize();
  startDesktopHeartbeat();
}

app.on('second-instance', () => showMainWindow());

app.whenReady().then(() => {
  installApplicationMenu();

  // This is the key desktop behavior: keep Windows active for Pathfinder while
  // still allowing the display to turn off. It prevents ordinary idle sleep from
  // suspending the app while an officer is on duty.
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');

  if (process.platform === 'win32' && app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: [BACKGROUND_START_ARG],
    });
  }

  powerMonitor.on('resume', () => sendOperationalResume('windows_resume'));
  powerMonitor.on('unlock-screen', () => sendOperationalResume('windows_unlock'));
  powerMonitor.on('on-ac', () => sendOperationalResume('windows_ac_power'));

  const startMinimized = process.argv.includes(BACKGROUND_START_ARG);
  createMainWindow(startMinimized);
});

app.on('before-quit', () => {
  quitting = true;
  clearInterval(desktopHeartbeat);
  clearTimeout(unresponsiveTimer);
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
});

app.on('window-all-closed', event => {
  // Pathfinder is intentionally persistent on Windows. It exits only through
  // File > Quit Pathfinder / Ctrl+Q or system shutdown.
  if (!quitting) event?.preventDefault?.();
});
