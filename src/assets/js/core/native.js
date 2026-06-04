/**
 * RICAZO - Runtime Nativo (Capacitor)
 *
 * Só faz algo quando rodando dentro do APK Android (WebView Capacitor).
 * No navegador desktop/web, sai cedo e não altera nada.
 *
 * Responsabilidades:
 *  1. Auto-atualização: compara a versão instalada com o update-manifest.json
 *     hospedado no site e, se houver versão nova, mostra um modal com botão
 *     que abre o download do APK no navegador.
 *  2. Botão/gesto de voltar do Android: navega no histórico da WebView e, na
 *     tela inicial (sem histórico), pede confirmação antes de fechar o app.
 *
 * Como é vanilla JS (sem bundler), usamos a ponte global window.Capacitor.Plugins
 * que o Capacitor injeta automaticamente ao carregar o site remoto (server.url).
 */
(function () {
  'use strict';

  const SITE_BASE = 'https://ricazo.netlify.app';
  const MANIFEST_URL = `${SITE_BASE}/update-manifest.json`;
  const RECHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

  // Sai cedo se não for plataforma nativa (APK). No browser, nada acontece.
  const Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
    return;
  }

  const App = Cap.Plugins && Cap.Plugins.App;
  const Browser = Cap.Plugins && Cap.Plugins.Browser;

  // ── Util: comparação semver simples (retorna >0 se a>b, <0 se a<b, 0 igual) ──
  function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  // ── Modal de atualização (DOM puro, sem depender do CSS do app) ──────────────
  let modalAberto = false;
  function mostrarModalUpdate(manifest, versaoInstalada) {
    if (modalAberto) return;
    modalAberto = true;

    const overlay = document.createElement('div');
    overlay.id = 'ricazo-update-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);' +
      'display:flex;align-items:center;justify-content:center;padding:1.5rem;' +
      'font-family:system-ui,-apple-system,sans-serif;';

    const notas = (manifest.notes || 'Melhorias e correções.').replace(/</g, '&lt;');

    overlay.innerHTML =
      '<div style="background:#fff;color:#1A1A1A;max-width:380px;width:100%;' +
      'border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
        '<div style="background:#E8913A;padding:1.5rem;text-align:center;color:#fff;">' +
          '<div style="font-size:2.5rem;line-height:1;margin-bottom:0.5rem;">📲</div>' +
          '<div style="font-size:1.2rem;font-weight:800;">Atualização disponível</div>' +
          '<div style="font-size:0.85rem;opacity:0.9;margin-top:0.25rem;">' +
            'Versão ' + manifest.latestVersion + ' &nbsp;•&nbsp; instalada: ' + versaoInstalada +
          '</div>' +
        '</div>' +
        '<div style="padding:1.5rem;">' +
          '<p style="margin:0 0 1.25rem 0;font-size:0.9rem;color:#555;line-height:1.5;">' + notas + '</p>' +
          '<button id="ricazo-update-btn" style="width:100%;background:#E8913A;color:#fff;' +
            'border:none;padding:0.9rem;border-radius:10px;font-size:1rem;font-weight:700;' +
            'cursor:pointer;">Atualizar agora</button>' +
          (manifest.forceUpdate ? '' :
            '<button id="ricazo-update-later" style="width:100%;background:transparent;' +
            'color:#999;border:none;padding:0.75rem;margin-top:0.5rem;font-size:0.85rem;' +
            'cursor:pointer;">Mais tarde</button>') +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    const url = manifest.url && manifest.url.startsWith('http')
      ? manifest.url
      : `${SITE_BASE}${manifest.url || '/downloads/RicaZo%20PDV.apk'}`;

    document.getElementById('ricazo-update-btn').addEventListener('click', async () => {
      try {
        if (Browser) await Browser.open({ url });
        else window.open(url, '_system');
      } catch (e) {
        console.error('[Update] Erro ao abrir download:', e);
      }
    });

    const btnLater = document.getElementById('ricazo-update-later');
    if (btnLater) {
      btnLater.addEventListener('click', () => {
        overlay.remove();
        modalAberto = false;
      });
    }
  }

  // ── Verificação de atualização ───────────────────────────────────────────────
  let versaoInstalada = '0.0.0';
  async function checkUpdate() {
    try {
      if (!App) return;
      const info = await App.getInfo();
      versaoInstalada = info.version;

      const resp = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!resp.ok) {
        console.warn('[Update] Manifest indisponível:', resp.status);
        return;
      }

      const manifest = await resp.json();
      if (compareVersions(manifest.latestVersion, versaoInstalada) > 0) {
        console.log(`[Update] Nova versão: ${manifest.latestVersion} (instalada: ${versaoInstalada})`);
        mostrarModalUpdate(manifest, versaoInstalada);
      } else {
        console.log(`[Update] Já está atualizado: ${versaoInstalada}`);
      }
    } catch (e) {
      console.error('[Update] Erro ao verificar atualizações:', e);
    }
  }

  // ── Botão/gesto de voltar do Android ─────────────────────────────────────────
  function registrarBotaoVoltar() {
    if (!App) return;
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        if (window.confirm('Sair do RicaZo PDV?')) {
          App.exitApp();
        }
      }
    });
  }

  // ── Inicialização ────────────────────────────────────────────────────────────
  function init() {
    registrarBotaoVoltar();
    checkUpdate(); // ao abrir

    // Re-checa quando o app volta ao foreground
    if (App) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) checkUpdate();
      });
    }

    // Re-checa periodicamente enquanto o app está aberto
    setInterval(checkUpdate, RECHECK_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
