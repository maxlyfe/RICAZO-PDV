/**
 * RICAZO - Módulo de Gestão de Stock e Quebras (Descartes)
 */

class EstoqueModule {
  constructor() {
    this.unidades = [];
    this.produtos = [];
    this.unidadeSelecionada = null;
    
    // Define a data padrão como HOJE (ajustada ao fuso horário local)
    const hoje = new Date();
    const fusoOffset = hoje.getTimezoneOffset() * 60000;
    this.dataSelecionada = new Date(hoje.getTime() - fusoOffset).toISOString().split('T')[0];
  }

  async load() {
    const container = document.getElementById('estoque-list');
    if (!container) return;

    try {
      // Carrega unidades para o filtro (apenas lojas/quiosques)
      const { data: unidades } = await db.getClient()
        .from('unidades')
        .select('id, nome')
        .neq('tipo', 'fabrica') 
        .eq('ativo', true)
        .order('nome');
      
      this.unidades = unidades || [];

      // Carrega todos os produtos ativos, REMOVENDO OS COMBOS
      const { data: produtos } = await db.getClient()
        .from('produtos')
        .select('id, nome, tipo_preco, is_combo')
        .eq('ativo', true)
        .order('nome');
      
      this.produtos = (produtos || []).filter(p => !p.is_combo);

      this.renderFiltro(container);

    } catch (error) {
      console.error('Erro ao carregar módulo de stock:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger);">Erro ao carregar stock.</div>`;
    }
  }

  renderFiltro(container) {
    let html = `
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
        <div>
          <label class="form-label">Data de Análise:</label>
          <input type="date" class="form-input" id="estoque-data-filtro" value="${this.dataSelecionada}" onchange="estoqueModule.mudarData(this.value)">
        </div>
        <div style="flex: 1; max-width: 400px;">
          <label class="form-label">Selecione a Unidade:</label>
          <select class="form-input" id="estoque-unidade-filtro" style="font-weight: bold;" onchange="estoqueModule.carregarEstoque(this.value)">
            <option value="">-- Escolha uma Loja --</option>
            ${this.unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="estoque-conteudo-unidade" style="padding: 1.5rem;">
        <div class="empty-state">
          <div class="empty-state-icone">📦</div>
          <p>Selecione uma loja acima para ver a movimentação de stock.</p>
        </div>
      </div>
    `;
    container.innerHTML = html;
  }

  mudarData(novaData) {
    this.dataSelecionada = novaData;
    if (this.unidadeSelecionada) {
      this.carregarEstoque(this.unidadeSelecionada);
    }
  }

  async carregarEstoque(unidadeId) {
    const container = document.getElementById('estoque-conteudo-unidade');
    if (!unidadeId) {
      container.innerHTML = `<div class="empty-state"><p>Selecione uma loja acima para ver o stock</p></div>`;
      return;
    }

    this.unidadeSelecionada = unidadeId;
    container.innerHTML = `<div class="text-center"><div class="spinner"></div><p>A processar movimentos do dia selecionado...</p></div>`;

    try {
      // 1. Pega o Stock Atual Real do banco (O valor vivo agora)
      const { data: estoqueAtual } = await db.getClient()
        .from('estoque')
        .select('*')
        .eq('unidade_id', unidadeId);

      const mapEstoque = (estoqueAtual || []).reduce((acc, est) => {
        acc[est.produto_id] = parseFloat(est.quantidade);
        return acc;
      }, {});

      // 2. Calcula as horas de início e fim para a data selecionada
      const [ano, mes, dia] = this.dataSelecionada.split('-');
      const dataInicioIso = new Date(ano, mes - 1, dia, 0, 0, 0).toISOString();
      const dataFimIso = new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();

      // Verifica se a data selecionada é a de hoje
      const hojeStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const isHoje = this.dataSelecionada === hojeStr;

      // 3. Busca os movimentos estritamente dentro daquele dia
      const { data: movimentos } = await db.getClient()
        .from('estoque_movimentacao')
        .select('produto_id, tipo, quantidade')
        .eq('unidade_id', unidadeId)
        .gte('created_at', dataInicioIso)
        .lte('created_at', dataFimIso);

      const movsHoje = movimentos || [];

      // 4. Monta a tabela
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
                <th>Componente Físico</th>
                <th>Recebido (Fábrica)</th>
                <th>Vendido (Caixa)</th>
                <th>Quebras / Descartes</th>
                <th>Stock Atual (Live)</th>
                <th style="text-align: right;">Ação</th>
              </tr>
            </thead>
            <tbody>
      `;

      let temRegistos = false;

      this.produtos.forEach(p => {
        // Filtra os movimentos do produto específico no dia selecionado
        const entradasDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'entrada').reduce((sum, m) => sum + parseFloat(m.quantidade), 0);
        const vendasDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'saida').reduce((sum, m) => sum + Math.abs(parseFloat(m.quantidade)), 0);
        const descartesDia = movsHoje.filter(m => m.produto_id === p.id && m.tipo === 'descarte').reduce((sum, m) => sum + Math.abs(parseFloat(m.quantidade)), 0);
        
        const stockAtual = mapEstoque[p.id] || 0;
        const isPeso = p.tipo_preco === 'peso';
        const sufixo = isPeso ? 'kg' : 'un';

        const temMovimentoNoDia = entradasDia > 0 || vendasDia > 0 || descartesDia > 0;

        // Regra de exibição:
        // Se for "Hoje", mostra se tiver movimento ou se tiver stock guardado.
        // Se for "Passado", mostra APENAS se tiver tido movimentos naquele dia.
        if (temMovimentoNoDia || (isHoje && stockAtual > 0)) {
          temRegistos = true;
          
          const botaoAcao = isHoje 
            ? `<button class="btn btn-sm" style="border: 1px solid var(--danger); color: var(--danger); background: transparent;" onclick="estoqueModule.abrirModalDescarte('${p.id}', '${p.nome}', ${stockAtual}, '${p.tipo_preco}')">🗑️ Registar Quebra</button>`
            : `<span style="font-size: 0.75rem; color: var(--text-muted);">Bloqueado no Passado</span>`;

          tabelaHtml += `
            <tr>
              <td style="font-weight: 600;">${p.nome}</td>
              <td class="badge-entrada">+ ${entradasDia.toFixed(isPeso ? 3 : 0)} ${sufixo}</td>
              <td class="badge-saida">- ${vendasDia.toFixed(isPeso ? 3 : 0)} ${sufixo}</td>
              <td style="color: var(--danger); font-weight: bold;">- ${descartesDia.toFixed(isPeso ? 3 : 0)} ${sufixo}</td>
              <td class="badge-stock ${stockAtual < 0 ? 'text-danger' : ''}">${stockAtual.toFixed(isPeso ? 3 : 0)} ${sufixo}</td>
              <td style="text-align: right;">${botaoAcao}</td>
            </tr>
          `;
        }
      });

      tabelaHtml += `</tbody></table></div>`;

      if (!temRegistos) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icone">📅</div><p>Nenhuma movimentação de mercadoria registada no dia <strong>${this.dataSelecionada}</strong>.</p></div>`;
      } else {
        container.innerHTML = tabelaHtml;
      }

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
          <label class="form-label">Quantidade Estragada / Quebrada *</label>
          <input type="number" name="quantidade" class="form-input" step="${isPeso ? '0.001' : '1'}" min="0.001" max="${stockAtual > 0 ? stockAtual : ''}" required autofocus placeholder="Ex: ${isPeso ? '0.500' : '5'}">
          <small style="color: var(--text-muted); display: block; margin-top: 0.25rem;">Isto será subtraído ao stock atual da unidade.</small>
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
      // 1. Atualiza o registo de stock principal
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
      this.carregarEstoque(this.unidadeSelecionada); // Recarrega a tabela limpa

    } catch (error) {
      alert('❌ Erro ao registar descarte: ' + error.message);
      if (btn) btn.disabled = false;
    }
  }
}

const estoqueModule = new EstoqueModule();
window.estoqueModule = estoqueModule;