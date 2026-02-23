/**
 * RICAZO - Módulo Dashboard (Inteligência Financeira)
 */

class DashboardModule {
  constructor() {
    this.chartInstance = null;
    this.unidades = [];
    
    // Filtros padrão (Mês atual e Todas as unidades)
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

    // 1. Constrói a UI base (Filtros e Contentores) na primeira carga
    if (!document.getElementById('dashboard-filtros')) {
      this.renderBaseUI(container);
      await this.carregarUnidadesFiltro();
    }

    await this.processarDados();
  }

  renderBaseUI(container) {
    // UI remodelada com espaço dedicado para a fileira de botões
    container.innerHTML = `
      <div class="card" style="margin-bottom: 1.5rem; padding: 0; overflow: hidden;" id="dashboard-filtros">
        
        <div style="padding: 1.5rem 1.5rem 0.5rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <h3 class="card-title" style="margin: 0; font-size: 1.25rem;">📊 Visão Geral Financeira</h3>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Período:</span>
            <input type="month" id="filtro-mes-dash" class="form-input" style="width: auto; padding: 0.4rem 1rem; cursor: pointer;" value="${this.filtros.mesAno}" onchange="dashboardModule.atualizarFiltroMes()">
          </div>
        </div>

        <!-- Onde os botões das unidades serão injetados -->
        <div id="dashboard-unidades-botoes" style="display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0 1.5rem 1.5rem 1.5rem; border-bottom: 1px solid var(--border-color);">
        </div>

      </div>
      
      <div id="dashboard-metricas">
        <!-- Cards injetados aqui -->
      </div>
      
      <div class="card" style="margin-bottom: 2.5rem; position: relative; height: 350px;">
        <canvas id="faturamentoChart"></canvas>
      </div>
    `;
  }

  async carregarUnidadesFiltro() {
    try {
      const { data } = await db.getClient().from('unidades').select('id, nome').eq('visivel', true).order('nome');
      this.unidades = data || [];
      
      // Renderiza os botões logo após carregar os dados
      this.renderUnidadesBotoes();
      
    } catch (error) {
      console.error('Erro ao carregar unidades para filtro', error);
    }
  }

  // NOVO: Renderiza botões em vez de um Select <option>
  renderUnidadesBotoes() {
    const container = document.getElementById('dashboard-unidades-botoes');
    if (!container) return;

    // Botão fixo "Todas as Unidades"
    let html = `
      <button class="btn btn-sm ${this.filtros.unidadeId === 'todas' ? 'btn-primary' : 'btn-secondary border'}" 
              style="border-radius: 20px;"
              onclick="dashboardModule.mudarUnidadeFiltro('todas')">
        🏢 Todas do Grupo
      </button>
    `;

    // Botões dinâmicos para cada unidade
    this.unidades.forEach(u => {
      const isAtivo = this.filtros.unidadeId === u.id;
      html += `
        <button class="btn btn-sm ${isAtivo ? 'btn-primary' : 'btn-secondary border'}" 
                style="border-radius: 20px;"
                onclick="dashboardModule.mudarUnidadeFiltro('${u.id}')">
          🏪 ${u.nome}
        </button>
      `;
    });

    container.innerHTML = html;
  }

  // NOVO: Método específico para o clique no botão de unidade
  mudarUnidadeFiltro(unidadeId) {
    this.filtros.unidadeId = unidadeId;
    this.renderUnidadesBotoes(); // Atualiza a cor (ativo/inativo) dos botões imediatamente
    this.processarDados(); // Busca os dados da unidade selecionada
  }

  // NOVO: Método para lidar apenas com a mudança de data
  atualizarFiltroMes() {
    this.filtros.mesAno = document.getElementById('filtro-mes-dash').value;
    this.processarDados();
  }

