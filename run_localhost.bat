@echo off
setlocal

echo [1/4] Starting Nexxora HR AI on localhost...

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

echo [2/4] Activating backend virtualenv and applying migrations...
call "%BACKEND%\venv\Scripts\activate.bat"
cd /d "%BACKEND%"
python manage.py migrate --noinput

echo [3/4] Starting Django backend at http://127.0.0.1:8000
start "Nexxora Backend" cmd /k "cd /d %BACKEND% && call venv\Scripts\activate.bat && python manage.py runserver 127.0.0.1:8000"

echo [4/4] Starting frontend at http://127.0.0.1:5501
start "Nexxora Frontend" cmd /k "cd /d %FRONTEND% && python -m http.server 5501"

echo.
echo Backend:  http://127.0.0.1:8000/api/analytics/
echo Frontend: http://127.0.0.1:5501/auth.html
echo App:      http://127.0.0.1:5501/app.html
echo Root:     http://127.0.0.1:5501/
echo Booking:  http://127.0.0.1:5501/booking.html?token=YOUR_TOKEN
echo.
echo Optional Celery worker:
echo cd /d "%BACKEND%" ^&^& call venv\Scripts\activate.bat ^&^& celery -A hr_resume_ai worker -l info
echo.
pause
