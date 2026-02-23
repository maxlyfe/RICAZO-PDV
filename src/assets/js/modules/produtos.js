/**
 * RICAZO - Módulo de Produtos
 */

class ProdutosModule {
  constructor() {
    this.produtos = [];
  }

  async load() {
    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select(`*, precos:produto_precos(*)`)
        .eq('visivel', true)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      
      this.produtos = data || [];
      this.render();
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      this.renderError(error.message);
    }
  }

  render() {
    const container = document.getElementById('produtos-list');
    if (!container) return;

    if (this.produtos.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
          <p>Nenhum produto cadastrado</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">
            Clique em "Novo Produto" para começar
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.produtos.map(p => this.cardHTML(p)).join('');
  }

  cardHTML(produto) {
    const precoBase = parseFloat(produto.preco_base).toFixed(2);
    const tipoLabel = produto.tipo_preco === 'peso' ? '⚖️ KG' : '📦 UN';
    
    return `
      <div class="produto-card-modern">
        <div class="produto-card-top">
          <div class="produto-img-wrapper">
            ${produto.imagem_url 
              ? `<img src="${produto.imagem_url}" alt="${produto.nome}" onerror="this.src='https://via.placeholder.com/80?text=🥖'">`
              : `<div class="produto-img-placeholder">🥖</div>`
            }
          </div>
          <div class="produto-info-modern">
            <h3 class="produto-nome-modern" title="${produto.nome}">${produto.nome}</h3>
            ${produto.descricao ? `<p class="produto-desc-modern">${produto.descricao}</p>` : ''}
            <div class="produto-tipo-pill">${tipoLabel}</div>
          </div>
        </div>
        
        <div class="produto-card-bottom">
          <div class="produto-preco-modern">R$ ${precoBase}</div>
          <div class="produto-acoes-modern">
            <button class="btn-action-ghost edit" onclick="produtosModule.editar('${produto.id}')" title="Editar Produto">
              ✏️ Editar
            </button>
            <button class="btn-action-ghost delete" onclick="produtosModule.ocultar('${produto.id}')" title="Ocultar Produto">
              🗑️ Ocultar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderError(msg) {
    const container = document.getElementById('produtos-list');
    if (container) {
      container.innerHTML = `<div class="text-center" style="color: var(--danger); padding: 2rem;">❌ ${msg}</div>`;
    }
  }

  openModal(produtoId = null) {
    const unidades = unidadesModule.getAll();
    if (unidades.length === 0) {
      alert('❌ Cadastre uma unidade primeiro!');
      return;
    }

    const isEdicao = produtoId && produtoId !== '';
    const produto = isEdicao ? this.produtos.find(p => p.id === produtoId) : null;

    const unidadesCheckboxes = unidades.map(u => {
      const precoExistente = produto?.precos?.find(p => p.unidade_id === u.id);
      const precoValor = precoExistente ? precoExistente.preco : '';
      const checked = isEdicao ? !!precoExistente : true;
      
      return `
        <label class="unidade-checkbox">
          <input type="checkbox" name="unidades" value="${u.id}" ${checked ? 'checked' : ''}>
          <span>${u.nome}</span>
          <input type="number" step="0.01" name="preco_${u.id}" placeholder="Preço" class="form-input preco-input" value="${precoValor}">
        </label>
      `;
    }).join('');

    const content = `
      <div class="card-header">
        <h3 class="card-title">${isEdicao ? '✏️ Editar' : '🥖 Novo'} Produto</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="produtosModule.salvar(event, '${produtoId || ''}')">
        ${modal.formGroup('Nome do Produto *', `<input type="text" name="nome" class="form-input" placeholder="Ex: Pão Francês" required value="${produto?.nome || ''}">`)}
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          ${modal.formGroup('Tipo de Preço *', `
            <select name="tipo_preco" class="form-input" required onchange="produtosModule.toggleTipo(this.value)">
              <option value="unidade" ${produto?.tipo_preco === 'unidade' ? 'selected' : ''}>📦 Por Unidade</option>
              <option value="peso" ${produto?.tipo_preco === 'peso' ? 'selected' : ''}>⚖️ Por Peso (KG)</option>
            </select>
          `)}
          ${modal.formGroup('Preço Base * (R$)', `<input type="number" step="0.01" name="preco_base" class="form-input" placeholder="0,00" required value="${produto?.preco_base || ''}" onchange="produtosModule.preencherPrecos(this.value)">`)}
        </div>

        <div class="form-group">
          <label class="form-label">URL da Imagem (opcional)</label>
          <input type="url" name="imagem_url" class="form-input" placeholder="https://..." value="${produto?.imagem_url || ''}">
        </div>

        ${modal.formGroup('Descrição', `<textarea name="descricao" class="form-input" rows="2" placeholder="Descrição opcional">${produto?.descricao || ''}</textarea>`)}

        <div class="form-group">
          <label class="form-label">
            Preços por Unidade 
            <small style="color: var(--text-muted); font-weight: normal;">
              (deixe em branco para usar o preço base)
            </small>
          </label>
          <div id="precos-unidades" style="margin-top: 0.5rem;">
            ${unidadesCheckboxes}
          </div>
        </div>

        ${modal.actions('Cancelar', isEdicao ? 'Salvar Alterações' : 'Criar Produto')}
      </form>
    `;
    modal.open(content);
    
    if (produto) {
      this.toggleTipo(produto.tipo_preco);
    }
  }

  preencherPrecos(valor) {
    document.querySelectorAll('input[name^="preco_"]').forEach(input => {
      if (!input.value) input.value = valor;
    });
  }

  toggleTipo(tipo) {
    const label = document.querySelector('input[name="preco_base"]').previousElementSibling;
    if (label) {
      label.textContent = tipo === 'peso' ? 'Preço Base * (R$ por KG)' : 'Preço Base * (R$ por Unidade)';
    }
  }

  async salvar(event, produtoId = null) {
    event.preventDefault();
    const form = event.target;
    const isEdicao = produtoId && produtoId !== '';
    
    const unidadesSelecionadas = Array.from(form.querySelectorAll('input[name="unidades"]:checked')).map(cb => cb.value);
    
    if (unidadesSelecionadas.length === 0) {
      alert('❌ Selecione pelo menos uma unidade');
      return;
    }

    const dados = {
      nome: form.nome.value.trim(),
      tipo_preco: form.tipo_preco.value,
      preco_base: parseFloat(form.preco_base.value),
      imagem_url: form.imagem_url.value.trim() || null,
      descricao: form.descricao.value.trim() || null,
      ativo: true,
      visivel: true
    };

    try {
      if (isEdicao) {
        await db.update('produtos', produtoId, dados);
        await db.getClient().from('produto_precos').delete().eq('produto_id', produtoId);
        
        const precosInsert = unidadesSelecionadas.map(unidadeId => {
          const precoEspecifico = form[`preco_${unidadeId}`].value;
          return {
            produto_id: produtoId,
            unidade_id: unidadeId,
            preco: precoEspecifico ? parseFloat(precoEspecifico) : dados.preco_base,
            preco_igual_base: !precoEspecifico || parseFloat(precoEspecifico) === dados.preco_base
          };
        });
        
        await db.insert('produto_precos', precosInsert);
        alert('✅ Produto atualizado!');

      } else {
        const [novoProduto] = await db.insert('produtos', [{...dados, created_by: auth.getCurrentUser()?.id}]);

        const precosInsert = unidadesSelecionadas.map(unidadeId => {
          const precoEspecifico = form[`preco_${unidadeId}`].value;
          return {
            produto_id: novoProduto.id,
            unidade_id: unidadeId,
            preco: precoEspecifico ? parseFloat(precoEspecifico) : dados.preco_base,
            preco_igual_base: !precoEspecifico || parseFloat(precoEspecifico) === dados.preco_base
          };
        });

        await db.insert('produto_precos', precosInsert);

        const estoqueInsert = unidadesSelecionadas.map(unidadeId => ({
          unidade_id: unidadeId,
          produto_id: novoProduto.id,
          quantidade: 0
        }));
        await db.insert('estoque', estoqueInsert);
        
        alert('✅ Produto criado!');
      }

      modal.close();
      await this.load();

    } catch (error) {
      console.error('Erro:', error);
      alert('❌ Erro: ' + error.message);
    }
  }

  async ocultar(id) {
    if (!confirm('Tem certeza que deseja ocultar este produto?')) return;
    try {
      await db.update('produtos', id, { visivel: false, ativo: false });
      await this.load();
      alert('✅ Produto ocultado!');
    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  editar(id) {
    this.openModal(id);
  }

  getAll() {
    return this.produtos;
  }
}

const produtosModule = new ProdutosModule();
window.produtosModule = produtosModule;