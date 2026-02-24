/**
 * RICAZO - Módulo Dashboard (Inteligência Financeira, Auditoria e Desempenho)
 */

class DashboardModule {
  constructor() {
    this.chartInstance = null;
    this.unidades = [];
    this.usuariosMap = {}; 
    this.mesasMap = {}; 
    this.formasMap = {}; 
    this.vendasAtuais = []; 
    
    this.telaAtual = 'resumo'; // 'resumo' | 'auditoria' | 'equipe'
    
    // Ajuste de fuso horário seguro para o formato YYYY-MM-DD
    const hoje = new Date();
    const fusoOffset = hoje.getTimezoneOffset() * 60000;
    const dataLocal = new Date(hoje.getTime() - fusoOffset);
    const hojeStr = dataLocal.toISOString().split('T')[0];
    
    // Primeiro dia do mês corrente
    const primeiroDiaMes = new Date(dataLocal.getFullYear(), dataLocal.getMonth(), 1);
    const priDiaStr = primeiroDiaMes.toISOString().split('T')[0];
    
    this.filtros = {
      unidadeId: 'todas',
      dataInicio: priDiaStr,
      dataFim: hojeStr
    };

    this.dadosGraficoCompletos = [];
  }

  async carregarEstatisticas() {
    const container = document.getElementById('admin-dashboard-stats');
    if (!container) return;

    if (!document.getElementById('dashboard-wrapper')) {
      this.renderBaseUI(container);
      await Promise.all([
        this.carregarUnidadesFiltro(),
        this.carregarUsuariosMap(),
        this.carregarMesasMap(),
        this.carregarFormasMap()
      ]);
    }

    await this.processarDados();
  }

  getIconePagamento(nomeForma) {
    if (!nomeForma) return '🪙';
    const n = nomeForma.toLowerCase();
    if (n.includes('pix')) return '💠';
    if (n.includes('dinheiro')) return '💵';
    if (n.includes('crédito') || n.includes('credito')) return '💳';
    if (n.includes('débito') || n.includes('debito')) return '🏧';
    return '🪙';
  }

