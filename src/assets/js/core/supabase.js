/**
 * RICAZO - Conexão com Supabase
 */

class SupabaseClient {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      try {
        this.client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log('✅ Supabase conectado');
      } catch (error) {
        console.error('❌ Erro Supabase:', error);
      }
    } else {
      console.warn('⚠️ Supabase não configurado');
    }
  }

  getClient() {
    return this.client;
  }

  isConnected() {
    return this.client !== null;
  }

  // Helpers para queries comuns
  async getAll(table, options = {}) {
    if (!this.client) throw new Error('Supabase não conectado');
    
    let query = this.client.from(table).select(options.select || '*');
    
    if (options.eq) {
      query = query.eq(options.eq.column, options.eq.value);
    }
    
    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending !== false });
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async insert(table, data) {
    if (!this.client) throw new Error('Supabase não conectado');
    const { data: result, error } = await this.client.from(table).insert(data).select();
    if (error) throw error;
    return result;
  }

  async update(table, id, data) {
    if (!this.client) throw new Error('Supabase não conectado');
    const { error } = await this.client.from(table).update(data).eq('id', id);
    if (error) throw error;
  }
}

const db = new SupabaseClient();
window.db = db;