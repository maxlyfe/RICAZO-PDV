/**
 * RICAZO - Configuração Global
 */

const getConfig = () => {
  if (typeof LOCAL_CONFIG !== 'undefined') {
    console.log('✅ Configuração local encontrada');
    return {
      SUPABASE_URL: LOCAL_CONFIG.SUPABASE_URL,
      SUPABASE_ANON_KEY: LOCAL_CONFIG.SUPABASE_ANON_KEY
    };
  }

  if (typeof window.ENV !== 'undefined') {
    return {
      SUPABASE_URL: window.ENV.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: window.ENV.SUPABASE_ANON_KEY || ''
    };
  }

  return { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
};

const configData = getConfig();

const CONFIG = {
  SUPABASE_URL: configData.SUPABASE_URL,
  SUPABASE_ANON_KEY: configData.SUPABASE_ANON_KEY,
  
  APP_NAME: 'RicaZo',
  APP_VERSION: '1.0.0',
  DEFAULT_THEME: 'light',
  
  PERFIS: {
    DEV: 'dev',
    ADMIN: 'admin',
    CAIXA: 'caixa',
    PDV: 'pdv',
    PRODUCAO: 'producao'
  },
  
  PERFIS_COLORS: {
    dev: '#6F42C1',
    admin: '#DC3545',
    caixa: '#28A745',
    pdv: '#007BFF',
    producao: '#FD7E14'
  },
  
  PERFIS_LABELS: {
    dev: 'Desenvolvedor',
    admin: 'Administrador',
    caixa: 'Caixa',
    pdv: 'PDV',
    producao: 'Produção'
  },
  
  FORMAS_PAGAMENTO_PADRAO: [
    { id: 'dinheiro', nome: 'Dinheiro', prazo_recebimento: 0, ativo: true },
    { id: 'pix', nome: 'PIX', prazo_recebimento: 0, ativo: true },
    { id: 'credito', nome: 'Cartão de Crédito', prazo_recebimento: 30, ativo: true },
    { id: 'debito', nome: 'Cartão de Débito', prazo_recebimento: 1, ativo: true }
  ]
};

console.log('CONFIG:', {
  url: CONFIG.SUPABASE_URL ? '✅' : '❌',
  key: CONFIG.SUPABASE_ANON_KEY ? '✅' : '❌'
});

window.CONFIG = CONFIG;