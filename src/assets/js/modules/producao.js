/**
 * RICAZO - Módulo de Produção (Fábrica)
 */

class ProducaoModule {
  constructor() {
    this.unidadeOrigemId = null;
    this.unidadesDestino = [];
    this.produtos = [];
    this.carrinho = [];
    this.historico = [];
  }

  async init() {
    // Lê o ID real (UUID) diretamente da sessão segura
    const unidade = auth.getUnidadeAtual();
    
    if (!unidade || !unidade.id || !unidade.id.includes('-')) {
      console.error('ID de unidade inválido ou ausente na sessão.');
      alert('Erro de Sessão: Por favor, selecione a unidade novamente.');
      window.location.href = '/src/pages/dashboard/?view=selecao-unidade';
      return;
    }
    
    this.unidadeOrigemId = unidade.id;
    this.carrinho = [];

    // Carrega os dados em paralelo para ser mais rápido
    await Promise.all([
      this.loadUnidadesDestino(),
      this.loadProdutos(),
      this.loadHistorico()
    ]);
    
    this.render();
  }

  async loadUnidadesDestino() {
    try {
      const { data, error } = await db.getClient()
        .from('unidades')
        .select('id, nome, tipo')
        .neq('id', this.unidadeOrigemId) // A fábrica não pode enviar pão para ela mesma
        .eq('ativo', true)
        .eq('visivel', true)
        .order('nome');

      if (error) throw error;
      this.unidadesDestino = data || [];
    } catch (error) {
      console.error('Erro ao carregar unidades de destino:', error);
    }
  }

  async loadProdutos() {
    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .eq('visivel', true)
        .order('nome');

      if (error) throw error;
      this.produtos = data || [];
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  }

