/**
 * RICAZO - Impressão Compartilhada (Caixa e PDV)
 *
 * Centraliza a impressão térmica de 80mm:
 *  - PC (Chrome --kiosk-printing): imprime local via window.print()
 *  - Mobile: grava o HTML na fila (fila_impressao) e o PC da unidade imprime
 *
 * Também monta o HTML do Extrato de Conferência (pré conta), usado tanto pelo
 * Caixa quanto pelo PDV. O extrato NÃO fecha a venda e NÃO lança pagamento:
 * serve só para o cliente conferir o consumo antes de pagar.
 */

class Printer {
  constructor() {
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.subscription = null;
    this.unidadeListener = null;
    this.viasConferencia = {}; // venda_id -> nº de vias já impressas nesta sessão
  }

  // ==========================================
  // FILA REMOTA (Mobile → PC via Supabase Realtime)
  // ==========================================

  /** Listener da fila de impressão. Idempotente: não duplica assinatura. */
  iniciarListener(unidadeId) {
    if (!unidadeId) return;
    if (this.subscription && this.unidadeListener === unidadeId) return;

    this.pararListener();

    const client = db.getClient();
    if (!client) return;

    this.unidadeListener = unidadeId;
    this.subscription = client
      .channel('fila-impressao')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'fila_impressao',
        filter: `unidade_id=eq.${unidadeId}`
      }, async (payload) => {
        const job = payload.new;
        if (job.status !== 'pendente') return;

        this.imprimirLocal(job.html);

        try {
          await client.from('fila_impressao')
            .update({ status: 'impresso', impresso_em: new Date().toISOString() })
            .eq('id', job.id);
        } catch (e) {
          console.warn('Erro ao marcar impressão como concluída:', e);
        }
      })
      .subscribe();

    console.log('🖨️ Listener de impressão remota ativo para esta unidade.');
  }

  pararListener() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.unidadeListener = null;
  }

  async enviarParaFila(html, unidadeId) {
    try {
      const client = db.getClient();
      if (!client) throw new Error('Supabase não conectado');
      const { error } = await client.from('fila_impressao').insert({
        unidade_id: unidadeId,
        html: html,
        solicitado_por: auth.getCurrentUser()?.id || null,
        status: 'pendente'
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Erro ao enviar para fila de impressão:', e);
      return false;
    }
  }

  /** Limpa registros de impressão com mais de 24h para não acumular lixo */
  async limparFilaAntiga() {
    try {
      const client = db.getClient();
      if (!client) return;
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await client.from('fila_impressao').delete().lt('created_at', ontem);
    } catch (e) { /* silencioso */ }
  }

  // ==========================================
  // IMPRESSÃO
  // ==========================================

  /** Imprime localmente via window.print() (PC com Chrome --kiosk-printing) */
  imprimirLocal(html) {
    let printDiv = document.getElementById('print-section');
    if (!printDiv) {
      printDiv = document.createElement('div');
      printDiv.id = 'print-section';
      document.body.appendChild(printDiv);
    }
    printDiv.innerHTML = html;
    setTimeout(() => window.print(), 150);
  }

  /**
   * Impressão inteligente:
   * - PC: imprime local
   * - Mobile: manda pra fila e o PC da unidade imprime
   * @param {string} mensagemEnvio Aviso opcional exibido no mobile quando o envio dá certo
   */
  imprimir(html, unidadeId, mensagemEnvio = null) {
    if (this.isMobile) {
      this.enviarParaFila(html, unidadeId).then(ok => {
        if (!ok) alert('❌ Erro ao enviar impressão para o PC. Verifique a conexão.');
        else if (mensagemEnvio) alert(mensagemEnvio);
      });
      return;
    }
    this.imprimirLocal(html);
  }

  // ==========================================
  // EXTRATO DE CONFERÊNCIA (PRÉ CONTA)
  // ==========================================

  /** Conta e devolve o número da via de conferência desta comanda */
  proximaVia(vendaId) {
    if (!vendaId) return 1;
    this.viasConferencia[vendaId] = (this.viasConferencia[vendaId] || 0) + 1;
    return this.viasConferencia[vendaId];
  }

  /** Descrição da quantidade respeitando produto por peso */
  _descQuantidade(item) {
    const qtd = parseFloat(item.quantidade);
    const porPeso = item.produto?.tipo_preco === 'peso';
    return porPeso ? `${qtd.toFixed(3)} kg` : `${qtd}x`;
  }

  /**
   * Monta o HTML do extrato de conferência.
   * @param {object} dados unidade, identificador, itens, subtotal, taxaPercent,
   *                       taxaValor, atendente, vendaId, abertaEm, via
   */
  extratoConferenciaHtml(dados) {
    const {
      unidade, identificador, itens, subtotal,
      taxaPercent = 0, taxaValor = 0,
      atendente, vendaId, abertaEm, via = 1
    } = dados;

    const total = subtotal + taxaValor;
    const qtdLinhas = itens.length;

    const itensHtml = itens.map(i => {
      const nome = i.produto?.nome || '—';
      const precoUnit = parseFloat(i.preco_unitario);
      const subtotalItem = parseFloat(i.subtotal);
      const qtd = parseFloat(i.quantidade);
      const porPeso = i.produto?.tipo_preco === 'peso';
      const mostraDetalhe = porPeso || qtd !== 1;

      return `
        <div class="tk-row"><span>${this._descQuantidade(i)} ${nome}</span><span>R$ ${subtotalItem.toFixed(2)}</span></div>
        ${mostraDetalhe ? `<div class="tk-sub">${porPeso ? `${qtd.toFixed(3)} kg` : qtd} x R$ ${precoUnit.toFixed(2)}${porPeso ? ' /kg' : ''}</div>` : ''}
      `;
    }).join('');

    return `
      <div class="ticket-header">
        ${via > 1 ? `<div class="ticket-reprint">*** ${via}ª VIA ***</div>` : ''}
        <div class="ticket-title">Conferência</div>
        <div class="ticket-subtitle">${unidade?.nome || CONFIG.APP_NAME || 'RicaZo'}</div>
        ${unidade?.endereco ? `<div class="ticket-info">${unidade.endereco}</div>` : ''}
        ${unidade?.cnpj ? `<div class="ticket-info">CNPJ: ${unidade.cnpj}</div>` : ''}
      </div>
      <div class="ticket-divider"></div>

      <div class="tk-line"><b>EMITIDO:</b> ${new Date().toLocaleString('pt-BR')}</div>
      ${abertaEm ? `<div class="tk-line"><b>ABERTURA:</b> ${new Date(abertaEm).toLocaleString('pt-BR')}</div>` : ''}
      <div class="tk-line"><b>ATENDENTE:</b> ${atendente || 'Operador'}</div>
      ${vendaId ? `<div class="tk-line"><b>COMANDA:</b> #${vendaId.substring(0, 8).toUpperCase()}</div>` : ''}
      <div class="ticket-id-badge">${identificador}</div>
      <div class="ticket-divider"></div>

      <div class="ticket-section-title">Itens Consumidos (${qtdLinhas})</div>
      ${itensHtml}
      <div class="ticket-divider"></div>

      <div class="tk-row"><span>SUBTOTAL</span><span>R$ ${subtotal.toFixed(2)}</span></div>
      ${taxaValor > 0
        ? `<div class="tk-row"><span>TAXA DE SERVIÇO ${taxaPercent}%</span><span>R$ ${taxaValor.toFixed(2)}</span></div>`
        : `<div class="tk-line">Taxa de serviço não incluída</div>`}
      <div class="ticket-section-title" style="border: none; margin-bottom: 0;">Total a Pagar</div>
      <div class="ticket-total-grande">R$ ${total.toFixed(2)}</div>

      <div class="ticket-aviso">
        Extrato de conferência<br>
        Não é documento fiscal<br>
        Não é comprovante de pagamento
      </div>

      <div class="ticket-footer">
        <div class="ticket-thanks">Confira os itens antes de pagar</div>
        <div class="ticket-brand">${new Date().getFullYear()} — ${CONFIG.APP_NAME || 'RicaZo'}</div>
      </div>
    `;
  }
}

const printer = new Printer();
window.printer = printer;
