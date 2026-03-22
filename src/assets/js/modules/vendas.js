/**
 * RICAZO - Módulo de Vendas (PDV + Caixa)
 */

class VendasModule {
  constructor() {
    this.unidadeAtual = null;
    this.mesas = [];
    this.vendasAbertas = [];
    this.produtos = [];
    this.formasPagamento = [];
  }

  async init(unidadeId) {
    this.unidadeAtual = unidadeId;
    await Promise.all([
      this.carregarMesas(),
      this.carregarVendasAbertas(),
      this.carregarProdutos(),
      this.carregarFormasPagamento()
    ]);
    this.render();
  }

  async carregarMesas() {
    try {
      const { data, error } = await db.getClient()
        .from('unidade_mesas')
        .select('*')
        .eq('unidade_id', this.unidadeAtual)
        .eq('ativa', true)
        .order('numero');

      if (error) throw error;
      this.mesas = data || [];
    } catch (error) {
      console.error('Erro ao carregar mesas:', error);
    }
  }

  async carregarVendasAbertas() {
    try {
      const { data, error } = await db.getClient()
        .from('vendas')
        .select(`*, itens:venda_itens(*, produto:produtos(nome, preco_base))`)
        .eq('unidade_id', this.unidadeAtual)
        .eq('status', 'aberta');

      if (error) throw error;
      this.vendasAbertas = data || [];
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    }
  }

