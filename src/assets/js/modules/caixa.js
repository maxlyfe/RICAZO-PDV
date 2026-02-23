/**
 * RICAZO - Módulo Caixa (Fechamento, Venda Rápida, Taxa de Serviço e Impressão)
 */

class CaixaModule {
  constructor() {
    this.unidadeAtual = null;
    this.vendasAbertas = [];
    this.mesas = [];
    this.usuarios = {}; 
    this.formasPagamento = [];
    this.produtos = []; 
    
    this.vendaSelecionada = null;
    this.pagamentosAtuais = [];
    this.taxaServicoPercent = 0; // Controle da Taxa de Garçom
    
    this.carrinhoBalcao = []; 
  }

  async init() {
    const unidade = auth.getUnidadeAtual();
    if (!unidade) return;
    this.unidadeAtual = unidade.id;
    this.vendaSelecionada = null;
    this.pagamentosAtuais = [];
    this.taxaServicoPercent = 0;
    this.carrinhoBalcao = [];

    await Promise.all([
      this.loadUsuarios(),
      this.loadMesas(),
      this.loadFormasPagamento(),
      this.loadProdutos(),
      this.loadVendasAbertas()
    ]);
    
    this.render();
    
    if(this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      if(document.getElementById('caixa-content')) this.refreshVendasAbertas();
      else clearInterval(this.interval);
    }, 10000); 
  }

  async loadUsuarios() {
    try {
      const { data } = await db.getClient().from('usuarios').select('id, nome');
      this.usuarios = (data || []).reduce((acc, u) => { acc[u.id] = u.nome; return acc; }, {});
    } catch (error) {}
  }

  async loadMesas() {
    try {
      const { data } = await db.getClient().from('unidade_mesas').select('*').eq('unidade_id', this.unidadeAtual);
      this.mesas = data || [];
    } catch (error) {}
  }

  async loadFormasPagamento() {
    try {
      const { data } = await db.getClient().from('formas_pagamento').select('*').eq('ativo', true).order('nome');
      this.formasPagamento = data || [];
    } catch (error) {}
  }

  async loadProdutos() {
    try {
      const { data } = await db.getClient().from('produtos').select(`*, precos:produto_precos(*)`).eq('ativo', true).eq('visivel', true).order('nome');
      this.produtos = (data || []).map(p => {
        const preco = p.precos?.find(pr => pr.unidade_id === this.unidadeAtual);
        return { ...p, preco_venda: preco ? preco.preco : p.preco_base };
      });
    } catch (error) {}
  }

  async loadVendasAbertas() {
    try {
      const { data } = await db.getClient()
        .from('vendas')
        .select(`*, itens:venda_itens(*, produto:produtos(nome, tipo_preco))`)
        .eq('unidade_id', this.unidadeAtual)
        .eq('status', 'aberta')
        .order('solicitou_fechamento', { ascending: false })
        .order('created_at', { ascending: true });

      this.vendasAbertas = data || [];
      
      if (this.vendaSelecionada && !this.vendasAbertas.find(v => v.id === this.vendaSelecionada.id)) {
        this.selecionarVenda(null);
      } else if (this.vendaSelecionada) {
        this.vendaSelecionada = this.vendasAbertas.find(v => v.id === this.vendaSelecionada.id);
      }
    } catch (error) {}
  }

  async refreshVendasAbertas() {
    await this.loadVendasAbertas();
    this.renderListaComandas();
    if (this.vendaSelecionada) this.renderDetalhesVenda();
  }

  render() {
    const container = document.getElementById('caixa-content');
    if (!container) return;

    container.innerHTML = `
      <style>
        .caixa-container { display: grid; grid-template-columns: 350px 1fr; gap: 1.5rem; height: calc(100vh - 140px); }
        @media (max-width: 1024px) { .caixa-container { grid-template-columns: 1fr; height: auto; } }
        .comandas-lista { background: var(--bg-card); border-radius: var(--border-radius-lg); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; overflow: hidden; }
        .comanda-item { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: var(--transition); display: flex; justify-content: space-between; align-items: center; border-left: 4px solid transparent; }
        .comanda-item:hover { background: var(--bg-hover); }
        .comanda-item.ativa { background: var(--bg-secondary); border-left-color: var(--primary); }
        .comanda-item.urgente { border-left-color: var(--danger); animation: pulse 2s infinite; }
      </style>
      
      <div class="caixa-container animate-fade-in">
        <div class="comandas-lista">
          <div class="card-header" style="padding: 1.5rem 1.5rem 0.5rem; border-bottom: none; margin-bottom: 0;">
            <h3 class="card-title">📝 Comandas</h3>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn btn-ghost btn-sm" onclick="caixaModule.refreshVendasAbertas()" title="Atualizar">🔄</button>
              <button class="btn btn-primary btn-sm" onclick="caixaModule.abrirModalNovaVendaRápida()">🛒 Nova Venda</button>
            </div>
          </div>
          <div style="overflow-y: auto; flex: 1;" class="custom-scrollbar" id="lista-comandas-caixa">
            ${this.renderListaComandasHTML()}
          </div>
        </div>
        <div class="painel-pedido" id="detalhes-venda-caixa" style="display: flex; flex-direction: column;">
          ${this.renderDetalhesVendaHTML()}
        </div>
      </div>
    `;
  }

  renderListaComandas() {
    const div = document.getElementById('lista-comandas-caixa');
    if (div) div.innerHTML = this.renderListaComandasHTML();
  }

  renderListaComandasHTML() {
    if (this.vendasAbertas.length === 0) return `<div class="text-center" style="padding: 3rem; color: var(--text-muted);">Nenhuma venda em andamento</div>`;

    return this.vendasAbertas.map(v => {
      const mesa = this.mesas.find(m => m.id === v.mesa_id);
      const titulo = v.tipo === 'balcao' ? '🛒 Balcão' : `🍽️ Mesa ${mesa ? mesa.numero : v.identificador}`;
      const isAtiva = this.vendaSelecionada?.id === v.id;
      const isUrgente = v.solicitou_fechamento && !isAtiva;
      const tempo = new Date(v.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
      
      // Subtotal dos itens puro para exibição na lista
      const subtotalItens = v.itens.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);

      return `
        <div class="comanda-item ${isAtiva ? 'ativa' : ''} ${isUrgente ? 'urgente' : ''}" onclick="caixaModule.selecionarVenda('${v.id}')">
          <div>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 1.1rem;">${titulo}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Aberta às ${tempo}</div>
            ${v.solicitou_fechamento ? `<div style="font-size: 0.75rem; color: var(--danger); font-weight: 600; margin-top: 0.25rem;">🔔 Pagar</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; color: var(--primary); font-size: 1.15rem;">R$ ${subtotalItens.toFixed(2)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  selecionarVenda(id) {
    this.vendaSelecionada = id ? this.vendasAbertas.find(v => v.id === id) : null;
    
    // Se for mesa, aplica 10% por padrão. Se for balcão, 0%.
    if (this.vendaSelecionada) {
      this.taxaServicoPercent = this.vendaSelecionada.tipo === 'mesa' ? 10 : 0;
    }
    
    this.pagamentosAtuais = [];
    this.renderListaComandas();
    this.renderDetalhesVenda();
  }

  setTaxaServico(percent) {
    this.taxaServicoPercent = percent;
    this.renderDetalhesVenda();
  }

  renderDetalhesVenda() {
    const div = document.getElementById('detalhes-venda-caixa');
    if (div) div.innerHTML = this.renderDetalhesVendaHTML();
  }

  renderDetalhesVendaHTML() {
    if (!this.vendaSelecionada) {
      return `
        <div class="empty-state" style="padding: 4rem 2rem; flex: 1; display: flex; flex-direction: column; justify-content: center;">
          <div class="empty-state-icone" style="font-size: 4rem;">💵</div>
          <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">Caixa Livre</h3>
          <p>Selecione uma comanda ou inicie uma nova venda rápida.</p>
        </div>
      `;
    }

    const v = this.vendaSelecionada;
    const mesa = this.mesas.find(m => m.id === v.mesa_id);
    const titulo = v.tipo === 'balcao' ? '🛒 Balcão' : `Mesa ${mesa ? mesa.numero : v.identificador}`;
    const abertPor = this.usuarios[v.usuario_abertura_id] || 'Desconhecido';
    
    // CÁLCULO FINANCEIRO
    const subtotalItens = v.itens.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
    const valorTaxa = subtotalItens * (this.taxaServicoPercent / 100);
    const totalVenda = subtotalItens + valorTaxa;
    
    const totalPago = this.pagamentosAtuais.reduce((sum, p) => sum + p.valor, 0);
    const restante = totalVenda - totalPago;
    const troco = restante < 0 ? Math.abs(restante) : 0;
    const falta = restante > 0 ? restante : 0;

    return `
      <div class="painel-pedido-header" style="display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0;">${titulo}</h2>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Aberta por: ${abertPor}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 2.2rem; font-weight: 800; color: var(--primary); line-height: 1;">R$ ${totalVenda.toFixed(2)}</div>
        </div>
      </div>
      
      <div class="pedido-itens custom-scrollbar" style="flex: 1; background: var(--bg-primary); padding: 1rem;">
        <h4 style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase;">Itens Consumidos</h4>
        ${v.itens.map(item => `
          <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px dashed var(--border-color);">
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${item.quantidade}x ${item.produto?.nome}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Lançado por ${this.usuarios[item.usuario_id] || 'Sistema'} às ${new Date(item.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            <div style="font-weight: 700; color: var(--text-primary);">R$ ${parseFloat(item.subtotal).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>

      <!-- CONTROLE DE TAXA DE SERVIÇO (SÓ PARA MESAS) -->
      ${v.tipo === 'mesa' ? `
        <div style="background: var(--bg-secondary); padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Taxa de Serviço (Opcional)</div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm ${this.taxaServicoPercent === 0 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(0)">0%</button>
              <button class="btn btn-sm ${this.taxaServicoPercent === 10 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(10)">10%</button>
              <button class="btn btn-sm ${this.taxaServicoPercent === 12 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(12)">12%</button>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Valor da Taxa</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">+ R$ ${valorTaxa.toFixed(2)}</div>
          </div>
        </div>
      ` : ''}
      
      <!-- ÁREA DE PAGAMENTO -->
      <div style="background: var(--bg-primary); border-top: 1px solid var(--border-color); padding: 1.5rem; flex-shrink: 0;">
        ${this.pagamentosAtuais.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary);">Valores Recebidos</h4>
            ${this.pagamentosAtuais.map((p, idx) => `
              <div style="display: flex; justify-content: space-between; background: var(--bg-secondary); padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 0.25rem; border: 1px solid var(--border-color);">
                <span style="font-weight: 600;">${p.forma_nome}</span>
                <div style="display: flex; gap: 1rem; align-items: center;">
                  <span style="font-weight: 800; color: var(--success);">R$ ${p.valor.toFixed(2)}</span>
                  <button class="btn-ghost" style="color: var(--danger); border: none; background: transparent; cursor: pointer; padding: 0 5px;" onclick="caixaModule.removerPagamento(${idx})">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${falta > 0 ? `
          <div style="background: var(--bg-secondary); padding: 1.25rem; border-radius: var(--border-radius); border: 1px solid var(--border-color); box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <label class="form-label" style="text-align: center; margin-bottom: 0.5rem; font-size: 0.85rem;">1º Informe o Valor a Receber (R$)</label>
            <input type="number" step="0.01" id="input-valor-pgto" class="form-input" style="font-size: 2rem; font-weight: 800; text-align: center; color: var(--primary); margin-bottom: 1.25rem; height: auto;" value="${falta.toFixed(2)}">
            
            <label class="form-label" style="margin-bottom: 0.75rem; text-align: center; font-size: 0.85rem;">2º Selecione a Forma de Pagamento</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.5rem;">
              ${this.formasPagamento.map(f => `
                <button type="button" class="btn btn-secondary" style="height: 50px; font-weight: 700; font-size: 0.95rem; border: 2px solid var(--border-color); transition: var(--transition); background: var(--bg-primary);" 
                        onclick="caixaModule.adicionarPagamentoRapido('${f.id}', '${f.nome}')"
                        onmouseover="this.style.borderColor='var(--primary)'; this.style.color='var(--primary)';"
                        onmouseout="this.style.borderColor='var(--border-color)'; this.style.color='var(--text-primary)';">
                  ${f.nome}
                </button>
              `).join('')}
            </div>
          </div>
          
          <div style="margin-top: 1rem; text-align: right; font-size: 1.25rem; font-weight: 700; color: var(--danger);">
            Falta Receber: R$ ${falta.toFixed(2)}
          </div>
        ` : `
          <div style="text-align: center; padding: 0.5rem 0;">
            ${troco > 0 ? `<div style="font-size: 1.5rem; font-weight: 800; color: var(--warning); margin-bottom: 1rem;">Troco a devolver: R$ ${troco.toFixed(2)}</div>` : `<div style="color: var(--success); font-weight: 800; font-size: 1.2rem; margin-bottom: 1rem;">Valor Exato Recebido!</div>`}
            <button class="btn btn-success btn-lg w-full" style="font-size: 1.25rem; padding: 1rem; box-shadow: var(--shadow-md);" onclick="caixaModule.finalizarVenda()">✅ FINALIZAR & IMPRIMIR TICKET</button>
          </div>
        `}
      </div>
    `;
  }

  adicionarPagamentoRapido(formaId, formaNome) {
    const inputEl = document.getElementById('input-valor-pgto');
    if (!inputEl) return;
    
    const valor = parseFloat(inputEl.value);
    if (isNaN(valor) || valor <= 0) {
      alert('⚠️ Informe um valor válido superior a zero.');
      return;
    }

    this.pagamentosAtuais.push({
      forma_id: formaId,
      forma_nome: formaNome,
      valor: valor
    });

    this.renderDetalhesVenda();
  }

  removerPagamento(index) {
    this.pagamentosAtuais.splice(index, 1);
    this.renderDetalhesVenda();
  }

  async finalizarVenda() {
    const btn = document.querySelector('button.btn-success');
    if(btn) { btn.disabled = true; btn.innerHTML = 'Processando...'; }

    try {
      const vId = this.vendaSelecionada.id;
      const usuarioId = auth.getCurrentUser()?.id;

      // Recalcula totais com a taxa final
      const subtotalVenda = this.vendaSelecionada.itens.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
      const valorTaxa = subtotalVenda * (this.taxaServicoPercent / 100);
      const totalVendaFinal = subtotalVenda + valorTaxa;

      let trocoRestante = this.pagamentosAtuais.reduce((sum, p) => sum + p.valor, 0) - totalVendaFinal;
      const trocoTotalImpressao = trocoRestante > 0 ? trocoRestante : 0;
      
      const insertsPgto = this.pagamentosAtuais.map(p => {
        let trocoDestaForma = 0;
        if (trocoRestante > 0 && p.forma_nome.toLowerCase().includes('dinheiro')) {
           trocoDestaForma = trocoRestante;
           trocoRestante = 0;
        }
        return {
          venda_id: vId,
          forma_pagamento_id: p.forma_id,
          valor: p.valor,
          troco: trocoDestaForma,
          usuario_id: usuarioId,
          data_recebimento: new Date().toISOString().split('T')[0]
        };
      });

      // 1. Salva Pagamentos
      await db.insert('pagamentos', insertsPgto);
      
      // 2. Baixa Estoque
      await this.baixarEstoque(this.vendaSelecionada, usuarioId);

      // 3. Atualiza Venda (Salva o Total Final e a Taxa Aplicada)
      await db.update('vendas', vId, {
        status: 'fechada',
        total: totalVendaFinal,
        taxa_servico: valorTaxa,
        data_fechamento: new Date().toISOString(),
        usuario_fechamento_id: usuarioId
      });

      // 4. Imprime Ticket (Passamos os clones para não depender do estado que será limpo)
      this.imprimirTicket({ ...this.vendaSelecionada }, [...this.pagamentosAtuais], trocoTotalImpressao, subtotalVenda, valorTaxa, this.taxaServicoPercent);

      this.vendaSelecionada = null;
      this.pagamentosAtuais = [];
      await this.refreshVendasAbertas();

    } catch (error) {
      alert('❌ Erro: ' + error.message);
      if(btn) { btn.disabled = false; btn.innerHTML = '✅ FINALIZAR VENDA'; }
    }
  }

  // MOTOR DE IMPRESSÃO
  imprimirTicket(venda, pagamentos, trocoTotal, subtotal, taxaValor, taxaPercent) {
    let printDiv = document.getElementById('print-section');
    if (!printDiv) {
      printDiv = document.createElement('div');
      printDiv.id = 'print-section';
      document.body.appendChild(printDiv);
    }

    const unidade = auth.getUnidadeAtual();
    const dataHora = new Date().toLocaleString('pt-BR');
    const atendente = auth.getCurrentUser()?.nome || 'Operador';
    const mesa = this.mesas.find(m => m.id === venda.mesa_id);
    const identificador = venda.tipo === 'balcao' ? 'BALCÃO' : `MESA ${mesa ? mesa.numero : venda.identificador}`;

    const html = `
      <div class="ticket-header">
        <div class="ticket-title">${CONFIG.APP_NAME || 'RicaZo'}</div>
        <div class="ticket-info">${unidade.nome}</div>
        <div class="ticket-info">${unidade.endereco || ''}</div>
        <div class="ticket-divider"></div>
        <div class="ticket-info">DATA: ${dataHora}</div>
        <div class="ticket-info">CAIXA: ${atendente}</div>
        <div class="ticket-info">PEDIDO: #${venda.id.substring(0,8).toUpperCase()} - <strong>${identificador}</strong></div>
        <div class="ticket-divider"></div>
      </div>
      
      <table class="ticket-table">
        <thead>
          <tr>
            <th>QTD</th>
            <th>PRODUTO</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${venda.itens.map(i => `
            <tr>
              <td>${i.quantidade}</td>
              <td>${i.produto?.nome}</td>
              <td>R$ ${parseFloat(i.subtotal).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="ticket-divider"></div>
      
      <table class="ticket-totals">
        <tr>
          <td>SUBTOTAL:</td>
          <td>R$ ${subtotal.toFixed(2)}</td>
        </tr>
        ${taxaValor > 0 ? `
        <tr>
          <td>TAXA SERVIÇO (${taxaPercent}%):</td>
          <td>R$ ${taxaValor.toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr>
          <td class="bold">TOTAL A PAGAR:</td>
          <td class="bold">R$ ${(subtotal + taxaValor).toFixed(2)}</td>
        </tr>
        <tr><td colspan="2"><div style="height:5px;"></div></td></tr>
        
        ${pagamentos.map(p => `
          <tr>
            <td>${p.forma_nome.toUpperCase()}:</td>
            <td>R$ ${p.valor.toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr>
          <td>TROCO:</td>
          <td class="bold">R$ ${trocoTotal.toFixed(2)}</td>
        </tr>
      </table>
      
      <div class="ticket-divider"></div>
      <div class="ticket-footer">
        <div style="font-weight: bold; margin-bottom: 5px;">OBRIGADO PELA PREFERÊNCIA!</div>
        <div>Volte Sempre</div>
      </div>
    `;
    
    printDiv.innerHTML = html;
    
    setTimeout(() => {
      window.print();
    }, 150);
  }

  async baixarEstoque(venda, usuarioId) {
    for (const item of venda.itens) {
      const { data: est } = await db.getClient().from('estoque').select('*').eq('produto_id', item.produto_id).eq('unidade_id', this.unidadeAtual).single();
      const qtdAnterior = est ? parseFloat(est.quantidade) : 0;
      const novaQtd = qtdAnterior - parseFloat(item.quantidade);

      if (est) await db.update('estoque', est.id, { quantidade: novaQtd, updated_by: usuarioId });
      else await db.insert('estoque', [{ unidade_id: this.unidadeAtual, produto_id: item.produto_id, quantidade: novaQtd, updated_by: usuarioId }]);

      await db.insert('estoque_movimentacao', [{
        unidade_id: this.unidadeAtual,
        produto_id: item.produto_id,
        tipo: 'saida',
        quantidade: -parseFloat(item.quantidade),
        quantidade_anterior: qtdAnterior,
        quantidade_nova: novaQtd,
        usuario_id: usuarioId,
        observacao: `Venda ${venda.tipo === 'balcao' ? 'Balcão' : 'Mesa'}`
      }]);
    }
  }

  // ==========================================
  // VENDA RÁPIDA (MINI-PDV DO CAIXA)
  // ==========================================
  abrirModalNovaVendaRápida() {
    this.carrinhoBalcao = [];
    const content = `
      <style>
        .modal-fullscreen { width: 95vw !important; max-width: 1200px !important; height: 90vh !important; }
        .mini-pdv-grid { display: grid; grid-template-columns: 1fr 400px; gap: 1.5rem; height: calc(100vh - 180px); }
        @media(max-width: 1024px) { .mini-pdv-grid { grid-template-columns: 1fr; height: auto; } }
        .pdv-grid-otimizado { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1.5rem; overflow-y: auto; flex: 1; align-content: start; }
        .produto-venda-card-otimizado { background: var(--bg-primary); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); padding: 1rem; text-align: center; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .produto-venda-card-otimizado:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: var(--shadow-md); }
      </style>
      
      <div class="card-header">
        <h3 class="card-title">🛒 Nova Venda Rápida (Balcão)</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      
      <div class="mini-pdv-grid">
        <div class="painel-produtos" style="box-shadow: none; border: 1px solid var(--border-color);">
          <div class="painel-produtos-header">
            <div class="painel-produtos-busca">
              <input type="text" placeholder="Buscar produto..." onkeyup="caixaModule.filtrarProdutosBalcao(this.value)">
            </div>
          </div>
          <div id="grade-produtos-balcao" class="pdv-grid-otimizado custom-scrollbar">
            ${this.renderProdutosBalcao(this.produtos)}
          </div>
        </div>
        <div class="painel-pedido" style="box-shadow: none; border: 1px solid var(--border-color);">
          <div class="painel-pedido-header"><h2 style="font-size: 1.25rem; font-weight: 800; color: var(--primary); margin: 0;">🛒 Comanda Atual</h2></div>
          <div id="carrinho-balcao" class="pedido-itens custom-scrollbar" style="padding: 1rem;"></div>
          <div class="pedido-resumo">
            <div class="pedido-resumo-total">
              <span class="pedido-resumo-total-label">Total:</span><span id="total-balcao" class="pedido-resumo-total-valor">R$ 0.00</span>
            </div>
          </div>
          <div class="pedido-acoes">
            <button class="btn btn-primary w-full btn-lg" onclick="caixaModule.confirmarVendaBalcao()">Ir para Pagamento →</button>
          </div>
        </div>
      </div>
    `;
    modal.open(content);
    document.querySelector('.modal-content').classList.add('modal-fullscreen');
    this.atualizarCarrinhoBalcao();
  }

  renderProdutosBalcao(lista) {
    if (lista.length === 0) return `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto encontrado.</div>`;
    return lista.map(p => `
      <div class="produto-venda-card-otimizado" onclick="caixaModule.addCarrinhoBalcao('${p.id}')">
        <div style="width: 80px; height: 80px; flex-shrink: 0; background: var(--bg-secondary); border-radius: var(--border-radius); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: var(--shadow-sm);">
          ${p.imagem_url ? `<img src="${p.imagem_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div style="display:none; font-size: 2rem;">🥖</div>` : '<div style="font-size: 2rem;">🥖</div>'}
        </div>
        <div style="width: 100%;">
          <div title="${p.nome}" style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.nome}</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary); margin-bottom: 0.25rem;">R$ ${p.preco_venda.toFixed(2)}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">
            <span style="background: var(--bg-secondary); padding: 0.15rem 0.5rem; border-radius: 12px; border: 1px solid var(--border-color);">${p.tipo_preco === 'peso' ? '⚖️ KG' : '📦 UN'}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  filtrarProdutosBalcao(termo) {
    const t = termo.toLowerCase();
    document.getElementById('grade-produtos-balcao').innerHTML = this.renderProdutosBalcao(this.produtos.filter(p => p.nome.toLowerCase().includes(t)));
  }

  abrirModalPesoBalcao(produtoId) {
    const produto = this.produtos.find(p => p.id === produtoId);
    if (!produto) return;
    const html = `
      <div id="modal-peso-secundario" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 1rem;">
        <div class="card" style="width: 100%; max-width: 400px; animation: modalSlideIn 0.2s ease;">
          <div class="card-header">
            <h3 class="card-title">⚖️ Informar Peso</h3>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('modal-peso-secundario').remove()">✕</button>
          </div>
          <form onsubmit="caixaModule.confirmarPesoBalcao(event, '${produto.id}')">
            <div style="text-align: center; margin-bottom: 1.5rem;"><h4 style="font-size: 1.25rem;">${produto.nome}</h4><p style="color: var(--primary); font-weight: 700;">R$ ${produto.preco_venda.toFixed(2)} / KG</p></div>
            <div style="margin-bottom: 1.5rem;">
              <label class="form-label" style="text-align: center; margin-bottom: 0.75rem;">Adicionar Quantidade</label>
              <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="caixaModule.somarPesoBalcao(0.050)">+ 50g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="caixaModule.somarPesoBalcao(0.100)">+ 100g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="caixaModule.somarPesoBalcao(0.150)">+ 150g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="caixaModule.somarPesoBalcao(0.200)">+ 200g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="caixaModule.somarPesoBalcao(0.250)">+ 250g</button>
              </div>
              <div style="text-align: center; margin-top: 0.75rem;"><button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('input-peso-balcao').value=''; document.getElementById('input-peso-balcao').focus();">🔄 Zerar</button></div>
            </div>
            <div class="form-group">
              <label class="form-label">Peso Total (em KG) *</label>
              <input type="number" step="0.001" min="0.001" name="peso" id="input-peso-balcao" class="form-input" style="font-size: 1.75rem; text-align: center; font-weight: 800; color: var(--primary);" required autofocus placeholder="0.000">
            </div>
            <div class="modal-actions" style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-peso-secundario').remove()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Adicionar</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  somarPesoBalcao(valorEmKg) {
    const input = document.getElementById('input-peso-balcao');
    if (!input) return;
    let pesoAtual = parseFloat(input.value) || 0;
    input.value = (pesoAtual + valorEmKg).toFixed(3);
    input.focus();
  }

  confirmarPesoBalcao(event, produtoId) {
    event.preventDefault();
    const peso = parseFloat(event.target.peso.value);
    const p = this.produtos.find(x => x.id === produtoId);
    if (p && peso > 0) {
      this.carrinhoBalcao.push({ p, qtd: peso });
      this.atualizarCarrinhoBalcao();
      document.getElementById('modal-peso-secundario').remove();
    }
  }

  addCarrinhoBalcao(id) {
    const p = this.produtos.find(x => x.id === id);
    if (!p) return;
    if (p.tipo_preco === 'peso') {
      this.abrirModalPesoBalcao(p.id);
    } else {
      const ext = this.carrinhoBalcao.find(i => i.p.id === id);
      if (ext) ext.qtd++; else this.carrinhoBalcao.push({ p, qtd: 1 });
      this.atualizarCarrinhoBalcao();
    }
  }

  atualizarCarrinhoBalcao() {
    const div = document.getElementById('carrinho-balcao');
    if(!div) return;
    let total = 0;
    if (this.carrinhoBalcao.length === 0) {
      div.innerHTML = `<div class="empty-state" style="padding: 2rem 1rem;"><div class="empty-state-icone" style="font-size: 3rem;">🛒</div><p>Comanda vazia</p></div>`;
    } else {
      div.innerHTML = this.carrinhoBalcao.map((i, idx) => {
        const sub = i.qtd * i.p.preco_venda;
        total += sub;
        return `
          <div class="pedido-item" style="padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); background: var(--bg-primary); display: flex; justify-content: space-between; align-items: center;">
            <div class="pedido-item-info"><div style="font-size: 0.9rem; font-weight: 600;">${i.p.nome}</div><div style="font-size: 0.85rem; color: var(--primary); font-weight: 700;">R$ ${sub.toFixed(2)}</div></div>
            <div class="pedido-item-acoes" style="display: flex; align-items: center; gap: 0.5rem;">
              ${i.p.tipo_preco === 'unidade' ? `<div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-secondary); padding: 0.25rem; border-radius: var(--border-radius);"><button class="btn-ghost" style="width: 24px; height: 24px; border:none; cursor:pointer;" onclick="caixaModule.alterarQtdBalcao(${idx}, -1)">-</button><span style="font-size: 0.85rem; min-width: 1.5rem; text-align: center; font-weight: 600;">${i.qtd}</span><button class="btn-ghost" style="width: 24px; height: 24px; border:none; cursor:pointer;" onclick="caixaModule.alterarQtdBalcao(${idx}, 1)">+</button></div>` : `<div style="font-size: 0.85rem; font-weight: 600; padding: 0.25rem 0.5rem;">${i.qtd} kg</div>`}
              <button style="width: 28px; height: 28px; border: none; background: transparent; color: var(--danger); cursor: pointer;" onclick="caixaModule.removerBalcao(${idx})">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }
    document.getElementById('total-balcao').innerText = `R$ ${total.toFixed(2)}`;
  }

  alterarQtdBalcao(idx, delta) {
    const item = this.carrinhoBalcao[idx];
    if (!item || item.p.tipo_preco === 'peso') return;
    item.qtd += delta;
    if (item.qtd <= 0) this.carrinhoBalcao.splice(idx, 1);
    this.atualizarCarrinhoBalcao();
  }

  removerBalcao(idx) {
    this.carrinhoBalcao.splice(idx, 1);
    this.atualizarCarrinhoBalcao();
  }

  async confirmarVendaBalcao() {
    if (this.carrinhoBalcao.length === 0) return;
    const total = this.carrinhoBalcao.reduce((s, i) => s + (i.qtd * i.p.preco_venda), 0);
    const uId = auth.getCurrentUser()?.id;
    const btn = event.target;
    if(btn) btn.disabled = true;

    try {
      const [novaVenda] = await db.insert('vendas', [{ unidade_id: this.unidadeAtual, tipo: 'balcao', identificador: 'Balcão', status: 'aberta', total: total, usuario_abertura_id: uId }]);
      await db.insert('venda_itens', this.carrinhoBalcao.map(i => ({
        venda_id: novaVenda.id, produto_id: i.p.id, quantidade: i.qtd, preco_unitario: i.p.preco_venda, subtotal: i.qtd * i.p.preco_venda, usuario_id: uId
      })));
      
      modal.close();
      await this.refreshVendasAbertas();
      this.selecionarVenda(novaVenda.id); 

    } catch (error) { 
      alert('❌ Erro: ' + error.message); 
      if(btn) btn.disabled = false; 
    }
  }
}

const caixaModule = new CaixaModule();
window.caixaModule = caixaModule;