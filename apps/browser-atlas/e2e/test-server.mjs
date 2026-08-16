import { createServer } from 'node:http';

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(204);
    response.end();
    return;
  }

  const title = request.url?.includes('target') ? 'Browser Atlas E2E Target' : 'Browser Atlas E2E Source';
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html><head><title>${title}</title></head><body><main>${title}</main></body></html>`);
});

server.listen(3161, '127.0.0.1');

/** Closes the local fixture server when Playwright stops its web-server process. */
function closeServer() {
  server.close();
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