  async carregarProdutos() {
    try {
      const { data, error } = await db.getClient()
        .from('produtos')
        .select(`*, preco:produto_precos(preco)`)
        .eq('ativo', true)
        .eq('visivel', true)
        .order('nome');

      if (error) throw error;
      
      // Filtra preço da unidade atual
      this.produtos = (data || []).map(p => {
        const precoUnidade = p.preco?.find(pr => pr.unidade_id === this.unidadeAtual);
        return {
          ...p,
          preco_venda: precoUnidade ? precoUnidade.preco : p.preco_base
        };
      });
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  }

  async carregarFormasPagamento() {
    try {
      const { data, error } = await db.getClient()
        .from('formas_pagamento')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      this.formasPagamento = data || [];
    } catch (error) {
      console.error('Erro ao carregar formas de pagamento:', error);
    }
  }

  render() {
    const container = document.getElementById('vendas-content');
    if (!container) return;

    const user = auth.getCurrentUser();
    const isCaixa = user.perfis.includes('caixa') || user.perfis.includes('dev');
    const isPDV = user.perfis.includes('pdv') || user.perfis.includes('dev');

    container.innerHTML = `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <h3 class="card-title">🍽️ Controle de Mesas</h3>
          <div style="display: flex; gap: 0.5rem;">
            <span style="
              background: var(--success);
              color: white;
              padding: 0.25rem 0.75rem;
              border-radius: 12px;
              font-size: 0.75rem;
            ">${this.mesas.filter(m => this.getStatusMesa(m.id) === 'livre').length} Livres</span>
            <span style="
              background: var(--warning);
              color: white;
              padding: 0.25rem 0.75rem;
              border-radius: 12px;
              font-size: 0.75rem;
            ">${this.mesas.filter(m => this.getStatusMesa(m.id) === 'ocupada').length} Ocupadas</span>
            <span style="
              background: var(--danger);
              color: white;
              padding: 0.25rem 0.75rem;
              border-radius: 12px;
              font-size: 0.75rem;
            ">${this.mesas.filter(m => this.getStatusMesa(m.id) === 'fechamento').length} Fechamento</span>
          </div>
        </div>
        <div class="mesas-grid">
          ${this.mesas.map(m => this.renderMesa(m)).join('')}
          
          <!-- BALCÃO (sempre disponível) -->
          <div class="mesa-card balcao" onclick="vendasModule.abrirBalcao()">
            <div class="mesa-numero">🛒</div>
            <div class="mesa-nome">Balcão</div>
            <div class="mesa-status livre">Venda Rápida</div>
          </div>
        </div>
      </div>

      ${isCaixa ? `
        <div class="card" style="margin-top: 2rem;">
          <div class="card-header">
            <h3 class="card-title">💰 Caixa - Aguardando Fechamento</h3>
          </div>
          <div id="caixa-fila">
            ${this.renderFilaCaixa()}
          </div>
        </div>
      ` : ''}
    `;
  }

  getStatusMesa(mesaId) {
    const venda = this.vendasAbertas.find(v => v.mesa_id === mesaId);
    if (!venda) return 'livre';
    if (venda.solicitou_fechamento) return 'fechamento';
    return 'ocupada';
  }

  renderMesa(mesa) {
    const status = this.getStatusMesa(mesa.id);
    const venda = this.vendasAbertas.find(v => v.mesa_id === mesa.id);
    const total = venda ? venda.itens.reduce((sum, item) => sum + (item.subtotal || 0), 0) : 0;

    const statusConfig = {
      livre: { cor: 'var(--success)', texto: 'Livre', icone: '✓' },
      ocupada: { cor: 'var(--warning)', texto: 'Ocupada', icone: '🍽️' },
      fechamento: { cor: 'var(--danger)', texto: 'Fechamento!', icone: '💰' }
    };

    const config = statusConfig[status];

    return `
      <div class="mesa-card ${status}" onclick="vendasModule.clicarMesa('${mesa.id}')">
        <div class="mesa-numero">${mesa.numero}</div>
        <div class="mesa-nome">${mesa.nome || `Mesa ${mesa.numero}`}</div>
        <div class="mesa-status" style="background: ${config.cor};">
          ${config.icone} ${config.texto}
        </div>
        ${venda ? `<div class="mesa-total">R$ ${total.toFixed(2)}</div>` : ''}
      </div>
    `;
  }

  renderFilaCaixa() {
    const fila = this.vendasAbertas.filter(v => v.solicitou_fechamento);
    
    if (fila.length === 0) {
      return '<p class="text-center" style="padding: 2rem; color: var(--text-muted);">Nenhuma mesa aguardando fechamento</p>';
    }

    return fila.map(v => {
      const mesa = this.mesas.find(m => m.id === v.mesa_id);
      const total = v.itens.reduce((sum, item) => sum + (item.subtotal || 0), 0);
      
      return `
        <div class="fila-caixa-item" onclick="vendasModule.fecharVenda('${v.id}')">
          <div>
            <strong>${mesa ? `Mesa ${mesa.numero}` : 'Balcão'}</strong>
            <div style="font-size: 0.875rem; color: var(--text-muted);">
              ${v.itens.length} item(s) • Solicitado às ${new Date(v.solicitou_fechamento_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">
              R$ ${total.toFixed(2)}
            </div>
            <button class="btn btn-sm btn-success" style="margin-top: 0.5rem;">
              💰 Fechar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  clicarMesa(mesaId) {
    const status = this.getStatusMesa(mesaId);
    const user = auth.getCurrentUser();

    if (status === 'livre') {
      // Abre nova mesa
      if (user.perfis.includes('pdv') || user.perfis.includes('dev')) {
        this.abrirMesa(mesaId);
      } else {
        alert('❌ Apenas PDV pode abrir mesas');
      }
    } else if (status === 'ocupada') {
      // Adiciona itens
      if (user.perfis.includes('pdv') || user.perfis.includes('dev')) {
        this.abrirMesa(mesaId);
      } else {
        alert('❌ Mesa ocupada - aguarde o garçom');
      }
    } else if (status === 'fechamento') {
      // Só caixa pode fechar
      if (user.perfis.includes('caixa') || user.perfis.includes('dev')) {
        const venda = this.vendasAbertas.find(v => v.mesa_id === mesaId);
        this.fecharVenda(venda.id);
      } else {
        alert('❌ Aguardando caixa para fechamento');
      }
    }
  }

  async abrirMesa(mesaId = null) {
    // Abre modal para adicionar itens
    const vendaExistente = this.vendasAbertas.find(v => v.mesa_id === mesaId);
    
    const mesa = mesaId ? this.mesas.find(m => m.id === mesaId) : null;
    const titulo = mesa ? `Mesa ${mesa.numero}` : 'Balcão';

    const itensAtuais = vendaExistente ? vendaExistente.itens.map(i => `
      <div class="item-venda">
        <span>${i.quantidade}x ${i.produto?.nome}</span>
        <span>R$ ${i.subtotal.toFixed(2)}</span>
      </div>
    `).join('') : '<p style="color: var(--text-muted);">Nenhum item</p>';

    const totalAtual = vendaExistente ? vendaExistente.itens.reduce((sum, i) => sum + i.subtotal, 0) : 0;

    const produtosOptions = this.produtos.map(p => `
      <option value="${p.id}" data-preco="${p.preco_venda}">
        ${p.nome} - R$ ${p.preco_venda.toFixed(2)} ${p.tipo_preco === 'peso' ? '/kg' : ''}
      </option>
    `).join('');

    const content = `
      <div class="card-header">
        <h3 class="card-title">🍽️ ${titulo}</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <h4 style="margin-bottom: 0.5rem;">Itens da Venda</h4>
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--border-radius); min-height: 150px; max-height: 200px; overflow-y: auto;">
            ${itensAtuais}
          </div>
          <div style="text-align: right; margin-top: 0.5rem; font-size: 1.25rem; font-weight: 700;">
            Total: R$ ${totalAtual.toFixed(2)}
          </div>
          ${vendaExistente ? `
            <button class="btn btn-warning w-full" style="margin-top: 1rem;" onclick="vendasModule.solicitarFechamento('${vendaExistente.id}')">
              🔔 Solicitar Fechamento
            </button>
          ` : ''}
        </div>
        
        <div>
          <h4 style="margin-bottom: 0.5rem;">Adicionar Item</h4>
          <form onsubmit="vendasModule.adicionarItem(event, '${vendaExistente?.id || ''}', '${mesaId || ''}')">
            ${modal.formGroup('Produto', `
              <select name="produto_id" class="form-input" required>
                <option value="">Selecione...</option>
                ${produtosOptions}
              </select>
            `)}
            
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.5rem;">
              ${modal.formGroup('Qtd/Peso', `<input type="number" step="0.001" name="quantidade" class="form-input" required placeholder="0" min="0.001">`)}
              ${modal.formGroup('Preço', `<input type="number" step="0.01" name="preco" class="form-input" required placeholder="0,00">`)}
            </div>
            
            <button type="submit" class="btn btn-primary w-full" style="margin-top: 0.5rem;">
              ➕ Adicionar
            </button>
          </form>
        </div>
      </div>
    `;
    
    modal.open(content);
  }

  async adicionarItem(event, vendaId, mesaId) {
    event.preventDefault();
    const form = event.target;
    
    const produtoId = form.produto_id.value;
    const quantidade = parseFloat(form.quantidade.value);
    const preco = parseFloat(form.preco.value);
    const subtotal = quantidade * preco;

    try {
      let venda = vendaId ? this.vendasAbertas.find(v => v.id === vendaId) : null;

      // Cria venda se não existir
      if (!venda) {
        const { data: novaVenda, error } = await db.getClient()
          .from('vendas')
          .insert([{
            unidade_id: this.unidadeAtual,
            tipo: mesaId ? 'mesa' : 'balcao',
            identificador: mesaId || 'Balcão',
            mesa_id: mesaId,
            status: 'aberta',
            total: 0,
            usuario_abertura_id: auth.getCurrentUser()?.id
          }])
          .select()
          .single();

        if (error) throw error;
        venda = novaVenda;
        venda.itens = [];
      }

      // Adiciona item
      await db.insert('venda_itens', [{
        venda_id: venda.id,
        produto_id: produtoId,
        quantidade: quantidade,
        preco_unitario: preco,
        subtotal: subtotal,
        usuario_id: auth.getCurrentUser()?.id
      }]);

      // Atualiza total
      const novoTotal = (venda.total || 0) + subtotal;
      await db.update('vendas', venda.id, { total: novoTotal });

      modal.close();
      await this.carregarVendasAbertas();
      this.render();
      
      // Reabre modal atualizado
      this.abrirMesa(mesaId);

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  async solicitarFechamento(vendaId) {
    if (!confirm('Confirmar solicitação de fechamento?')) return;

    try {
      await db.update('vendas', vendaId, {
        solicitou_fechamento: true,
        solicitou_fechamento_at: new Date().toISOString()
      });

      modal.close();
      await this.carregarVendasAbertas();
      this.render();
      alert('✅ Solicitação enviada ao caixa!');

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  async fecharVenda(vendaId) {
    const venda = this.vendasAbertas.find(v => v.id === vendaId);
    if (!venda) return;

    const total = venda.itens.reduce((sum, i) => sum + i.subtotal, 0);
    let valorPago = 0;
    const pagamentos = [];

    const atualizarModal = () => {
      const restante = total - valorPago;
      const container = document.getElementById('caixa-pagamento');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; margin-bottom: 1rem;">
            <div style="font-size: 2rem; font-weight: 700; color: ${restante > 0 ? 'var(--danger)' : 'var(--success)'};">
              ${restante > 0 ? `Falta: R$ ${restante.toFixed(2)}` : `Troco: R$ ${Math.abs(restante).toFixed(2)}`}
            </div>
          </div>
          
          ${restante > 0 ? `
            <form onsubmit="vendasModule.adicionarPagamento(event, '${vendaId}', ${total})">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                ${modal.formGroup('Forma', `
                  <select name="forma_id" class="form-input" required>
                    ${this.formasPagamento.map(fp => `<option value="${fp.id}">${fp.nome}</option>`).join('')}
                  </select>
                `)}
                ${modal.formGroup('Valor', `<input type="number" step="0.01" name="valor" class="form-input" required max="${restante}" placeholder="0,00">`)}
              </div>
              <button type="submit" class="btn btn-primary w-full" style="margin-top: 0.5rem;">
                ➕ Adicionar Pagamento
              </button>
            </form>
          ` : `
            <button class="btn btn-success w-full btn-lg" onclick="vendasModule.finalizarVenda('${vendaId}', ${total})">
              ✅ Finalizar Venda
            </button>
          `}
          
          ${pagamentos.length > 0 ? `
            <div style="margin-top: 1rem; background: var(--bg-secondary); padding: 1rem; border-radius: var(--border-radius);">
              <h4>Pagamentos:</h4>
              ${pagamentos.map(p => `
                <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                  <span>${p.forma}</span>
                  <span>R$ ${p.valor.toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        `;
      }
    };

    const content = `
      <div class="card-header">
        <h3 class="card-title">💰 Fechar Venda</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      
      <div style="margin-bottom: 1rem;">
        <h4>Resumo:</h4>
        ${venda.itens.map(i => `
          <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
            <span>${i.quantidade}x ${i.produto?.nome}</span>
            <span>R$ ${i.subtotal.toFixed(2)}</span>
          </div>
        `).join('')}
        <div style="border-top: 2px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem; font-size: 1.25rem; font-weight: 700; text-align: right;">
          Total: R$ ${total.toFixed(2)}
        </div>
      </div>
      
      <div id="caixa-pagamento">
        ${atualizarModal()}
      </div>
    `;
    
    modal.open(content);
    
    // Expõe função para o modal
    this.adicionarPagamento = (event, vid, tot) => {
      event.preventDefault();
      const form = event.target;
      const forma = this.formasPagamento.find(f => f.id === form.forma_id.value);
      const valor = parseFloat(form.valor.value);
      
      valorPago += valor;
      pagamentos.push({ forma: forma.nome, valor: valor });
      atualizarModal();
    };
  }

  async finalizarVenda(vendaId, total) {
    try {
      await db.update('vendas', vendaId, {
        status: 'fechada',
        data_fechamento: new Date().toISOString(),
        usuario_fechamento_id: auth.getCurrentUser()?.id
      });

      modal.close();
      await this.carregarVendasAbertas();
      this.render();
      alert('✅ Venda finalizada!');

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    }
  }

  abrirBalcao() {
    this.abrirMesa(null); // null = balcão
  }
}

const vendasModule = new VendasModule();
window.vendasModule = vendasModule;