  renderBaseUI(container) {
    container.innerHTML = `
      <div id="dashboard-wrapper">
        
        <!-- CABEÇALHO E ABAS DE NAVEGAÇÃO -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; gap: 0.5rem; background: var(--bg-secondary); padding: 0.5rem; border-radius: var(--border-radius-lg); border: 1px solid var(--border-color); overflow-x: auto; max-width: 100%;">
            <button id="tab-resumo" class="btn btn-primary" style="border-radius: var(--border-radius); padding: 0.5rem 1rem; white-space: nowrap;" onclick="dashboardModule.mudarTela('resumo')">📊 Resumo Gráfico</button>
            <button id="tab-equipe" class="btn btn-ghost" style="border-radius: var(--border-radius); padding: 0.5rem 1rem; white-space: nowrap;" onclick="dashboardModule.mudarTela('equipe')">👥 Desempenho Equipa</button>
            <button id="tab-auditoria" class="btn btn-ghost" style="border-radius: var(--border-radius); padding: 0.5rem 1rem; white-space: nowrap;" onclick="dashboardModule.mudarTela('auditoria')">🧾 Histórico de Vendas</button>
          </div>
        </div>

        <!-- FILTROS PRINCIPAIS -->
        <div class="card" style="margin-bottom: 1.5rem; padding: 0; overflow: hidden;" id="dashboard-filtros">
          <div style="padding: 1.5rem 1.5rem 0.5rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <h3 class="card-title" style="margin: 0; font-size: 1.25rem;">Painel de Inteligência</h3>
            
            <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase;">De:</span>
                <input type="date" id="filtro-data-inicio" class="form-input" style="padding: 0.4rem 0.75rem; font-size: 0.9rem;" value="${this.filtros.dataInicio}" onchange="dashboardModule.atualizarFiltros()">
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase;">Até:</span>
                <input type="date" id="filtro-data-fim" class="form-input" style="padding: 0.4rem 0.75rem; font-size: 0.9rem;" value="${this.filtros.dataFim}" onchange="dashboardModule.atualizarFiltros()">
              </div>
            </div>
          </div>
          <div id="dashboard-unidades-botoes" style="display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0 1.5rem 1.5rem 1.5rem; border-bottom: 1px solid var(--border-color);"></div>
        </div>
        
        <!-- CONTENTOR DINÂMICO (Gráficos ou Tabela) -->
        <div id="dashboard-dynamic-content">
           <div class="text-center" style="padding: 3rem;"><div class="spinner"></div></div>
        </div>
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

  async carregarMesasMap() {
    try {
      const { data } = await db.getClient().from('unidade_mesas').select('id, numero, nome');
      this.mesasMap = (data || []).reduce((acc, m) => { acc[m.id] = m.nome || `Mesa ${m.numero}`; return acc; }, {});
    } catch (error) {}
  }

  async carregarFormasMap() {
    try {
      const { data } = await db.getClient().from('formas_pagamento').select('id, nome');
      this.formasMap = (data || []).reduce((acc, f) => { acc[f.id] = f.nome; return acc; }, {});
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
    this.processarDados(); 
  }

  atualizarFiltros() {
    const dInicio = document.getElementById('filtro-data-inicio').value;
    const dFim = document.getElementById('filtro-data-fim').value;
    if (dInicio && dFim) {
      this.filtros.dataInicio = dInicio;
      this.filtros.dataFim = dFim;
      this.processarDados();
    }
  }

  mudarTela(tela) {
    if (this.telaAtual === tela) return; 
    
    this.telaAtual = tela;
    
    document.getElementById('tab-resumo').className = tela === 'resumo' ? 'btn btn-primary' : 'btn btn-ghost';
    document.getElementById('tab-equipe').className = tela === 'equipe' ? 'btn btn-primary' : 'btn btn-ghost';
    document.getElementById('tab-auditoria').className = tela === 'auditoria' ? 'btn btn-primary' : 'btn btn-ghost';
    
    const hoje = new Date();
    const fusoOffset = hoje.getTimezoneOffset() * 60000;
    const dataLocal = new Date(hoje.getTime() - fusoOffset);
    const hojeStr = dataLocal.toISOString().split('T')[0];
    
    if (tela === 'auditoria') {
      this.filtros.dataInicio = hojeStr;
      this.filtros.dataFim = hojeStr;
    } else {
      const primeiroDiaMes = new Date(dataLocal.getFullYear(), dataLocal.getMonth(), 1);
      this.filtros.dataInicio = primeiroDiaMes.toISOString().split('T')[0];
      this.filtros.dataFim = hojeStr;
    }

    const inputInicio = document.getElementById('filtro-data-inicio');
    const inputFim = document.getElementById('filtro-data-fim');
    if (inputInicio) inputInicio.value = this.filtros.dataInicio;
    if (inputFim) inputFim.value = this.filtros.dataFim;

    this.processarDados();
  }

  async processarDados() {
    try {
      const container = document.getElementById('dashboard-dynamic-content');
      if (container && this.vendasAtuais.length === 0) {
        container.innerHTML = `<div class="text-center" style="padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>A calcular...</p></div>`;
      }

      const dataInicioIso = `${this.filtros.dataInicio}T00:00:00.000Z`;
      const dataFimIso = `${this.filtros.dataFim}T23:59:59.999Z`;
      
      const fusoOffset = new Date().getTimezoneOffset() * 60000;
      const hojeStr = new Date(Date.now() - fusoOffset).toISOString().split('T')[0];

      // 1. Busca Vendas e ITENS (Para saber quem lançou o quê)
      let query = db.getClient()
        .from('vendas')
        .select('id, total, taxa_servico, data_fechamento, tipo, identificador, mesa_id, usuario_fechamento_id, unidade_id, itens:venda_itens(subtotal, usuario_id)')
        .eq('status', 'fechada')
        .gte('data_fechamento', dataInicioIso)
        .lte('data_fechamento', dataFimIso)
        .order('data_fechamento', { ascending: false });

      if (this.filtros.unidadeId !== 'todas') {
        query = query.eq('unidade_id', this.filtros.unidadeId);
      }

      const { data: vendas, error } = await query;
      if (error) throw error;

      this.vendasAtuais = vendas || [];

      // 2. Busca Pagamentos (Para Cartão/PIX/Dinheiro)
      let todosPagamentos = [];
      if (this.vendasAtuais.length > 0) {
        const vendasIds = this.vendasAtuais.map(v => v.id);
        
        for (let i = 0; i < vendasIds.length; i += 500) {
          const chunk = vendasIds.slice(i, i + 500);
          const { data: pags } = await db.getClient()
             .from('pagamentos')
             .select('venda_id, forma_pagamento_id, valor')
             .in('venda_id', chunk);
          if (pags) todosPagamentos.push(...pags);
        }
      }

