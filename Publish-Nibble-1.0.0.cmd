@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed
node scripts\publish-1.0.0.mjs
if errorlevel 1 goto failed
echo Nibble 1.0.0 source and tag are published.
pause
exit /b 0
:failed
echo Publishing was not completed. Read the error above. Existing remote history was preserved.
pause
exit /b 1
