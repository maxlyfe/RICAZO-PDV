/**
 * RICAZO - Sistema de Autenticação
 */

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.session = null;
    this.unidadesUsuario = []; // Cache das unidades do usuário
    this.init();
  }

  async init() {
    this.checkSession();
    this.initTheme();
  }

  checkSession() {
    const savedSession = localStorage.getItem('ricazo_session');
    const savedUser = localStorage.getItem('ricazo_user');
    const savedUnidades = localStorage.getItem('ricazo_unidades');
    
    if (savedSession && savedUser) {
      try {
        this.session = JSON.parse(savedSession);
        this.currentUser = JSON.parse(savedUser);
        if (savedUnidades) {
          this.unidadesUsuario = JSON.parse(savedUnidades);
        }
        
        const sessionAge = Date.now() - this.session.timestamp;
        if (sessionAge > 24 * 60 * 60 * 1000) {
          this.logout();
          return false;
        }
        return true;
      } catch (e) {
        this.logout();
        return false;
      }
    }
    return false;
  }

  async login(username, password) {
    try {
      if (!username || !password) {
        throw new Error('Usuário e senha são obrigatórios');
      }

      if (db.isConnected()) {
        return await this.loginSupabase(username, password);
      } else {
        return await this.loginSimulado(username, password);
      }

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async loginSupabase(username, password) {
    const { data: usuario, error } = await db.getClient()
      .from('usuarios')
      .select(`*, perfis:usuario_perfis(perfil), unidades:usuario_unidades(unidade_id)`)
      .eq('username', username)
      .eq('senha', password)
      .eq('ativo', true)
      .single();

    if (error || !usuario) {
      throw new Error('Usuário ou senha incorretos');
    }

    let unidadesAcesso = [];
    if (usuario.unidades && usuario.unidades.length > 0) {
      const unidadeIds = usuario.unidades.map(u => u.unidade_id);
      const { data: unidadesData } = await db.getClient()
        .from('unidades')
        .select('*')
        .in('id', unidadeIds)
        .eq('ativo', true)
        .eq('visivel', true);
      
      unidadesAcesso = unidadesData || [];
    }

    const userData = {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      perfis: usuario.perfis ? usuario.perfis.map(p => p.perfil) : [],
      unidades_acesso: unidadesAcesso.map(u => u.id),
      ativo: usuario.ativo
    };

    // CORREÇÃO: DEV carrega DADOS COMPLETOS (*) de todas as unidades
    if (userData.perfis.includes('dev')) {
      const { data: todasUnidades } = await db.getClient()
        .from('unidades')
        .select('*') 
        .eq('ativo', true)
        .eq('visivel', true);
      userData.unidades_acesso = (todasUnidades || []).map(u => u.id);
      unidadesAcesso = todasUnidades || [];
    }

    this.currentUser = userData;
    this.unidadesUsuario = unidadesAcesso;
    this.session = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      timestamp: Date.now(),
      userId: usuario.id
    };

    localStorage.setItem('ricazo_user', JSON.stringify(userData));
    localStorage.setItem('ricazo_session', JSON.stringify(this.session));
    localStorage.setItem('ricazo_unidades', JSON.stringify(unidadesAcesso));

    return { success: true, user: userData, unidades: unidadesAcesso };
  }

  async loginSimulado(username, password) {
    if (username === 'max.dev' && password === '29122015') {
      const devUser = {
        id: '11111111-1111-1111-1111-111111111111',
        nome: 'Max Dev',
        username: 'max.dev',
        perfis: ['dev'],
        unidades_acesso: ['*'],
        ativo: true
      };
      
      this.currentUser = devUser;
      this.unidadesUsuario = [];
      this.session = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: Date.now(),
        userId: devUser.id
      };

      localStorage.setItem('ricazo_user', JSON.stringify(devUser));
      localStorage.setItem('ricazo_session', JSON.stringify(this.session));
      localStorage.setItem('ricazo_unidades', JSON.stringify([]));

      return { success: true, user: devUser, unidades: [] };
    }

    throw new Error('Usuário ou senha incorretos');
  }

  async verificarUnidadesAcesso() {
    if (this.unidadesUsuario.length === 0 && this.currentUser) {
      if (this.isDev()) {
        const { data } = await db.getClient()
          .from('unidades')
          .select('*')
          .eq('ativo', true)
          .eq('visivel', true);
        this.unidadesUsuario = data || [];
      } else if (this.currentUser.unidades_acesso.length > 0) {
        const { data } = await db.getClient()
          .from('unidades')
          .select('*')
          .in('id', this.currentUser.unidades_acesso)
          .eq('ativo', true)
          .eq('visivel', true);
        this.unidadesUsuario = data || [];
      }
    }
    return this.unidadesUsuario;
  }

  async redirectByPerfil() {
    if (!this.currentUser) {
      window.location.href = '/src/pages/login/';
      return;
    }

    const perfis = this.currentUser.perfis;
    const unidades = await this.verificarUnidadesAcesso();

    if ((perfis.includes('dev') || perfis.includes('admin')) && unidades.length === 0) {
      window.location.href = '/src/pages/dashboard/?view=admin';
      return;
    }

    if (perfis.includes('dev') || perfis.includes('admin')) {
      window.location.href = '/src/pages/dashboard/?view=admin';
      return;
    }

    if (unidades.length === 0) {
      alert('❌ Você não tem acesso a nenhuma unidade. Contate o administrador.');
      this.logout();
      return;
    }

    if (unidades.length === 1) {
      this.entrarNaUnidade(unidades[0]);
      return;
    }

    window.location.href = '/src/pages/dashboard/?view=selecao-unidade';
  }

  entrarNaUnidade(unidade) {
    const perfis = this.currentUser.perfis;
    
    // Salva unidade atual com segurança
    localStorage.setItem('ricazo_unidade_atual', JSON.stringify(unidade));
    
    // Roteamento inteligente
    if (unidade.tipo === 'fabrica') {
      window.location.href = `/src/pages/dashboard/?view=producao&unidade=${unidade.id}`;
    } else if (perfis.includes('caixa')) {
      window.location.href = `/src/pages/dashboard/?view=caixa&unidade=${unidade.id}`;
    } else if (perfis.includes('pdv')) {
      window.location.href = `/src/pages/dashboard/?view=pdv&unidade=${unidade.id}`;
    } else if (perfis.includes('producao')) {
      window.location.href = `/src/pages/dashboard/?view=producao&unidade=${unidade.id}`;
    } else if (perfis.includes('dev') || perfis.includes('admin')) {
      // DEV e Admin vão para o Admin da unidade (visão geral)
      window.location.href = `/src/pages/dashboard/?view=admin&unidade=${unidade.id}`;
    } else {
      const perfilPrincipal = perfis[0] || 'admin';
      window.location.href = `/src/pages/dashboard/?view=${perfilPrincipal}&unidade=${unidade.id}`;
    }
  }

  voltarParaHome() {
    if (!this.currentUser) {
      window.location.href = '/src/pages/login/';
      return;
    }

    const perfis = this.currentUser.perfis;
    
    if (perfis.includes('dev') || perfis.includes('admin')) {
      window.location.href = '/src/pages/dashboard/?view=admin';
      return;
    }

    const unidadeAtual = localStorage.getItem('ricazo_unidade_atual');
    if (unidadeAtual) {
      const unidade = JSON.parse(unidadeAtual);
      if (unidade && unidade.nome) {
        this.entrarNaUnidade(unidade);
        return;
      }
    }

    this.redirectByPerfil();
  }

  logout() {
    this.currentUser = null;
    this.session = null;
    this.unidadesUsuario = [];
    localStorage.removeItem('ricazo_user');
    localStorage.removeItem('ricazo_session');
    localStorage.removeItem('ricazo_unidades');
    localStorage.removeItem('ricazo_unidade_atual');
    window.location.href = '/src/pages/login/';
  }

  isAuthenticated() {
    return this.checkSession();
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUnidadesUsuario() {
    return this.unidadesUsuario;
  }

  getUnidadeAtual() {
    const saved = localStorage.getItem('ricazo_unidade_atual');
    return saved ? JSON.parse(saved) : null;
  }

  isDev() {
    return this.currentUser?.perfis.includes('dev') || false;
  }

  isAdmin() {
    return this.currentUser?.perfis.includes('admin') || false;
  }

  hasPerfil(perfil) {
    if (!this.currentUser) return false;
    return this.currentUser.perfis.includes(perfil) || this.isDev();
  }

  podeGerenciarUnidades() {
    return this.isDev();
  }

  podeGerenciarUsuario(usuario) {
    if (!this.currentUser) return false;
    if (this.isDev()) return true;
    if (usuario.perfis?.includes('dev')) return false;
    return this.isAdmin();
  }

  podeCriarPerfil(perfil) {
    if (!this.currentUser) return false;
    if (this.isDev()) return true;
    if (perfil === 'dev') return false;
    return this.isAdmin();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('ricazo_theme') || CONFIG.DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ricazo_theme', newTheme);
    return newTheme;
  }

  getTheme() {
    return document.documentElement.getAttribute('data-theme');
  }
}

const auth = new AuthSystem();
window.auth = auth;