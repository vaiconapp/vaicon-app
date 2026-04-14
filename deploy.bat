@echo off
cd /d C:\Users\xxxyy\Desktop\vaicon-app
set EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyB04iN9S_MfYMsx3V3Jn1j2rOyz5ySf-sQ
echo Building...
npx expo export --platform web
echo Deploying...
netlify deploy --dir=dist --prod
echo.
echo Ανεβηκε στο vaiconapp.netlify.app
pause