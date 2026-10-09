@echo off
rem Avvio dall'icona: apre la finestra del launcher (scripts\launch.mjs), questa console si chiude subito.
cd /d "%~dp0\..\.."
set NODE=node
where node >nul 2>nul || set NODE="%ProgramFiles%\nodejs\node.exe"
start "" /min %NODE% scripts\launch.mjs
