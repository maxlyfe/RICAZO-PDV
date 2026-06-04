/**
 * RICAZO - Módulo de Gestão de Lojas e Fábricas (Com Telemetria em Tempo Real)
 */

class UnidadesModule {
  constructor() {
    this.unidades = [];
    this.vendasHoje = [];
    this.vendasAbertas = [];
    this.editingId = null;
  }

  // Função auxiliar usada pelo app.js para listar unidades no seletor inicial
  getAll() {
    return this.unidades;
  }

  async load() {
    const container = document.getElementById('unidades-list');
    if (!container) return;

    // Garante que o grid funciona na perfeição e se adapta ao ecrã
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    container.style.gap = '1.5rem';

    try {
      // 1. Calcular a data de hoje para os filtros de vendas
      const fusoOffset = new Date().getTimezoneOffset() * 60000;
      const hojeStr = new Date(Date.now() - fusoOffset).toISOString().split('T')[0];
      const dataInicioIso = `${hojeStr}T00:00:00.000Z`;

      // 2. Consultas PARALELAS ao Supabase para máxima velocidade
      const [resUnidades, resFechadas, resAbertas] = await Promise.all([
        db.getClient().from('unidades').select('*').order('nome'),
        db.getClient().from('vendas').select('unidade_id, total').eq('status', 'fechada').gte('data_fechamento', dataInicioIso),
        db.getClient().from('vendas').select('unidade_id, itens:venda_itens(subtotal)').eq('status', 'aberta')
      ]);

      if (resUnidades.error) throw resUnidades.error;

      this.unidades = resUnidades.data || [];
      this.vendasHoje = resFechadas.data || [];
      this.vendasAbertas = resAbertas.data || [];

      this.render(container);
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
      container.innerHTML = `<div class="text-center" style="color: var(--danger); grid-column: 1/-1;">❌ Erro ao carregar as Lojas e Fábricas.</div>`;
    }
  }

  render(container) {
    // Filtramos para não mostrar as que foram ocultadas (Soft Delete)
    const ativas = this.unidades.filter(u => u.visivel !== false);

    if (ativas.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; padding: 4rem 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🏪</div>
          <p>Nenhuma loja ou fábrica cadastrada.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = ativas.map(u => {
      // MÁGICA 1: Somar Vendas Fechadas (Hoje)
      const vendasDesta = this.vendasHoje.filter(v => v.unidade_id === u.id);
      const totalHoje = vendasDesta.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

      // MÁGICA 2: Somar Vendas Em Aberto (Mesas/Balcão rodando agora)
      const abertasDesta = this.vendasAbertas.filter(v => v.unidade_id === u.id);
      let totalAberto = 0;
      abertasDesta.forEach(v => {
         const sumItens = (v.itens || []).reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
         totalAberto += sumItens;
      });

      const tipoFormatado = this.formatTipoUnidade(u.tipo);
      const enderecoTxt = u.endereco ? ` • ${u.endereco}` : '';
      const icone = u.tipo === 'fabrica' ? '🏭' : '🏪';

      return `
        <div class="admin-produto-card animate-fade-in" style="background: var(--bg-card); border-radius: var(--border-radius-lg); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; transition: transform 0.2s; cursor: pointer;" onclick="app.entrarUnidade('${u.id}')" title="Aceder a ${u.nome}">
          
          <div style="padding: 1.5rem; flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
              <div style="width: 45px; height: 45px; border-radius: var(--border-radius); background: var(--bg-secondary); border: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                ${icone}
              </div>
              <span style="font-size: 0.65rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 12px; text-transform: uppercase; background: rgba(40,167,69,0.1); color: var(--success); border: 1px solid currentColor;">
                ● Ativa
              </span>
            </div>
            
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">${u.nome}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; height: 2.8em; overflow: hidden;">${tipoFormatado}${enderecoTxt}</div>

            <!-- SEÇÃO DE TELEMETRIA (VALORES REAIS) -->
            <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); margin-top: 1rem; padding-top: 1.5rem;">
              <div style="flex: 1; text-align: center; border-right: 1px solid var(--border-color); padding-right: 0.5rem;">
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.25rem;">
                  ${totalHoje > 0 ? `R$ ${totalHoje.toFixed(2)}` : '-'}
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Vendas Hoje</div>
              </div>
              
              <div style="flex: 1; text-align: center; padding-left: 0.5rem;">
                <div style="font-weight: 800; font-size: 1.1rem; color: ${totalAberto > 0 ? 'var(--warning)' : 'var(--text-primary)'}; margin-bottom: 0.25rem;">
                  ${totalAberto > 0 ? `R$ ${totalAberto.toFixed(2)}` : '-'}
                </div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Em Aberto</div>
              </div>
            </div>
          </div>

          <!-- AÇÕES DO RODAPÉ (COM STOP PROPAGATION PARA NÃO NAVEGAR ACIDENTALMENTE) -->
          <div style="background: var(--bg-secondary); padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 1rem; border-radius: 0 0 var(--border-radius-lg) var(--border-radius-lg);" onclick="event.stopPropagation();">
            <button class="btn-ghost" style="color: var(--primary); font-size: 0.85rem; font-weight: 700; padding: 0; border: none; cursor: pointer;" onclick="event.stopPropagation(); unidadesModule.openModal('${u.id}')">✏️ Editar</button>
            <button class="btn-ghost" style="color: var(--danger); font-size: 0.85rem; font-weight: 700; padding: 0; border: none; cursor: pointer;" onclick="event.stopPropagation(); unidadesModule.ocultar('${u.id}')">🗑️ Ocultar</button>
          </div>

        </div>
      `;
    }).join('');
  }

  formatTipoUnidade(tipo) {
    const tipos = { 'loja': 'Loja de Atendimento', 'fabrica': 'Fábrica / Matriz', 'quiosque': 'Quiosque Express' };
    return tipos[tipo] || tipo;
  }

  // ==========================================
  // FUNÇÕES DE CRIAÇÃO E EDIÇÃO
  // ==========================================
  async ocultar(id) {
    const unidade = this.unidades.find(u => u.id === id);
    if (!unidade) return;

    if (confirm(`⚠️ Deseja realmente ocultar a unidade "${unidade.nome}"?\n\nEla deixará de aparecer nas listas do sistema, mas o histórico financeiro será preservado.`)) {
      try {
        await db.update('unidades', id, { visivel: false });
        alert('✅ Unidade ocultada com sucesso!');
        this.load(); 
      } catch (error) {
        alert('❌ Erro ao ocultar unidade: ' + error.message);
      }
    }
  }

  formatarCnpj(valor) {
    // Remove tudo que não é dígito
    const digits = (valor || '').replace(/\D/g, '');
    if (!digits) return '';
    // Aplica máscara XX.XXX.XXX/XXXX-XX
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 18);
  }

