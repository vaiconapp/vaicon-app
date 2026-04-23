@echo off
setlocal EnableDelayedExpansion

REM Me diplo klik to Windows trexei me cmd /c. Anoigei NEA konsola (cmd /k) pou MENEI anoixth.
if /i not "%~1"=="_RUN" (
  start "VAICON Backup" cmd /k "%~f0" _RUN
  exit /b 0
)

chcp 65001 >nul
cd /d "%~dp0"

echo ================================
echo    VAICON BACKUP ^(git push^)
echo ================================
echo.

echo [0/3] Bump version...
call node scripts\bump-version.js
if errorlevel 1 (
    echo *** BUMP VERSION FAILED ***
    pause
    goto :eof
)

echo.
echo [1/3] git add .
git add .
if errorlevel 1 (
    echo *** git add FAILED ***
    pause
    goto :eof
)

echo.
echo [2/3] git commit
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "backup"
    if errorlevel 1 (
        echo *** git commit FAILED ***
        pause
        goto :eof
    )
) else (
    echo Den yparxoun nees allages gia commit.
)

echo.
echo [3/3] git push
git push
if errorlevel 1 (
    echo.
    echo *** git push FAILED ***
    echo Elegxe syndesh internet, credentials, i an yparxei conflict me to remote.
    pause
    goto :eof
)

echo.
echo ================================
echo    Ανέβηκε στο GitHub!
echo ================================
echo.
echo Πατήστε Enter για κλείσιμο...
pause
goto :eof
