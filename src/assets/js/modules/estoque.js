/**
 * RICAZO - Módulo de Gestão de Stock e Quebras (Descartes)
 */

class EstoqueModule {
  constructor() {
    this.unidades = [];
    this.produtos = [];
    this.unidadeSelecionada = null;
  }

  async load() {
    const container = document.getElementById('estoque-list');
    if (!container) return;

    try {
      // Carrega unidades para o filtro (apenas lojas/quiosques)
      const { data: unidades } = await db.getClient()
        .from('unidades')
        .select('id, nome')
        .neq('tipo', 'fabrica') // Fábrica envia, Lojas controlam as quebras
        .eq('ativo', true)
        .order('nome');
      
      this.unidades = unidades || [];

      // Carrega todos os produtos ativos
      const { data: produtos } = await db.getClient()
        .from('produtos')
        .select('id, nome, tipo_preco')
        .eq('ativo', true)
        .order('nome');
      
      this.produtos = produtos || [];

      this.renderFiltro(container);

    } catch (error) {
      console.error('Erro ao carregar módulo de stock:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger);">Erro ao carregar stock.</div>`;
    }
  }

  renderFiltro(container) {
    let html = `
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary);">
        <label class="form-label">Selecione a Unidade para Analisar o Stock Diário:</label>
        <select class="form-input" style="max-width: 400px; font-weight: bold;" onchange="estoqueModule.carregarEstoque(this.value)">
          <option value="">-- Escolha uma Loja --</option>
          ${this.unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
        </select>
      </div>
      <div id="estoque-conteudo-unidade" style="padding: 1.5rem;">
        <div class="empty-state">
          <div class="empty-state-icone">📦</div>
          <p>Selecione uma loja acima para ver o stock</p>
        </div>
      </div>
    `;
    container.innerHTML = html;
  }

  async carregarEstoque(unidadeId) {
    const container = document.getElementById('estoque-conteudo-unidade');
    if (!unidadeId) {
      container.innerHTML = `<div class="empty-state"><p>Selecione uma loja acima para ver o stock</p></div>`;
      return;
    }

    this.unidadeSelecionada = unidadeId;
    container.innerHTML = `<div class="text-center"><div class="spinner"></div><p>A carregar movimentos do dia...</p></div>`;

    try {
      // 1. Pega o Stock Atual Real do banco
      const { data: estoqueAtual } = await db.getClient()
        .from('estoque')
        .select('*')
        .eq('unidade_id', unidadeId);

      const mapEstoque = (estoqueAtual || []).reduce((acc, est) => {
        acc[est.produto_id] = parseFloat(est.quantidade);
        return acc;
      }, {});

      // 2. Pega os movimentos DE HOJE (Entradas da fábrica vs Saídas de vendas)
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const { data: movimentos } = await db.getClient()
        .from('estoque_movimentacao')
        .select('produto_id, tipo, quantidade')
        .eq('unidade_id', unidadeId)
        .gte('created_at', hoje.toISOString());

      const movsHoje = movimentos || [];

      // 3. Monta a tabela cruzando os dados
      let tabelaHtml = `
        <style>
          .table-stock { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
          .table-stock th, .table-stock td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border-color); }
          .table-stock th { background: var(--bg-primary); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; }
          .table-stock tbody tr:hover { background: var(--bg-hover); }
          .badge-entrada { color: var(--success); font-weight: bold; }
          .badge-saida { color: var(--primary); font-weight: bold; }
          .badge-stock { font-size: 1.1rem; font-weight: 800; }
        </style>
        <div style="overflow-x: auto;">
          <table class="table-stock">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Recebido Hoje (Fábrica)</th>
                <th>Vendido Hoje (PDV)</th>
                <th>Quebras/Descartes (Hoje)</th>
                <th>Stock Atual Teórico</th>
                <th style="text-align: right;">Ação</th>
              </tr>
            </thead>
            <tbody>
      `;

      this.produtos.forEach(p => {
        // Filtra os movimentos do produto específico
        const entradasDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'entrada').reduce((sum, m) => sum + parseFloat(m.quantidade), 0);
        const vendasDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'saida').reduce((sum, m) => sum + Math.abs(parseFloat(m.quantidade)), 0);
        const descartesDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'descarte').reduce((sum, m) => sum + Math.abs(parseFloat(m.quantidade)), 0);
        
        const stockAtual = mapEstoque[p.id] || 0;
        const sufixo = p.tipo_preco === 'peso' ? 'kg' : 'un';

        // Só mostra produtos que tiveram movimento ou que têm stock
        if (entradasDia > 0 || vendasDia > 0 || stockAtual > 0 || descartesDia > 0) {
          tabelaHtml += `
            <tr>
              <td style="font-weight: 600;">${p.nome}</td>
              <td class="badge-entrada">+ ${entradasDia.toFixed(p.tipo_preco === 'peso' ? 3 : 0)} ${sufixo}</td>
              <td class="badge-saida">- ${vendasDia.toFixed(p.tipo_preco === 'peso' ? 3 : 0)} ${sufixo}</td>
              <td style="color: var(--danger); font-weight: bold;">- ${descartesDia.toFixed(p.tipo_preco === 'peso' ? 3 : 0)} ${sufixo}</td>
              <td class="badge-stock ${stockAtual < 0 ? 'text-danger' : ''}">${stockAtual.toFixed(p.tipo_preco === 'peso' ? 3 : 0)} ${sufixo}</td>
              <td style="text-align: right;">
                <button class="btn btn-sm" style="border: 1px solid var(--danger); color: var(--danger); background: transparent;" 
                        onclick="estoqueModule.abrirModalDescarte('${p.id}', '${p.nome}', ${stockAtual}, '${p.tipo_preco}')">
                  🗑️ Declarar Sobra/Quebra
                </button>
              </td>
            </tr>
          `;
        }
      });

