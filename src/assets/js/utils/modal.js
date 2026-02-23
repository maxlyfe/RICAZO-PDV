/**
 * RICAZO - Sistema de Modais
 */

class ModalSystem {
  constructor() {
    this.currentModal = null;
    this.initStyles();
  }

  initStyles() {
    if (document.getElementById('modal-styles')) return;
    
    const styles = `
      <style id="modal-styles">
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
          animation: modalFadeIn 0.2s ease;
        }
        .modal-content {
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          overflow-y: auto;
          animation: modalSlideIn 0.3s ease;
        }
        .modal-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { opacity: 0; transform: translateY(-30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);
  }

  open(content) {
    this.close();
    const html = `
      <div class="modal-overlay" onclick="if(event.target === this) modal.close()">
        <div class="card modal-content">
          ${content}
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    this.currentModal = document.querySelector('.modal-overlay');
  }

  close() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(m => m.remove());
    this.currentModal = null;
  }

  // Helpers para formulários comuns
  formGroup(label, input) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        ${input}
      </div>
    `;
  }

  input(name, type = 'text', placeholder = '', required = false) {
    return `<input type="${type}" name="${name}" class="form-input" placeholder="${placeholder}" ${required ? 'required' : ''}>`;
  }

  select(name, options, required = false) {
    return `
      <select name="${name}" class="form-input" ${required ? 'required' : ''}>
        <option value="">Selecione...</option>
        ${options}
      </select>
    `;
  }

  actions(cancelText = 'Cancelar', submitText = 'Salvar') {
    return `
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="modal.close()">${cancelText}</button>
        <button type="submit" class="btn btn-primary">${submitText}</button>
      </div>
    `;
  }
}

const modal = new ModalSystem();
window.modal = modal;