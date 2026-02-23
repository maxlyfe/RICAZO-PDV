/**
 * RICAZO - Módulo de Gestão de Produtos (Uploads, Abas e Combos com KG)
 */

class ProdutosModule {
  constructor() {
    this.produtos = [];
    
    // Estados temporários para o modal de edição/criação
    this.editingId = null;
    this.isComboMode = false;
    this.comboItems = []; 
  }

  async load() {
    const container = document.getElementById('produtos-list');
    if (!container) return;

    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select('*')
        .order('nome');

      if (error) throw error;
      this.produtos = data || [];
      this.render(container);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger);">Erro ao carregar produtos.</div>`;
    }
  }

  render(container) {
    if (this.produtos.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Nenhum produto cadastrado.</p></div>`;
      return;
    }

    container.innerHTML = this.produtos.map(p => `
      <div class="card" style="display: flex; gap: 1rem; align-items: center; padding: 1rem;">
        <div style="width: 60px; height: 60px; background: var(--bg-secondary); border-radius: var(--border-radius); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
          ${p.imagem_url 
            ? `<img src="${p.imagem_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` 
            : '🥖'}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
            ${p.nome} 
            ${p.is_combo ? `<span style="background: var(--primary); color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;">COMBO</span>` : ''}
          </div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">
            R$ ${parseFloat(p.preco_base).toFixed(2)} • ${p.tipo_preco === 'peso' ? 'KG' : 'Unidade'}
          </div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">
            <span style="color: ${p.ativo ? 'var(--success)' : 'var(--danger)'}">● ${p.ativo ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="produtosModule.openModal('${p.id}')">Editar</button>
        </div>
      </div>
    `).join('');
  }

  openModal(id = null) {
    this.editingId = id;
    let p = { nome: '', preco_base: '', tipo_preco: 'unidade', imagem_url: '', ativo: true, visivel: true, is_combo: false, itens_combo: [] };
    
    if (id) {
      const prod = this.produtos.find(x => x.id === id);
      if (prod) {
        p = { ...prod };
      }
    }

    // Se estiver a editar um combo, abre logo na aba de Combo
    this.isComboMode = p.is_combo;
    this.comboItems = p.itens_combo ? [...p.itens_combo] : [];

    const opcoesProdutos = this.produtos
      .filter(prod => !prod.is_combo)
      .map(prod => `<option value="${prod.id}" data-tipo="${prod.tipo_preco}">${prod.nome} (R$ ${parseFloat(prod.preco_base).toFixed(2)})</option>`)
      .join('');

    const content = `
      <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 1rem; padding-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 class="card-title" id="modal-produto-title">${id ? '✏️ Editar' : '➕ Novo'} ${this.isComboMode ? 'Combo' : 'Produto'}</h3>
          <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
        </div>
        
        <!-- NAVEGAÇÃO POR ABAS -->
        <div style="display: flex; gap: 0.5rem; width: 100%; border-bottom: 2px solid var(--border-color); padding-bottom: 1rem;">
          <button type="button" id="tab-simples" class="btn btn-sm ${!this.isComboMode ? 'btn-primary' : 'btn-ghost'}" onclick="produtosModule.mudarAbaModal(false)" style="flex: 1; border: 1px solid var(--border-color);">
            🥖 Item Simples
          </button>
          <button type="button" id="tab-combo" class="btn btn-sm ${this.isComboMode ? 'btn-primary' : 'btn-ghost'}" onclick="produtosModule.mudarAbaModal(true)" style="flex: 1; border: 1px solid var(--border-color);">
            📦 Combo / Kit
          </button>
        </div>
      </div>

      <form onsubmit="produtosModule.save(event)" style="margin-top: 1rem;">
        
        <div class="form-group">
          <label class="form-label">Nome do Produto/Combo *</label>
          <input type="text" name="nome" class="form-input" required value="${p.nome}" placeholder="Ex: Pão de Queijo ou Combo Manhã">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Preço Final (R$) *</label>
            <input type="number" step="0.01" min="0" name="preco_base" id="input-preco-base" class="form-input" required value="${p.preco_base}" onkeyup="produtosModule.renderListaCombo()" onchange="produtosModule.renderListaCombo()">
          </div>
          <div class="form-group" id="container-tipo-preco" style="${this.isComboMode ? 'display: none;' : ''}">
            <label class="form-label">Vendido por *</label>
            <select name="tipo_preco" class="form-input">
              <option value="unidade" ${p.tipo_preco === 'unidade' ? 'selected' : ''}>Unidade (UN)</option>
              <option value="peso" ${p.tipo_preco === 'peso' ? 'selected' : ''}>Peso (KG)</option>
            </select>
          </div>
        </div>

        <!-- CONSTRUTOR DE COMBO (Visibilidade controlada pelas abas) -->
        <div id="combo-builder-wrapper" style="display: ${this.isComboMode ? 'block' : 'none'};">
          <div style="border: 2px dashed var(--primary); padding: 1.5rem; border-radius: var(--border-radius); background: rgba(232, 145, 58, 0.05); margin-top: 0.5rem; margin-bottom: 1.5rem;">
            <h4 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">📋 Itens que compõem o Combo</h4>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: flex-end;">
              <div style="flex: 1;">
                <label style="font-size: 0.75rem; color: var(--text-secondary);">Produto</label>
                <select id="combo-select-produto" class="form-input" onchange="produtosModule.atualizarInputQtdCombo()">
                  ${opcoesProdutos}
                </select>
              </div>
              <div style="width: 100px;">
                <label style="font-size: 0.75rem; color: var(--text-secondary);">Qtd/Peso</label>
                <input type="number" id="combo-input-qtd" class="form-input" value="1" min="0.001" step="1" placeholder="1">
              </div>
              <button type="button" class="btn btn-primary" onclick="produtosModule.adicionarItemCombo()" style="height: 42px;">Add</button>
            </div>

            <div id="combo-items-list" style="margin-bottom: 1rem;"></div>
            <div id="combo-totals" style="border-top: 1px solid var(--border-color); padding-top: 1rem; font-size: 0.9rem;"></div>
          </div>
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label class="form-label">Imagem do Produto/Combo</label>
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--border-radius); border: 1px dashed var(--border-color);">
            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">1. Fazer upload de uma foto do computador:</div>
            <input type="file" id="imagem_file" class="form-input" accept="image/*" style="margin-bottom: 1rem;">
            
            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">2. OU colar o link de uma imagem da internet:</div>
            <input type="text" name="imagem_url" id="imagem_url" class="form-input" placeholder="https://exemplo.com/foto.jpg" value="${p.imagem_url || ''}">
          </div>
        </div>

        <div style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: bold;">
            <input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''} style="width: 18px; height: 18px;"> Ativo no Sistema
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: bold;">
            <input type="checkbox" name="visivel" ${p.visivel ? 'checked' : ''} style="width: 18px; height: 18px;"> Visível no PDV
          </label>
        </div>

        ${modal.actions('Cancelar', 'Salvar Alterações')}
      </form>
    `;
    
    modal.open(content);
    
    // Inicializa o input de quantidade do combo conforme o primeiro produto da lista e carrega a lista
    setTimeout(() => {
      this.atualizarInputQtdCombo();
      if (this.isComboMode) this.renderListaCombo();
    }, 10);
  }

  mudarAbaModal(isCombo) {
    this.isComboMode = isCombo;
    
    // Atualiza classes dos botões (Abas)
    const btnSimples = document.getElementById('tab-simples');
    const btnCombo = document.getElementById('tab-combo');
    
    btnSimples.className = `btn btn-sm ${!isCombo ? 'btn-primary' : 'btn-ghost'}`;
    btnSimples.style.border = '1px solid var(--border-color)';
    btnCombo.className = `btn btn-sm ${isCombo ? 'btn-primary' : 'btn-ghost'}`;
    btnCombo.style.border = '1px solid var(--border-color)';

    // Atualiza Título
    const titleEl = document.getElementById('modal-produto-title');
    if (titleEl) {
       titleEl.innerHTML = `${this.editingId ? '✏️ Editar' : '➕ Novo'} ${isCombo ? 'Combo' : 'Produto'}`;
    }

    // Mostra/Oculta Secções
    document.getElementById('container-tipo-preco').style.display = isCombo ? 'none' : 'block';
    document.getElementById('combo-builder-wrapper').style.display = isCombo ? 'block' : 'none';
    
    if (isCombo) this.renderListaCombo();
  }

  // Atualiza o placeholder e os decimais do Input de Quantidade baseado no produto (Peso vs Unidade)
  atualizarInputQtdCombo() {
    const select = document.getElementById('combo-select-produto');
    const input = document.getElementById('combo-input-qtd');
    if (!select || !input) return;

    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) return;

    const tipo = selectedOption.dataset.tipo;
    if (tipo === 'peso') {
      input.step = '0.001';
      input.placeholder = 'Ex: 0.500';
      // Se era 1 (padrão de unidade), muda para algo que lembre gramas
      if (input.value === '1') input.value = '0.250';
    } else {
      input.step = '1';
      input.placeholder = 'Qtd';
      // Se tinha decimais, arredonda para unidade
      if (input.value.includes('.')) input.value = '1';
    }
  }

  adicionarItemCombo() {
    const prodId = document.getElementById('combo-select-produto').value;
    const qtd = parseFloat(document.getElementById('combo-input-qtd').value);

    if (prodId && qtd > 0) {
      // Se já existir no combo, soma a quantidade
      const existente = this.comboItems.find(i => i.produto_id === prodId);
      if (existente) {
        existente.quantidade += qtd;
      } else {
        this.comboItems.push({ produto_id: prodId, quantidade: qtd });
      }
      this.renderListaCombo();
    }
  }

  removerItemCombo(index) {
    this.comboItems.splice(index, 1);
    this.renderListaCombo();
  }

  renderListaCombo() {
    const listContainer = document.getElementById('combo-items-list');
    const totalsContainer = document.getElementById('combo-totals');
    if (!listContainer || !totalsContainer) return;

    let valorRealItens = 0;
    let listaHtml = this.comboItems.map((item, idx) => {
      // Procura o produto original para saber o preço dele
      const prodOriginal = this.produtos.find(p => p.id === item.produto_id);
      if (!prodOriginal) return '';
      
      const subtotal = parseFloat(prodOriginal.preco_base) * item.quantidade;
      valorRealItens += subtotal;

      const isPeso = prodOriginal.tipo_preco === 'peso';
      const qtdDisplay = isPeso ? `${item.quantidade.toFixed(3)} kg` : `${item.quantidade} un`;

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary); padding: 0.5rem 1rem; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 0.25rem;">
          <span style="font-size: 0.9rem;"><strong>${qtdDisplay}</strong> de ${prodOriginal.nome}</span>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">R$ ${subtotal.toFixed(2)}</span>
            <button type="button" class="btn-ghost" style="color: var(--danger); padding: 0; min-width: auto;" onclick="produtosModule.removerItemCombo(${idx})">✕</button>
          </div>
        </div>
      `;
    }).join('');

    if (this.comboItems.length === 0) {
      listaHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">Nenhum produto adicionado ao combo ainda.</div>`;
    }

    // Calcula Desconto Baseado no Preço Base Digitado
    const inputPreco = document.getElementById('input-preco-base');
    const precoCombo = inputPreco && inputPreco.value ? parseFloat(inputPreco.value) : 0;
    const desconto = valorRealItens - precoCombo;

    listContainer.innerHTML = listaHtml;
    totalsContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
        <span>Soma dos Itens Avulsos:</span>
        <strong>R$ ${valorRealItens.toFixed(2)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; color: ${desconto > 0 ? 'var(--success)' : (desconto < 0 ? 'var(--danger)' : 'var(--text-muted)')}; font-weight: bold; font-size: 1rem;">
        <span>${desconto < 0 ? 'Acréscimo no Combo:' : 'Desconto Oferecido:'}</span>
        <span>R$ ${Math.abs(desconto).toFixed(2)}</span>
      </div>
    `;
  }

  async save(event) {
    event.preventDefault();
    const form = event.target;
    const btnSubmit = form.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'A guardar...';

    try {
      let finalImageUrl = form.imagem_url.value;
      const fileInput = document.getElementById('imagem_file');

      // SELECIONOU UM FICHEIRO? FAZ O UPLOAD PARA O BUCKET DO SUPABASE
      if (fileInput && fileInput.files.length > 0) {
        btnSubmit.innerHTML = 'A enviar imagem... ⏳';
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await db.getClient()
          .storage
          .from('produtos')
          .upload(fileName, file);

        if (uploadError) throw new Error('Falha no upload da imagem: ' + uploadError.message);

        // Pega a URL pública
        const { data: publicUrlData } = db.getClient().storage.from('produtos').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      // Prepara os dados do produto
      const produtoData = {
        nome: form.nome.value,
        preco_base: parseFloat(form.preco_base.value),
        tipo_preco: this.isComboMode ? 'unidade' : form.tipo_preco?.value, // Combos são sempre unidade
        imagem_url: finalImageUrl,
        ativo: form.ativo.checked,
        visivel: form.visivel.checked,
        is_combo: this.isComboMode,
        itens_combo: this.isComboMode ? this.comboItems : [] // Grava o JSON do combo
      };

      if (this.isComboMode && this.comboItems.length === 0) {
        throw new Error("Um combo precisa de ter pelo menos 1 item adicionado.");
      }

      btnSubmit.innerHTML = 'A guardar dados...';

      if (this.editingId) {
        await db.update('produtos', this.editingId, produtoData);
      } else {
        await db.insert('produtos', [produtoData]);
      }

      modal.close();
      this.load(); // Recarrega a grelha
      alert('✅ Produto guardado com sucesso!');

    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('❌ Erro: ' + error.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

const produtosModule = new ProdutosModule();
window.produtosModule = produtosModule;