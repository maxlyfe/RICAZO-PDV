/**
 * RicaZo - Módulo de Impressão Direta para Impressoras Térmicas
 *
 * Usa WebUSB API para enviar comandos ESC/POS diretamente à impressora,
 * eliminando completamente o diálogo de impressão do Chrome.
 *
 * Fallback: Se WebUSB não estiver disponível ou o usuário não parear
 * a impressora, usa window.print() normalmente.
 *
 * Compatível com: Epson, Bematech, Elgin, Star e genéricas ESC/POS 80mm.
 */

class ThermalPrinter {
  constructor() {
    this.device = null;
    this.interfaceNumber = 0;
    this.endpointOut = null;
    this.encoder = new TextEncoder();
    this.connected = false;
    this.MAX_CHARS = 48; // Colunas para 80mm (padrão ESC/POS)
  }

  // ==========================================
  // CONEXÃO USB
  // ==========================================

  /** Verifica se WebUSB está disponível */
  isSupported() {
    return 'usb' in navigator;
  }

  /** Solicita ao usuário parear a impressora (apenas 1 vez) */
  async connect() {
    if (!this.isSupported()) {
      console.warn('🖨️ WebUSB não suportado neste browser');
      return false;
    }

    try {
      // Solicita dispositivo USB (filtro genérico para impressoras)
      this.device = await navigator.usb.requestDevice({
        filters: [
          { classCode: 7 }, // Classe 7 = Impressoras
        ]
      });

      await this.device.open();

      // Encontrar interface e endpoint de saída
      const config = this.device.configuration;
      if (!config) {
        await this.device.selectConfiguration(1);
      }

      for (const iface of this.device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          if (alt.interfaceClass === 7) { // Printer class
            this.interfaceNumber = iface.interfaceNumber;
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out') {
                this.endpointOut = ep.endpointNumber;
              }
            }
          }
        }
      }

      if (this.endpointOut === null) {
        // Fallback: tentar primeiro endpoint OUT disponível
        for (const iface of this.device.configuration.interfaces) {
          for (const alt of iface.alternates) {
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out') {
                this.interfaceNumber = iface.interfaceNumber;
                this.endpointOut = ep.endpointNumber;
                break;
              }
            }
            if (this.endpointOut !== null) break;
          }
          if (this.endpointOut !== null) break;
        }
      }

      await this.device.claimInterface(this.interfaceNumber);
      this.connected = true;
      console.log('🖨️ Impressora conectada via USB:', this.device.productName);
      return true;

    } catch (error) {
      if (error.name === 'NotFoundError') {
        console.log('🖨️ Nenhuma impressora selecionada pelo usuário');
      } else {
        console.warn('🖨️ Erro ao conectar impressora:', error.message);
      }
      this.connected = false;
      return false;
    }
  }

  /** Tenta reconectar a impressoras já pareadas */
  async reconnect() {
    if (!this.isSupported()) return false;

    try {
      const devices = await navigator.usb.getDevices();
      if (devices.length > 0) {
        this.device = devices[0]; // Usa a primeira pareada
        await this.device.open();

        const config = this.device.configuration;
        if (!config) {
          await this.device.selectConfiguration(1);
        }

        for (const iface of this.device.configuration.interfaces) {
          for (const alt of iface.alternates) {
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out') {
                this.interfaceNumber = iface.interfaceNumber;
                this.endpointOut = ep.endpointNumber;
              }
            }
          }
        }

        await this.device.claimInterface(this.interfaceNumber);
        this.connected = true;
        console.log('🖨️ Reconectado a:', this.device.productName);
        return true;
      }
    } catch (error) {
      console.warn('🖨️ Reconexão falhou:', error.message);
    }

    this.connected = false;
    return false;
  }

  /** Desconecta a impressora */
  async disconnect() {
    if (this.device) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
        await this.device.close();
      } catch (e) { /* ignore */ }
      this.device = null;
      this.connected = false;
    }
  }

  // ==========================================
  // ENVIO DE DADOS RAW
  // ==========================================

  /** Envia bytes raw para a impressora */
  async sendRaw(data) {
    if (!this.connected || !this.device || !this.endpointOut) {
      throw new Error('Impressora não conectada');
    }
    const buffer = data instanceof Uint8Array ? data : this.encoder.encode(data);
    await this.device.transferOut(this.endpointOut, buffer);
  }

  /** Envia um array de comandos ESC/POS */
  async sendBytes(bytes) {
    await this.sendRaw(new Uint8Array(bytes));
  }

  // ==========================================
  // COMANDOS ESC/POS
  // ==========================================

  /** Inicializa a impressora */
  async init() {
    await this.sendBytes([0x1B, 0x40]); // ESC @ (reset)
  }

  /** Texto normal */
  async textNormal() {
    await this.sendBytes([0x1B, 0x21, 0x00]); // ESC ! 0
  }

  /** Texto negrito */
  async textBold() {
    await this.sendBytes([0x1B, 0x45, 0x01]); // ESC E 1
  }

  /** Desativar negrito */
  async textBoldOff() {
    await this.sendBytes([0x1B, 0x45, 0x00]); // ESC E 0
  }

  /** Texto grande (dupla altura + dupla largura) */
  async textLarge() {
    await this.sendBytes([0x1D, 0x21, 0x11]); // GS ! 0x11
  }

  /** Texto médio (dupla altura) */
  async textMedium() {
    await this.sendBytes([0x1D, 0x21, 0x01]); // GS ! 0x01
  }

  /** Voltar ao tamanho normal */
  async textSizeNormal() {
    await this.sendBytes([0x1D, 0x21, 0x00]); // GS ! 0x00
  }

  /** Alinhar centro */
  async alignCenter() {
    await this.sendBytes([0x1B, 0x61, 0x01]); // ESC a 1
  }

  /** Alinhar esquerda */
  async alignLeft() {
    await this.sendBytes([0x1B, 0x61, 0x00]); // ESC a 0
  }

  /** Alinhar direita */
  async alignRight() {
    await this.sendBytes([0x1B, 0x61, 0x02]); // ESC a 2
  }

  /** Imprime texto */
  async print(text) {
    await this.sendRaw(text);
  }

  /** Imprime texto + nova linha */
  async println(text = '') {
    await this.sendRaw(text + '\n');
  }

  /** Linha divisória tracejada */
  async divider() {
    await this.println('-'.repeat(this.MAX_CHARS));
  }

  /** Linha com texto à esquerda e à direita */
  async lineLeftRight(left, right) {
    const spaces = this.MAX_CHARS - left.length - right.length;
    const line = left + ' '.repeat(Math.max(spaces, 1)) + right;
    await this.println(line);
  }

  /** Avança N linhas */
  async feed(lines = 3) {
    await this.sendBytes([0x1B, 0x64, lines]); // ESC d N
  }

  /** Corta o papel (parcial) */
  async cut() {
    await this.feed(4);
    await this.sendBytes([0x1D, 0x56, 0x01]); // GS V 1 (partial cut)
  }

  /** Abre a gaveta de dinheiro */
  async openCashDrawer() {
    await this.sendBytes([0x1B, 0x70, 0x00, 0x19, 0xFA]); // ESC p 0
  }

  // ==========================================
  // IMPRESSÃO DE TICKETS FORMATADOS
  // ==========================================

  /**
   * Imprime ticket de venda completo via ESC/POS
   */
  async printTicket({ titulo, loja, endereco, data, caixa, pedido, identificador, itens, subtotal, taxaPercent, taxaValor, total, pagamentos, troco }) {
    try {
      await this.init();

      // === HEADER ===
      await this.alignCenter();
      await this.textLarge();
      await this.textBold();
      await this.println(titulo);
      await this.textSizeNormal();
      await this.textBoldOff();
      await this.println(loja);
      if (endereco) await this.println(endereco);
      await this.divider();

      // === INFO ===
      await this.alignLeft();
      await this.textBold();
      await this.println(`DATA: ${data}`);
      await this.println(`CAIXA: ${caixa}`);
      await this.println(`PEDIDO: ${pedido} - ${identificador}`);
      await this.textBoldOff();
      await this.divider();

      // === ITENS ===
      await this.textBold();
      await this.lineLeftRight('QTD PRODUTO', 'TOTAL');
      await this.textBoldOff();
      await this.divider();

      for (const item of itens) {
        const qtdNome = `${item.qtd} ${item.nome}`;
        const valor = `R$ ${item.total}`;
        await this.lineLeftRight(qtdNome.substring(0, this.MAX_CHARS - valor.length - 1), valor);
      }

      await this.divider();

      // === TOTAIS ===
      await this.lineLeftRight('SUBTOTAL:', `R$ ${subtotal}`);
      if (taxaValor && parseFloat(taxaValor) > 0) {
        await this.lineLeftRight(`TAXA SERV (${taxaPercent}%):`, `R$ ${taxaValor}`);
      }

      await this.textBold();
      await this.textMedium();
      await this.lineLeftRight('TOTAL A PAGAR:', `R$ ${total}`);
      await this.textSizeNormal();
      await this.textBoldOff();

      await this.println('');

      // === PAGAMENTOS ===
      for (const p of pagamentos) {
        await this.lineLeftRight(`${p.nome.toUpperCase()}:`, `R$ ${p.valor}`);
      }

      await this.textBold();
      await this.lineLeftRight('TROCO:', `R$ ${troco}`);
      await this.textBoldOff();
      await this.divider();

      // === FOOTER ===
      await this.alignCenter();
      await this.textBold();
      await this.println('OBRIGADO PELA PREFERENCIA!');
      await this.textBoldOff();
      await this.println(`${new Date().getFullYear()} - RicaZo`);

      // Corta e abre gaveta
      await this.cut();
      await this.openCashDrawer();

      return true;
    } catch (error) {
      console.error('🖨️ Erro ao imprimir ticket:', error);
      return false;
    }
  }

  /**
   * Imprime Relatório Z completo via ESC/POS
   */
  async printRelatorioZ({ loja, inicio, fim, opAbertura, opFecho, fundo, formas, totalProdutos, totalTaxas, totalGeral, dinheiroEsperado, dinheiroDeclarado, diferenca }) {
    try {
      await this.init();

      // === HEADER ===
      await this.alignCenter();
      await this.textLarge();
      await this.textBold();
      await this.println('RELATORIO Z');
      await this.textSizeNormal();
      await this.println('FECHO DE CAIXA');
      await this.textBoldOff();
      await this.divider();

      // === INFO DO TURNO ===
      await this.alignLeft();
      await this.textBold();
      await this.println(`LOJA: ${loja}`);
      await this.println(`ABERTURA: ${inicio}`);
      await this.println(`FECHO: ${fim}`);
      await this.println(`OP. ABERTURA: ${opAbertura}`);
      await this.println(`OP. FECHO: ${opFecho}`);
      await this.textBoldOff();
      await this.divider();

      // === RESUMO FINANCEIRO ===
      await this.alignCenter();
      await this.textBold();
      await this.println('RESUMO FINANCEIRO');
      await this.textBoldOff();
      await this.alignLeft();

      await this.lineLeftRight('FUNDO DE CAIXA:', `R$ ${fundo}`);
      await this.divider();

      await this.textBold();
      await this.println('RECEBIMENTOS DO TURNO:');
      await this.textBoldOff();
      for (const [forma, valor] of formas) {
        await this.lineLeftRight(`${forma.toUpperCase()}:`, `R$ ${valor}`);
      }
      await this.divider();

      await this.textBold();
      if (totalProdutos !== undefined) {
        await this.lineLeftRight('TOTAL PRODUTOS:', `R$ ${totalProdutos}`);
        await this.lineLeftRight('TOTAL TAXAS:', `R$ ${totalTaxas}`);
        await this.println('');
      }
      await this.textMedium();
      await this.lineLeftRight('TOTAL GERAL:', `R$ ${totalGeral}`);
      await this.textSizeNormal();
      await this.textBoldOff();
      await this.divider();

      // === AUDITORIA ===
      await this.alignCenter();
      await this.textBold();
      await this.println('AUDITORIA DE GAVETA');
      await this.textBoldOff();
      await this.alignLeft();

      await this.lineLeftRight('ESPERADO:', `R$ ${dinheiroEsperado}`);
      await this.lineLeftRight('DECLARADO:', `R$ ${dinheiroDeclarado}`);
      await this.divider();
      await this.textBold();
      await this.textMedium();
      await this.lineLeftRight('DIFERENCA:', `R$ ${diferenca}`);
      await this.textSizeNormal();
      await this.textBoldOff();
      await this.divider();

      // === FOOTER ===
      await this.alignCenter();
      await this.println('Relatorio gerado pelo RicaZo');

      await this.cut();
      return true;
    } catch (error) {
      console.error('🖨️ Erro ao imprimir Relatório Z:', error);
      return false;
    }
  }
}

// Instância global
const printer = new ThermalPrinter();
window.printer = printer;

// Tenta reconectar automaticamente a impressoras já pareadas
if (printer.isSupported()) {
  printer.reconnect().then(ok => {
    if (ok) console.log('🖨️ Impressora térmica pronta (modo direto)');
  });
}
