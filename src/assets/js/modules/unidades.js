/**
 * RICAZO - Módulo de Unidades
 */

class UnidadesModule {
  constructor() {
    this.unidades = [];
  }

  async load() {
    try {
      if (!auth.isDev()) {
        this.unidades = auth.getUnidadesUsuario();
        this.render();
        return this.unidades;
      }

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

    return `
      <div class="unidade-card" onclick="${podeEntrar ? `app.entrarUnidade('${unidade.id}')` : ''}" style="cursor: ${podeEntrar ? 'pointer' : 'not-allowed'}; ${!podeEntrar ? 'opacity: 0.6;' : ''}">
        <div class="unidade-header">
          <div class="unidade-name">${unidade.nome}</div>
          <div class="unidade-type">${this.formatTipo(unidade.tipo)}</div>
        </div>
        <div class="unidade-body">
          <!-- Conteúdo do card -->
        </div>
      </div>
    `;
  }
}

const unidadesModule = new UnidadesModule();
window.unidadesModule = unidadesModule;