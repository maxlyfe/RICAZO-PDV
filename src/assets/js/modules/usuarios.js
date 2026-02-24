/**
 * RICAZO - Módulo de Usuários
 */

class UsuariosModule {
  constructor() {
    this.usuarios = [];
  }

  async load() {
    try {
      const { data, error } = await db.getClient()
        .from('usuarios')
        .select(`*, perfis:usuario_perfis(perfil), unidades:usuario_unidades(unidade_id, unidade:unidades(nome))`)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      
      this.usuarios = data || [];
      this.render();
      return this.usuarios;
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      this.renderError(error.message);
    }
  }

  render() {
    const container = document.getElementById('usuarios-list');
    if (!container) return;

    const usuariosVisiveis = auth.isDev() 
      ? this.usuarios 
      : this.usuarios.filter(u => !u.perfis.some(p => p.perfil === 'dev'));

    if (usuariosVisiveis.length === 0) {
      container.innerHTML = `<div class="text-center" style="padding: 2rem; color: var(--text-muted);"><p>Nenhum usuário cadastrado</p></div>`;
      return;
    }

    container.innerHTML = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
              <th style="padding: 0.75rem;">Nome</th>
              <th style="padding: 0.75rem;">Username</th>
              <th style="padding: 0.75rem;">Perfis</th>
              <th style="padding: 0.75rem;">Unidades</th>
              <th style="padding: 0.75rem; text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${usuariosVisiveis.map(u => this.rowHTML(u)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  rowHTML(user) {
    const podeEditar = auth.podeGerenciarUsuario(user);
    
    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.75rem; font-weight: 600;">${user.nome}</td>
        <td style="padding: 0.75rem; color: var(--text-secondary);">${user.username}</td>
        <td style="padding: 0.75rem;">
          ${user.perfis.map(p => `<span class="perfil-badge perfil-${p.perfil}">${CONFIG.PERFIS_LABELS[p.perfil]}</span>`).join(' ')}
        </td>
        <td style="padding: 0.75rem;">
          ${user.unidades?.length > 0 
            ? user.unidades.map(u => u.unidade?.nome || 'Todas').join(', ')
            : '<span style="color: var(--text-muted);">Todas</span>'
          }
        </td>
        <td style="padding: 0.75rem; text-align: right;">
          ${podeEditar ? `
            <button class="btn btn-sm btn-secondary" onclick="usuariosModule.editar('${user.id}')">
              ✏️ Editar
            </button>
          ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">🔒</span>'}
        </td>
      </tr>
    `;
  }

  renderError(msg) {
    const container = document.getElementById('usuarios-list');
    if (container) container.innerHTML = `<p style="color: var(--danger); padding: 2rem;">❌ ${msg}</p>`;
  }

  openModal() {
    if (!auth.hasPerfil('admin') && !auth.isDev()) {
      alert('❌ Sem permissão para criar usuários');
      return;
    }

    // REGRA DE SEGURANÇA: Filtra o perfil 'dev' para não aparecer nas opções de criação
    const perfisDisponiveis = Object.entries(CONFIG.PERFIS_LABELS)
      .filter(([key]) => key !== 'dev' && auth.podeCriarPerfil(key))
      .map(([key, label]) => `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--bg-secondary); border-radius: var(--border-radius); cursor: pointer;">
          <input type="checkbox" name="perfis" value="${key}">
          <span class="perfil-badge perfil-${key}">${label}</span>
        </label>
      `).join('');

    const unidadesOptions = unidadesModule.getAll().map(u => 
      `<option value="${u.id}">${u.nome}</option>`
    ).join('');

    const content = `
      <div class="card-header">
        <h3 class="card-title">👥 Novo Usuário</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="usuariosModule.salvar(event)">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          ${modal.formGroup('Nome Completo *', modal.input('nome', 'text', 'Ex: João Silva', true))}
          ${modal.formGroup('Username *', modal.input('username', 'text', 'Ex: joao.silva', true))}
        </div>
        ${modal.formGroup('Senha *', modal.input('senha', 'text', 'Mínimo 4 caracteres', true))}
        
        <div class="form-group">
          <label class="form-label">Perfis * (selecione um ou mais)</label>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
            ${perfisDisponiveis}
          </div>
        </div>

        ${modal.formGroup('Unidades de Acesso', `
          <select name="unidades" class="form-input" multiple size="4" style="height: auto;">
            <option value="">Todas as unidades (DEV/Admin)</option>
            ${unidadesOptions}
          </select>
          <small style="color: var(--text-muted);">Segure Ctrl para selecionar múltiplas</small>
        `)}
        
        ${modal.actions()}
      </form>
    `;
    modal.open(content);
  }

  async salvar(event) {
    event.preventDefault();
    const form = event.target;
    
    const perfisSelecionados = Array.from(form.querySelectorAll('input[name="perfis"]:checked')).map(cb => cb.value);
    const unidadesSelecionadas = Array.from(form.unidades.selectedOptions).map(opt => opt.value).filter(v => v);

    if (perfisSelecionados.length === 0) {
      alert('❌ Selecione pelo menos um perfil');
      return;
    }

    const dados = {
      nome: form.nome.value.trim(),
      username: form.username.value.trim().toLowerCase(),
      senha: form.senha.value,
      ativo: true
    };

    try {
      const [novoUsuario] = await db.insert('usuarios', [dados]);

      await db.insert('usuario_perfis', perfisSelecionados.map(perfil => ({
        usuario_id: novoUsuario.id,
        perfil: perfil
      })));

      if (unidadesSelecionadas.length > 0) {
        await db.insert('usuario_unidades', unidadesSelecionadas.map(uid => ({
          usuario_id: novoUsuario.id,
          unidade_id: uid
        })));
      }

      modal.close();
      await this.load();
      alert('✅ Usuário criado!');

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  editar(id) {
    const usuario = this.usuarios.find(u => u.id === id);
    if (!usuario) return;
    
    if (!auth.podeGerenciarUsuario(usuario)) {
      alert('❌ Você não tem permissão para editar este usuário');
      return;
    }

    const unidadesOptions = unidadesModule.getAll().map(u => {
      const selecionado = usuario.unidades?.some(un => un.unidade_id === u.id);
      return `<option value="${u.id}" ${selecionado ? 'selected' : ''}>${u.nome}</option>`;
    }).join('');

    // REGRA DE SEGURANÇA: Filtra o perfil 'dev' para não aparecer nas opções de edição
    const perfisCheckboxes = Object.entries(CONFIG.PERFIS_LABELS)
      .filter(([key]) => key !== 'dev')
      .map(([key, label]) => {
      const selecionado = usuario.perfis.some(p => p.perfil === key);
      return `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--bg-secondary); border-radius: var(--border-radius); cursor: pointer;">
          <input type="checkbox" name="perfis" value="${key}" ${selecionado ? 'checked' : ''}>
          <span class="perfil-badge perfil-${key}">${label}</span>
        </label>
      `;
    }).join('');

    const content = `
      <div class="card-header">
        <h3 class="card-title">✏️ Editar Usuário</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="usuariosModule.atualizar(event, '${id}')">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          ${modal.formGroup('Nome Completo *', `<input type="text" name="nome" class="form-input" required value="${usuario.nome}">`)}
          ${modal.formGroup('Username *', `<input type="text" name="username" class="form-input" required value="${usuario.username}" disabled style="background: var(--bg-tertiary);">`)}
        </div>
        
        <div class="form-group">
          <label class="form-label">Nova Senha (deixe em branco para manter)</label>
          <input type="text" name="senha" class="form-input" placeholder="••••••">
        </div>
        
        <div class="form-group">
          <label class="form-label">Perfis *</label>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
            ${perfisCheckboxes}
            ${usuario.perfis.some(p => p.perfil === 'dev') ? `<span class="perfil-badge perfil-dev" style="opacity: 0.7;" title="Perfil protegido pelo banco de dados">DEV (Protegido)</span>` : ''}
          </div>
        </div>

        ${modal.formGroup('Unidades de Acesso', `
          <select name="unidades" class="form-input" multiple size="4" style="height: auto;">
            <option value="">Todas as unidades</option>
            ${unidadesOptions}
          </select>
          <small style="color: var(--text-muted);">Segure Ctrl para selecionar múltiplas</small>
        `)}
        
        ${modal.actions('Cancelar', 'Salvar Alterações')}
      </form>
    `;
    modal.open(content);
  }

  async atualizar(event, id) {
    event.preventDefault();
    const form = event.target;
    
    // Verifica se o usuário editado JÁ ERA dev no banco de dados
    const usuarioOriginal = this.usuarios.find(u => u.id === id);
    const eraDev = usuarioOriginal?.perfis.some(p => p.perfil === 'dev');

    const perfisSelecionados = Array.from(form.querySelectorAll('input[name="perfis"]:checked')).map(cb => cb.value);
    
    // TRAVA DE SEGURANÇA: Injeta o 'dev' de volta para não apagar sem querer o acesso de um Dev
    if (eraDev && !perfisSelecionados.includes('dev')) {
      perfisSelecionados.push('dev');
    }

    const unidadesSelecionadas = Array.from(form.unidades.selectedOptions).map(opt => opt.value).filter(v => v);

    if (perfisSelecionados.length === 0) {
      alert('❌ Selecione pelo menos um perfil');
      return;
    }

    try {
      const dados = { nome: form.nome.value.trim() };
      if (form.senha.value) dados.senha = form.senha.value;
      
      await db.update('usuarios', id, dados);

      await db.getClient().from('usuario_perfis').delete().eq('usuario_id', id);
      await db.insert('usuario_perfis', perfisSelecionados.map(perfil => ({
        usuario_id: id,
        perfil: perfil
      })));

      await db.getClient().from('usuario_unidades').delete().eq('usuario_id', id);
      if (unidadesSelecionadas.length > 0) {
        await db.insert('usuario_unidades', unidadesSelecionadas.map(uid => ({
          usuario_id: id,
          unidade_id: uid
        })));
      }

      modal.close();
      await this.load();
      alert('✅ Usuário atualizado!');

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }
}

const usuariosModule = new UsuariosModule();
window.usuariosModule = usuariosModule;