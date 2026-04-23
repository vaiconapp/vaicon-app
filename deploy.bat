@echo off
setlocal EnableDelayedExpansion

REM Me diplo klik to Windows trexei me cmd /c — to parathyro kleinei molis teleiwsei to script.
REM Anoigei NEA konsola me cmd /k pou MENEI anoixth mexri na kleiseis esu.
if /i not "%~1"=="_RUN" (
  start "VAICON Deploy" cmd /k "%~f0" _RUN
  exit /b 0
)

cd /d "%~dp0"
set EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyB04iN9S_MfYMsx3V3Jn1j2rOyz5ySf-sQ

REM Merikes sundeseis Windows: to Netlify API kollaei se IPv6 — dokimase IPv4 proteraiotita
set NODE_OPTIONS=--dns-result-order=ipv4first

REM Optional: personal access token from Netlify - User settings, Applications
REM An kollaei akoma: set NETLIFY_AUTH_TOKEN=xxxxxxxx  [kai meta deploy xoris login prompt]

echo ================================
echo    VAICON DEPLOY
echo ================================
echo.

REM Without linked site, deploy waits for hidden prompts (looks "stuck").
if not exist ".netlify\state.json" (
    echo [NETLIFY] Missing .netlify\state.json - site not linked yet.
    echo Run ONCE in this folder ^(open CMD here, not double-click^):
    echo   npx netlify-cli login
    echo   npx netlify-cli link
    echo   ^- choose: Link to existing project ^> vaiconapp
    echo.
    pause
    goto :eof
)

echo [0/3] Bump version...
call node scripts\bump-version.js
if errorlevel 1 (
    echo *** BUMP VERSION FAILED ***
    pause
    goto :eof
)

echo.
echo [1/2] Building...
call npx expo export -p web -c
if errorlevel 1 (
    echo.
    echo *** ΣΦΑΛΜΑ ΣΤΟ BUILD ***
    pause
    goto :eof
)

echo.
echo [2/2] Deploying to Netlify...
if not exist "node_modules\netlify-cli\package.json" (
    echo Installing netlify-cli locally ^(one-time^)...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo *** npm install FAILED ***
        pause
        goto :eof
    )
)
call npm run deploy:netlify
if errorlevel 1 (
    echo.
    echo *** ΣΦΑΛΜΑ ΣΤΟ DEPLOY ***
    pause
    goto :eof
)

echo.
echo ================================
echo    Ανεβηκε στο vaiconapp.netlify.app
echo ================================
echo.
echo Πατήστε Enter για κλείσιμο...
pause
goto :eof
