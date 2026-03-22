/**
 * RICAZO - Módulo PDV (Frente de Caixa / Garçom)
 */

class PdvModule {
  constructor() {
    this.unidadeAtual = null;
    this.produtos = [];
    this.mesas = [];
    this.vendasAbertas = [];
    
    // Estado de navegação interna
    this.telaAtual = 'mesas'; // 'mesas' | 'comanda'
    this.mesaSelecionada = null; // null = balcão
    this.carrinho = []; // Apenas itens novos não enviados
    this.categoriaFiltro = null;
    this.termoFiltro = '';
  }

  async init() {
    const unidade = auth.getUnidadeAtual();
    if (!unidade) {
      alert('Unidade não selecionada!');
      return;
    }
    this.unidadeAtual = unidade.id;
    this.telaAtual = 'mesas';
    this.mesaSelecionada = null;
    this.carrinho = [];

    await Promise.all([
      this.loadProdutos(),
      this.loadMesas(),
      this.loadVendasAbertas()
    ]);
    
    this.render();
  }

  async loadProdutos() {
    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select(`*, precos:produto_precos(*)`)
        .eq('ativo', true)
        .eq('visivel', true)
        .order('nome');

      if (error) throw error;
      
      this.produtos = (data || []).map(p => {
        const precoPersonalizado = p.precos?.find(pr => pr.unidade_id === this.unidadeAtual);
        return {
          ...p,
          preco_venda: precoPersonalizado ? precoPersonalizado.preco : p.preco_base
        };
      });
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  }

  async loadMesas() {
    try {
      const { data, error } = await db.getClient()
        .from('unidade_mesas')
        .select('*')
        .eq('unidade_id', this.unidadeAtual)
        .eq('ativa', true)
        .order('numero');

      if (error) throw error;
      this.mesas = data || [];
    } catch (error) {
      console.error('Erro ao carregar mesas:', error);
    }
  }

  async loadVendasAbertas() {
    try {
      const { data, error } = await db.getClient()
        .from('vendas')
        .select(`*, itens:venda_itens(*, produto:produtos(nome, tipo_preco))`)
        .eq('unidade_id', this.unidadeAtual)
        .eq('status', 'aberta');

      if (error) throw error;
      this.vendasAbertas = data || [];
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    }
  }

  render() {
    const container = document.getElementById('pdv-content');
    if (!container) return;

    if (this.telaAtual === 'mesas') {
      container.innerHTML = this.renderMapaMesas();
    } else if (this.telaAtual === 'comanda') {
      container.innerHTML = this.renderComandaSplitView();
    }
  }