  openModal(id = null) {
    this.editingId = id;
    let u = { nome: '', tipo: 'loja', endereco: '', cnpj: '' };

    if (id) {
      const uni = this.unidades.find(x => x.id === id);
      if (uni) u = { ...uni };
    }

    const content = `
      <div class="card-header">
        <h3 class="card-title">${id ? '✏️ Editar Unidade' : '➕ Nova Unidade (Loja/Fábrica)'}</h3>
        <button class="btn btn-ghost btn-sm" onclick="modal.close()">✕</button>
      </div>
      <form onsubmit="unidadesModule.save(event)">

        <div class="form-group">
          <label class="form-label">Nome da Unidade *</label>
          <input type="text" name="nome" class="form-input" required value="${u.nome}" placeholder="Ex: RicaZo Centro">
        </div>

        <div class="form-group">
          <label class="form-label">Tipo de Unidade *</label>
          <select name="tipo" class="form-input" required>
            <option value="loja" ${u.tipo === 'loja' ? 'selected' : ''}>🏪 Loja (Vende ao Público)</option>
            <option value="fabrica" ${u.tipo === 'fabrica' ? 'selected' : ''}>🏭 Fábrica / Matriz (Produz e Distribui)</option>
            <option value="quiosque" ${u.tipo === 'quiosque' ? 'selected' : ''}>📍 Quiosque (Ponto Rápido)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Endereço / Localização</label>
          <input type="text" name="endereco" class="form-input" value="${u.endereco || ''}" placeholder="Ex: Rua das Pedras, 10 - Búzios">
          <small style="color: var(--text-muted); margin-top: 0.25rem; display: block;">Esta informação sairá impressa nos talões/recibos.</small>
        </div>

        <div class="form-group">
          <label class="form-label">CNPJ <span style="color: var(--text-muted); font-weight: 400;">(opcional)</span></label>
          <input type="text" name="cnpj" class="form-input" value="${u.cnpj || ''}" placeholder="00.000.000/0000-00" maxlength="18"
            oninput="this.value = unidadesModule.formatarCnpj(this.value)">
          <small style="color: var(--text-muted); margin-top: 0.25rem; display: block;">Se preenchido, sairá impresso nos talões e no Relatório Z.</small>
        </div>

        ${modal.actions('Cancelar', 'Salvar Unidade')}
      </form>
    `;
    modal.open(content);
  }

  async save(event) {
    event.preventDefault();
    const form = event.target;
    const btnSubmit = form.querySelector('button[type="submit"]');
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'A guardar...';

    const dados = {
      nome: form.nome.value.trim(),
      tipo: form.tipo.value,
      endereco: form.endereco.value.trim(),
      cnpj: form.cnpj.value.trim() || null,
      visivel: true
    };

    try {
      if (this.editingId) {
        await db.update('unidades', this.editingId, dados);
        alert('✅ Unidade atualizada com sucesso!');
      } else {
        await db.insert('unidades', [dados]);
        alert('✅ Nova unidade criada!');
      }

      modal.close();
      this.load(); 

    } catch (error) {
      alert('❌ Erro: ' + error.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = 'Salvar Unidade';
    }
  }
}

const unidadesModule = new UnidadesModule();
window.unidadesModule = unidadesModule;