  async loadHistorico() {
    try {
      if (!this.unidadeOrigemId) return;

      const { data, error } = await db.getClient()
        .from('estoque_movimentacao')
        .select(`
          *,
          produto:produtos(nome, tipo_preco)
        `)
        .eq('tipo', 'producao')
        .eq('unidade_id', this.unidadeOrigemId) 
        .order('created_at', { ascending: false })
        .limit(50); 

      if (error) throw error;
      this.historico = data || [];
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  }

  render() {
    const container = document.getElementById('producao-content');
    if (!container) return;

    container.innerHTML = `
      <style>
        .producao-grid { display: grid; grid-template-columns: 2fr 400px; gap: 1.5rem; height: calc(100vh - 120px); }
        @media(max-width: 1024px) { .producao-grid { grid-template-columns: 1fr; height: auto; } }
        
        .pdv-grid-otimizado { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1.5rem; overflow-y: auto; flex: 1; align-content: start; }
        .produto-venda-card-otimizado { background: var(--bg-primary); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); padding: 1rem; text-align: center; cursor: pointer; transition: var(--transition); display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .produto-venda-card-otimizado:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: var(--shadow-md); }
      </style>

      <div class="producao-grid animate-fade-in">
        
        <!-- LADO ESQUERDO: Catálogo de Produtos e Histórico -->
        <div class="card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0; box-shadow: none; border: 1px solid var(--border-color);">
          <div class="card-header" style="border-bottom: 1px solid var(--border-color); margin: 0;">
            <h3 class="card-title">🏭 Catálogo de Produtos</h3>
            <div class="form-group" style="margin: 0; width: 250px;">
              <input type="text" class="form-input" placeholder="Buscar produto..." onkeyup="producaoModule.filtrarProdutos(this.value)">
            </div>
          </div>
          
          <div id="grade-produtos-producao" class="pdv-grid-otimizado custom-scrollbar" style="flex: 1;">
            ${this.renderListaProdutos(this.produtos)}
          </div>
          
          <div style="height: 200px; border-top: 2px solid var(--border-color); background: var(--bg-secondary); display: flex; flex-direction: column;">
            <div style="padding: 0.5rem 1rem; font-weight: bold; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary);">Últimos Envios Realizados</div>
            <div style="overflow-y: auto; flex: 1; padding: 0 1rem 1rem 1rem;" class="custom-scrollbar">
              ${this.renderHistorico()}
            </div>
          </div>
        </div>

        <!-- LADO DIREITO: Painel de Envio -->
        <div class="painel-pedido" style="box-shadow: none; border: 1px solid var(--border-color);">
          <div class="painel-pedido-header">
            <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--primary); margin: 0;">🚚 Preparar Envio</h2>
          </div>
          
          <div style="padding: 1rem; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
            <label class="form-label">Unidade de Destino *</label>
            <select id="select-destino" class="form-input" style="font-weight: bold; border-color: var(--primary);">
              <option value="">-- Selecione a Loja/Destino --</option>
              ${this.unidadesDestino.map(u => `<option value="${u.id}">🏪 ${u.nome}</option>`).join('')}
            </select>
          </div>

          <div class="pedido-itens custom-scrollbar" id="producao-carrinho" style="padding: 1rem; flex: 1;">
            ${this.renderCarrinho()}
          </div>
          
          <div class="pedido-acoes" style="padding: 1.5rem;">
            <button class="btn btn-secondary w-full" style="margin-bottom: 0.5rem;" onclick="producaoModule.limparCarrinho()" ${this.carrinho.length === 0 ? 'disabled' : ''}>Limpar Caixa</button>
            <button class="btn btn-primary w-full btn-lg" onclick="producaoModule.confirmarEnvio()" ${this.carrinho.length === 0 ? 'disabled' : ''}>🚀 DESPACHAR PRODUTOS</button>
          </div>
        </div>

      </div>
    `;
  }

  renderListaProdutos(lista) {
    if (lista.length === 0) return `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto encontrado.</div>`;
    
    return lista.map(p => `
      <div class="produto-venda-card-otimizado" onclick="producaoModule.abrirModalQuantidade('${p.id}')">
        <div style="width: 80px; height: 80px; flex-shrink: 0; background: var(--bg-secondary); border-radius: var(--border-radius); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: var(--shadow-sm);">
          ${p.imagem_url 
            ? `<img src="${p.imagem_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div style="display:none; font-size: 2rem;">🥖</div>` 
            : '<div style="font-size: 2rem;">🥖</div>'}
        </div>
        <div style="width: 100%;">
          <div title="${p.nome}" style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${p.nome}
          </div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">
            <span style="background: var(--bg-secondary); padding: 0.15rem 0.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
              ${p.tipo_preco === 'peso' ? '⚖️ KG' : '📦 UN'}
            </span>
          </div>
        </div>
      </div>
    `).join('');
  }

  filtrarProdutos(termo) {
    const t = termo.toLowerCase();
    document.getElementById('grade-produtos-producao').innerHTML = this.renderListaProdutos(this.produtos.filter(p => p.nome.toLowerCase().includes(t)));
  }

  // ==========================================
  // NOVOS MODAIS PROFISSIONAIS (SUBSTITUEM O PROMPT)
  // ==========================================
  abrirModalQuantidade(produtoId) {
    const produto = this.produtos.find(p => p.id === produtoId);
    if (!produto) return;

    if (produto.tipo_preco === 'peso') {
      this.renderModalPeso(produto);
    } else {
      this.renderModalUnidade(produto);
    }
  }

  renderModalPeso(produto) {
    const content = `
      <div class="card-header">
        <h3 class="card-title">⚖️ Volume de Envio (Por Quilo)</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="producaoModule.confirmarAdicaoModal(event, '${produto.id}')">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <h4 style="font-size: 1.25rem;">${produto.nome}</h4>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label class="form-label" style="text-align: center; margin-bottom: 0.75rem;">Adicionar Quantidade Rápida</label>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(0.500, 3)">+ 500g</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(1.000, 3)">+ 1 KG</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(5.000, 3)">+ 5 KG</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(10.000, 3)">+ 10 KG</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(20.000, 3)">+ 20 KG</button>
          </div>
          <div style="text-align: center; margin-top: 0.75rem;">
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('input-qtd-modal').value=''; document.getElementById('input-qtd-modal').focus();">
              🔄 Zerar Volume
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" style="text-align: center;">Total a Enviar (em KG) *</label>
          <input type="number" step="0.001" min="0.001" name="quantidade" id="input-qtd-modal" class="form-input" style="font-size: 2rem; text-align: center; font-weight: 800; color: var(--primary); height: auto;" required autofocus placeholder="0.000">
        </div>
        
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <button type="button" class="btn btn-secondary w-full" onclick="modal.close()">Cancelar</button>
          <button type="submit" class="btn btn-primary w-full">Adicionar à Caixa de Transporte</button>
        </div>
      </form>
    `;
    modal.open(content);
  }

  renderModalUnidade(produto) {
    const content = `
      <div class="card-header">
        <h3 class="card-title">📦 Volume de Envio (Unidades)</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="producaoModule.confirmarAdicaoModal(event, '${produto.id}')">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <h4 style="font-size: 1.25rem;">${produto.nome}</h4>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label class="form-label" style="text-align: center; margin-bottom: 0.75rem;">Adicionar Quantidade Rápida</label>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(10, 0)">+ 10 un</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(20, 0)">+ 20 un</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(50, 0)">+ 50 un</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(100, 0)">+ 100 un</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="producaoModule.somarInputModal(200, 0)">+ 200 un</button>
          </div>
          <div style="text-align: center; margin-top: 0.75rem;">
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('input-qtd-modal').value=''; document.getElementById('input-qtd-modal').focus();">
              🔄 Zerar Volume
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" style="text-align: center;">Total a Enviar (Unidades) *</label>
          <input type="number" step="1" min="1" name="quantidade" id="input-qtd-modal" class="form-input" style="font-size: 2rem; text-align: center; font-weight: 800; color: var(--primary); height: auto;" required autofocus placeholder="0">
        </div>
        
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <button type="button" class="btn btn-secondary w-full" onclick="modal.close()">Cancelar</button>
          <button type="submit" class="btn btn-primary w-full">Adicionar à Caixa de Transporte</button>
        </div>
      </form>
    `;
    modal.open(content);
  }

  somarInputModal(valorAdicional, casasDecimais) {
    const input = document.getElementById('input-qtd-modal');
    if (!input) return;
    
    let valorAtual = parseFloat(input.value) || 0;
    let novoValor = valorAtual + valorAdicional;
    
    input.value = novoValor.toFixed(casasDecimais);
    input.focus();
  }

  confirmarAdicaoModal(event, produtoId) {
    event.preventDefault();
    const inputQtd = event.target.quantidade.value;
    const quantidade = parseFloat(inputQtd);
    
    const produto = this.produtos.find(p => p.id === produtoId);
    
    if (produto && quantidade > 0) {
      this.inserirNoCarrinho(produto, quantidade);
      modal.close();
    }
  }

  // ==========================================
  // CARRINHO E ENVIO
  // ==========================================
  inserirNoCarrinho(produto, quantidade) {
    const existente = this.carrinho.find(i => i.produto.id === produto.id);
    if (existente) {
      existente.quantidade += quantidade;
    } else {
      this.carrinho.push({ produto, quantidade });
    }
    this.atualizarCarrinhoUI();
  }

  removerItem(index) {
    this.carrinho.splice(index, 1);
    this.atualizarCarrinhoUI();
  }

  limparCarrinho() {
    this.carrinho = [];
    this.atualizarCarrinhoUI();
  }

  atualizarCarrinhoUI() {
    const div = document.getElementById('producao-carrinho');
    if (div) div.innerHTML = this.renderCarrinho();
    
    const btnLimpar = document.querySelector('.pedido-acoes .btn-secondary');
    const btnEnviar = document.querySelector('.pedido-acoes .btn-primary');
    if(btnLimpar) btnLimpar.disabled = this.carrinho.length === 0;
    if(btnEnviar) btnEnviar.disabled = this.carrinho.length === 0;
  }

  renderCarrinho() {
    if (this.carrinho.length === 0) return `<div class="empty-state"><div class="empty-state-icone" style="font-size: 3rem;">📦</div><p>Caixa de envio vazia</p><small>Selecione os produtos ao lado</small></div>`;
    
    return this.carrinho.map((item, idx) => `
      <div class="pedido-item" style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--border-radius);">
        <div class="pedido-item-info">
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem;">${item.produto.nome}</div>
          <div style="color: var(--primary); font-size: 0.85rem; font-weight: 800;">
            ${item.quantidade} ${item.produto.tipo_preco === 'peso' ? 'KG' : 'UN'}
          </div>
        </div>
        <button class="btn-ghost" style="color: var(--danger); font-size: 1.1rem; padding: 0.5rem; cursor: pointer; border: none; background: transparent;" onclick="producaoModule.removerItem(${idx})">✕</button>
      </div>
    `).join('');
  }

  renderHistorico() {
    if (this.historico.length === 0) return `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 1rem;">Nenhum envio recente.</div>`;
    
    return this.historico.map(h => {
      const dataFormatada = new Date(h.created_at).toLocaleString('pt-PT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
      const destino = this.unidadesDestino.find(u => u.id === h.observacao?.replace('Envio para ', ''))?.nome || 'Loja';
      
      return `
        <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
          <div>
            <span style="color: var(--success); font-weight: 800; background: rgba(39, 174, 96, 0.1); padding: 2px 6px; border-radius: 4px; margin-right: 5px;">
              +${parseFloat(h.quantidade).toFixed(h.produto?.tipo_preco==='peso'?3:0)}
            </span> 
            <span style="font-weight: 600;">${h.produto?.nome || 'Produto apagado'}</span>
          </div>
          <div style="text-align: right; color: var(--text-muted);">
            <div style="font-weight: 600; color: var(--text-primary);">${destino}</div>
            <div style="font-size: 0.75rem;">${dataFormatada}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  async confirmarEnvio() {
    const destinoId = document.getElementById('select-destino').value;
    if (!destinoId) {
      alert('⚠️ Selecione a unidade de destino antes de despachar os produtos!');
      return;
    }
    if (this.carrinho.length === 0) return;

    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = 'A processar envio...';

    try {
      const userId = auth.getCurrentUser()?.id;

      for (const item of this.carrinho) {
        const { data: est } = await db.getClient()
          .from('estoque')
          .select('*')
          .eq('produto_id', item.produto.id)
          .eq('unidade_id', destinoId)
          .single();

        const qtdAtual = est ? parseFloat(est.quantidade) : 0;
        const novaQtd = qtdAtual + parseFloat(item.quantidade);

        if (est) {
          await db.update('estoque', est.id, { quantidade: novaQtd, updated_by: userId });
        } else {
          await db.insert('estoque', [{
            unidade_id: destinoId,
            produto_id: item.produto.id,
            quantidade: novaQtd,
            updated_by: userId
          }]);
        }

        await db.insert('estoque_movimentacao', [{
          unidade_id: destinoId,
          produto_id: item.produto.id,
          tipo: 'entrada',
          quantidade: item.quantidade,
          quantidade_anterior: qtdAtual,
          quantidade_nova: novaQtd,
          usuario_id: userId,
          observacao: `Recebido da Fábrica`
        }]);
        
        await db.insert('estoque_movimentacao', [{
          unidade_id: this.unidadeOrigemId,
          produto_id: item.produto.id,
          tipo: 'producao',
          quantidade: item.quantidade,
          usuario_id: userId,
          observacao: `Envio para ${destinoId}`
        }]);
      }

      alert('✅ Produtos despachados com sucesso para a Loja!');
      this.carrinho = [];
      await this.loadHistorico(); 
      this.render(); 

    } catch (error) {
      alert('❌ Erro ao enviar: ' + error.message);
      btn.disabled = false;
      btn.innerHTML = '🚀 DESPACHAR PRODUTOS';
    }
  }
}

const producaoModule = new ProducaoModule();
window.producaoModule = producaoModule;