      const pagamentosAgrupados = todosPagamentos.reduce((acc, p) => {
        if (!acc[p.venda_id]) acc[p.venda_id] = [];
        acc[p.venda_id].push(p);
        return acc;
      }, {});

      // 3. Estruturas para Métricas
      let faturamentoPeriodo = 0;
      let faturamentoHoje = 0;
      let taxasPeriodo = 0;
      let taxasHoje = 0;
      let qtdVendas = this.vendasAtuais.length;

      this.metricasFormas = {
        dinheiro: { icon: '💵', label: 'Dinheiro', hoje: 0, periodo: 0 },
        pix: { icon: '💠', label: 'PIX', hoje: 0, periodo: 0 },
        credito: { icon: '💳', label: 'Crédito', hoje: 0, periodo: 0 },
        debito: { icon: '🏧', label: 'Débito', hoje: 0, periodo: 0 },
        outros: { icon: '🪙', label: 'Outros', hoje: 0, periodo: 0 }
      };

      this.metricasEquipe = {}; // Para o relatório de Garçons/Operadores

      const chartMap = {};
      let dAtual = new Date(this.filtros.dataInicio + 'T12:00:00');
      const dFimDate = new Date(this.filtros.dataFim + 'T12:00:00');
      
      while (dAtual <= dFimDate) {
        const isoDia = dAtual.toISOString().split('T')[0];
        const labelPT = dAtual.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        chartMap[isoDia] = { label: labelPT, totalVenda: 0, breakdownPagamentos: {} };
        dAtual.setDate(dAtual.getDate() + 1);
      }

      // 4. Processa Vendas, Pagamentos e Rateio de Taxas
      this.vendasAtuais.forEach(v => {
        v.pagamentos = pagamentosAgrupados[v.id] || [];
        
        const dataFechamento = new Date(v.data_fechamento);
        const fusoVenda = dataFechamento.getTimezoneOffset() * 60000;
        const diaVendaStr = new Date(dataFechamento.getTime() - fusoVenda).toISOString().split('T')[0];
        
        const isHoje = diaVendaStr === hojeStr;
        const taxaVenda = parseFloat(v.taxa_servico || 0);

        // Somatórios Gerais
        taxasPeriodo += taxaVenda;
        if (isHoje) taxasHoje += taxaVenda;

        // Distribuição da Taxa de Serviço e Venda por Garçom (quem lançou o item)
        const totalSubtotalItens = (v.itens || []).reduce((sum, i) => sum + parseFloat(i.subtotal), 0);
        
        (v.itens || []).forEach(item => {
           const uid = item.usuario_id;
           if (!this.metricasEquipe[uid]) {
             this.metricasEquipe[uid] = { vendas: 0, taxas: 0 };
           }
           
           const subItem = parseFloat(item.subtotal);
           this.metricasEquipe[uid].vendas += subItem;
           
           if (totalSubtotalItens > 0) {
             const proporcaoDaVenda = subItem / totalSubtotalItens;
             this.metricasEquipe[uid].taxas += (proporcaoDaVenda * taxaVenda);
           }
        });

        // Formas de Pagamento e Gráficos
        if (v.pagamentos.length === 0) {
          const valor = parseFloat(v.total) + taxaVenda;
          faturamentoPeriodo += valor;
          if (isHoje) faturamentoHoje += valor;
          if (chartMap[diaVendaStr]) chartMap[diaVendaStr].totalVenda += valor;
        }

        v.pagamentos.forEach(pag => {
          const valorPag = parseFloat(pag.valor);
          const formaNome = this.formasMap[pag.forma_pagamento_id] || 'Outros';
          const formaNomeLow = formaNome.toLowerCase();

          faturamentoPeriodo += valorPag;
          if (isHoje) faturamentoHoje += valorPag;

          if (chartMap[diaVendaStr]) {
             chartMap[diaVendaStr].totalVenda += valorPag;
             if (!chartMap[diaVendaStr].breakdownPagamentos[formaNome]) {
                 chartMap[diaVendaStr].breakdownPagamentos[formaNome] = 0;
             }
             chartMap[diaVendaStr].breakdownPagamentos[formaNome] += valorPag;
          }

          let cat = 'outros';
          if (formaNomeLow.includes('dinheiro')) cat = 'dinheiro';
          else if (formaNomeLow.includes('pix')) cat = 'pix';
          else if (formaNomeLow.includes('crédito') || formaNomeLow.includes('credito')) cat = 'credito';
          else if (formaNomeLow.includes('débito') || formaNomeLow.includes('debito')) cat = 'debito';

          this.metricasFormas[cat].periodo += valorPag;
          if (isHoje) this.metricasFormas[cat].hoje += valorPag;
        });
      });

