@echo off
REM ---------------------------------------------------------------------------
REM Lance l'application web des livreurs Toligo (React) dans le navigateur.
REM
REM L'application utilise l'API reglee par API_CIBLE dans .env.development
REM (serveur de test). Pour l'API lancee sur ce PC (php artisan serve), y
REM mettre API_CIBLE=http://127.0.0.1:8000.
REM
REM La premiere fois, l'installation des dependances prend quelques minutes.
REM Pour arreter l'application : fermer cette fenetre (ou Ctrl+C).
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

if not exist node_modules (
    echo Installation des dependances...
    call npm install --no-fund --no-audit
)

echo Lancement sur http://localhost:5174 ...
start "" http://localhost:5174
call npm run dev

pause
