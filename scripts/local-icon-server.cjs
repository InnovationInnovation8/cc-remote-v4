#!/usr/bin/env node
// Simple HTTP server that serves public/ files from local repo
// Used temporarily so bubblewrap init can fetch PNG icons during TWA generation
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const port = 8787;

const mimeTypes = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.html': 'text/html',
};

const server = http.createServer((req, res) => {
  const filePath = path.join(root, req.url.split('?')[0]);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log(`404: ${req.url}`);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
    console.log(`200: ${req.url} (${data.length} bytes)`);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local icon server: http://127.0.0.1:${port}/`);
  console.log(`Serving: ${root}`);
});
