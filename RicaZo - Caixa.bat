@echo off
:: ==========================================================
:: RicaZo PDV - Impressao Direta (Sem Dialogo do Chrome)
:: ==========================================================
:: Abre o Chrome com perfil DEDICADO + --kiosk-printing
:: Assim a impressao vai DIRETO para a impressora padrao
:: SEM abrir o dialogo de "Escolher impressora".
::
:: VANTAGEM: Usa um perfil separado do Chrome normal,
:: entao voce pode ter outras janelas do Chrome abertas
:: sem interferir. Funciona sempre!
::
:: Na PRIMEIRA vez: o Chrome vai abrir "limpo" (sem login).
:: Faca login no RicaZo normalmente. A partir dai o perfil
:: fica salvo e da proxima vez ja abre logado.
:: ==========================================================

:: Cria pasta do perfil se nao existir
if not exist "%LOCALAPPDATA%\RicaZo-PDV" mkdir "%LOCALAPPDATA%\RicaZo-PDV"

:: Abre Chrome com perfil isolado + impressao direta
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --user-data-dir="%LOCALAPPDATA%\RicaZo-PDV" ^
  --kiosk-printing ^
  --disable-popup-blocking ^
  --no-first-run ^
  --no-default-browser-check ^
  "https://ricazo.netlify.app"
