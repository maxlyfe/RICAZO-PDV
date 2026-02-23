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

    const perfisOperacionais = user.perfis.filter(p => ['caixa', 'pdv', 'producao'].includes(p));
    
    if (perfisOperacionais.length > 1) {
      const viewAtual = new URLSearchParams(window.location.search).get('view');
      const slug = auth.gerarSlug(unidade.nome); // Usar Slug limpo na navegação
      
      navPerfis.innerHTML = perfisOperacionais.map(p => {
        const isAtivo = viewAtual === p;
        const icones = { caixa: '🖥️', pdv: '📱', producao: '🏭' };
        return `
          <a href="/src/pages/dashboard/?view=${p}&unidade=${slug}" 
             class="nav-perfil-item ${isAtivo ? 'ativo' : ''}">
            ${icones[p]} ${CONFIG.PERFIS_LABELS[p]}
          </a>
        `;
      }).join('');
      
      navPerfis.style.display = 'flex';
    }
  }

  async loadView() {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view') || this.getDefaultView();
    const unidadeSlug = urlParams.get('unidade');

    // MÁGICA DA URL: Transforma o 'slug' (ex: padaria-centro) de volta na Unidade Original
    if (unidadeSlug) {
      const unidades = await auth.verificarUnidadesAcesso();
      let unidadeResolvida = unidades.find(u => auth.gerarSlug(u.nome) === unidadeSlug);
      
      // Fallback para DEV (que pode aceder a qualquer unidade mesmo se recém criada)
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

    // View renderiza com a unidade carregada (Sem exibir IDs na tela)
    container.innerHTML = this.getViewHTML(view);

    switch(view) {
      case 'admin':
        if (auth.isDev() || auth.isAdmin()) {
          const promises = [];
          if (typeof dashboardModule !== 'undefined') promises.push(dashboardModule.carregarEstatisticas());
          if (typeof unidadesModule !== 'undefined') promises.push(unidadesModule.load());
          if (typeof usuariosModule !== 'undefined') promises.push(usuariosModule.load());
          if (typeof produtosModule !== 'undefined') promises.push(produtosModule.load());
          await Promise.all(promises);
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
      auth.entrarNaUnidade(unidades[0]); // Redireciona logo
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
      <div class="unidade-selecao-card" onclick="app.entrarUnidade('${u.id}')">
        <div class="unidade-selecao-icone">
          ${u.tipo === 'fabrica' ? '🏭' : u.tipo === 'loja' ? '🏪' : '📍'}
        </div>
        <div class="unidade-selecao-info">
          <div class="unidade-selecao-nome">${u.nome}</div>
          <div class="unidade-selecao-tipo">${this.formatTipoUnidade(u.tipo)}</div>
          ${u.endereco ? `<div class="unidade-selecao-endereco">${u.endereco}</div>` : ''}
        </div>
        <div class="unidade-selecao-acao">
          <span class="btn btn-primary btn-sm">Entrar →</span>
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
    const tipos = {
      'loja': 'Loja',
      'fabrica': 'Fábrica/Matriz',
      'quiosque': 'Quiosque'
    };
    return tipos[tipo] || tipo;
  }

  getViewHTML(view) {
    const unidade = auth.getUnidadeAtual();
    const nomeUnidade = unidade ? unidade.nome : 'Unidade não selecionada';

    const views = {
      admin: () => {
        if (!auth.isDev() && !auth.isAdmin()) {
          return this.viewAcessoNegado();
        }
        return `
          <div class="view-section animate-fade-in">
            <div id="admin-dashboard-stats">
              <div class="text-center" style="padding: 2rem;">
                <div class="spinner" style="margin: 0 auto 1rem;"></div>
                <p>A calcular faturação...</p>
              </div>
            </div>

            ${this.renderSection('unidades', '🏪 Gerenciar Unidades', 'unidadesModule.openModal()', auth.podeGerenciarUnidades())}
            ${this.renderSection('usuarios', '👥 Gerenciar Utilizadores', 'usuariosModule.openModal()', true)}
            ${this.renderSection('produtos', '🥖 Gerenciar Produtos', 'produtosModule.openModal()', true)}
          </div>
        `;
      },
      
      'selecao-unidade': () => `
        <div class="view-section animate-fade-in" style="max-width: 1000px; margin: 0 auto;">
          <div class="selecao-header-compacto">
            <span class="selecao-icone">🏪</span>
            <div>
              <h2 class="selecao-titulo">Selecione uma Unidade</h2>
              <p class="selecao-subtitulo">Escolha o local onde deseja operar</p>
            </div>
          </div>
          <div id="selecao-unidade-list" class="selecao-lista">
            <div class="text-center" style="grid-column: 1/-1; padding: 3rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>A carregar unidades...</p>
            </div>
          </div>
        </div>
      `,
      
      producao: () => `
        <div class="view-section animate-fade-in">
          <div id="producao-content">
            <div class="text-center" style="padding: 3rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>A carregar módulo de produção...</p>
            </div>
          </div>
        </div>
      `,
      
      caixa: () => `
        <div class="view-section animate-fade-in" style="padding: 0;">
          <div id="caixa-content">
            <div class="text-center" style="padding: 4rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>A carregar Caixa...</p>
            </div>
          </div>
        </div>
      `,
      
      pdv: () => `
        <div class="view-section animate-fade-in" style="padding: 0;">
          <div id="pdv-content">
            <div class="text-center" style="padding: 4rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>A carregar PDV...</p>
            </div>
          </div>
        </div>
      `
    };
    
    return (views[view] || views.admin)();
  }

  viewAcessoNegado() {
    return `
      <div class="view-section animate-fade-in" style="text-align: center; padding: 4rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🚫</div>
        <h2 style="color: var(--danger); margin-bottom: 1rem;">Acesso Negado</h2>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">
          Não tem permissão para aceder a esta área do sistema.
        </p>
        <button class="btn btn-primary" onclick="auth.voltarParaHome()">
          ← Voltar para a Home
        </button>
      </div>
    `;
  }

  renderSection(id, title, onClick, mostrarBotao = true) {
    return `
      <div class="card" style="margin-top: 2rem;">
        <div class="card-header">
          <h3 class="card-title">${title}</h3>
          ${mostrarBotao ? `<button class="btn btn-primary btn-sm" onclick="${onClick}">+ Novo</button>` : ''}
        </div>
        <div id="${id}-list" class="${id === 'unidades' || id === 'produtos' ? id + '-grid' : ''}">
          <div class="text-center" style="padding: 2rem;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <p>A carregar...</p>
          </div>
        </div>
      </div>
    `;
  }
}

// Inicializa
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new RicaZoApp();
  window.app = app;
});