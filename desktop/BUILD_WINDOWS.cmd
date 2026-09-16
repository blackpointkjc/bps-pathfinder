@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo   BPS Pathfinder Desktop - Windows Build
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required to build Pathfinder Desktop.
  echo Install the current Node.js LTS release, then run this file again.
  exit /b 1
)

call npm install
if errorlevel 1 exit /b 1

call npm run check
if errorlevel 1 exit /b 1

call npm run package:win
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command "$folder = Get-ChildItem -Path '.\release' -Directory | Where-Object { $_.Name -like 'BPS-Pathfinder-win32-x64*' -or $_.Name -like 'BPS Pathfinder-win32-x64*' } | Select-Object -First 1; if (-not $folder) { $folder = Get-ChildItem -Path '.\release' -Directory | Select-Object -First 1 }; if ($folder) { $zip = Join-Path '.\release' 'BPS-Pathfinder-Windows-x64.zip'; if (Test-Path $zip) { Remove-Item $zip -Force }; Compress-Archive -Path ($folder.FullName + '\*') -DestinationPath $zip -Force; Write-Host ('Created ' + $zip) }"

echo.
echo Build complete. Open the desktop\release folder.
echo Run "BPS Pathfinder.exe" from the packaged folder.
echo The app stays active when minimized and starts with Windows after packaging.
echo.
pause
endlocal
