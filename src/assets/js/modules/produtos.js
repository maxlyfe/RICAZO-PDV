/**
 * RICAZO - Módulo de Gestão de Produtos (Pesquisa Inteligente, Grid Cards e Soft Delete)
 */

class ProdutosModule {
  constructor() {
    this.produtos = [];
    this.editingId = null;
    this.isComboMode = false;
    this.comboItems = []; 
    this.termoBusca = ''; // Guarda o texto da pesquisa
  }

  // NOVO: Função de Mestre para remover acentos (Normalização NFD)
  removerAcentos(texto) {
    if (!texto) return '';
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  async load() {
    const container = document.getElementById('produtos-list');
    if (!container) return;

    // Remove o display grid fixo imposto pelo dashboard para o módulo gerir o seu próprio layout
    container.style.display = 'block'; 

    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select('*')
        .order('nome');

      if (error) throw error;
      
      // Filtramos e mostramos apenas os que NÃO estão marcados como excluídos
      this.produtos = (data || []).filter(p => p.excluido !== true);
      
      this.renderLayout(container);
      this.renderGrid();

    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger);">Erro ao carregar produtos.</div>`;
    }
  }

  // Desenha a Barra de Pesquisa e o Contentor da Grelha
  renderLayout(container) {
    container.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <div style="position: relative; max-width: 100%;">
          <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); font-size: 1.2rem; color: var(--text-muted);">🔍</span>
          <input type="text" class="form-input" id="busca-produtos" placeholder="Pesquisar produto ou combo por nome (ex: café ou cafe)..." 
                 onkeyup="produtosModule.filtrar(this.value)" 
                 style="padding-left: 2.8rem; height: 50px; font-size: 1.05rem; border-radius: var(--border-radius-lg); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); width: 100%;">
        </div>
      </div>
      
      <!-- GRELHA RESPONSIVA: auto-fill minmax faz os cartões ficarem lado a lado -->
      <div id="produtos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1.25rem;">
      </div>
    `;
  }

  // Atualiza o termo (já sem acentos e em minúsculas) e renderiza apenas os cartões
  filtrar(termo) {
    this.termoBusca = this.removerAcentos(termo.toLowerCase());
    this.renderGrid();
  }

  renderGrid() {
    const grid = document.getElementById('produtos-grid');
    if (!grid) return;

    // Filtra a lista comparando o termo digitado com o nome do produto (ambos sem acentos)
    const listaFiltrada = this.produtos.filter(p => {
      const nomeLimpo = this.removerAcentos(p.nome.toLowerCase());
      return nomeLimpo.includes(this.termoBusca);
    });

    if (listaFiltrada.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; padding: 4rem 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔎</div>
          <p>Nenhum produto encontrado para a sua pesquisa.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = listaFiltrada.map(p => `
      <div class="admin-produto-card animate-fade-in" style="background: var(--bg-card); border-radius: var(--border-radius-lg); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; transition: transform 0.2s;">
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <span style="font-size: 0.65rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 12px; text-transform: uppercase; background: ${p.ativo ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)'}; color: ${p.ativo ? 'var(--success)' : 'var(--danger)'}; border: 1px solid currentColor;">
              ● ${p.ativo ? 'Ativo' : 'Inativo'}
            </span>
            ${p.is_combo ? `<span style="font-size: 0.65rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 12px; text-transform: uppercase; background: var(--primary); color: white;">📦 Combo</span>` : ''}
          </div>
          
          <div style="display: flex; gap: 0.5rem;">
            <button style="background: var(--bg-secondary); border: 1px solid var(--border-color); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center;" onclick="produtosModule.openModal('${p.id}')" title="Editar Produto">✏️</button>
            ${(auth.isAdmin() || auth.isDev()) ? `
              <button style="background: rgba(220,53,69,0.05); border: 1px solid var(--danger); color: var(--danger); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center;" onclick="produtosModule.excluir('${p.id}')" title="Excluir Produto">🗑️</button>
            ` : ''}
          </div>
        </div>
        
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div style="width: 70px; height: 70px; border-radius: var(--border-radius); background: var(--bg-secondary); border: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 2rem; overflow: hidden; flex-shrink: 0;">
            ${p.imagem_url ? `<img src="${p.imagem_url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">` : '🥖'}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); line-height: 1.3; margin-bottom: 0.25rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${p.nome}">${p.nome}</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">
              R$ ${parseFloat(p.preco_base).toFixed(2)}
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">/ ${p.tipo_preco === 'peso' ? 'KG' : 'UN'}</span>
            </div>
          </div>
        </div>

      </div>
    `).join('');
  }

  async excluir(id) {
    if (!auth.isAdmin() && !auth.isDev()) {
      alert('❌ Sem permissão para excluir produtos.');
      return;
    }

    if (confirm('⚠️ ATENÇÃO: Tem a certeza que deseja excluir este produto/combo?\n\n- Se for um produto novo sem vendas, ele será apagado do banco de dados.\n- Se ele já tiver histórico de vendas, será inativado e ocultado para sempre da lista, mantendo a sua contabilidade segura.')) {
      try {
        const { error } = await db.getClient().from('produtos').delete().eq('id', id);
        
        if (error) {
          if (error.code === '23503' || error.message.includes('foreign key')) {
            await db.update('produtos', id, { ativo: false, visivel: false, excluido: true });
            alert('ℹ️ EXCLUSÃO INTELIGENTE:\nEste produto já possuía histórico de vendas. Ele foi excluído visualmente e inativado com sucesso. Os seus relatórios financeiros do passado continuam intactos!');
          } else {
            throw error; 
          }
        } else {
           alert('✅ Produto excluído definitivamente do banco de dados!');
        }
        
        this.load(); 

      } catch (error) {
        alert('❌ Erro ao excluir: ' + error.message);
      }
    }
  }

  openModal(id = null) {
    this.editingId = id;
    let p = { nome: '', preco_base: '', tipo_preco: 'unidade', imagem_url: '', ativo: true, visivel: true, is_combo: false, itens_combo: [] };
    
    if (id) {
      const prod = this.produtos.find(x => x.id === id);
      if (prod) p = { ...prod };
    }

    this.isComboMode = p.is_combo;
    this.comboItems = p.itens_combo ? [...p.itens_combo] : [];

    const opcoesProdutos = this.produtos
      .filter(prod => !prod.is_combo && !prod.excluido)
      .map(prod => `<option value="${prod.id}" data-tipo="${prod.tipo_preco}">${prod.nome} (R$ ${parseFloat(prod.preco_base).toFixed(2)})</option>`)
      .join('');

    const content = `
      <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 1rem; padding-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 class="card-title" id="modal-produto-title">${id ? '✏️ Editar' : '➕ Novo'} ${this.isComboMode ? 'Combo' : 'Produto'}</h3>
          <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
        </div>
        
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

        <div id="combo-builder-wrapper" style="display: ${this.isComboMode ? 'block' : 'none'};">
          <div style="border: 2px dashed var(--primary); padding: 1.5rem; border-radius: var(--border-radius); background: rgba(232, 145, 58, 0.05); margin-top: 0.5rem; margin-bottom: 1.5rem;">
            <h4 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">📋 Itens que compõem o Combo</h4>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: flex-end; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
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
    
    setTimeout(() => {
      this.atualizarInputQtdCombo();
      if (this.isComboMode) this.renderListaCombo();
    }, 10);
  }

  mudarAbaModal(isCombo) {
    this.isComboMode = isCombo;
    
    const btnSimples = document.getElementById('tab-simples');
    const btnCombo = document.getElementById('tab-combo');
    
    btnSimples.className = `btn btn-sm ${!isCombo ? 'btn-primary' : 'btn-ghost'}`;
    btnSimples.style.border = '1px solid var(--border-color)';
    btnCombo.className = `btn btn-sm ${isCombo ? 'btn-primary' : 'btn-ghost'}`;
    btnCombo.style.border = '1px solid var(--border-color)';

    const titleEl = document.getElementById('modal-produto-title');
    if (titleEl) titleEl.innerHTML = `${this.editingId ? '✏️ Editar' : '➕ Novo'} ${isCombo ? 'Combo' : 'Produto'}`;

    document.getElementById('container-tipo-preco').style.display = isCombo ? 'none' : 'block';
    document.getElementById('combo-builder-wrapper').style.display = isCombo ? 'block' : 'none';
    
    if (isCombo) this.renderListaCombo();
  }

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
      if (input.value === '1') input.value = '0.250';
    } else {
      input.step = '1';
      input.placeholder = 'Qtd';
      if (input.value.includes('.')) input.value = '1';
    }
  }

  adicionarItemCombo() {
    const prodId = document.getElementById('combo-select-produto').value;
    const qtd = parseFloat(document.getElementById('combo-input-qtd').value);

    if (prodId && qtd > 0) {
      const existente = this.comboItems.find(i => i.produto_id === prodId);
      if (existente) existente.quantidade += qtd;
      else this.comboItems.push({ produto_id: prodId, quantidade: qtd });
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

    if (this.comboItems.length === 0) listaHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">Nenhum produto adicionado ao combo ainda.</div>`;

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

      if (fileInput && fileInput.files.length > 0) {
        btnSubmit.innerHTML = 'A enviar imagem... ⏳';
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await db.getClient().storage.from('produtos').upload(fileName, file);
        if (uploadError) throw new Error('Falha no upload da imagem: ' + uploadError.message);

        const { data: publicUrlData } = db.getClient().storage.from('produtos').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      const produtoData = {
        nome: form.nome.value,
        preco_base: parseFloat(form.preco_base.value),
        tipo_preco: this.isComboMode ? 'unidade' : form.tipo_preco?.value,
        imagem_url: finalImageUrl,
        ativo: form.ativo.checked,
        visivel: form.visivel.checked,
        is_combo: this.isComboMode,
        itens_combo: this.isComboMode ? this.comboItems : [] 
      };

      if (this.isComboMode && this.comboItems.length === 0) throw new Error("Um combo precisa de ter pelo menos 1 item adicionado.");

      btnSubmit.innerHTML = 'A guardar dados...';

      if (this.editingId) await db.update('produtos', this.editingId, produtoData);
      else await db.insert('produtos', [produtoData]);

      modal.close();
      this.load(); 
      alert('✅ Produto guardado com sucesso!');

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

const produtosModule = new ProdutosModule();
window.produtosModule = produtosModule;