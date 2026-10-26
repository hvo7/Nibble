@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed
set "ELECTRON_RUN_AS_NODE="
set "NIBBLE_SMOKE="
set "NIBBLE_SCREENSHOT="
set "NIBBLE_DEV_URL="
set "NIBBLE_DATA_DIR="
set "NIBBLE_CHANNEL="
if not exist "node_modules\electron\dist\electron.exe" (
  echo Run npm ci in this folder first.
  goto failed
)
if not exist "dist-electron\main.cjs" goto build
if not exist "dist\index.html" goto build
if not exist "dist-electron\ocr\eng.traineddata.gz" goto build
if not exist "dist-electron\ocr\numbers\eng.traineddata.gz" goto build
goto launch
:build
call npm.cmd run build
if errorlevel 1 goto failed
:launch
if not exist ".nibble-runtime" mkdir ".nibble-runtime"
> ".nibble-runtime\production-launch.log" echo Production launch: %DATE% %TIME%
start "" /wait "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." "--enable-logging=file" "--log-file=%~dp0.nibble-runtime\electron-startup.log"
set "NIBBLE_LAUNCH_EXIT=%ERRORLEVEL%"
>> ".nibble-runtime\production-launch.log" echo Exit: %NIBBLE_LAUNCH_EXIT%
if not "%NIBBLE_LAUNCH_EXIT%"=="0" goto failed
endlocal
exit /b 0
:failed
echo Nibble could not start. See .nibble-runtime\production-launch.log and electron-startup.log.
pause
endlocal
exit /b 1
