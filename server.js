/**
 * RICASO PDV - Servidor de Desenvolvimento
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);

  // Remove query strings
  let url = req.url.split('?')[0];
  
  // Se for raiz, redireciona para login
  if (url === '/' || url === '/src/') {
    url = '/src/pages/login/index.html';
  }
  
  // Constrói caminho do arquivo
  let filePath = path.join(__dirname, url);
  
  // Se não tiver extensão, tenta .html
  const extname = String(path.extname(filePath)).toLowerCase();
  if (!extname && !fs.existsSync(filePath)) {
    filePath += '.html';
  }
  
  // Se for pasta, procura index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // 404 - Page not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <h1>404 - Página não encontrada</h1>
          <p>Arquivo: ${filePath}</p>
          <a href="/src/pages/login/">Ir para Login</a>
        `);
      } else {
        res.writeHead(500);
        res.end('Erro interno: ' + error.code);
      }
    } else {
      // Sucesso
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║        🥖 RICASO PDV - Servidor Local          ║
║                                                ║
║   Acesse: http://localhost:${PORT}/src/pages/login/    ║
║                                                ║
║   Pressione Ctrl+C para parar                  ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});