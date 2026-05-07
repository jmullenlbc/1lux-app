@echo off
echo ========================================
echo   ILC Studios - First-Time Setup
echo ========================================
echo.
echo Installing dependencies...
npm install
echo.
echo Setting up database...
npx prisma db push
echo.
echo Creating admin account...
node prisma/seed.js
echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Admin login:
echo   Email:    admin@ilcstudios.com
echo   Password: ILCadmin2024!
echo.
echo To start the app, run: start.bat
echo Or type: npm run dev
echo Then open: http://localhost:3000
echo.
pause
