@echo off
:: ===========================================
:: RicaZo PDV - Atalho para Impressão Direta
:: ===========================================
:: Abre o Chrome com --kiosk-printing que envia
:: a impressão DIRETO para a impressora padrão
:: sem abrir o diálogo de escolha.
::
:: IMPORTANTE: Feche TODAS as janelas do Chrome
:: antes de executar este atalho, senão a flag
:: não será aplicada.
:: ===========================================

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing "https://ricazo.netlify.app"
