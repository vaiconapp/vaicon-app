@echo off
cd /d C:\Users\xxxyy\Desktop\vaicon-app
echo Building...
npx expo export --platform web
echo Deploying...
netlify deploy --dir=dist --prod
echo.
echo Ανεβηκε στο vaiconapp.netlify.app
paus