      this.ticketMedio = qtdVendas > 0 ? (faturamentoPeriodo / qtdVendas) : 0;
      this.faturamentoHoje = faturamentoHoje;
      this.faturamentoPeriodo = faturamentoPeriodo;
      this.taxasHoje = taxasHoje;
      this.taxasPeriodo = taxasPeriodo;
      this.qtdVendas = qtdVendas;

      this.labelsGrafico = Object.values(chartMap).map(d => d.label);
      this.dadosGrafico = Object.values(chartMap).map(d => d.totalVenda);
      this.dadosGraficoCompletos = Object.values(chartMap); 

      this.renderDynamicUI();

    } catch (error) {
      console.error('Erro ao processar dados do dashboard:', error);
    }
  }

  renderDynamicUI() {
    const container = document.getElementById('dashboard-dynamic-content');
    if (!container) return;

    if (this.telaAtual === 'resumo') {
      container.innerHTML = this.htmlTelaResumo();
      setTimeout(() => this.renderGrafico(), 50);
    } else if (this.telaAtual === 'auditoria') {
      container.innerHTML = this.htmlTelaAuditoria();
    } else if (this.telaAtual === 'equipe') {
      container.innerHTML = this.htmlTelaEquipe();
    }
  }

  htmlTelaResumo() {
    let html = `
      <div class="dashboard-grid animate-fade-in" style="margin-bottom: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="stat-card success"><div class="stat-header"><span class="stat-title">Faturação Hoje</span><div class="stat-icon">💰</div></div><div class="stat-value">R$ ${this.faturamentoHoje.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">Acumulado de hoje</div></div>
        <div class="stat-card info"><div class="stat-header"><span class="stat-title">Faturação no Período</span><div class="stat-icon">📅</div></div><div class="stat-value">R$ ${this.faturamentoPeriodo.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">${this.qtdVendas} Vendas</div></div>
        
        <div class="stat-card" style="border-left-color: var(--dev-color);">
          <div class="stat-header"><span class="stat-title">Taxas de Serviço</span><div class="stat-icon">🍽️</div></div>
          <div class="stat-value" style="color: var(--dev-color);">R$ ${this.taxasPeriodo.toFixed(2)}</div>
          <div class="stat-change" style="color: var(--text-muted);">Hoje: R$ ${this.taxasHoje.toFixed(2)}</div>
        </div>

        <div class="stat-card warning"><div class="stat-header"><span class="stat-title">Ticket Médio</span><div class="stat-icon">🧾</div></div><div class="stat-value">R$ ${this.ticketMedio.toFixed(2)}</div><div class="stat-change" style="color: var(--text-muted);">Por cliente no período</div></div>
      </div>
    `;

    html += `
      <h4 style="margin: 2rem 0 1rem 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.5px;">Detalhamento por Meio de Pagamento</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
    `;

    Object.values(this.metricasFormas).forEach(m => {
      if (m.periodo > 0 || m.hoje > 0) {
        html += `
          <div class="card animate-fade-in" style="padding: 1rem; border-left: 3px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-weight: 700; color: var(--text-primary);">
              <span style="font-size: 1.2rem;">${m.icon}</span> ${m.label}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary); border-bottom: 1px dashed var(--border-color); padding-bottom: 0.25rem;">
              <span>Hoje:</span> <strong style="color: var(--success);">R$ ${m.hoje.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 0.25rem;">
              <span>Período:</span> <strong>R$ ${m.periodo.toFixed(2)}</strong>
            </div>
          </div>
        `;
      }
    });

    html += `</div>`;

    html += `
      <div class="card animate-fade-in" style="margin-bottom: 1.5rem; position: relative; height: 350px;">
        <canvas id="faturamentoChart"></canvas>
      </div>
    `;

    return html;
  }

  // ===============================================
  // ABA: DESEMPENHO DA EQUIPA E GORJETAS (Corrigido texto da tabela)
  // ===============================================
  htmlTelaEquipe() {
    const equipaArray = Object.entries(this.metricasEquipe)
      .map(([uid, dados]) => ({
        id: uid,
        nome: this.usuariosMap[uid] || (uid === 'null' ? 'Sistema / Sem Registo' : 'Desconhecido'),
        vendas: dados.vendas,
        taxas: dados.taxas,
        totalGeral: dados.vendas + dados.taxas
      }))
      .sort((a, b) => b.vendas - a.vendas);

    let linhasHtml = '';

    if (equipaArray.length === 0) {
      linhasHtml = `<tr><td colspan="4" class="text-center" style="padding: 3rem; color: var(--text-muted);">Nenhum lançamento registado pela equipa neste período.</td></tr>`;
    } else {
      equipaArray.forEach((eq, idx) => {
        const trofeu = idx === 0 ? '🏆 ' : (idx === 1 ? '🥈 ' : (idx === 2 ? '🥉 ' : ''));
        linhasHtml += `
          <tr>
            <td style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${trofeu}${eq.nome}</td>
            <td style="text-align: right; color: var(--text-secondary);">R$ ${eq.vendas.toFixed(2)}</td>
            <td style="text-align: right; font-weight: 800; color: var(--dev-color);">R$ ${eq.taxas.toFixed(2)}</td>
            <td style="text-align: right; font-weight: 700; color: var(--primary);">R$ ${eq.totalGeral.toFixed(2)}</td>
          </tr>
        `;
      });
    }

    return `
      <style>
        .table-equipe { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .table-equipe th, .table-equipe td { padding: 1rem; border-bottom: 1px solid var(--border-color); }
        .table-equipe th { background: var(--bg-secondary); position: sticky; top: 0; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; z-index: 10;}
        .table-equipe tbody tr:hover { background: var(--bg-hover); }
      </style>

      <div class="card animate-fade-in" style="margin-bottom: 2.5rem; padding: 0; overflow: hidden; border: 1px solid var(--primary-light);">
        <div class="card-header" style="background: rgba(232, 145, 58, 0.05); border-bottom: 1px solid var(--border-color); margin: 0; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <div>
            <h3 class="card-title" style="margin: 0;">👥 Desempenho e Comissionamento</h3>
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">Baseado em quem lançou os itens na comanda.</p>
          </div>
          <div style="text-align: right; background: var(--bg-primary); padding: 0.5rem 1rem; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold;">Bolo Total de Gorjetas</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: var(--dev-color);">R$ ${this.taxasPeriodo.toFixed(2)}</div>
          </div>
        </div>
        
        <div style="width: 100%; overflow-x: auto;">
          <table class="table-equipe">
            <thead>
              <tr>
                <th style="text-align: left;">Garçom / Atendente</th>
                <th style="text-align: right;">Total de Vendas (Produtos)</th>
                <!-- AQUI O TEXTO FOI CORRIGIDO PARA NÃO CONFUNDIR -->
                <th style="text-align: right;">Gorjetas Individuais (Valor Real Recebido)</th>
                <th style="text-align: right;">Volume Total Movimentado</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  htmlTelaAuditoria() {
    let linhasHtml = '';

    if (this.vendasAtuais.length === 0) {
      linhasHtml = `<tr><td colspan="7" class="text-center" style="padding: 3rem; color: var(--text-muted);">Nenhuma venda concluída neste período.</td></tr>`;
    } else {
      this.vendasAtuais.forEach(v => {
        const dataFormatada = new Date(v.data_fechamento).toLocaleString('pt-PT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        const nomeCaixa = this.usuariosMap[v.usuario_fechamento_id] || 'Desconhecido';
        const nomeUnidade = this.unidades.find(u => u.id === v.unidade_id)?.nome || '---';
        const nomeMesa = this.mesasMap[v.mesa_id] || v.identificador || 'Desconhecida';
        
        const origemBadge = v.tipo === 'balcao' 
          ? `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">🛒 Balcão</span>` 
          : `<span style="font-size: 0.85rem; font-weight: 600;">🍽️ ${nomeMesa}</span>`;

        const detalhePagamentos = v.pagamentos.length > 0 
          ? v.pagamentos.map(p => {
              const formaNome = this.formasMap[p.forma_pagamento_id] || 'Outros';
              const icone = this.getIconePagamento(formaNome);
              return `<div style="white-space: nowrap;"><span style="font-size: 0.9rem;">${icone}</span> <span style="color: var(--text-secondary); font-size: 0.75rem;">${formaNome}:</span> <strong style="color: var(--text-primary); font-size: 0.85rem;">R$ ${parseFloat(p.valor).toFixed(2)}</strong></div>`;
            }).join('')
          : `<span style="color: var(--text-muted); font-size: 0.8rem;">---</span>`;

        const total = parseFloat(v.total);
        const taxa = parseFloat(v.taxa_servico || 0);

        linhasHtml += `
          <tr>
            <td style="color: var(--text-muted); font-size: 0.85rem;">${dataFormatada}</td>
            ${this.filtros.unidadeId === 'todas' ? `<td><strong>${nomeUnidade}</strong></td>` : ''}
            <td>${origemBadge}</td>
            <td style="font-size: 0.85rem;">${nomeCaixa}</td>
            <td>${detalhePagamentos}</td>
            <td style="text-align: right; color: var(--text-secondary); font-size: 0.85rem;">R$ ${(total - taxa).toFixed(2)}<br><small>+ Taxa R$ ${taxa.toFixed(2)}</small></td>
            <td style="text-align: right; font-weight: 800; color: var(--primary); font-size: 1rem;">R$ ${total.toFixed(2)}</td>
          </tr>
        `;
      });
    }

    return `
      <style>
        .table-auditoria { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .table-auditoria th, .table-auditoria td { padding: 1rem; text-align: left; border-bottom: 1px solid var(--border-color); }
        .table-auditoria th { background: var(--bg-secondary); position: sticky; top: 0; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; z-index: 10;}
        .table-auditoria tbody tr:hover { background: var(--bg-hover); }
      </style>

      <div class="card animate-fade-in" style="margin-bottom: 2.5rem; padding: 0; overflow: hidden; border: 1px solid var(--primary-light);">
        <div class="card-header" style="background: rgba(232, 145, 58, 0.05); border-bottom: 1px solid var(--border-color); margin: 0; padding: 1.5rem;">
          <h3 class="card-title">🧾 Relatório Detalhado de Vendas</h3>
        </div>
        
        <div style="width: 100%; overflow-x: auto;">
          <table class="table-auditoria">
            <thead>
              <tr>
                <th>Data / Hora</th>
                ${this.filtros.unidadeId === 'todas' ? '<th>Unidade</th>' : ''}
                <th>Origem</th>
                <th>Operador de Caixa</th>
                <th>Detalhes do Pagamento</th>
                <th style="text-align: right;">Valores</th>
                <th style="text-align: right;">Total Recebido</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderGrafico() {
    const ctx = document.getElementById('faturamentoChart');
    if (!ctx) return;
    if (this.chartInstance) this.chartInstance.destroy();
    
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#B0B0B0' : '#666666';
    const gridColor = isDarkMode ? '#404040' : '#E0E0E0';
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#E8913A';
    
    const dadosCompletosDia = this.dadosGraficoCompletos;
    const moduloRef = this;

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.labelsGrafico,
        datasets: [{
          label: 'Faturação Total', 
          data: this.dadosGrafico, 
          backgroundColor: 'rgba(232, 145, 58, 0.2)', 
          borderColor: primaryColor,
          borderWidth: 3, 
          pointBackgroundColor: primaryColor, 
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true, 
          tension: 0.3
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
          legend: { display: false },
          tooltip: {
            padding: 12,
            titleFont: { size: 14 },
            bodyFont: { size: 13 },
            callbacks: {
              label: function(context) {
                const diaInfo = dadosCompletosDia[context.dataIndex];
                let linhas = [`💰 Faturamento: R$ ${context.parsed.y.toFixed(2)}`];
                
                const pagamentos = diaInfo.breakdownPagamentos;
                if (Object.keys(pagamentos).length > 0) {
                  linhas.push('-------------------------');
                  for (const [forma, valor] of Object.entries(pagamentos)) {
                    if (valor > 0) {
                      const icone = moduloRef.getIconePagamento(forma);
                      linhas.push(`${icone} ${forma}: R$ ${valor.toFixed(2)}`);
                    }
                  }
                } else if (context.parsed.y > 0) {
                  linhas.push('-------------------------');
                  linhas.push('⚠️ Vendas sem detalhe de pagt.');
                }
                return linhas;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } },
          x: { ticks: { color: textColor }, grid: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }
}

const dashboardModule = new DashboardModule();
window.dashboardModule = dashboardModule;