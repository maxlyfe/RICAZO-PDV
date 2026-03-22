/**
 * RICAZO - Configuração Global
 */

/**
 * Prioridade de configuração:
 * 1. config.local.js (LOCAL_CONFIG) — desenvolvimento local (não vai para o git)
 * 2. window.ENV — injeção externa (Netlify functions, etc.)
 * 3. Fallback hardcoded — credenciais públicas (anon key) para produção
 *
 * NOTA: A SUPABASE_ANON_KEY é uma chave pública por design (Row Level Security
 * protege os dados). É seguro expô-la no frontend — Supabase recomenda isso.
 */
const PROD_FALLBACK = {
  SUPABASE_URL: 'https://ejvwsxoozfkymskwfqii.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdndzeG9vemZreW1za3dmcWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NjQzNjUsImV4cCI6MjA4NzM0MDM2NX0.pRQwAhU2b1tnjM3ftx3loYcJSl2cE1wpkcOAl-eiq3M'
};

const getConfig = () => {
  // 1. config.local.js (desenvolvimento)
  if (typeof LOCAL_CONFIG !== 'undefined' && LOCAL_CONFIG.SUPABASE_URL) {
    console.log('✅ Configuração local encontrada');
    return {
      SUPABASE_URL: LOCAL_CONFIG.SUPABASE_URL,
      SUPABASE_ANON_KEY: LOCAL_CONFIG.SUPABASE_ANON_KEY
    };
  }

  // 2. Variáveis injetadas externamente
  if (typeof window.ENV !== 'undefined' && window.ENV.SUPABASE_URL) {
    console.log('✅ Configuração via ENV encontrada');
    return {
      SUPABASE_URL: window.ENV.SUPABASE_URL,
      SUPABASE_ANON_KEY: window.ENV.SUPABASE_ANON_KEY
    };
  }

  // 3. Fallback de produção (anon key pública)
  console.log('✅ Usando configuração de produção');
  return PROD_FALLBACK;
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