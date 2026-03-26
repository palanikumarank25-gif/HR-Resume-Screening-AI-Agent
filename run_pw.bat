@echo off
"c:\Users\palan\Documents\HR Resume Screening AI Agent\backend\venv\Scripts\python.exe" -m pip install playwright
"c:\Users\palan\Documents\HR Resume Screening AI Agent\backend\venv\Scripts\python.exe" -m playwright install chromium
"c:\Users\palan\Documents\HR Resume Screening AI Agent\backend\venv\Scripts\python.exe" test_frontend.py
