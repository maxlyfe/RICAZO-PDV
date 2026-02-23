/**
 * RICAZO - Módulo Dashboard (Inteligência Financeira e Auditoria)
 */

class DashboardModule {
  constructor() {
    this.chartInstance = null;
    this.unidades = [];
    this.usuariosMap = {}; 
    this.mesasMap = {}; // NOVO: Mapear IDs de mesas para nomes
    this.vendasAtuais = []; // Guarda as vendas para usar no modal
    
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    
    this.filtros = {
      unidadeId: 'todas',
      mesAno: `${ano}-${mes}`
    };
  }

  async carregarEstatisticas() {
    const container = document.getElementById('admin-dashboard-stats');
    if (!container) return;

    if (!document.getElementById('dashboard-filtros')) {
      this.renderBaseUI(container);
      await Promise.all([
        this.carregarUnidadesFiltro(),
        this.carregarUsuariosMap(),
        this.carregarMesasMap() // Carrega as mesas
      ]);
    }

    await this.processarDados();
  }

  renderBaseUI(container) {
    container.innerHTML = `
      <div class="card" style="margin-bottom: 1.5rem; padding: 0; overflow: hidden;" id="dashboard-filtros">
        <div style="padding: 1.5rem 1.5rem 0.5rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <h3 class="card-title" style="margin: 0; font-size: 1.25rem;">📊 Visão Geral Financeira</h3>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Período:</span>
            <input type="month" id="filtro-mes-dash" class="form-input" style="width: auto; padding: 0.4rem 1rem; cursor: pointer;" value="${this.filtros.mesAno}" onchange="dashboardModule.atualizarFiltroMes()">
          </div>
        </div>
        <div id="dashboard-unidades-botoes" style="display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0 1.5rem 1.5rem 1.5rem; border-bottom: 1px solid var(--border-color);"></div>
      </div>
      
      <div id="dashboard-metricas"></div>
      
      <div class="card" style="margin-bottom: 1.5rem; position: relative; height: 350px;">
        <canvas id="faturamentoChart"></canvas>
      </div>

      <!-- NOVO: Botão para abrir o Modal de Auditoria em vez de exibir a lista enorme -->
      <div style="text-align: right; margin-bottom: 2.5rem;">
        <button class="btn btn-secondary" style="font-weight: 700; padding: 0.75rem 1.5rem; border: 2px solid var(--border-color);" onclick="dashboardModule.abrirModalAuditoria()">
          🧾 Ver Histórico Detalhado de Vendas
        </button>
      </div>
    `;
  }

  async carregarUnidadesFiltro() {
    try {
      const { data } = await db.getClient().from('unidades').select('id, nome').eq('visivel', true).order('nome');
      this.unidades = data || [];
      this.renderUnidadesBotoes();
    } catch (error) {}
  }

  async carregarUsuariosMap() {
    try {
      const { data } = await db.getClient().from('usuarios').select('id, nome');
      this.usuariosMap = (data || []).reduce((acc, u) => { acc[u.id] = u.nome; return acc; }, {});
    } catch (error) {}
  }

  // NOVO: Carregar mapa de Mesas para traduzir o ID
  async carregarMesasMap() {
    try {
      const { data } = await db.getClient().from('unidade_mesas').select('id, numero, nome');
      this.mesasMap = (data || []).reduce((acc, m) => { 
        acc[m.id] = m.nome || `Mesa ${m.numero}`; 
        return acc; 
      }, {});
    } catch (error) {}
  }

  renderUnidadesBotoes() {
    const container = document.getElementById('dashboard-unidades-botoes');
    if (!container) return;

    let html = `<button class="btn btn-sm ${this.filtros.unidadeId === 'todas' ? 'btn-primary' : 'btn-secondary border'}" style="border-radius: 20px;" onclick="dashboardModule.mudarUnidadeFiltro('todas')">🏢 Todas do Grupo</button>`;
    this.unidades.forEach(u => {
      const isAtivo = this.filtros.unidadeId === u.id;
      html += `<button class="btn btn-sm ${isAtivo ? 'btn-primary' : 'btn-secondary border'}" style="border-radius: 20px;" onclick="dashboardModule.mudarUnidadeFiltro('${u.id}')">🏪 ${u.nome}</button>`;
    });
    container.innerHTML = html;
  }

