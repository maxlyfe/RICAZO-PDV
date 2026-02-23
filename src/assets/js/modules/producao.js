/**
 * RICAZO - Módulo de Produção
 * Envia produtos da fábrica para as unidades
 */

class ProducaoModule {
  constructor() {
    this.produtos = [];
    this.unidades = [];
    this.unidadeAtual = null; // Fábrica atual
    this.historicoEnvios = [];
  }

  async init() {
    // Pega unidade da URL (fabrica ou específica)
    const urlParams = new URLSearchParams(window.location.search);
    const unidadeId = urlParams.get('unidade') || 'fabrica';
    
    await this.carregarUnidadeAtual(unidadeId);
    await Promise.all([
      this.loadProdutos(),
      this.loadUnidadesDestino()
    ]);
    this.render();
    this.carregarHistorico();
  }

  async carregarUnidadeAtual(unidadeId) {
    try {
      if (unidadeId === 'fabrica') {
        // Busca a primeira fábrica/matriz
        const { data, error } = await db.getClient()
          .from('unidades')
          .select('*')
          .eq('tipo', 'fabrica')
          .eq('ativo', true)
          .single();
        
        if (error) throw error;
        this.unidadeAtual = data;
      } else {
        // Busca unidade específica
        const { data, error } = await db.getClient()
          .from('unidades')
          .select('*')
          .eq('id', unidadeId)
          .single();
        
        if (error) throw error;
        this.unidadeAtual = data;
      }
    } catch (error) {
      console.error('Erro ao carregar unidade:', error);
      alert('❌ Unidade não encontrada');
    }
  }

  async loadProdutos() {
    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select(`*`)
        .eq('ativo', true)
        .eq('visivel', true)
        .order('nome');

      if (error) throw error;
      this.produtos = data || [];
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  }

  async loadUnidadesDestino() {
    try {
      const { data, error } = await db.getClient()
        .from('unidades')
        .select('*')
        .eq('ativo', true)
        .eq('visivel', true)
        .neq('id', this.unidadeAtual?.id) // Exclui a unidade atual (fábrica)
        .neq('tipo', 'fabrica') // E outras fábricas se houver
        .order('nome');

      if (error) throw error;
      this.unidades = data || [];
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
    }
  }

    render() {
    const container = document.getElementById('producao-content');
    if (!container) return;

    const nomeUnidade = this.unidadeAtual?.nome || 'Fábrica';

    container.innerHTML = `
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, var(--primary-light), var(--primary)); color: white;">
        <div class="card-header" style="border-bottom: none;">
          <h3 class="card-title" style="color: white; font-size: 1.5rem;">🏭 ${nomeUnidade}</h3>
          <span style="opacity: 0.9; font-size: 0.875rem;">Módulo de Produção</span>
        </div>
      </div>

      <div class="producao-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📦 Produtos para Envio</h3>
            <small style="color: var(--success);">✓ Disponível para envio</small>
          </div>
          
          <!-- CAMPO DE BUSCA -->
          <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
            <div class="form-group" style="margin-bottom: 0;">
              <input 
                type="text" 
                id="busca-produto" 
                class="form-input" 
                placeholder="🔍 Buscar produto por nome..."
                onkeyup="producaoModule.filtrarProdutos(this.value)"
              >
            </div>
          </div>
          
          <div id="lista-produtos-envio" style="max-height: 400px; overflow-y: auto;">
            ${this.renderListaProdutos()}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🚚 Unidades de Destino</h3>
            <small style="color: var(--text-muted);">${this.unidades.length} unidade(s)</small>
          </div>
          <div id="lista-unidades-destino">
            ${this.renderListaUnidades()}
          </div>
          <div style="padding: 1rem; border-top: 1px solid var(--border-color);">
            <button class="btn btn-primary w-full" onclick="producaoModule.confirmarEnvio()" id="btn-enviar" disabled>
              📤 Enviar Produção
            </button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 2rem;">
        <div class="card-header">
          <h3 class="card-title">📋 Histórico de Envios (Hoje)</h3>
          <button class="btn btn-sm btn-secondary" onclick="producaoModule.carregarHistorico()">🔄 Atualizar</button>
        </div>
        <div id="historico-envios">
          <p class="text-center" style="padding: 2rem; color: var(--text-muted);">
            Carregando histórico...
          </p>
        </div>
      </div>
    `;
  }

