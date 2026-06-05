/**
 * RICAZO - Verificador de Relógio do Dispositivo
 *
 * Compara a hora do aparelho com a hora REAL (do servidor) e avisa o usuário
 * se houver divergência, em 3 níveis de severidade. NÃO impede o uso do sistema
 * — apenas adverte e exige marcar um check-box para continuar.
 *
 * Por que isto importa: o sistema grava o instante exato de cada venda/turno a
 * partir do relógio do aparelho. Se o relógio estiver errado, os relatórios
 * (que são por dia) podem sair com vendas no dia/hora errados.
 *
 * Fonte de hora confiável: o cabeçalho HTTP "Date" de um fetch sem cache.
 * Funciona igual no navegador e dentro do APK (mesma origem).
 */
(function () {
  'use strict';

  // Limiares (fáceis de ajustar)
  const TOLERANCIA_MS = 2 * 60 * 1000;       // < 2 min: não avisa (latência normal)
  const LEVE_MAX_MS   = 60 * 60 * 1000;      // 2 min a 1h: aviso leve
  const FORTE_MAX_MS  = 3 * 60 * 60 * 1000;  // 1h a 3h: aviso forte
  // > 3h: alerta enfático

  const SS_KEY = 'ricazo_clock_ack'; // marca que o usuário já reconheceu nesta sessão

  // ── Obtém a hora real do servidor (header Date) ──────────────────────────────
  async function getServerTime() {
    const fontes = [
      () => fetch(window.location.origin + '/?_clk=' + Date.now(), { method: 'HEAD', cache: 'no-store' }),
      () => fetch('https://ejvwsxoozfkymskwfqii.supabase.co/auth/v1/health?_clk=' + Date.now(), { cache: 'no-store' })
    ];
    for (const tentar of fontes) {
      try {
        const t0 = Date.now();
        const resp = await tentar();
        const t1 = Date.now();
        const dateHeader = resp.headers.get('date');
        if (dateHeader) {
          // compensa metade do round-trip para reduzir erro de latência
          const latenciaMeia = (t1 - t0) / 2;
          return new Date(dateHeader).getTime() + latenciaMeia;
        }
      } catch (e) { /* tenta próxima fonte */ }
    }
    return null; // sem fonte confiável (ex.: offline) → não atrapalha
  }

  function nivel(absSkew) {
    if (absSkew < TOLERANCIA_MS) return null;
    if (absSkew <= LEVE_MAX_MS)  return 'leve';
    if (absSkew <= FORTE_MAX_MS) return 'forte';
    return 'enfatico';
  }

  function formatarDiferenca(ms) {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin} minuto${totalMin !== 1 ? 's' : ''}`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h${m > 0 ? (' ' + m + 'min') : ''}`;
  }

  const ESTILOS = {
    leve:     { cor: '#B45309', fundo: '#FEF3C7', borda: '#F59E0B', icone: '⏰', titulo: 'Relógio um pouco fora do horário' },
    forte:    { cor: '#9A3412', fundo: '#FFEDD5', borda: '#EA580C', icone: '⚠️', titulo: 'Atenção: relógio do aparelho incorreto' },
    enfatico: { cor: '#991B1B', fundo: '#FEE2E2', borda: '#DC2626', icone: '🚨', titulo: 'ALERTA: horário muito errado!' }
  };

  function mostrarModal(nivelAviso, skewMs, deviceTime, serverTime) {
    const est = ESTILOS[nivelAviso];
    const adiantado = skewMs > 0;
    const diffTxt = formatarDiferenca(Math.abs(skewMs));
    const direcao = adiantado ? 'ADIANTADO' : 'ATRASADO';

    const horaAparelho = new Date(deviceTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaCorreta  = new Date(serverTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const mensagemNivel = nivelAviso === 'enfatico'
      ? 'O horário deste aparelho está MUITO errado. Se não for corrigido, <strong>os relatórios de vendas e fechamento de caixa vão sair incorretos</strong> (vendas podem cair no dia/hora errados).'
      : nivelAviso === 'forte'
      ? 'O horário deste aparelho está bem fora do correto. Isto <strong>pode fazer os relatórios saírem errados</strong>. Recomendamos acertar o relógio o quanto antes.'
      : 'O horário deste aparelho está levemente fora do correto. Em geral não afeta os relatórios, mas vale a pena acertar.';

    const overlay = document.createElement('div');
    overlay.id = 'ricazo-clock-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.6);' +
      'display:flex;align-items:center;justify-content:center;padding:1.25rem;' +
      'font-family:system-ui,-apple-system,sans-serif;';

    overlay.innerHTML =
      '<div style="background:#fff;max-width:440px;width:100%;border-radius:16px;overflow:hidden;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.45);border-top:6px solid ' + est.borda + ';">' +
        '<div style="background:' + est.fundo + ';padding:1.25rem 1.5rem;text-align:center;color:' + est.cor + ';">' +
          '<div style="font-size:2.2rem;line-height:1;margin-bottom:0.4rem;">' + est.icone + '</div>' +
          '<div style="font-size:1.1rem;font-weight:800;">' + est.titulo + '</div>' +
        '</div>' +
        '<div style="padding:1.5rem;color:#1A1A1A;">' +
          '<p style="margin:0 0 1rem 0;font-size:0.9rem;line-height:1.5;color:#444;">' + mensagemNivel + '</p>' +
          '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:0.75rem 1rem;font-size:0.85rem;color:#374151;margin-bottom:1rem;">' +
            '<div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:0.35rem;"><span>Hora do aparelho:</span><strong>' + horaAparelho + '</strong></div>' +
            '<div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:0.35rem;"><span>Hora correta:</span><strong style="color:' + est.cor + ';">' + horaCorreta + '</strong></div>' +
            '<div style="display:flex;justify-content:space-between;gap:1rem;border-top:1px dashed #E5E7EB;padding-top:0.35rem;"><span>Diferença:</span><strong>' + diffTxt + ' ' + direcao + '</strong></div>' +
          '</div>' +
          '<p style="margin:0 0 1rem 0;font-size:0.8rem;color:#6B7280;line-height:1.5;">' +
            '💡 Como acertar: nas configurações do aparelho, ative <strong>"Data e hora automática"</strong> (hora da rede).' +
          '</p>' +
          '<label style="display:flex;align-items:flex-start;gap:0.6rem;cursor:pointer;font-size:0.85rem;color:#1A1A1A;margin-bottom:1rem;user-select:none;">' +
            '<input type="checkbox" id="ricazo-clock-ck" style="margin-top:0.2rem;width:18px;height:18px;flex-shrink:0;cursor:pointer;">' +
            '<span>Estou ciente de que o horário do aparelho está incorreto e de que os relatórios podem sair errados até eu acertá-lo.</span>' +
          '</label>' +
          '<button id="ricazo-clock-btn" disabled style="width:100%;background:' + est.borda + ';color:#fff;border:none;' +
            'padding:0.9rem;border-radius:10px;font-size:1rem;font-weight:700;cursor:not-allowed;opacity:0.5;transition:opacity 0.15s;">' +
            'Continuar mesmo assim' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    const ck = document.getElementById('ricazo-clock-ck');
    const btn = document.getElementById('ricazo-clock-btn');
    ck.addEventListener('change', () => {
      btn.disabled = !ck.checked;
      btn.style.cursor = ck.checked ? 'pointer' : 'not-allowed';
      btn.style.opacity = ck.checked ? '1' : '0.5';
    });
    btn.addEventListener('click', () => {
      if (!ck.checked) return;
      sessionStorage.setItem(SS_KEY, 'ack');
      overlay.remove();
    });
  }

  async function init() {
    // Mostra no máximo uma vez por sessão para não incomodar
    if (sessionStorage.getItem(SS_KEY)) return;

    const serverTime = await getServerTime();
    if (!serverTime) return; // sem internet / sem fonte confiável → não bloqueia nada

    const deviceTime = Date.now();
    const skew = deviceTime - serverTime; // >0 = aparelho adiantado
    const n = nivel(Math.abs(skew));

    if (!n) {
      // Relógio OK — NÃO marca a sessão, para re-checar em cada carregamento
      // (assim, se a hora mudar no meio do uso, o aviso ainda aparece).
      return;
    }
    mostrarModal(n, skew, deviceTime, serverTime);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
