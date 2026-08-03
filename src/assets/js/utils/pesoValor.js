/**
 * RICAZO - Peso ⇄ Valor (produtos vendidos por KG)
 *
 * Monta e sincroniza os dois campos do modal de peso: o operador pode digitar
 * o peso em KG e ver o valor em R$, ou digitar o valor em R$ e ver o peso.
 * Usado pelo PDV e pelo Balcão do Caixa.
 *
 * O campo de peso mantém o name="peso", então os handlers de submit dos
 * modais continuam lendo o mesmo campo de sempre.
 */

class PesoValor {
  /** Bloco com os dois campos sincronizados */
  campos({ precoKg, idPeso = 'input-peso', idValor = 'input-valor', autofocus = true }) {
    const p = Number(precoKg) || 0;
    return `
      <div class="peso-valor-grid">
        <div>
          <label class="form-label" for="${idPeso}">Peso (KG)</label>
          <input type="number" step="0.001" min="0.001" name="peso" id="${idPeso}"
                 class="form-input peso-valor-input" required ${autofocus ? 'autofocus' : ''} placeholder="0.000"
                 oninput="pesoValor.sincronizarDoPeso(${p}, '${idPeso}', '${idValor}')">
        </div>
        <div class="peso-valor-sinal">⇄</div>
        <div>
          <label class="form-label" for="${idValor}">Valor (R$)</label>
          <input type="number" step="0.01" min="0" id="${idValor}"
                 class="form-input peso-valor-input" placeholder="0.00"
                 oninput="pesoValor.sincronizarDoValor(${p}, '${idPeso}', '${idValor}')"
                 onchange="pesoValor.sincronizarDoValor(${p}, '${idPeso}', '${idValor}', true)">
        </div>
      </div>
    `;
  }

  /** Botões de atalho de peso (+50g, +100g, ...) */
  atalhos({ precoKg, idPeso = 'input-peso', idValor = 'input-valor', passos = [0.05, 0.1, 0.15, 0.2, 0.25] }) {
    const p = Number(precoKg) || 0;
    return passos.map(kg => `
      <button type="button" class="btn btn-sm btn-secondary" onclick="pesoValor.somar(${p}, '${idPeso}', '${idValor}', ${kg})">
        + ${Math.round(kg * 1000)}g
      </button>
    `).join('');
  }

  /** Botão de limpar os dois campos */
  botaoZerar({ idPeso = 'input-peso', idValor = 'input-valor' }) {
    return `<button type="button" class="btn btn-sm btn-ghost" onclick="pesoValor.zerar('${idPeso}', '${idValor}')">🔄 Zerar</button>`;
  }

  // ==========================================
  // SINCRONIZAÇÃO
  // ==========================================

  /** Digitou o peso → calcula o valor */
  sincronizarDoPeso(precoKg, idPeso, idValor) {
    const elPeso = document.getElementById(idPeso);
    const elValor = document.getElementById(idValor);
    if (!elPeso || !elValor) return;

    const peso = parseFloat(elPeso.value);
    if (!(precoKg > 0) || isNaN(peso) || peso <= 0) { elValor.value = ''; return; }

    elValor.value = (peso * precoKg).toFixed(2);
  }

  /**
   * Digitou o valor → calcula o peso.
   * @param {boolean} normalizar Ao sair do campo, reescreve o valor a partir do
   *        peso arredondado, para o R$ exibido ser exatamente o que vai ser
   *        cobrado (ex: R$ 50,00 a R$ 89,90/kg = 0.556 kg = R$ 49,98).
   */
  sincronizarDoValor(precoKg, idPeso, idValor, normalizar = false) {
    const elPeso = document.getElementById(idPeso);
    const elValor = document.getElementById(idValor);
    if (!elPeso || !elValor) return;

    const valor = parseFloat(elValor.value);
    if (!(precoKg > 0) || isNaN(valor) || valor <= 0) { elPeso.value = ''; return; }

    const peso = Math.round((valor / precoKg) * 1000) / 1000;
    elPeso.value = peso.toFixed(3);
    if (normalizar) elValor.value = (peso * precoKg).toFixed(2);
  }

  /** Soma um atalho de peso e atualiza o valor */
  somar(precoKg, idPeso, idValor, kg) {
    const elPeso = document.getElementById(idPeso);
    if (!elPeso) return;

    const atual = parseFloat(elPeso.value) || 0;
    elPeso.value = (atual + kg).toFixed(3);
    this.sincronizarDoPeso(precoKg, idPeso, idValor);
    elPeso.focus();
  }

  zerar(idPeso, idValor) {
    const elPeso = document.getElementById(idPeso);
    const elValor = document.getElementById(idValor);
    if (elValor) elValor.value = '';
    if (elPeso) { elPeso.value = ''; elPeso.focus(); }
  }
}

const pesoValor = new PesoValor();
window.pesoValor = pesoValor;