      tabelaHtml += `</tbody></table></div>`;
      container.innerHTML = tabelaHtml;

    } catch (error) {
      console.error('Erro ao carregar detalhes de stock:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger);">Erro ao carregar dados.</div>`;
    }
  }

  abrirModalDescarte(produtoId, produtoNome, stockAtual, tipoPreco) {
    const isPeso = tipoPreco === 'peso';
    const content = `
      <div class="card-header">
        <h3 class="card-title">🗑️ Registar Quebra / Descarte</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="estoqueModule.salvarDescarte(event, '${produtoId}', ${stockAtual})">
        <div style="margin-bottom: 1.5rem; background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem;">${produtoNome}</div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Stock Sistémico Atual: <strong style="color: var(--primary);">${stockAtual.toFixed(isPeso ? 3 : 0)} ${isPeso ? 'kg' : 'un'}</strong></div>
        </div>

        <div class="form-group">
          <label class="form-label">Quantidade de Sobra/Estragada *</label>
          <input type="number" name="quantidade" class="form-input" step="${isPeso ? '0.001' : '1'}" min="0.001" max="${stockAtual > 0 ? stockAtual : ''}" required autofocus placeholder="Ex: ${isPeso ? '0.500' : '5'}">
          <small style="color: var(--text-muted); display: block; margin-top: 0.25rem;">Isto será subtraído ao stock atual.</small>
        </div>

        <div class="form-group">
          <label class="form-label">Motivo (Opcional)</label>
          <select name="motivo" class="form-input">
            <option value="Sobra de fim de dia">Sobra de fim de dia</option>
            <option value="Passou da validade">Passou da validade</option>
            <option value="Caiu / Danificado">Caiu / Danificado</option>
            <option value="Outro">Outro</option>
          </select>
        </div>

        ${modal.actions('Cancelar', 'Confirmar Quebra')}
      </form>
    `;
    modal.open(content);
  }

  async salvarDescarte(event, produtoId, stockAtual) {
    event.preventDefault();
    const btn = event.submitter;
    if (btn) btn.disabled = true;

    const quantidadeRemover = parseFloat(event.target.quantidade.value);
    const motivo = event.target.motivo.value;
    const novoStock = stockAtual - quantidadeRemover;
    const userId = auth.getCurrentUser()?.id;

    try {
      // 1. Atualiza o registo de stock
      const { data: est } = await db.getClient()
        .from('estoque')
        .select('id')
        .eq('produto_id', produtoId)
        .eq('unidade_id', this.unidadeSelecionada)
        .single();

      if (est) {
        await db.update('estoque', est.id, { quantidade: novoStock, updated_by: userId });
      }

      // 2. Grava a movimentação de descarte
      await db.insert('estoque_movimentacao', [{
        unidade_id: this.unidadeSelecionada,
        produto_id: produtoId,
        tipo: 'descarte',
        quantidade: -quantidadeRemover,
        quantidade_anterior: stockAtual,
        quantidade_nova: novoStock,
        usuario_id: userId,
        observacao: motivo
      }]);

      modal.close();
      this.carregarEstoque(this.unidadeSelecionada); // Recarrega a tabela

    } catch (error) {
      alert('❌ Erro ao registar descarte: ' + error.message);
      if (btn) btn.disabled = false;
    }
  }
}

const estoqueModule = new EstoqueModule();
window.estoqueModule = estoqueModule;