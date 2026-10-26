@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed
rem Inherited Electron/test settings must never turn a normal launch into a smoke test.
set "ELECTRON_RUN_AS_NODE="
set "NIBBLE_SMOKE="
set "NIBBLE_SCREENSHOT="
set "NIBBLE_DEV_URL="
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing from PATH. Install the project's supported Node.js version and try again.
  goto failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Nibble dependencies are missing. Run npm ci in this folder, then try again.
  goto failed
)
echo Building and opening Nibble Staging...
echo Your staging recipes are kept in .nibble-staging\data.
call npm.cmd run build:staging
if errorlevel 1 goto failed
call npm.cmd run setup:ocr
if errorlevel 1 echo Screenshot reading needs setup. You can still test text imports.
set "NIBBLE_CHANNEL=staging"
set "NIBBLE_DATA_DIR=%~dp0.nibble-staging\data"
> ".nibble-staging\staging-launch.log" echo Interactive staging launch: %DATE% %TIME%
>> ".nibble-staging\staging-launch.log" echo App: %~dp0.nibble-staging\app
>> ".nibble-staging\staging-launch.log" echo Data: %NIBBLE_DATA_DIR%
rem Launch the executable directly, matching the known working manual command.
start "" /wait "%~dp0node_modules\electron\dist\electron.exe" "%~dp0.nibble-staging\app" "--enable-logging=file" "--log-file=%~dp0.nibble-staging\electron-startup.log"
set "NIBBLE_LAUNCH_EXIT=%ERRORLEVEL%"
>> ".nibble-staging\staging-launch.log" echo Exit: %NIBBLE_LAUNCH_EXIT%
if not "%NIBBLE_LAUNCH_EXIT%"=="0" goto failed
endlocal
exit /b 0
:failed
echo.
echo Nibble Staging could not start. Read the error above.
if defined NIBBLE_LAUNCH_EXIT echo Electron exit: %NIBBLE_LAUNCH_EXIT%
echo Launch details: .nibble-staging\staging-launch.log
echo Electron details, when available: .nibble-staging\electron-startup.log
pause
endlocal
exit /b 1
