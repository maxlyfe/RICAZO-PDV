/**
 * RICAZO - App Principal (Orquestrador)
 */

class RicaZoApp {
  constructor() {
    this.init();
  }

  async init() {
    if (!auth.isAuthenticated()) {
      if (!window.location.pathname.includes('/login/')) {
        window.location.href = '/src/pages/login/';
      }
      return;
    }

    if (window.location.pathname.includes('/login/')) {
      await auth.redirectByPerfil();
      return;
    }

    this.setupEventListeners();
    await this.loadView(); // Load View trata a Unidade via URL
    this.loadUserInfo();   // User info carrega depois para exibir a Unidade certa
  }

  setupEventListeners() {
    document.getElementById('btn-logout')?.addEventListener('click', () => auth.logout());
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const newTheme = auth.toggleTheme();
        themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
      });
      themeToggle.textContent = auth.getTheme() === 'dark' ? '☀️' : '🌙';
    }

    const logo = document.getElementById('logo-ricazo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => auth.voltarParaHome());
    }
  }

  loadUserInfo() {
    const user = auth.getCurrentUser();
    if (!user) return;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('user-name', user.nome);
    setText('user-role', user.perfis.map(p => CONFIG.PERFIS_LABELS[p]).join(', '));
    setText('user-avatar', user.nome.charAt(0).toUpperCase());

    const perfisContainer = document.getElementById('user-perfis');
    if (perfisContainer) {
      perfisContainer.innerHTML = user.perfis.map(perfil => 
        `<span class="perfil-badge perfil-${perfil}">${CONFIG.PERFIS_LABELS[perfil]}</span>`
      ).join('');
    }

    const unidadeAtual = auth.getUnidadeAtual();
    const unidadeInfo = document.getElementById('unidade-atual');
    
    if (unidadeAtual && !unidadeAtual.nome) {
      localStorage.removeItem('ricazo_unidade_atual');
    } else if (unidadeInfo && unidadeAtual) {
      unidadeInfo.innerHTML = `🏪 ${unidadeAtual.nome} <small style="margin-left: 5px; opacity: 0.7;">▼</small>`;
      unidadeInfo.style.display = 'flex';
      unidadeInfo.style.cursor = 'pointer';
      unidadeInfo.title = 'Trocar de unidade';
      unidadeInfo.onclick = () => {
        window.location.href = '/src/pages/dashboard/?view=selecao-unidade';
      };
    }

    this.renderNavegacaoPerfis();
  }

  renderNavegacaoPerfis() {
    const user = auth.getCurrentUser();
    const unidade = auth.getUnidadeAtual();
    const navPerfis = document.getElementById('nav-perfis');
    
    if (!user || !unidade || !navPerfis) return;

    const urlParams = new URLSearchParams(window.location.search);
    const viewAtual = urlParams.get('view') || this.getDefaultView();

    if (viewAtual === 'admin' || viewAtual === 'selecao-unidade') {
      navPerfis.style.display = 'none';
      return;
    }

    let perfisOperacionais = user.perfis.filter(p => ['caixa', 'pdv', 'producao'].includes(p));
    if (auth.isDev() || auth.isAdmin()) {
      perfisOperacionais = ['caixa', 'pdv', 'producao'];
    }

    if (unidade.tipo !== 'fabrica') {
      perfisOperacionais = perfisOperacionais.filter(p => p !== 'producao');
    }

    if (perfisOperacionais.length > 0) {
      const slug = auth.gerarSlug(unidade.nome); 
      
      navPerfis.innerHTML = perfisOperacionais.map(p => {
        const isAtivo = viewAtual === p;
        const icones = { caixa: '🖥️', pdv: '📱', producao: '🏭' };
        const label = (typeof CONFIG !== 'undefined' && CONFIG.PERFIS_LABELS && CONFIG.PERFIS_LABELS[p]) ? CONFIG.PERFIS_LABELS[p] : p.toUpperCase();
        return `
          <a href="/src/pages/dashboard/?view=${p}&unidade=${slug}" 
             class="nav-perfil-item ${isAtivo ? 'ativo' : ''}">
            ${icones[p]} ${label}
          </a>
        `;
      }).join('');
      
      navPerfis.style.display = 'flex';
    } else {
      navPerfis.style.display = 'none';
    }
  }

  async loadView() {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view') || this.getDefaultView();
    const unidadeSlug = urlParams.get('unidade');

    if (unidadeSlug) {
      const unidades = await auth.verificarUnidadesAcesso();
      let unidadeResolvida = unidades.find(u => auth.gerarSlug(u.nome) === unidadeSlug);
      
      if (!unidadeResolvida && auth.isDev() && typeof unidadesModule !== 'undefined') {
        const todas = unidadesModule.getAll();
        unidadeResolvida = todas.find(u => auth.gerarSlug(u.nome) === unidadeSlug);
      }

      if (unidadeResolvida) {
        auth.setUnidadeAtual(unidadeResolvida);
      }
    }

    const container = document.getElementById('dashboard-content');
    if (!container) return;

    if (!this.podeAcessarView(view)) {
      alert('❌ Não tem permissão para aceder a esta área.');
      auth.voltarParaHome();
      return;
    }

    container.innerHTML = this.getViewHTML(view);

    switch(view) {
      case 'admin':
        if (auth.isDev() || auth.isAdmin()) {
          // Agora só carrega o Dashboard! O Dashboard tratará do resto via Abas.
          if (typeof dashboardModule !== 'undefined') {
            await dashboardModule.carregarEstatisticas();
          }
        }
        break;
      case 'selecao-unidade':
        await this.carregarSelecaoUnidade();
        break;
      case 'producao':
        if (typeof producaoModule !== 'undefined') await producaoModule.init();
        break;
      case 'caixa':
        if (typeof caixaModule !== 'undefined') await caixaModule.init();
        break;
      case 'pdv':
        if (typeof pdvModule !== 'undefined') await pdvModule.init();
        break;
    }
  }

  podeAcessarView(view) {
    const user = auth.getCurrentUser();
    if (!user) return false;

    if (auth.isDev()) return true;

    const perfis = user.perfis;

    switch(view) {
      case 'admin':
        return perfis.includes('admin');
      case 'selecao-unidade':
        return perfis.some(p => ['caixa', 'pdv', 'producao'].includes(p));
      case 'producao':
        return perfis.includes('producao');
      case 'caixa':
        return perfis.includes('caixa');
      case 'pdv':
        return perfis.includes('pdv');
      default:
        return true;
    }
  }

  getDefaultView() {
    const user = auth.getCurrentUser();
    if (!user) return 'login';
    
    if (auth.isDev() || auth.isAdmin()) return 'admin';
    
    const unidades = auth.getUnidadesUsuario();
    if (unidades.length > 1) return 'selecao-unidade';
    if (unidades.length === 1) {
      auth.entrarNaUnidade(unidades[0]); 
      return null;
    }
    
    return 'admin';
  }

  async carregarSelecaoUnidade() {
    const container = document.getElementById('selecao-unidade-list');
    if (!container) return;

    const unidades = await auth.verificarUnidadesAcesso();
    
    if (unidades.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 3rem; color: var(--danger);">
          <p>❌ Nenhuma unidade disponível</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">
            Contacte o administrador do sistema.
          </p>
        </div>
      `;
      return;
    }

    if (unidades.length === 1 && !auth.isDev() && !auth.isAdmin()) {
      auth.entrarNaUnidade(unidades[0]);
      return;
    }

    container.innerHTML = unidades.map(u => `
      <div class="animate-fade-in" style="background: var(--bg-card); border-radius: var(--border-radius-lg); border: 2px solid var(--border-color); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; transition: all 0.2s; cursor: pointer; padding: 0; overflow: hidden; height: 100%;" 
           onclick="app.entrarUnidade('${u.id}')" 
           onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-5px)'; this.style.boxShadow='var(--shadow-lg)';" 
           onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)';">

        <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column; gap: 1.25rem;">
          
          <!-- Cabeçalho do Cartão (Ícone e Nome completo) -->
          <div style="display: flex; align-items: flex-start; gap: 1rem;">
            <div style="width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg, var(--primary-light), var(--primary)); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white; box-shadow: var(--shadow-sm); flex-shrink: 0;">
              ${u.tipo === 'fabrica' ? '🏭' : u.tipo === 'loja' ? '🏪' : '📍'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.75rem; color: var(--primary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">${this.formatTipoUnidade(u.tipo)}</div>
              <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); line-height: 1.3; word-wrap: break-word;">${u.nome}</div>
            </div>
          </div>

          <!-- Endereço (Só aparece se existir) -->
          ${u.endereco ? `
            <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; align-items: flex-start; gap: 0.5rem; background: var(--bg-secondary); padding: 0.75rem 1rem; border-radius: var(--border-radius); margin-top: auto;">
              <span style="opacity: 0.7; font-size: 1rem; line-height: 1.2;">📍</span>
              <span style="line-height: 1.4; word-wrap: break-word;">${u.endereco}</span>
            </div>
          ` : ''}
          
        </div>

        <!-- Rodapé do Cartão de Ação -->
        <div style="background: rgba(232, 145, 58, 0.05); padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Aceder à Operação</span>
          <span style="font-weight: 800; color: var(--primary); font-size: 1rem;">Entrar →</span>
        </div>

      </div>
    `).join('');
  }

  entrarUnidade(unidadeId) {
    let unidades = auth.getUnidadesUsuario();
    let unidade = unidades.find(u => u.id === unidadeId);
    
    if ((!unidade || !unidade.nome) && typeof unidadesModule !== 'undefined') {
      unidade = unidadesModule.getAll().find(u => u.id === unidadeId);
    }

    if (unidade && unidade.nome) {
      auth.entrarNaUnidade(unidade);
    } else {
      alert('❌ Erro: Dados da unidade não encontrados. Tente recarregar a página (F5).');
    }
  }

  formatTipoUnidade(tipo) {
    const tipos = { 'loja': 'Loja', 'fabrica': 'Fábrica/Matriz', 'quiosque': 'Quiosque' };
    return tipos[tipo] || tipo;
  }

  getViewHTML(view) {
    const views = {
      admin: () => {
        if (!auth.isDev() && !auth.isAdmin()) return this.viewAcessoNegado();
        // O Dashboard agora gere a UI toda. Deixamos apenas o contentor mestre vazio.
        return `
          <div class="view-section animate-fade-in" style="padding: 0;">
            <div id="admin-dashboard-stats">
              <div class="text-center" style="padding: 4rem;">
                <div class="spinner" style="margin: 0 auto 1rem;"></div>
                <p>A carregar Painel Mestre...</p>
              </div>
            </div>
          </div>
        `;
      },
      'selecao-unidade': () => `
        <div class="view-section animate-fade-in" style="max-width: 1000px; margin: 0 auto;">
          <div class="selecao-header-compacto">
            <span class="selecao-icone">🏪</span>
            <div><h2 class="selecao-titulo">Selecione uma Unidade</h2><p class="selecao-subtitulo">Escolha o local onde deseja operar</p></div>
          </div>
          <div id="selecao-unidade-list" class="selecao-lista">
            <div class="text-center" style="grid-column: 1/-1; padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>A carregar unidades...</p></div>
          </div>
        </div>
      `,
      producao: () => `<div class="view-section animate-fade-in"><div id="producao-content"><div class="text-center" style="padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>A carregar módulo de produção...</p></div></div></div>`,
      caixa: () => `<div class="view-section animate-fade-in" style="padding: 0;"><div id="caixa-content"><div class="text-center" style="padding: 4rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>A carregar Caixa...</p></div></div></div>`,
      pdv: () => `<div class="view-section animate-fade-in" style="padding: 0;"><div id="pdv-content"><div class="text-center" style="padding: 4rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>A carregar PDV...</p></div></div></div>`
    };
    return (views[view] || views.admin)();
  }

  viewAcessoNegado() {
    return `<div class="view-section animate-fade-in" style="text-align: center; padding: 4rem;"><div style="font-size: 4rem; margin-bottom: 1rem;">🚫</div><h2 style="color: var(--danger); margin-bottom: 1rem;">Acesso Negado</h2><button class="btn btn-primary" onclick="auth.voltarParaHome()">← Voltar para a Home</button></div>`;
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new RicaZoApp(); window.app = app; });