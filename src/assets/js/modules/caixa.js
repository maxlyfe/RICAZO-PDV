/**
 * RICAZO - Módulo Caixa (Abertura, Fechamento, Venda Rápida e Impressão Z)
 */

class CaixaModule {
  constructor() {
    this.unidadeAtual = null;
    this.turnoAtual = null; // Guarda o estado do turno (Aberto/Fechado)
    
    this.vendasAbertas = [];
    this.mesas = [];
    this.usuarios = {}; 
    this.formasPagamento = [];
    this.produtos = []; 
    
    this.vendaSelecionada = null;
    this.pagamentosAtuais = [];
    this.taxaServicoPercent = 0; 
    
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

    // Carrega definições base
    await Promise.all([
      this.loadUsuarios(),
      this.loadMesas(),
      this.loadFormasPagamento(),
      this.loadProdutos(),
      this.loadTurnoAtual() // NOVO: Verifica se o caixa está aberto
    ]);
    
    // Se houver turno, carrega as vendas abertas
    if (this.turnoAtual) {
      await this.loadVendasAbertas();
    }
    
    this.render();
    
    // Polling de atualizações apenas se o turno estiver aberto
    if(this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      if(document.getElementById('caixa-content') && this.turnoAtual) {
        this.refreshVendasAbertas();
      } else {
        clearInterval(this.interval);
      }
    }, 10000); 
  }

  // ==========================================
  // GESTÃO DE TURNO (ABERTURA E FECHO)
  // ==========================================
  async loadTurnoAtual() {
    try {
      const { data } = await db.getClient()
        .from('caixa_turnos')
        .select('*')
        .eq('unidade_id', this.unidadeAtual)
        .eq('status', 'aberto')
        .single();
      
      this.turnoAtual = data || null;
    } catch (error) {
      this.turnoAtual = null; // Sem turno aberto
    }
  }

  renderTelaAbertura() {
    return `
      <div class="animate-fade-in" style="display: flex; align-items: center; justify-content: center; height: calc(100vh - 100px);">
        <div class="card" style="width: 100%; max-width: 450px; text-align: center; padding: 3rem 2rem;">
          <div style="font-size: 5rem; margin-bottom: 1rem;">🔒</div>
          <h2 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.8rem; font-weight: 800;">Caixa Fechado</h2>
          <p style="color: var(--text-secondary); margin-bottom: 2rem;">Para iniciar as vendas, informe o valor de troco inicial disponível na gaveta.</p>
          
          <form onsubmit="caixaModule.abrirCaixa(event)">
            <div class="form-group" style="text-align: left;">
              <label class="form-label" style="text-align: center;">Fundo de Caixa / Troco (R$) *</label>
              <input type="number" step="0.01" min="0" name="fundo_caixa" class="form-input" required autofocus placeholder="Ex: 150.00" style="font-size: 2rem; text-align: center; font-weight: 800; color: var(--primary); height: auto;">
            </div>
            <button type="submit" class="btn btn-primary btn-lg w-full" style="font-size: 1.2rem; padding: 1rem;">🔓 ABRIR CAIXA</button>
          </form>
        </div>
      </div>
    `;
  }

  async abrirCaixa(event) {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    btn.innerHTML = 'A Abrir...';

    const fundo = parseFloat(event.target.fundo_caixa.value) || 0;
    const userId = auth.getCurrentUser()?.id;

    try {
      await db.insert('caixa_turnos', [{
        unidade_id: this.unidadeAtual,
        usuario_abertura_id: userId,
        fundo_caixa: fundo,
        status: 'aberto'
      }]);

      await this.init(); // Recarrega tudo
    } catch (error) {
      alert('❌ Erro ao abrir caixa: ' + error.message);
      btn.disabled = false;
      btn.innerHTML = '🔓 ABRIR CAIXA';
    }
  }

  abrirModalFechoCaixa() {
    const content = `
      <div class="card-header">
        <h3 class="card-title">🔐 Fecho de Caixa (Contagem Cega)</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="caixaModule.processarFechoCaixa(event)">
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--border-radius); margin-bottom: 1.5rem; text-align: center;">
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">Por favor, conte todo o <strong>dinheiro em espécie (físico)</strong> presente na gaveta neste exato momento e digite abaixo.</p>
        </div>

        <div class="form-group">
          <label class="form-label" style="text-align: center;">Dinheiro Físico na Gaveta (R$) *</label>
          <input type="number" step="0.01" min="0" name="dinheiro_gaveta" class="form-input" required autofocus placeholder="0.00" style="font-size: 2rem; text-align: center; font-weight: 800; color: var(--success); height: auto;">
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <button type="button" class="btn btn-secondary w-full" onclick="modal.close()">Cancelar</button>
          <button type="submit" class="btn btn-danger w-full">Confirmar e Fechar Turno</button>
        </div>
      </form>
    `;
    modal.open(content);
  }

  async processarFechoCaixa(event) {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    btn.innerHTML = 'A processar relatórios...';

    const dinheiroInformado = parseFloat(event.target.dinheiro_gaveta.value) || 0;
    const userId = auth.getCurrentUser()?.id;

    try {
      // 1. Busca todas as vendas FECHADAS deste turno (desde a abertura)
      const { data: vendasDoTurno } = await db.getClient()
        .from('vendas')
        .select('id')
        .eq('unidade_id', this.unidadeAtual)
        .eq('status', 'fechada')
        .gte('data_fechamento', this.turnoAtual.data_abertura);

      const vendasIds = (vendasDoTurno || []).map(v => v.id);

      let totalVendasLiquido = 0;
      let totalDinheiroSistema = parseFloat(this.turnoAtual.fundo_caixa);
      let detalhesPagamentos = {};

      // 2. Se houver vendas, puxa os pagamentos exatos
      if (vendasIds.length > 0) {
        const { data: pags } = await db.getClient()
          .from('pagamentos')
          .select('forma_pagamento_id, valor, troco')
          .in('venda_id', vendasIds);

        (pags || []).forEach(p => {
          const nomeForma = this.formasPagamento.find(f => f.id === p.forma_pagamento_id)?.nome || 'Outros';
          const valorLiquido = parseFloat(p.valor) - parseFloat(p.troco || 0);

          totalVendasLiquido += valorLiquido;

          if (!detalhesPagamentos[nomeForma]) detalhesPagamentos[nomeForma] = 0;
          detalhesPagamentos[nomeForma] += valorLiquido;

          if (nomeForma.toLowerCase().includes('dinheiro')) {
            totalDinheiroSistema += valorLiquido;
          }
        });
      }

      const diferenca = dinheiroInformado - totalDinheiroSistema;

      // 3. Atualiza o registo do turno para Fechado
      const turnoFinal = {
        status: 'fechado',
        usuario_fechamento_id: userId,
        data_fechamento: new Date().toISOString(),
        total_vendas: totalVendasLiquido,
        total_dinheiro_sistema: totalDinheiroSistema,
        total_dinheiro_informado: dinheiroInformado,
        diferenca_caixa: diferenca,
        detalhes_pagamentos: detalhesPagamentos
      };

      await db.update('caixa_turnos', this.turnoAtual.id, turnoFinal);

      // 4. Imprime o Relatório Z
      this.imprimirRelatorioZ({ ...this.turnoAtual, ...turnoFinal });

      modal.close();
      alert('✅ Caixa fechado com sucesso! Relatório Z enviado para impressão.');
      await this.init(); // Volta ao ecrã de cadeado

    } catch (error) {
      alert('❌ Erro no fecho de caixa: ' + error.message);
      btn.disabled = false;
      btn.innerHTML = 'Confirmar e Fechar Turno';
    }
  }

  // ==========================================
  // DADOS BASE E OPERAÇÃO NORMAL
  // ==========================================
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
      const { data } = await db.getClient().from('produtos').select(`*, precos:produto_precos(*)`).eq('ativo', true).order('nome');
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
    if (!this.turnoAtual) return;
    await this.loadVendasAbertas();
    this.renderListaComandas();
    if (this.vendaSelecionada) this.renderDetalhesVenda();
  }

  render() {
    const container = document.getElementById('caixa-content');
    if (!container) return;

    if (!this.turnoAtual) {
      container.innerHTML = this.renderTelaAbertura();
      return;
    }

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
      
      <!-- Cabeçalho de Controle de Turno -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding: 0 1rem;">
        <div style="font-size: 0.9rem; color: var(--text-secondary);">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--success); margin-right: 5px;"></span>
          Turno Aberto (Fundo: R$ ${parseFloat(this.turnoAtual.fundo_caixa).toFixed(2)})
        </div>
        <button class="btn btn-sm btn-danger" onclick="caixaModule.abrirModalFechoCaixa()" style="box-shadow: var(--shadow-sm);">
          🔒 Fechar Caixa
        </button>
      </div>

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
    
    const subtotalItens = v.itens.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
    const valorTaxa = subtotalItens * (this.taxaServicoPercent / 100);
    const totalVenda = subtotalItens + valorTaxa;
    
    const totalPago = this.pagamentosAtuais.reduce((sum, p) => sum + p.valor, 0);
    const restante = totalVenda - totalPago;
    const troco = restante < 0 ? Math.abs(restante) : 0;
    const falta = restante > 0 ? restante : 0;

    return `
      <div class="painel-pedido-header" style="display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; padding-bottom: 0.75rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0;">${titulo}</h2>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Aberta por: ${abertPor}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--primary); line-height: 1;">R$ ${totalVenda.toFixed(2)}</div>
        </div>
      </div>
      
      <!-- ITEM LIST (Ganha o máximo de espaço possível com flex: 1) -->
      <div class="pedido-itens custom-scrollbar" style="flex: 1; background: var(--bg-primary); padding: 1rem; overflow-y: auto;">
        <h4 style="margin-bottom: 0.75rem; color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase;">Itens Consumidos</h4>
        ${v.itens.map(item => `
          <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color);">
            <div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${item.quantidade}x ${item.produto?.nome}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">Lançado por ${this.usuarios[item.usuario_id] || 'Sistema'}</div>
            </div>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">R$ ${parseFloat(item.subtotal).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>

      ${v.tipo === 'mesa' ? `
        <div style="background: var(--bg-secondary); padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.25rem;">Taxa de Serviço (Opcional)</div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm ${this.taxaServicoPercent === 0 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(0)" style="padding: 0.25rem 0.75rem;">0%</button>
              <button class="btn btn-sm ${this.taxaServicoPercent === 10 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(10)" style="padding: 0.25rem 0.75rem;">10%</button>
              <button class="btn btn-sm ${this.taxaServicoPercent === 12 ? 'btn-primary' : 'btn-secondary border'}" onclick="caixaModule.setTaxaServico(12)" style="padding: 0.25rem 0.75rem;">12%</button>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Valor da Taxa</div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary);">+ R$ ${valorTaxa.toFixed(2)}</div>
          </div>
        </div>
      ` : ''}
      
      <!-- PAYMENT AREA (Compacta para ocupar menos espaço visual) -->
      <div style="background: var(--bg-primary); border-top: 1px solid var(--border-color); padding: 1rem; flex-shrink: 0;">
        ${this.pagamentosAtuais.length > 0 ? `
          <div style="margin-bottom: 1rem;">
            <h4 style="margin-bottom: 0.25rem; font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary);">Valores Recebidos</h4>
            ${this.pagamentosAtuais.map((p, idx) => `
              <div style="display: flex; justify-content: space-between; background: var(--bg-secondary); padding: 0.4rem 0.75rem; border-radius: 6px; margin-bottom: 0.25rem; border: 1px solid var(--border-color);">
                <span style="font-weight: 600; font-size: 0.85rem;">${p.forma_nome}</span>
                <div style="display: flex; gap: 1rem; align-items: center;">
                  <span style="font-weight: 800; color: var(--success); font-size: 0.9rem;">R$ ${p.valor.toFixed(2)}</span>
                  <button class="btn-ghost" style="color: var(--danger); border: none; background: transparent; cursor: pointer; padding: 0 5px;" onclick="caixaModule.removerPagamento(${idx})">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${falta > 0 ? `
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--border-radius); border: 1px solid var(--border-color); box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 1rem;">
              <label class="form-label" style="margin-bottom: 0.25rem; font-size: 0.75rem; text-align: center;">1º INFORME O VALOR A RECEBER (R$)</label>
              <input type="number" step="0.01" id="input-valor-pgto" class="form-input" style="font-size: 1.6rem; font-weight: 800; text-align: center; color: var(--primary); padding: 0.5rem; width: 180px; height: auto;" value="${falta.toFixed(2)}">
            </div>
            
            <label class="form-label" style="margin-bottom: 0.5rem; text-align: center; font-size: 0.75rem; display: block;">2º SELECIONE A FORMA DE PAGAMENTO</label>
            <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 0.5rem;">
              ${this.formasPagamento.map(f => `
                <button type="button" class="btn btn-secondary" style="min-width: 100px; height: 40px; font-weight: 700; font-size: 0.85rem; border: 2px solid var(--border-color); transition: var(--transition); background: var(--bg-primary);" 
                        onclick="caixaModule.adicionarPagamentoRapido('${f.id}', '${f.nome}')"
                        onmouseover="this.style.borderColor='var(--primary)'; this.style.color='var(--primary)';"
                        onmouseout="this.style.borderColor='var(--border-color)'; this.style.color='var(--text-primary)';">
                  ${f.nome}
                </button>
              `).join('')}
            </div>
          </div>
          
          <div style="margin-top: 0.75rem; text-align: right; font-size: 1.15rem; font-weight: 700; color: var(--danger);">
            Falta Receber: R$ ${falta.toFixed(2)}
          </div>
        ` : `
          <div style="text-align: center; padding: 0.5rem 0;">
            ${troco > 0 ? `<div style="font-size: 1.25rem; font-weight: 800; color: var(--warning); margin-bottom: 0.75rem;">Troco a devolver: R$ ${troco.toFixed(2)}</div>` : `<div style="color: var(--success); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.75rem;">Valor Exato Recebido!</div>`}
            <button class="btn btn-success btn-lg w-full" style="font-size: 1.15rem; padding: 0.75rem; box-shadow: var(--shadow-md);" onclick="caixaModule.finalizarVenda()">✅ FINALIZAR VENDA</button>
          </div>
        `}
      </div>
    `;
  }

  adicionarPagamentoRapido(formaId, formaNome) {
    const inputEl = document.getElementById('input-valor-pgto');
    if (!inputEl) return;
    const valor = parseFloat(inputEl.value);
    if (isNaN(valor) || valor <= 0) return alert('⚠️ Informe um valor válido superior a zero.');

    this.pagamentosAtuais.push({ forma_id: formaId, forma_nome: formaNome, valor: valor });
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
          venda_id: vId, forma_pagamento_id: p.forma_id, valor: p.valor,
          troco: trocoDestaForma, usuario_id: usuarioId, data_recebimento: new Date().toISOString().split('T')[0]
        };
      });

      await db.insert('pagamentos', insertsPgto);
      await this.baixarEstoque(this.vendaSelecionada, usuarioId);
      
      await db.update('vendas', vId, {
        status: 'fechada', total: totalVendaFinal, taxa_servico: valorTaxa,
        data_fechamento: new Date().toISOString(), usuario_fechamento_id: usuarioId
      });

      this.imprimirTicket({ ...this.vendaSelecionada }, [...this.pagamentosAtuais], trocoTotalImpressao, subtotalVenda, valorTaxa, this.taxaServicoPercent);

      this.vendaSelecionada = null;
      this.pagamentosAtuais = [];
      await this.refreshVendasAbertas();

    } catch (error) {
      alert('❌ Erro: ' + error.message);
      if(btn) { btn.disabled = false; btn.innerHTML = '✅ FINALIZAR VENDA'; }
    }
  }

  async baixarEstoque(venda, usuarioId) {
    for (const item of venda.itens) {
      const produtoFull = this.produtos.find(p => p.id === item.produto_id);
      if (produtoFull && produtoFull.is_combo && produtoFull.itens_combo && produtoFull.itens_combo.length > 0) {
        for (const componente of produtoFull.itens_combo) {
          const qtdTotalComponente = parseFloat(componente.quantidade) * parseFloat(item.quantidade);
          await this.registrarSaidaEstoque(componente.produto_id, qtdTotalComponente, usuarioId, `Combo Vendido (${produtoFull.nome})`);
        }
      } else {
        await this.registrarSaidaEstoque(item.produto_id, parseFloat(item.quantidade), usuarioId, `Venda ${venda.tipo === 'balcao' ? 'Balcão' : 'Mesa'}`);
      }
    }
  }

  async registrarSaidaEstoque(produtoId, quantidadeSaida, usuarioId, observacao) {
    const { data: est } = await db.getClient().from('estoque').select('*').eq('produto_id', produtoId).eq('unidade_id', this.unidadeAtual).single();
    const qtdAnterior = est ? parseFloat(est.quantidade) : 0;
    const novaQtd = qtdAnterior - quantidadeSaida;

    if (est) await db.update('estoque', est.id, { quantidade: novaQtd, updated_by: usuarioId });
    else await db.insert('estoque', [{ unidade_id: this.unidadeAtual, produto_id: produtoId, quantidade: novaQtd, updated_by: usuarioId }]);

    await db.insert('estoque_movimentacao', [{
      unidade_id: this.unidadeAtual, produto_id: produtoId, tipo: 'saida',
      quantidade: -quantidadeSaida, quantidade_anterior: qtdAnterior, quantidade_nova: novaQtd,
      usuario_id: usuarioId, observacao: observacao
    }]);
  }

  // ==========================================
  // BALCÃO RÁPIDO E IMPRESSÕES (Z e Cupom)
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
        <h3 class="card-title">🛒 Nova Venda Rápida</h3>
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
    const visiveis = lista.filter(p => p.visivel);
    if (visiveis.length === 0) return `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto visível encontrado.</div>`;
    return visiveis.map(p => `
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
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('input-peso-balcao').value=(parseFloat(document.getElementById('input-peso-balcao').value||0)+0.05).toFixed(3)">+ 50g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('input-peso-balcao').value=(parseFloat(document.getElementById('input-peso-balcao').value||0)+0.1).toFixed(3)">+ 100g</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('input-peso-balcao').value=(parseFloat(document.getElementById('input-peso-balcao').value||0)+0.2).toFixed(3)">+ 200g</button>
              </div>
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
              ${i.p.tipo_preco === 'unidade' ? `<div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-secondary); padding: 0.25rem; border-radius: var(--border-radius);"><button class="btn-ghost" style="width: 24px; height: 24px; border:none; cursor:pointer;" onclick="caixaModule.carrinhoBalcao[${idx}].qtd--; if(caixaModule.carrinhoBalcao[${idx}].qtd<=0)caixaModule.carrinhoBalcao.splice(${idx},1); caixaModule.atualizarCarrinhoBalcao();">-</button><span style="font-size: 0.85rem; min-width: 1.5rem; text-align: center; font-weight: 600;">${i.qtd}</span><button class="btn-ghost" style="width: 24px; height: 24px; border:none; cursor:pointer;" onclick="caixaModule.carrinhoBalcao[${idx}].qtd++; caixaModule.atualizarCarrinhoBalcao();">+</button></div>` : `<div style="font-size: 0.85rem; font-weight: 600; padding: 0.25rem 0.5rem;">${i.qtd} kg</div>`}
              <button style="width: 28px; height: 28px; border: none; background: transparent; color: var(--danger); cursor: pointer;" onclick="caixaModule.carrinhoBalcao.splice(${idx}, 1); caixaModule.atualizarCarrinhoBalcao();">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }
    document.getElementById('total-balcao').innerText = `R$ ${total.toFixed(2)}`;
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

  imprimirTicket(venda, pagamentos, trocoTotal, subtotal, taxaValor, taxaPercent) {
    let printDiv = document.getElementById('print-section');
    if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-section'; document.body.appendChild(printDiv); }
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
        <thead><tr><th>QTD</th><th>PRODUTO</th><th>TOTAL</th></tr></thead>
        <tbody>${venda.itens.map(i => `<tr><td>${i.quantidade}</td><td>${i.produto?.nome}</td><td>R$ ${parseFloat(i.subtotal).toFixed(2)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="ticket-divider"></div>
      <table class="ticket-totals">
        <tr><td>SUBTOTAL:</td><td>R$ ${subtotal.toFixed(2)}</td></tr>
        ${taxaValor > 0 ? `<tr><td>TAXA SERVIÇO (${taxaPercent}%):</td><td>R$ ${taxaValor.toFixed(2)}</td></tr>` : ''}
        <tr><td class="bold">TOTAL A PAGAR:</td><td class="bold">R$ ${(subtotal + taxaValor).toFixed(2)}</td></tr>
        <tr><td colspan="2"><div style="height:5px;"></div></td></tr>
        ${pagamentos.map(p => `<tr><td>${p.forma_nome.toUpperCase()}:</td><td>R$ ${p.valor.toFixed(2)}</td></tr>`).join('')}
        <tr><td>TROCO:</td><td class="bold">R$ ${trocoTotal.toFixed(2)}</td></tr>
      </table>
      <div class="ticket-divider"></div>
      <div class="ticket-footer"><div style="font-weight: bold; margin-bottom: 5px;">OBRIGADO PELA PREFERÊNCIA!</div></div>
    `;
    printDiv.innerHTML = html;
    setTimeout(() => window.print(), 150);
  }

  // --- O RELATÓRIO Z (COMPROVANTE DE FECHO DE TURNO) ---
  imprimirRelatorioZ(turno) {
    let printDiv = document.getElementById('print-section');
    if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-section'; document.body.appendChild(printDiv); }
    
    const unidade = auth.getUnidadeAtual();
    const inicio = new Date(turno.data_abertura).toLocaleString('pt-BR');
    const fim = new Date(turno.data_fechamento).toLocaleString('pt-BR');
    const operadorAbertura = this.usuarios[turno.usuario_abertura_id] || 'N/A';
    const operadorFecho = this.usuarios[turno.usuario_fechamento_id] || 'N/A';

    const formasHtml = Object.entries(turno.detalhes_pagamentos).map(([forma, valor]) => `
      <tr><td>${forma.toUpperCase()}:</td><td>R$ ${parseFloat(valor).toFixed(2)}</td></tr>
    `).join('');

    const html = `
      <div class="ticket-header">
        <div class="ticket-title">*** RELATÓRIO Z ***</div>
        <div class="ticket-info">FECHO DE CAIXA</div>
        <div class="ticket-divider"></div>
        <div class="ticket-info" style="text-align: left;">
          LOJA: ${unidade.nome}<br>
          ABERTURA: ${inicio}<br>
          FECHO: ${fim}<br>
          OP. ABERTURA: ${operadorAbertura}<br>
          OP. FECHO: ${operadorFecho}<br>
        </div>
        <div class="ticket-divider"></div>
      </div>
      
      <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">RESUMO FINANCEIRO</div>
      <table class="ticket-totals">
        <tr><td>FUNDO DE CAIXA (TROCO):</td><td>R$ ${parseFloat(turno.fundo_caixa).toFixed(2)}</td></tr>
        <tr><td colspan="2"><div class="ticket-divider"></div></td></tr>
        
        <tr><td colspan="2" style="font-weight: bold; padding-top: 5px;">RECEBIMENTOS DO TURNO:</td></tr>
        ${formasHtml}
        
        <tr><td colspan="2"><div class="ticket-divider"></div></td></tr>
        <tr><td class="bold">TOTAL FATURADO (LIQUIDO):</td><td class="bold">R$ ${parseFloat(turno.total_vendas).toFixed(2)}</td></tr>
      </table>

      <div class="ticket-divider"></div>
      <div style="font-weight: bold; margin-bottom: 5px; text-align: center;">AUDITORIA DE GAVETA</div>
      <table class="ticket-totals">
        <tr><td>DINHEIRO ESPERADO (FUNDO + VENDAS):</td><td>R$ ${parseFloat(turno.total_dinheiro_sistema).toFixed(2)}</td></tr>
        <tr><td>DINHEIRO DECLARADO PELO CAIXA:</td><td>R$ ${parseFloat(turno.total_dinheiro_informado).toFixed(2)}</td></tr>
        <tr><td colspan="2"><div class="ticket-divider"></div></td></tr>
        <tr>
          <td class="bold">DIFERENÇA (QUEBRA/SOBRA):</td>
          <td class="bold" style="color: ${turno.diferenca_caixa < 0 ? 'red' : 'black'};">R$ ${parseFloat(turno.diferenca_caixa).toFixed(2)}</td>
        </tr>
      </table>
      
      <div class="ticket-divider"></div>
      <div class="ticket-footer">
        <div>Relatório gerado automaticamente pelo sistema RicaZo.</div>
      </div>
    `;
    printDiv.innerHTML = html;
    setTimeout(() => window.print(), 200);
  }
}

const caixaModule = new CaixaModule();
window.caixaModule = caixaModule;