  mudarUnidadeFiltro(unidadeId) {
    this.filtros.unidadeId = unidadeId;
    this.renderUnidadesBotoes(); 
    
    // Se o modal estiver aberto, atualiza os botões de lá também
    if (document.getElementById('modal-filtros-auditoria')) {
      this.renderBotoesModal();
    }

    this.processarDados(); 
  }

  atualizarFiltroMes() {
    this.filtros.mesAno = document.getElementById('filtro-mes-dash').value;
    this.processarDados();
  }

  async processarDados() {
    try {
      const [anoStr, mesStr] = this.filtros.mesAno.split('-');
      const ano = parseInt(anoStr);
      const mes = parseInt(mesStr) - 1; 

      const dataInicio = new Date(ano, mes, 1);
      const dataFim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
      
      const dataInicioIso = dataInicio.toISOString();
      const dataFimIso = dataFim.toISOString();
      const hoje = new Date();
      const strHoje = hoje.toISOString().split('T')[0];

      let query = db.getClient()
        .from('vendas')
        .select('id, total, taxa_servico, data_fechamento, tipo, identificador, mesa_id, usuario_fechamento_id, unidade_id')
        .eq('status', 'fechada')
        .gte('data_fechamento', dataInicioIso)
        .lte('data_fechamento', dataFimIso)
        .order('data_fechamento', { ascending: false });

      if (this.filtros.unidadeId !== 'todas') {
        query = query.eq('unidade_id', this.filtros.unidadeId);
      }

      const { data: vendas, error } = await query;
      if (error) throw error;

      this.vendasAtuais = vendas || []; // Salva para o modal

      let faturamentoPeriodo = 0;
      let faturamentoHoje = 0;
      let qtdVendas = this.vendasAtuais.length;
      
      const diasNoMes = dataFim.getDate();
      const vendasPorDia = Array(diasNoMes).fill(0);
      const labelsDias = Array.from({length: diasNoMes}, (_, i) => `${i + 1}/${mesStr}`);

      this.vendasAtuais.forEach(v => {
        const totalComTaxa = parseFloat(v.total) + parseFloat(v.taxa_servico || 0);
        faturamentoPeriodo += totalComTaxa;

        const dataFechamento = new Date(v.data_fechamento);
        const diaVendaStr = dataFechamento.toISOString().split('T')[0]; 
        
        if (diaVendaStr === strHoje) faturamentoHoje += totalComTaxa;

        const diaDoMes = dataFechamento.getDate();
        vendasPorDia[diaDoMes - 1] += totalComTaxa;
      });

      const ticketMedio = qtdVendas > 0 ? (faturamentoPeriodo / qtdVendas) : 0;

      this.renderMetricas(faturamentoHoje, faturamentoPeriodo, ticketMedio, qtdVendas);
      this.renderGrafico(labelsDias, vendasPorDia);
      
      // Se o modal estiver aberto, atualiza a tabela lá dentro
      if (document.getElementById('modal-tabela-auditoria')) {
        this.renderTabelaAuditoria();
      }

    } catch (error) {
      console.error('Erro ao processar dados do dashboard:', error);
    }
  }

