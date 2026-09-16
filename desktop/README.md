# BPS Pathfinder Desktop (Windows)

This desktop runtime exists specifically for Toughbooks and other Windows CAD computers that need Pathfinder to keep operating while the window is minimized or the computer is idle.

## What it changes

- Runs Pathfinder in Electron instead of a normal Chrome/Edge tab.
- Disables Chromium background timer throttling for the Pathfinder window.
- Uses Electron `powerSaveBlocker` with `prevent-app-suspension`, so Windows can turn the screen off while keeping the Pathfinder application/system active.
- Sends a 30-second desktop heartbeat into the existing Pathfinder background GPS/session tracker.
- Sends immediate recovery events after Windows resume, unlock, renderer recovery, window restore, and connectivity recovery.
- Grants the trusted Pathfinder origin geolocation and Web Serial permissions needed for the CF-33 / external NMEA GPS workflow.
- Keeps the app running if the user clicks the window X: close behaves like minimize. Use **File > Quit Pathfinder** or **Ctrl+Q** to intentionally exit.
- Starts with Windows after it has been packaged/installed and launches in background mode.
- Automatically reloads the renderer only if it stays unresponsive for one minute.

## Build on Windows

1. Install the current Node.js LTS release.
2. Open this `desktop` folder.
3. Run `BUILD_WINDOWS.cmd`.
4. The packaged Windows application will be created in `desktop\release`.
5. Deploy the packaged folder to each Toughbook and launch `BPS Pathfinder.exe`.

The packaged application loads the production Pathfinder URL:

`https://pathfinderbps.base44.app`

To point a test build at another Pathfinder URL, set the `PATHFINDER_URL` environment variable before launching.

## Operational behavior

The app may be minimized and the display may turn off. Pathfinder should remain running and continue its CAD/GPS heartbeat. If Windows is explicitly shut down, restarted, or the process is forcibly terminated, no application can continue running; Pathfinder Desktop automatically resumes its recovery workflow when Windows/app operation resumes.

## External GPS

Pathfinder Desktop supports the same Web Serial/NMEA receiver used by the web app. When more than one serial receiver is present, the desktop runtime displays a receiver-selection dialog. GPS/GNSS-looking devices are prioritized.