    filtrarProdutos(termo) {
    const container = document.getElementById('lista-produtos-envio');
    if (!container) return;

    const termoLower = termo.toLowerCase().trim();
    
    // Se vazio, mostra todos
    if (!termoLower) {
      container.innerHTML = this.renderListaProdutos();
      return;
    }

    // Filtra produtos
    const produtosFiltrados = this.produtos.filter(p => 
      p.nome.toLowerCase().includes(termoLower)
    );

    if (produtosFiltrados.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 2rem; color: var(--text-muted);">
          <p>🔍 Nenhum produto encontrado</p>
          <small>Tente outro termo de busca</small>
        </div>
      `;
      return;
    }

    // Renderiza filtrados (reutiliza o HTML mas com lista filtrada)
    container.innerHTML = produtosFiltrados.map(p => `
      <div class="produto-envio-item" data-produto-id="${p.id}">
        <div class="produto-envio-info">
          <div class="produto-envio-nome">${p.nome}</div>
          <div class="produto-envio-tipo">${p.tipo_preco === 'peso' ? '⚖️ Por KG' : '📦 Por Unidade'}</div>
        </div>
        <div class="produto-envio-quantidade">
          <input type="number" 
                 step="${p.tipo_preco === 'peso' ? '0.001' : '1'}" 
                 min="0" 
                 class="form-input input-qtd" 
                 placeholder="Qtd"
                 onchange="producaoModule.verificarPodeEnviar()"
                 data-tipo="${p.tipo_preco}">
        </div>
      </div>
    `).join('');
    
    // Reativa o listener de verificação
    this.verificarPodeEnviar();
  }

  renderListaProdutos() {
    if (this.produtos.length === 0) {
      return '<p style="padding: 1rem; color: var(--text-muted);">Nenhum produto cadastrado</p>';
    }

    return this.produtos.map(p => `
      <div class="produto-envio-item" data-produto-id="${p.id}">
        <div class="produto-envio-info">
          <div class="produto-envio-nome">${p.nome}</div>
          <div class="produto-envio-tipo">${p.tipo_preco === 'peso' ? '⚖️ Por KG' : '📦 Por Unidade'}</div>
        </div>
        <div class="produto-envio-quantidade">
          <input type="number" 
                 step="${p.tipo_preco === 'peso' ? '0.001' : '1'}" 
                 min="0" 
                 class="form-input input-qtd" 
                 placeholder="Qtd"
                 onchange="producaoModule.verificarPodeEnviar()"
                 data-tipo="${p.tipo_preco}">
        </div>
      </div>
    `).join('');
  }

  renderListaUnidades() {
    if (this.unidades.length === 0) {
      return '<p style="padding: 1rem; color: var(--text-muted);">Nenhuma unidade disponível para envio</p>';
    }

    return this.unidades.map(u => `
      <label class="unidade-destino-item">
        <input type="checkbox" name="unidade_destino" value="${u.id}" onchange="producaoModule.verificarPodeEnviar()">
        <div class="unidade-destino-info">
          <div class="unidade-destino-nome">${u.nome}</div>
          <div class="unidade-destino-tipo">${this.formatTipoUnidade(u.tipo)}</div>
        </div>
      </label>
    `).join('');
  }

  formatTipoUnidade(tipo) {
    const tipos = {
      'loja': '🏪 Loja',
      'quiosque': '📍 Quiosque'
    };
    return tipos[tipo] || tipo;
  }

  verificarPodeEnviar() {
    const temQuantidade = Array.from(document.querySelectorAll('.input-qtd')).some(input => parseFloat(input.value) > 0);
    const temUnidade = document.querySelectorAll('input[name="unidade_destino"]:checked').length > 0;
    
    const btn = document.getElementById('btn-enviar');
    if (btn) {
      btn.disabled = !(temQuantidade && temUnidade);
    }
  }

  async confirmarEnvio() {
    const produtosEnvio = [];
    document.querySelectorAll('.produto-envio-item').forEach(item => {
      const input = item.querySelector('.input-qtd');
      const qtd = parseFloat(input.value);
      if (qtd > 0) {
        produtosEnvio.push({
          produto_id: item.dataset.produtoId,
          quantidade: qtd
        });
      }
    });

    const unidadesDestino = Array.from(document.querySelectorAll('input[name="unidade_destino"]:checked'))
      .map(cb => cb.value);

    if (produtosEnvio.length === 0 || unidadesDestino.length === 0) {
      alert('❌ Selecione produtos e unidades de destino');
      return;
    }

    const resumo = produtosEnvio.map(p => {
      const prod = this.produtos.find(prod => prod.id === p.produto_id);
      return `• ${prod.nome}: ${p.quantidade} ${prod.tipo_preco === 'peso' ? 'kg' : 'un'}`;
    }).join('\n');

    const confirmar = confirm(
      `Enviar da ${this.unidadeAtual.nome} para ${unidadesDestino.length} unidade(s):\n\n${resumo}`
    );
    if (!confirmar) return;

    try {
      await this.processarEnvio(produtosEnvio, unidadesDestino);
      alert('✅ Envio realizado com sucesso!');
      await this.init();
      
    } catch (error) {
      console.error('Erro no envio:', error);
      alert('❌ Erro: ' + error.message);
    }
  }

  async processarEnvio(produtos, unidadesDestino) {
    const usuarioId = auth.getCurrentUser()?.id;
    const fabricaId = this.unidadeAtual.id;

    for (const unidadeId of unidadesDestino) {
      for (const item of produtos) {
        // 1. Registra SAÍDA da fábrica
        await db.insert('estoque_movimentacao', [{
          unidade_id: fabricaId,
          produto_id: item.produto_id,
          tipo: 'producao',
          quantidade: -item.quantidade,
          quantidade_anterior: 0,
          quantidade_nova: 0,
          usuario_id: usuarioId,
          observacao: `Envio para unidade ${unidadeId}`
        }]);

        // 2. Atualiza estoque da unidade destino
        const { data: estoqueUnidade } = await db.getClient()
          .from('estoque')
          .select('*')
          .eq('produto_id', item.produto_id)
          .eq('unidade_id', unidadeId)
          .single();

        const qtdAnterior = estoqueUnidade ? estoqueUnidade.quantidade : 0;
        const qtdNova = qtdAnterior + item.quantidade;

        if (estoqueUnidade) {
          await db.getClient()
            .from('estoque')
            .update({ quantidade: qtdNova, updated_by: usuarioId })
            .eq('id', estoqueUnidade.id);
        } else {
          await db.insert('estoque', [{
            unidade_id: unidadeId,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            updated_by: usuarioId
          }]);
        }

        // 3. Registra ENTRADA na unidade
        await db.insert('estoque_movimentacao', [{
          unidade_id: unidadeId,
          produto_id: item.produto_id,
          tipo: 'entrada',
          quantidade: item.quantidade,
          quantidade_anterior: qtdAnterior,
          quantidade_nova: qtdNova,
          origem_unidade_id: fabricaId,
          usuario_id: usuarioId,
          observacao: `Recebido de ${this.unidadeAtual.nome}`
        }]);
      }
    }
  }

      async carregarHistorico() {
    const container = document.getElementById('historico-envios');
    if (!container) return;

    try {
      const hoje = new Date().toISOString().split('T')[0];
      
      // Busca envios de hoje (saídas da fábrica)
      const { data: envios, error } = await db.getClient()
        .from('estoque_movimentacao')
        .select(`
          *,
          produto:produtos(nome, tipo_preco)
        `)
        .eq('tipo', 'producao')
        .eq('unidade_id', this.unidadeAtual?.id)
        .gte('created_at', hoje)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!envios || envios.length === 0) {
        container.innerHTML = `
          <div class="text-center" style="padding: 2rem; color: var(--text-muted);">
            <p>📭 Nenhum envio realizado hoje</p>
          </div>
        `;
        return;
      }

      // Busca nomes das unidades de destino (está na observação ou precisamos buscar separado)
      // Extrai IDs das unidades de destino das observações
      const unidadeIds = [...new Set(envios.map(e => {
        const match = e.observacao?.match(/Envio para unidade ([a-f0-9-]+)/);
        return match ? match[1] : null;
      }).filter(Boolean))];

      // Busca nomes das unidades
      let unidadesNomes = {};
      if (unidadeIds.length > 0) {
        const { data: unidadesData } = await db.getClient()
          .from('unidades')
          .select('id, nome')
          .in('id', unidadeIds);
        
        unidadesNomes = (unidadesData || []).reduce((acc, u) => {
          acc[u.id] = u.nome;
          return acc;
        }, {});
      }

      // Agrupa por unidade de destino
      const porUnidade = {};
      envios.forEach(mov => {
        const match = mov.observacao?.match(/Envio para unidade ([a-f0-9-]+)/);
        const unidadeId = match ? match[1] : 'desconhecida';
        const unidadeNome = unidadesNomes[unidadeId] || 'Unidade Desconhecida';
        
        if (!porUnidade[unidadeNome]) {
          porUnidade[unidadeNome] = [];
        }
        porUnidade[unidadeNome].push(mov);
      });

      // Renderiza agrupado
      container.innerHTML = Object.entries(porUnidade).map(([unidadeNome, movimentacoes]) => `
        <div class="envio-grupo" style="margin-bottom: 1.5rem;">
          <div class="envio-grupo-header" style="
            background: var(--bg-secondary);
            padding: 0.75rem 1rem;
            border-radius: var(--border-radius);
            margin-bottom: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          ">
            <span>🏪</span>
            <strong>${unidadeNome}</strong>
            <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: auto;">
              ${movimentacoes.length} item(s)
            </span>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                <th style="padding: 0.5rem; text-align: left;">Horário</th>
                <th style="padding: 0.5rem; text-align: left;">Produto</th>
                <th style="padding: 0.5rem; text-align: right;">Qtd</th>
                <th style="padding: 0.5rem; text-align: left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${movimentacoes.map(mov => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.5rem;">${new Date(mov.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</td>
                  <td style="padding: 0.5rem;">${mov.produto?.nome || '-'}</td>
                  <td style="padding: 0.5rem; text-align: right; font-weight: 600;">
                    ${Math.abs(mov.quantidade)} ${mov.produto?.tipo_preco === 'peso' ? 'kg' : 'un'}
                  </td>
                  <td style="padding: 0.5rem;">
                    <span style="
                      background: var(--success);
                      color: white;
                      padding: 0.125rem 0.5rem;
                      border-radius: 12px;
                      font-size: 0.75rem;
                    ">Enviado</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('');

    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      container.innerHTML = `
        <div class="text-center" style="padding: 2rem; color: var(--danger);">
          <p>❌ Erro ao carregar histórico</p>
          <small>${error.message}</small>
        </div>
      `;
    }
  }
}

const producaoModule = new ProducaoModule();
window.producaoModule = producaoModule;