  async processarDados() {
    try {
      // 1. Preparar Datas
      const [anoStr, mesStr] = this.filtros.mesAno.split('-');
      const ano = parseInt(anoStr);
      const mes = parseInt(mesStr) - 1; // Meses em JS começam em 0

      const dataInicio = new Date(ano, mes, 1);
      const dataFim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
      
      // Datas formatadas para Supabase (UTC/ISO)
      const dataInicioIso = dataInicio.toISOString();
      const dataFimIso = dataFim.toISOString();

      // Para comparar "Hoje"
      const hoje = new Date();
      const strHoje = hoje.toISOString().split('T')[0];

      // 2. Query ao Supabase
      let query = db.getClient()
        .from('vendas')
        .select('total, taxa_servico, data_fechamento')
        .eq('status', 'fechada')
        .gte('data_fechamento', dataInicioIso)
        .lte('data_fechamento', dataFimIso);

      if (this.filtros.unidadeId !== 'todas') {
        query = query.eq('unidade_id', this.filtros.unidadeId);
      }

      const { data: vendas, error } = await query;
      if (error) throw error;

      // 3. Processar Métricas
      let faturamentoPeriodo = 0;
      let faturamentoHoje = 0;
      let qtdVendas = vendas.length;
      
      // Estrutura para agrupar por dia (para o gráfico)
      const diasNoMes = dataFim.getDate();
      const vendasPorDia = Array(diasNoMes).fill(0);
      const labelsDias = Array.from({length: diasNoMes}, (_, i) => `${i + 1}/${mesStr}`);

      vendas.forEach(v => {
        const totalComTaxa = parseFloat(v.total) + parseFloat(v.taxa_servico || 0);
        faturamentoPeriodo += totalComTaxa;

        // Tratar Fuso Horário local
        const dataFechamento = new Date(v.data_fechamento);
        const diaVendaStr = dataFechamento.toISOString().split('T')[0]; 
        
        if (diaVendaStr === strHoje) {
          faturamentoHoje += totalComTaxa;
        }

        // Agrupar no dia correto do mês (índice 0 = dia 1)
        const diaDoMes = dataFechamento.getDate();
        vendasPorDia[diaDoMes - 1] += totalComTaxa;
      });

      const ticketMedio = qtdVendas > 0 ? (faturamentoPeriodo / qtdVendas) : 0;

      // 4. Renderizar Tela
      this.renderMetricas(faturamentoHoje, faturamentoPeriodo, ticketMedio, qtdVendas);
      this.renderGrafico(labelsDias, vendasPorDia);

    } catch (error) {
      console.error('Erro ao processar dados do dashboard:', error);
    }
  }

  renderMetricas(hoje, periodo, ticket, qtd) {
    const container = document.getElementById('dashboard-metricas');
    if (!container) return;

    container.innerHTML = `
      <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
        <div class="stat-card success" style="animation: fadeIn 0.3s ease;">
          <div class="stat-header">
            <span class="stat-title">Faturamento Hoje</span>
            <div class="stat-icon">💰</div>
          </div>
          <div class="stat-value">R$ ${hoje.toFixed(2)}</div>
          <div class="stat-change" style="color: var(--text-muted);">Acumulado de hoje</div>
        </div>
        
        <div class="stat-card info" style="animation: fadeIn 0.4s ease;">
          <div class="stat-header">
            <span class="stat-title">Faturamento no Período</span>
            <div class="stat-icon">📅</div>
          </div>
          <div class="stat-value">R$ ${periodo.toFixed(2)}</div>
          <div class="stat-change" style="color: var(--text-muted);">${qtd} Venda(s) concluída(s)</div>
        </div>
        
        <div class="stat-card warning" style="animation: fadeIn 0.5s ease;">
          <div class="stat-header">
            <span class="stat-title">Ticket Médio</span>
            <div class="stat-icon">🧾</div>
          </div>
          <div class="stat-value">R$ ${ticket.toFixed(2)}</div>
          <div class="stat-change" style="color: var(--text-muted);">Média de gasto por cliente</div>
        </div>
      </div>
    `;
  }

  renderGrafico(labels, dados) {
    const ctx = document.getElementById('faturamentoChart');
    if (!ctx) return;

    // Destrói gráfico antigo se existir (para evitar sobreposição ao filtrar)
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#B0B0B0' : '#666666';
    const gridColor = isDarkMode ? '#404040' : '#E0E0E0';
    
    // Obtém a cor primária do CSS
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#E8913A';

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Faturamento (R$)',
          data: dados,
          backgroundColor: 'rgba(232, 145, 58, 0.2)', // Cor primária transparente
          borderColor: primaryColor,
          borderWidth: 3,
          pointBackgroundColor: primaryColor,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3 // Deixa a linha suave/arredondada
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return 'R$ ' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { 
              color: textColor,
              callback: function(value) { return 'R$ ' + value; }
            },
            grid: { color: gridColor, drawBorder: false }
          },
          x: {
            ticks: { color: textColor },
            grid: { display: false, drawBorder: false }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
      }
    });
  }
}

const dashboardModule = new DashboardModule();
window.dashboardModule = dashboardModule;