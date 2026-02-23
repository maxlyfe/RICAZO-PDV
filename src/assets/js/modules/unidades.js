/**
 * RICAZO - Módulo de Unidades
 */

class UnidadesModule {
  constructor() {
    this.unidades = [];
  }

  async load() {
    try {
      // Se não for DEV, só carrega unidades do usuário
      if (!auth.isDev()) {
        this.unidades = auth.getUnidadesUsuario();
        this.render();
        return this.unidades;
      }

      // DEV carrega todas
      this.unidades = await db.getAll('unidades', {
        eq: { column: 'visivel', value: true },
        order: { column: 'nome' }
      });
      
      this.render();
      return this.unidades;

    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
      this.renderError(error.message);
    }
  }

  render() {
    const container = document.getElementById('unidades-list');
    if (!container) return;

    const podeGerenciar = auth.podeGerenciarUnidades();

    if (this.unidades.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="grid-column: 1/-1; padding: 3rem; color: var(--text-muted);">
          <p>Nenhuma unidade disponível</p>
          ${podeGerenciar ? '<p style="font-size: 0.875rem; margin-top: 0.5rem;">Clique em "Nova Unidade" para começar</p>' : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = this.unidades.map(u => this.cardHTML(u, podeGerenciar)).join('');
  }

  cardHTML(unidade, podeGerenciar) {
    const isUnidadeDoUsuario = auth.getUnidadesUsuario().some(u => u.id === unidade.id);
    const podeEntrar = auth.isDev() || isUnidadeDoUsuario;
    
    // Mapeamento de Ícones
    const icones = { loja: '🏪', fabrica: '🏭', quiosque: '📍' };
    const icone = icones[unidade.tipo] || '🏢';

    return `
      <div class="unidade-card-modern ${!podeEntrar ? 'disabled' : ''}" 
           onclick="${podeEntrar ? `app.entrarUnidade('${unidade.id}')` : ''}"
           style="${podeEntrar ? 'cursor: pointer;' : ''}">
        
        <div class="unidade-card-header">
          <div class="unidade-icon-box">${icone}</div>
          <div class="unidade-status-pill ${unidade.ativo ? 'active' : 'inactive'}">
            ${unidade.ativo ? '🟢 Ativa' : '⚪ Inativa'}
          </div>
        </div>
        
        <div class="unidade-card-body">
          <h3 class="unidade-title-modern">${unidade.nome}</h3>
          <p class="unidade-subtitle-modern">
            ${this.formatTipo(unidade.tipo)} 
            ${unidade.endereco ? ` • ${unidade.endereco}` : ''}
          </p>
        </div>

        <div class="unidade-card-stats-modern">
          <div class="stat-item">
            <span class="stat-value">-</span>
            <span class="stat-label">Vendas Hoje</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">-</span>
            <span class="stat-label">Em Aberto</span>
          </div>
        </div>

        ${!podeEntrar ? `
          <div class="unidade-no-access">🔒 Você não tem permissão de acesso</div>
        ` : ''}

        ${podeGerenciar ? `
          <div class="unidade-card-footer">
            <button class="btn-action-ghost edit" onclick="event.stopPropagation(); unidadesModule.editar('${unidade.id}')">
              ✏️ Editar
            </button>
            <button class="btn-action-ghost delete" onclick="event.stopPropagation(); unidadesModule.ocultar('${unidade.id}')">
              🗑️ Ocultar
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  formatTipo(tipo) {
    const tipos = {
      'loja': 'Loja',
      'fabrica': 'Fábrica / Matriz',
      'quiosque': 'Quiosque'
    };
    return tipos[tipo] || tipo;
  }

  renderError(msg) {
    const container = document.getElementById('unidades-list');
    if (container) {
      container.innerHTML = `<div class="text-center" style="color: var(--danger); padding: 2rem;">❌ ${msg}</div>`;
    }
  }

  openModal(unidadeId = null) {
    if (!auth.podeGerenciarUnidades()) {
      alert('❌ Apenas DEV pode criar/editar unidades');
      return;
    }
    
    const isEdicao = unidadeId && unidadeId !== '';
    const unidade = isEdicao ? this.unidades.find(u => u.id === unidadeId) : null;

    const content = `
      <div class="card-header">
        <h3 class="card-title">${isEdicao ? '✏️ Editar' : '🏪 Nova'} Unidade</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="unidadesModule.salvar(event, '${unidadeId || ''}')">
        ${modal.formGroup('Nome da Unidade *', `<input type="text" name="nome" class="form-input" required value="${unidade?.nome || ''}" placeholder="Ex: Loja Centro">`)}
        
        ${modal.formGroup('Tipo *', `
          <select name="tipo" class="form-input" required>
            <option value="">Selecione...</option>
            <option value="loja" ${unidade?.tipo === 'loja' ? 'selected' : ''}>🏪 Loja</option>
            <option value="fabrica" ${unidade?.tipo === 'fabrica' ? 'selected' : ''}>🏭 Fábrica</option>
            <option value="quiosque" ${unidade?.tipo === 'quiosque' ? 'selected' : ''}>📍 Quiosque</option>
          </select>
        `)}
        
        ${modal.formGroup('Endereço', `<input type="text" name="endereco" class="form-input" value="${unidade?.endereco || ''}" placeholder="Rua, número, bairro">`)}
        
        ${modal.formGroup('Telefone', `<input type="text" name="telefone" class="form-input" value="${unidade?.telefone || ''}" placeholder="(00) 00000-0000">`)}
        
        ${modal.actions('Cancelar', isEdicao ? 'Salvar Alterações' : 'Criar Unidade')}
      </form>
    `;
    modal.open(content);
  }

  async salvar(event, unidadeId = null) {
    event.preventDefault();
    const form = event.target;
    
    const isEdicao = unidadeId && unidadeId !== '';
    
    const dados = {
      nome: form.nome.value.trim(),
      tipo: form.tipo.value,
      endereco: form.endereco.value.trim(),
      telefone: form.telefone.value.trim()
    };

    try {
      if (isEdicao) {
        await db.update('unidades', unidadeId, dados);
        alert('✅ Unidade atualizada!');
      } else {
        await db.insert('unidades', [{
          ...dados,
          ativo: true,
          visivel: true,
          created_by: auth.getCurrentUser()?.id
        }]);
        alert('✅ Unidade criada!');
      }

      modal.close();
      await this.load();

    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('❌ Erro: ' + error.message);
    }
  }

  async ocultar(id) {
    if (!confirm('Tem certeza que deseja ocultar esta unidade?')) return;
    
    try {
      await db.update('unidades', id, { visivel: false, ativo: false });
      await this.load();
      alert('✅ Unidade ocultada!');
    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  selecionar(id) {
    const unidade = this.unidades.find(u => u.id === id);
    if (!unidade) return;

    // Verifica se tem acesso
    const temAcesso = auth.isDev() || auth.getUnidadesUsuario().some(u => u.id === id);
    if (!temAcesso) {
      alert('❌ Você não tem acesso a esta unidade');
      return;
    }

    // Redireciona baseado no tipo
    if (unidade.tipo === 'fabrica') {
      window.location.href = `/src/pages/dashboard/?view=producao&unidade=${id}`;
    } else {
      const perfis = auth.getCurrentUser()?.perfis || [];
      if (perfis.includes('caixa')) {
        window.location.href = `/src/pages/dashboard/?view=caixa&unidade=${id}`;
      } else if (perfis.includes('pdv')) {
        window.location.href = `/src/pages/dashboard/?view=pdv&unidade=${id}`;
      } else {
        window.location.href = `/src/pages/dashboard/?view=admin&unidade=${id}`;
      }
    }
  }

  editar(id) {
    this.openModal(id);
  }

  getAll() {
    return this.unidades;
  }
}

const unidadesModule = new UnidadesModule();
window.unidadesModule = unidadesModule;