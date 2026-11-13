// Local manual QA only. No remote access or real HubSpot data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = {
  '/': [path.join(__dirname, 'fixture.html'), 'text/html'],
  '/fixture.js': [path.join(__dirname, 'fixture.js'), 'text/javascript'],
  '/content.js': [path.join(__dirname, '..', 'content.js'), 'text/javascript'],
};
http.createServer((req, res) => {
  const route = routes[req.url];
  if (!route) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': route[1] + '; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(fs.readFileSync(route[0]));
}).listen(4177, '127.0.0.1', () => console.log('Fixture: http://127.0.0.1:4177'));