  // ==========================================
  // TELA 1: MAPA DE MESAS
  // ==========================================
  renderMapaMesas() {
    return `
      <div class="card animate-fade-in" style="margin: 1rem;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <h2 class="card-title">🗺️ Mapa de Mesas</h2>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="pdvModule.abrirModalNovaMesa()">➕ Criar Mesa</button>
            <button class="btn btn-info btn-sm" onclick="pdvModule.abrirMesa(null)" style="background: var(--info); color: white;">
              🛒 Balcão
            </button>
          </div>
        </div>

        <div class="mesas-grid">
          ${this.mesas.map(m => {
            const venda = this.vendasAbertas.find(v => v.mesa_id === m.id);
            let status = 'livre';
            if (venda) status = venda.solicitou_fechamento ? 'fechamento' : 'ocupada';
            
            const config = {
              livre: { css: 'livre', txt: 'Livre', icon: '✓' },
              ocupada: { css: 'ocupada', txt: 'Ocupada', icon: '🍽️' },
              fechamento: { css: 'fechamento', txt: 'Pagamento', icon: '💰' }
            }[status];

            const total = venda ? parseFloat(venda.total).toFixed(2) : '0.00';

            return `
              <div class="mesa-card ${config.css}" onclick="pdvModule.abrirMesa('${m.id}')" title="Aceder à Mesa">
                <div class="mesa-numero">${m.numero}</div>
                <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
                  ${m.nome || `Mesa ${m.numero}`}
                </div>
                <div class="mesa-status ${config.css}">${config.icon} ${config.txt}</div>
                ${venda ? `<div style="margin-top: 0.5rem; font-weight: 800; color: var(--text-primary);">R$ ${total}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  async abrirMesa(mesaId) {
    this.mesaSelecionada = mesaId; // null para balcão
    this.carrinho = []; // Limpa itens novos
    await this.loadVendasAbertas(); // Atualiza dados da mesa
    this.telaAtual = 'comanda';
    this.render();
  }

  voltarMapaMesas() {
    this.telaAtual = 'mesas';
    this.categoriaFiltro = null;
    this.termoFiltro = '';
    this.loadVendasAbertas().then(() => this.render());
  }

  // ==========================================
  // TELA 2: COMANDA (SPLIT-VIEW)
  // ==========================================
  renderComandaSplitView() {
    const isBalcao = this.mesaSelecionada === null;
    const mesa = isBalcao ? null : this.mesas.find(m => m.id === this.mesaSelecionada);
    const titulo = isBalcao ? '🛒 Balcão Livre' : `🍽️ ${mesa.nome || `Mesa ${mesa.numero}`}`;
    
    const vendaAtual = this.vendasAbertas.find(v => v.mesa_id === this.mesaSelecionada && v.tipo === (isBalcao ? 'balcao' : 'mesa'));
    
    const totalCarrinho = this.carrinho.reduce((sum, i) => sum + (i.quantidade * i.preco_unitario), 0);
    const qtdItens = this.carrinho.reduce((sum, i) => sum + i.quantidade, 0);

    return `
      <style>
        .pdv-grid-otimizado { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1.5rem; overflow-y: auto; flex: 1; align-content: start; }
        .produto-venda-card-otimizado { background: var(--bg-primary); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); padding: 1rem; text-align: center; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .produto-venda-card-otimizado:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: var(--shadow-md); }
        .secao-itens-lancados { background: rgba(0,0,0,0.02); padding: 1rem; border-bottom: 2px solid var(--border-color); }
        [data-theme="dark"] .secao-itens-lancados { background: rgba(255,255,255,0.02); }

        /* Botão flutuante Lançar (mobile) */
        .fab-lancar {
          display: none;
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          background: var(--primary);
          color: #fff;
          border: none;
          border-radius: 50px;
          padding: 14px 22px;
          font-size: 1rem;
          font-weight: 800;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          cursor: pointer;
          animation: fab-pulse 2s infinite;
          gap: 8px;
          align-items: center;
        }
        .fab-lancar .fab-badge {
          background: #fff;
          color: var(--primary);
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 900;
        }
        @keyframes fab-pulse {
          0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 4px 25px rgba(232,145,58,0.6); }
        }
        @media (max-width: 1024px) {
          .fab-lancar { display: flex; }
        }
      </style>
      
      <div class="venda-container animate-fade-in" style="height: calc(100vh - 100px);">
        <!-- ESQUERDA: Produtos -->
        <div class="painel-produtos">
          <div class="painel-produtos-header">
            <button class="btn btn-secondary btn-sm" onclick="pdvModule.voltarMapaMesas()">← Voltar</button>
            <div class="painel-produtos-busca">
              <input type="text" placeholder="Buscar produto..." onkeyup="pdvModule.filtrarProdutos(this.value)">
            </div>
          </div>
          <div class="categorias-filtro" id="pdv-categorias-filtro">
            <button class="categoria-btn${!this.categoriaFiltro ? ' active' : ''}" onclick="pdvModule.filtrarPorCategoria(null)">Todos</button>
            ${this.getCategoriasBtns()}
          </div>
          <div class="pdv-grid-otimizado" id="pdv-produtos-grid">
            ${this.renderListaProdutos(this.getProdutosFiltrados())}
          </div>
        </div>

