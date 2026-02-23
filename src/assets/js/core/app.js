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
    this.loadUserInfo();
    await this.loadView();
  }

  setupEventListeners() {
    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => auth.logout());
    
    // Tema
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const newTheme = auth.toggleTheme();
        themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
      });
      themeToggle.textContent = auth.getTheme() === 'dark' ? '☀️' : '🌙';
    }

    // NOVO: Logo RicaZo volta para home
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

    // NOVO: Mostra unidade atual se houver
    const unidadeAtual = auth.getUnidadeAtual();
    const unidadeInfo = document.getElementById('unidade-atual');
    if (unidadeInfo && unidadeAtual) {
      unidadeInfo.innerHTML = `🏪 ${unidadeAtual.nome}`;
      unidadeInfo.style.display = 'block';
    }
  }

  async loadView() {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view') || this.getDefaultView();
    const unidadeId = urlParams.get('unidade');

    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Verifica permissões de acesso à view
    if (!this.podeAcessarView(view)) {
      alert('❌ Você não tem permissão para acessar esta área');
      auth.voltarParaHome();
      return;
    }

    container.innerHTML = this.getViewHTML(view, unidadeId);

    // Carrega dados específicos da view
    switch(view) {
      case 'admin':
        if (auth.isDev() || auth.isAdmin()) {
          await Promise.all([
            unidadesModule.load(),
            usuariosModule.load(),
            produtosModule.load()
          ]);
        }
        break;
      case 'selecao-unidade':
        await this.carregarSelecaoUnidade();
        break;
      case 'producao':
        await producaoModule.init();
        break;
      case 'caixa':
        await this.carregarCaixa(unidadeId);
        break;
      case 'pdv':
        await this.carregarPDV(unidadeId);
        break;
    }
  }

  // NOVO: Verifica se usuário pode acessar determinada view
  podeAcessarView(view) {
    const user = auth.getCurrentUser();
    if (!user) return false;

    // DEV pode tudo
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
    
    // Verifica se tem múltiplas unidades
    const unidades = auth.getUnidadesUsuario();
    if (unidades.length > 1) return 'selecao-unidade';
    if (unidades.length === 1) {
      auth.entrarNaUnidade(unidades[0]);
      return null; // Redirecionamento já tratado
    }
    
    return 'admin';
  }

  // NOVO: View de seleção de unidade para operadores
  async carregarSelecaoUnidade() {
    const container = document.getElementById('selecao-unidade-list');
    if (!container) return;

    const unidades = await auth.verificarUnidadesAcesso();
    
    if (unidades.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 3rem; color: var(--danger);">
          <p>❌ Nenhuma unidade disponível</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">
            Contate o administrador do sistema
          </p>
        </div>
      `;
      return;
    }

    if (unidades.length === 1) {
      // Se só tem 1, entra direto
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
          <span class="btn btn-primary">Entrar →</span>
        </div>
      </div>
    `).join('');
  }

  // NOVO: Entra em uma unidade específica da seleção
  entrarUnidade(unidadeId) {
    const unidades = auth.getUnidadesUsuario();
    const unidade = unidades.find(u => u.id === unidadeId);
    if (unidade) {
      auth.entrarNaUnidade(unidade);
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

  async carregarCaixa(unidadeId) {
    // Implementação futura do módulo caixa
    console.log('Carregando caixa da unidade:', unidadeId);
  }

  async carregarPDV(unidadeId) {
    // Implementação futura do módulo PDV
    console.log('Carregando PDV da unidade:', unidadeId);
  }

  getViewHTML(view, unidadeId) {
    const views = {
      admin: () => {
        // Só DEV/Admin vê tudo
        if (!auth.isDev() && !auth.isAdmin()) {
          return this.viewAcessoNegado();
        }
        return `
          <div class="view-section animate-fade-in">
            ${this.renderSection('unidades', '🏪 Gerenciar Unidades', 'unidadesModule.openModal()', auth.podeGerenciarUnidades())}
            ${this.renderSection('usuarios', '👥 Gerenciar Usuários', 'usuariosModule.openModal()', true)}
            ${this.renderSection('produtos', '🥖 Gerenciar Produtos', 'produtosModule.openModal()', true)}
          </div>
        `;
      },
      
      'selecao-unidade': () => `
        <div class="view-section animate-fade-in">
          <div class="card" style="text-align: center; padding: 2rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🏪</div>
            <h2 class="card-title" style="margin-bottom: 0.5rem;">Selecione uma Unidade</h2>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
              Escolha qual unidade você deseja trabalhar hoje
            </p>
          </div>
          <div id="selecao-unidade-list" class="unidades-grid" style="margin-top: 1.5rem;">
            <div class="text-center" style="padding: 3rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>Carregando unidades...</p>
            </div>
          </div>
        </div>
      `,
      
      producao: () => `
        <div class="view-section animate-fade-in">
          <div id="producao-content">
            <div class="text-center" style="padding: 3rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p>Carregando módulo de produção...</p>
            </div>
          </div>
        </div>
      `,
      
      caixa: () => `
        <div class="view-section animate-fade-in">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">🖥️ Caixa</h2>
              ${unidadeId ? `<span class="perfil-badge perfil-caixa">Unidade: ${unidadeId.substring(0,8)}...</span>` : ''}
            </div>
            <p style="padding: 2rem; text-align: center; color: var(--text-muted);">
              Módulo de caixa em desenvolvimento...<br>
              <small>Unidade: ${auth.getUnidadeAtual()?.nome || 'Não selecionada'}</small>
            </p>
          </div>
        </div>
      `,
      
      pdv: () => `
        <div class="view-section animate-fade-in">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">📱 PDV / Garçom</h2>
              ${unidadeId ? `<span class="perfil-badge perfil-pdv">Unidade: ${unidadeId.substring(0,8)}...</span>` : ''}
            </div>
            <p style="padding: 2rem; text-align: center; color: var(--text-muted);">
              Módulo de PDV em desenvolvimento...<br>
              <small>Unidade: ${auth.getUnidadeAtual()?.nome || 'Não selecionada'}</small>
            </p>
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
          Você não tem permissão para acessar esta área do sistema.
        </p>
        <button class="btn btn-primary" onclick="auth.voltarParaHome()">
          ← Voltar para Home
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
            <p>Carregando...</p>
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