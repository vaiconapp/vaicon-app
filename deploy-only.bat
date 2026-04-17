@echo off
setlocal EnableDelayedExpansion

if /i not "%~1"=="_RUN" (
  start "VAICON Deploy Upload Only" cmd /k "%~f0" _RUN
  exit /b 0
)

cd /d "%~dp0"
set NODE_OPTIONS=--dns-result-order=ipv4first

if not exist ".netlify\state.json" (
    echo [ERROR] Run netlify link first, or use deploy.bat once.
    pause
    goto :eof
)
if not exist "dist\index.html" (
    echo [ERROR] No dist folder. Run expo export first, e.g.:
    echo   npx expo export -p web -c
    pause
    goto :eof
)

if not exist "node_modules\netlify-cli\package.json" (
    echo Installing netlify-cli...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo npm install failed.
        pause
        goto :eof
    )
)

echo Uploading dist to Netlify ^(production^)...
call npm run deploy:netlify
if errorlevel 1 (
    echo *** DEPLOY FAILED ***
    pause
    goto :eof
)

echo.
echo Done: https://vaiconapp.netlify.app
echo Πατήστε Enter για κλείσιμο...
pause
goto :eof
