🍞 RicaZo - Sistema de Gestão e PDV para Food Service

O RicaZo é um sistema completo, rápido e escalável de Ponto de Venda (PDV), Ponto de Produção (KDS), Gestão de Estoque e Business Intelligence (BI), desenhado especificamente para padarias, restaurantes e redes de quiosques.

Construído com uma arquitetura moderna Single Page Application (SPA) sem frameworks pesados, garantindo um desempenho em tempo real, mesmo em hardware modesto.

✨ Principais Funcionalidades

📊 Dashboard Administrativo & BI (Controlador Mestre)

Métricas em Tempo Real: Faturação diária, ticket médio e volume de vendas.

Auditoria de Turnos (Prevenção de Fraudes): Visualização de quebras e sobras de caixa, comparando o "Dinheiro Esperado" pelo sistema com o "Dinheiro Informado" pelo operador.

Desempenho da Equipa: Cálculo automático de vendas por funcionário e rateio proporcional de gorjetas/taxas de serviço.

Gestão Multi-Unidade: Controle dados de lojas, fábricas e quiosques num único painel, filtrando métricas por unidade.

💻 Módulo de Caixa (Frente de Loja)

Design Ergonómico (70/30): Layout otimizado para ecrãs touch, focando a atenção nos itens consumidos.

Gestão de Turnos: Abertura com troco inicial e contagem cega no fecho (Relatório Z).

Venda Rápida (Balcão): Grid visual de produtos com barra de pesquisa inteligente (ignora acentos) para lançamentos ultrarrápidos.

Rateio de Pagamentos: Suporte a múltiplos pagamentos na mesma comanda (ex: Parte em PIX, parte em Dinheiro).

Histórico e Reimpressão: Acesso imediato às últimas vendas do turno para conferência e reimpressão de talões.

📦 Gestão de Catálogo e Estoque

Produtos Simples e Combos: Suporte para produtos vendidos à unidade, ao peso (kg), ou combos (kits que descontam ingredientes no estoque).

Baixa Automática: O estoque é atualizado em tempo real assim que uma comanda é fechada.

Registo de Descartes: Controlo de quebras e perdas de produção.

🏭 Produção e Despacho (KDS)

Encaminhamento de pedidos para ecrãs de produção (cozinha/copa).

Mudança de status em tempo real (Pendente -> Em Preparo -> Concluído).

🛠️ Arquitetura e Tecnologias

O RicaZo foca-se na performance extrema e na manutenibilidade, utilizando o ecossistema Web nativo.

Frontend: HTML5, CSS3 (Variáveis CSS, CSS Grid/Flexbox) e Vanilla JavaScript (ES6+).

Padrão de Design: Modular JS (Classes e Orquestrador Central app.js).

Backend as a Service (BaaS): Supabase (PostgreSQL).

Autenticação: Supabase Auth com gestão de Perfis/Roles (Admin, Caixa, PDV, Produção).

Hospedagem: Preparado para Edge Delivery via Netlify ou Vercel.

Visualização de Dados: Chart.js para gráficos analíticos.

🚀 Como Executar o Projeto Localmente

Clonar o repositório:

git clone [https://github.com/seu-usuario/ricazo-pdv.git](https://github.com/seu-usuario/ricazo-pdv.git)
cd ricazo-pdv


Configurar as Variáveis de Ambiente:
Abra o ficheiro src/assets/js/core/config.js e insira as suas credenciais do Supabase:

const CONFIG = {
    SUPABASE_URL: 'sua-url-do-supabase',
    SUPABASE_KEY: 'sua-anon-key-do-supabase',
    // ...
};


Servir a aplicação:
Como é Vanilla JS, basta utilizar um servidor local simples, como o Live Server do VS Code, ou via terminal:

npx serve .


Acesso:
Abra o navegador em http://localhost:3000 (ou a porta atribuída pelo seu servidor).

🗄️ Estrutura da Base de Dados (Visão Geral)

O sistema depende de tabelas relacionais geridas no Supabase:

unidades, unidade_mesas

usuarios (Roles e permissões)

produtos, produto_precos

estoque, estoque_movimentacao, estoque_descartes

vendas, venda_itens, pagamentos

caixa_turnos

(O script de inicialização SQL encontra-se na documentação interna do projeto).

📱 Aplicativo Android (Capacitor)

O RicaZo PDV tem um APK Android que é um wrapper Capacitor: ele carrega `https://ricazo.netlify.app`
numa WebView. Por isso, mudanças de UI/lógica web NÃO precisam de rebuild do APK — entram ao vivo.
Rebuild só é necessário para: nova versão, mudança no `capacitor.config.json`, AndroidManifest ou plugins nativos.

**Recursos nativos** (em `src/assets/js/core/native.js`, só ativos dentro do APK):
- Auto-atualização: compara a versão instalada com `update-manifest.json` e mostra modal de update.
- Botão/gesto de voltar do Android: navega no histórico e pede confirmação antes de sair na tela inicial.

**Build do APK:**

```bash
npm install        # primeira vez (instala Capacitor)
npm run build:apk  # gera downloads/RicaZo PDV.apk
```

> ⚠️ O build usa o Java embutido no Android Studio (`C:/Program Files/Android/Android Studio/jbr`).
> O Android Studio precisa estar instalado.

**Processo de release:**
1. Bump `versionCode` (+1) e `versionName` (semver) em `android/app/build.gradle`.
2. Atualizar `update-manifest.json` com a nova `latestVersion` e as `notes`.
3. `npm run build:apk`.
4. `git add android/app/build.gradle update-manifest.json "downloads/RicaZo PDV.apk"` + commit + push.
5. Netlify publica → download disponível em `https://ricazo.netlify.app/downloads/RicaZo%20PDV.apk`.

📱 Responsividade

A interface foi construída com princípios de Mobile-First adaptativo. O Módulo de Caixa funciona perfeitamente em Tablets de 10", enquanto o Módulo PDV de lançamento (Garçom) é otimizado para ecrãs de Smartphones. O Dashboard Administrativo suporta visualização em Desktop para maior conforto na leitura de métricas.

Desenvolvido com ☕ e Código Limpo.