        <!-- DIREITA: Comanda -->
        <div class="painel-pedido">
          <div class="painel-pedido-header">
            <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--primary); margin: 0;">${titulo}</h2>
            ${vendaAtual?.solicitou_fechamento ? `<span class="status-badge status-pendente" style="background: var(--danger); color: white;">Aguardando Caixa</span>` : ''}
          </div>
          
          <div class="pedido-itens custom-scrollbar" style="padding: 0; display: flex; flex-direction: column;">
            
            <!-- Itens Já Lançados (Salvos no Banco) -->
            ${vendaAtual && vendaAtual.itens.length > 0 ? `
              <div class="secao-itens-lancados">
                <h4 style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Já Consumido</h4>
                ${vendaAtual.itens.map(item => `
                  <div class="pedido-item" style="padding: 0.5rem 0; border: none; background: transparent; gap: 0.5rem;">
                    <div class="pedido-item-info" style="min-width: 0; flex: 1;">
                      <div class="pedido-item-nome" style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.quantidade}x ${item.produto?.nome}</div>
                      <div style="color: var(--text-muted); font-size: 0.7rem;">R$ ${parseFloat(item.preco_unitario).toFixed(2)} un</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                      <span style="font-weight: 700; font-size: 0.85rem;">R$ ${parseFloat(item.subtotal).toFixed(2)}</span>
                      <button class="btn-ghost" style="color: var(--danger); border: none; cursor: pointer; width: 28px; height: 28px; display:flex; align-items:center; justify-content:center;" onclick="pdvModule.removerItemBanco('${item.id}', '${vendaAtual.id}')" title="Remover item">✕</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Carrinho Novo -->
            <div style="padding: 1rem;" id="pdv-carrinho-novos">
              <h4 style="font-size: 0.8rem; color: var(--success); text-transform: uppercase; margin-bottom: 0.5rem;">Novos Itens (Não Lançados)</h4>
              ${this.renderCarrinho()}
            </div>
          </div>
          
          <div class="pedido-resumo">
            <div class="pedido-resumo-total">
              <span class="pedido-resumo-total-label">Total da Mesa:</span>
              <span class="pedido-resumo-total-valor">R$ ${this.calcularTotalReal(vendaAtual).toFixed(2)}</span>
            </div>
          </div>
          
          <div class="pedido-acoes" style="flex-wrap: wrap; gap: 0.5rem;">
            ${vendaAtual && vendaAtual.itens.length > 0 && !vendaAtual.solicitou_fechamento ? `
              <button class="btn btn-warning" style="flex: 1; min-width: 100%;" onclick="pdvModule.solicitarFechamento('${vendaAtual.id}')">
                🔔 Pedir Conta
              </button>
            ` : ''}
            <button class="btn btn-secondary" style="flex: 1; min-width: 0;" onclick="pdvModule.limparCarrinho()" ${this.carrinho.length === 0 ? 'disabled' : ''}>
              Limpar
            </button>
            <button class="btn btn-primary" style="flex: 1; min-width: 0;" onclick="pdvModule.enviarPedido()" ${this.carrinho.length === 0 ? 'disabled' : ''}>
              📤 Lançar
            </button>
          </div>
        </div>
      </div>

      ${this.carrinho.length > 0 ? `
        <button class="fab-lancar" onclick="pdvModule.enviarPedido()">
          <span class="fab-badge">${qtdItens}</span>
          📤 Lançar — R$ ${totalCarrinho.toFixed(2)}
        </button>
      ` : ''}
    `;
  }

  calcularTotalReal(vendaAtual) {
    const totalBanco = vendaAtual ? parseFloat(vendaAtual.total) : 0;
    const totalCarrinho = this.carrinho.reduce((sum, i) => sum + (i.quantidade * i.preco_unitario), 0);
    return totalBanco + totalCarrinho;
  }

  // ==========================================
  // FUNCIONALIDADES DO PRODUTO / CARRINHO
  // ==========================================
  getCategoriasBtns() {
    const categorias = [...new Set(this.produtos.filter(p => p.categoria).map(p => p.categoria))].sort();
    return categorias.map(cat =>
      `<button class="categoria-btn${this.categoriaFiltro === cat ? ' active' : ''}" onclick="pdvModule.filtrarPorCategoria('${cat}')">${cat}</button>`
    ).join('');
  }

  filtrarPorCategoria(categoria) {
    this.categoriaFiltro = categoria;
    document.querySelectorAll('#pdv-categorias-filtro .categoria-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    this.aplicarFiltros();
  }

  filtrarProdutos(termo) {
    this.termoFiltro = termo;
    this.aplicarFiltros();
  }

  getProdutosFiltrados() {
    const termoLower = (this.termoFiltro || '').toLowerCase().trim();
    return this.produtos.filter(p => {
      const matchTermo = !termoLower || p.nome.toLowerCase().includes(termoLower);
      const matchCategoria = !this.categoriaFiltro || p.categoria === this.categoriaFiltro;
      return matchTermo && matchCategoria;
    });
  }

  aplicarFiltros() {
    const grid = document.getElementById('pdv-produtos-grid');
    if (grid) grid.innerHTML = this.renderListaProdutos(this.getProdutosFiltrados());
  }

  renderListaProdutos(produtosParaRenderizar) {
    if (produtosParaRenderizar.length === 0) return `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Produto não encontrado.</div>`;
    return produtosParaRenderizar.map(p => `
      <div class="produto-venda-card-otimizado" onclick="pdvModule.adicionarAoCarrinho('${p.id}')">
        <div class="produto-card-img-mobile" style="width: 70px; height: 70px; flex-shrink: 0; background: var(--bg-secondary); border-radius: var(--border-radius); display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${p.imagem_url ? `<img src="${p.imagem_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : '🥖'}
        </div>
        <div style="width: 100%; min-width: 0;">
          <div class="produto-venda-nome" title="${p.nome}" style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 0.8rem;">${p.nome}</div>
          <div class="produto-venda-preco" style="font-size: 1rem; font-weight: 800; color: var(--primary); margin-bottom: 0.15rem;">R$ ${p.preco_venda.toFixed(2)}</div>
          <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">
            <span style="background: var(--bg-secondary); padding: 0.1rem 0.4rem; border-radius: 12px; border: 1px solid var(--border-color);">${p.tipo_preco === 'peso' ? '⚖️ KG' : '📦 UN'}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  somarPeso(valorEmKg) {
    const input = document.getElementById('input-peso');
    if (!input) return;
    let pesoAtual = parseFloat(input.value) || 0;
    input.value = (pesoAtual + valorEmKg).toFixed(3);
    input.focus();
  }

  _comboTemOpcoes(produto) {
    return produto.is_combo && produto.itens_combo && produto.itens_combo.some(i => i.tipo === 'opcao');
  }

  abrirModalComboOpcoes(produto) {
    const gruposOpcoes = produto.itens_combo.filter(i => i.tipo === 'opcao');
    const fixos = produto.itens_combo.filter(i => i.tipo !== 'opcao');

    const fixosHtml = fixos.map(item => {
      const p = this.produtos.find(x => x.id === item.produto_id);
      return p ? `<div style="font-size: 0.85rem; padding: 3px 0;">✅ ${item.quantidade}x ${p.nome}</div>` : '';
    }).join('');

    const gruposHtml = gruposOpcoes.map((grupo, idx) => {
      const opcoesHtml = grupo.opcoes.map(opId => {
        const p = this.produtos.find(x => x.id === opId);
        return p ? `
          <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: var(--bg-secondary); border-radius: var(--border-radius); cursor: pointer; border: 2px solid transparent; transition: all 0.2s;"
            onclick="this.parentElement.querySelectorAll('label').forEach(l=>l.style.borderColor='transparent'); this.style.borderColor='var(--primary)';">
            <input type="radio" name="opcao_grupo_${idx}" value="${p.id}" required style="width: 18px; height: 18px;">
            <span style="font-weight: 600;">${p.nome}</span>
            <span style="margin-left: auto; color: var(--text-muted); font-size: 0.8rem;">R$ ${parseFloat(p.preco_base).toFixed(2)}</span>
          </label>
        ` : '';
      }).join('');

      return `
        <div style="margin-bottom: 1rem;">
          <label style="font-size: 0.85rem; font-weight: 700; color: var(--info); display: block; margin-bottom: 0.5rem;">
            🔄 Escolha ${grupo.quantidade} opção${grupo.quantidade > 1 ? ' (cada)' : ''}:
          </label>
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            ${opcoesHtml}
          </div>
        </div>
      `;
    }).join('');

    const content = `
      <div class="card-header">
        <h3 class="card-title">📦 ${produto.nome}</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <div style="text-align: center; margin-bottom: 1rem;">
        <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">R$ ${parseFloat(produto.preco_venda).toFixed(2)}</div>
      </div>
      <form onsubmit="pdvModule.confirmarComboOpcoes(event, '${produto.id}')">
        ${fixosHtml ? `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--border-radius);"><div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">ITENS INCLUSOS:</div>${fixosHtml}</div>` : ''}
        ${gruposHtml}
        <div class="modal-actions" style="display: flex; gap: 0.5rem; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
          <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="modal.close()">Cancelar</button>
          <button type="submit" class="btn btn-primary" style="flex: 1;">Adicionar ao Pedido</button>
        </div>
      </form>
    `;
    modal.open(content);
  }

  confirmarComboOpcoes(event, produtoId) {
    event.preventDefault();
    const produto = this.produtos.find(p => p.id === produtoId);
    if (!produto) return;

    const gruposOpcoes = produto.itens_combo.filter(i => i.tipo === 'opcao');
    const escolhas = {};
    for (let idx = 0; idx < gruposOpcoes.length; idx++) {
      const radio = event.target.querySelector(`input[name="opcao_grupo_${idx}"]:checked`);
      if (!radio) { alert('⚠️ Selecione todas as opções.'); return; }
      escolhas[idx] = radio.value;
    }

    // Cria item do carrinho com as escolhas
    const itemId = Date.now().toString();
    this.carrinho.push({
      id: itemId,
      produto: produto,
      quantidade: 1,
      preco_unitario: produto.preco_venda,
      escolhas_combo: escolhas
    });
    modal.close();
    this.atualizarUI();
  }

  adicionarAoCarrinho(produtoId) {
    const produto = this.produtos.find(p => p.id === produtoId);
    if (!produto) return;

    // Combo com opções → abre modal de escolha
    if (this._comboTemOpcoes(produto)) {
      this.abrirModalComboOpcoes(produto);
      return;
    }

    if (produto.tipo_preco === 'peso') {
      const content = `
        <div class="card-header">
          <h3 class="card-title">⚖️ Informar Peso</h3>
          <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
        </div>
        <form onsubmit="pdvModule.confirmarPeso(event, '${produto.id}')">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <h4 style="font-size: 1.25rem;">${produto.nome}</h4>
            <p style="color: var(--primary); font-weight: 700;">R$ ${produto.preco_venda.toFixed(2)} / KG</p>
          </div>
          <div style="margin-bottom: 1.5rem;">
            <label class="form-label" style="text-align: center; margin-bottom: 0.75rem;">Adicionar Quantidade</label>
            <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-sm btn-secondary" onclick="pdvModule.somarPeso(0.050)">+ 50g</button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="pdvModule.somarPeso(0.100)">+ 100g</button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="pdvModule.somarPeso(0.150)">+ 150g</button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="pdvModule.somarPeso(0.200)">+ 200g</button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="pdvModule.somarPeso(0.250)">+ 250g</button>
            </div>
            <div style="text-align: center; margin-top: 0.75rem;">
              <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('input-peso').value=''; document.getElementById('input-peso').focus();">🔄 Zerar Peso</button>
            </div>
          </div>
          ${modal.formGroup('Peso Total (em KG) *', `<input type="number" step="0.001" min="0.001" name="peso" id="input-peso" class="form-input" style="font-size: 1.75rem; text-align: center; font-weight: 800; color: var(--primary);" required autofocus placeholder="0.000">`)}
          ${modal.actions('Cancelar', 'Confirmar Adição')}
        </form>
      `;
      modal.open(content);
    } else {
      this.inserirItem(produto, 1);
    }
  }

  confirmarPeso(event, produtoId) {
    event.preventDefault();
    const peso = parseFloat(event.target.peso.value);
    const produto = this.produtos.find(p => p.id === produtoId);
    if (produto && peso > 0) {
      this.inserirItem(produto, peso);
      modal.close();
    }
  }

  inserirItem(produto, quantidade) {
    if (produto.tipo_preco === 'unidade') {
      const itemExistente = this.carrinho.find(i => i.produto.id === produto.id);
      if (itemExistente) {
        itemExistente.quantidade += quantidade;
        this.atualizarUI();
        return;
      }
    }
    this.carrinho.push({ id: Date.now().toString(), produto: produto, quantidade: quantidade, preco_unitario: produto.preco_venda });
    this.atualizarUI();
  }

  alterarQuantidade(itemId, delta) {
    const item = this.carrinho.find(i => i.id === itemId);
    if (!item) return;
    if (item.produto.tipo_preco === 'peso') return; // Peso não altera por botão +/-

    item.quantidade += delta;
    if (item.quantidade <= 0) this.removerItem(itemId);
    else this.atualizarUI();
  }

  removerItem(itemId) {
    this.carrinho = this.carrinho.filter(i => i.id !== itemId);
    this.atualizarUI();
  }

  limparCarrinho() {
    this.carrinho = [];
    this.atualizarUI();
  }

  renderCarrinho() {
    if (this.carrinho.length === 0) return `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin-top: 1rem;">Nenhum item novo.</p>`;
    return this.carrinho.map(item => `
      <div class="pedido-item" style="padding: 0.5rem; margin-bottom: 0.4rem; gap: 0.5rem;">
        <div class="pedido-item-info" style="min-width: 0; flex: 1;">
          <div class="pedido-item-nome" style="font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.produto.nome}</div>
          <div class="pedido-item-preco" style="font-size: 0.8rem;">R$ ${(item.quantidade * item.preco_unitario).toFixed(2)}</div>
        </div>
        <div class="pedido-item-acoes" style="flex-shrink: 0;">
          ${item.produto.tipo_preco === 'unidade' ? `
            <div class="pedido-item-qtd" style="padding: 0.15rem;">
              <button style="width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;" onclick="pdvModule.alterarQuantidade('${item.id}', -1)">-</button>
              <span style="font-size: 0.8rem; min-width: 1.5rem;">${item.quantidade}</span>
              <button style="width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;" onclick="pdvModule.alterarQuantidade('${item.id}', 1)">+</button>
            </div>
          ` : `<span style="font-size: 0.8rem; font-weight: 600;">${item.quantidade} kg</span>`}
          <button class="pedido-item-remover" style="width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;" onclick="pdvModule.removerItem('${item.id}')">✕</button>
        </div>
      </div>
    `).join('');
  }

  atualizarUI() {
    this.render();
  }

  // ==========================================
  // AÇÕES NO BANCO DE DADOS
  // ==========================================
  async enviarPedido() {
    if (this.carrinho.length === 0) return;
    const isBalcao = this.mesaSelecionada === null;
    const usuarioId = auth.getCurrentUser()?.id;

    try {
      let venda = this.vendasAbertas.find(v => v.mesa_id === this.mesaSelecionada && v.tipo === (isBalcao ? 'balcao' : 'mesa'));
      const subtotalNovos = this.carrinho.reduce((sum, item) => sum + (item.quantidade * item.preco_unitario), 0);

      if (venda) {
        // Atualiza venda existente
        await db.update('vendas', venda.id, { total: parseFloat(venda.total) + subtotalNovos });
      } else {
        // Cria nova
        const [novaVenda] = await db.insert('vendas', [{
          unidade_id: this.unidadeAtual,
          tipo: isBalcao ? 'balcao' : 'mesa',
          identificador: isBalcao ? 'Balcão' : this.mesaSelecionada,
          mesa_id: this.mesaSelecionada,
          status: 'aberta',
          total: subtotalNovos,
          usuario_abertura_id: usuarioId
        }]);
        venda = novaVenda;
      }

      // Insere itens
      await db.insert('venda_itens', this.carrinho.map(item => ({
        venda_id: venda.id,
        produto_id: item.produto.id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.quantidade * item.preco_unitario,
        usuario_id: usuarioId,
        escolhas_combo: item.escolhas_combo || null
      })));

      this.carrinho = [];
      await this.loadVendasAbertas();
      this.voltarMapaMesas(); // Após lançar, volta pro mapa

    } catch (error) {
      console.error('Erro ao lançar:', error);
      alert('❌ Erro: ' + error.message);
    }
  }

  async removerItemBanco(itemId, vendaId) {
    if (!confirm('Excluir este item da comanda?')) return;
    try {
      // Pega dados do item para subtrair do total
      const { data: item } = await db.getClient().from('venda_itens').select('subtotal').eq('id', itemId).single();
      if (!item) return;

      // Remove o item
      await db.getClient().from('venda_itens').delete().eq('id', itemId);

      // Atualiza total da venda
      const venda = this.vendasAbertas.find(v => v.id === vendaId);
      const novoTotal = parseFloat(venda.total) - parseFloat(item.subtotal);
      
      // Se total zerou e não tem mais itens, cancela a venda. Se não, só atualiza.
      const { data: restantes } = await db.getClient().from('venda_itens').select('id').eq('venda_id', vendaId);
      
      if (restantes.length === 0) {
         await db.update('vendas', vendaId, { status: 'cancelada', total: 0 });
         alert('A comanda foi cancelada pois ficou sem itens.');
         this.voltarMapaMesas();
      } else {
         await db.update('vendas', vendaId, { total: novoTotal });
         await this.loadVendasAbertas();
         this.render();
      }
    } catch (error) {
      alert('❌ Erro ao remover item: ' + error.message);
    }
  }

  async solicitarFechamento(vendaId) {
    if (!confirm('Pedir a conta no Caixa?')) return;
    try {
      await db.update('vendas', vendaId, { solicitou_fechamento: true, solicitou_fechamento_at: new Date().toISOString() });
      await this.loadVendasAbertas();
      this.voltarMapaMesas();
    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  // Criação de mesa on the fly
  abrirModalNovaMesa() {
    const proxNumero = this.mesas.length > 0 ? Math.max(...this.mesas.map(m => m.numero)) + 1 : 1;
    const content = `
      <div class="card-header">
        <h3 class="card-title">🍽️ Criar Nova Mesa</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="pdvModule.salvarNovaMesa(event)">
        ${modal.formGroup('Número da Mesa *', `<input type="number" name="numero" class="form-input" required value="${proxNumero}" min="1">`)}
        ${modal.formGroup('Nome / Referência', `<input type="text" name="nome" class="form-input" placeholder="Ex: Varanda 1">`)}
        ${modal.actions('Cancelar', 'Criar Mesa')}
      </form>
    `;
    modal.open(content);
  }

  async salvarNovaMesa(event) {
    event.preventDefault();
    const numero = parseInt(event.target.numero.value);
    if (this.mesas.some(m => m.numero === numero)) {
      alert('❌ Já existe uma mesa com este número!');
      return;
    }
    try {
      await db.insert('unidade_mesas', [{ unidade_id: this.unidadeAtual, numero: numero, nome: event.target.nome.value.trim() || null, ativa: true }]);
      modal.close();
      await this.loadMesas();
      this.render();
    } catch (error) {
      alert('❌ Erro ao criar mesa: ' + error.message);
    }
  }
}

const pdvModule = new PdvModule();
window.pdvModule = pdvModule;