  renderMetricas(hoje, periodo, ticket, qtd) {
    const container = document.getElementById('dashboard-metricas');
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
        <div class="stat-card success"><div class="stat-header"><span class="stat-title">Faturação Hoje</span><div class="stat-icon">💰</div></div><div class="stat-value">R$ ${hoje.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">Acumulado de hoje</div></div>
        <div class="stat-card info"><div class="stat-header"><span class="stat-title">Faturação no Período</span><div class="stat-icon">📅</div></div><div class="stat-value">R$ ${periodo.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">${qtd} Venda(s) concluída(s)</div></div>
        <div class="stat-card warning"><div class="stat-header"><span class="stat-title">Ticket Médio</span><div class="stat-icon">🧾</div></div><div class="stat-value">R$ ${ticket.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">Média de gasto por cliente</div></div>
      </div>
    `;
  }

  renderGrafico(labels, dados) {
    const ctx = document.getElementById('faturamentoChart');
    if (!ctx) return;
    if (this.chartInstance) this.chartInstance.destroy();
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#E8913A';
    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Faturação (R$)', data: dados, backgroundColor: 'rgba(232, 145, 58, 0.2)', borderColor: primaryColor,
          borderWidth: 3, pointBackgroundColor: primaryColor, fill: true, tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // ==========================================
  // MODAL DE AUDITORIA (NOVO)
  // ==========================================
  abrirModalAuditoria() {
    const content = `
      <style>
        .modal-auditoria { width: 95vw !important; max-width: 1000px !important; }
        .table-auditoria { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .table-auditoria th, .table-auditoria td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border-color); }
        .table-auditoria th { background: var(--bg-secondary); position: sticky; top: 0; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; z-index: 10;}
        .table-auditoria tbody tr:hover { background: var(--bg-hover); }
      </style>
      
      <div class="card-header" style="padding-bottom: 1rem; border-bottom: none;">
        <h3 class="card-title">🧾 Histórico de Vendas (${this.filtros.mesAno})</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      
      <!-- Navegação de Unidades DENTRO do Modal -->
      <div id="modal-filtros-auditoria" style="padding: 0 1.5rem 1rem 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); background: var(--bg-primary);">
      </div>

      <!-- Tabela -->
      <div id="modal-tabela-auditoria" style="max-height: 60vh; overflow-y: auto;" class="custom-scrollbar">
        <div class="text-center" style="padding: 3rem;"><div class="spinner"></div></div>
      </div>
    `;
    
    modal.open(content);
    document.querySelector('.modal-content').classList.add('modal-auditoria');
    
    this.renderBotoesModal();
    this.renderTabelaAuditoria();
  }

  renderBotoesModal() {
    const container = document.getElementById('modal-filtros-auditoria');
    if (!container) return;

    let html = `<button class="btn btn-sm ${this.filtros.unidadeId === 'todas' ? 'btn-primary' : 'btn-secondary border'}" style="border-radius: 20px;" onclick="dashboardModule.mudarUnidadeFiltro('todas')">🏢 Todas</button>`;
    this.unidades.forEach(u => {
      const isAtivo = this.filtros.unidadeId === u.id;
      html += `<button class="btn btn-sm ${isAtivo ? 'btn-primary' : 'btn-secondary border'}" style="border-radius: 20px;" onclick="dashboardModule.mudarUnidadeFiltro('${u.id}')">🏪 ${u.nome}</button>`;
    });
    container.innerHTML = html;
  }

  renderTabelaAuditoria() {
    const container = document.getElementById('modal-tabela-auditoria');
    if (!container) return;

    if (this.vendasAtuais.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding: 3rem;"><p>Nenhuma venda concluída neste período.</p></div>`;
      return;
    }

    let html = `
      <table class="table-auditoria">
        <thead>
          <tr>
            <th>Data e Hora (Fecho)</th>
            ${this.filtros.unidadeId === 'todas' ? '<th>Unidade</th>' : ''}
            <th>Origem</th>
            <th>Atendente / Caixa</th>
            <th style="text-align: right;">Subtotal</th>
            <th style="text-align: right;">Taxa</th>
            <th style="text-align: right;">Total Final</th>
          </tr>
        </thead>
        <tbody>
    `;

    this.vendasAtuais.forEach(v => {
      const dataFormatada = new Date(v.data_fechamento).toLocaleString('pt-PT');
      const nomeCaixa = this.usuariosMap[v.usuario_fechamento_id] || 'Desconhecido';
      const nomeUnidade = this.unidades.find(u => u.id === v.unidade_id)?.nome || '---';
      
      // Traduz o ID da Mesa para o Nome Real
      const nomeMesa = this.mesasMap[v.mesa_id] || v.identificador || 'Desconhecida';
      
      const origemBadge = v.tipo === 'balcao' 
        ? `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">🛒 Balcão</span>` 
        : `🍽️ ${nomeMesa}`;

      const total = parseFloat(v.total);
      const taxa = parseFloat(v.taxa_servico || 0);

      html += `
        <tr>
          <td style="color: var(--text-muted);">${dataFormatada}</td>
          ${this.filtros.unidadeId === 'todas' ? `<td><strong>${nomeUnidade}</strong></td>` : ''}
          <td>${origemBadge}</td>
          <td>${nomeCaixa}</td>
          <td style="text-align: right;">R$ ${total.toFixed(2)}</td>
          <td style="text-align: right; color: var(--text-muted);">R$ ${taxa.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 800; color: var(--primary);">R$ ${(total + taxa).toFixed(2)}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }
}

const dashboardModule = new DashboardModule();
window.dashboardModule = dashboardModule;