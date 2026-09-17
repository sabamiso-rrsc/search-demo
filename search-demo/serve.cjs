const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
http.createServer((request, response) => {
  let filename;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    filename = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  });
}).listen(8765, '127.0.0.1', () => console.log('http://127.0.0.1:8765/search-demo/'));
