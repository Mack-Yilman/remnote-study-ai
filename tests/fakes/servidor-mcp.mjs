import http from 'node:http';

export async function iniciar({ modo = 'json' } = {}) {
  const peticiones = [];

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let cuerpo = raw;
      try {
        cuerpo = JSON.parse(raw);
      } catch {
        // deja raw si no es JSON válido
      }
      peticiones.push({ headers: { ...req.headers }, cuerpo });

      if (modo === '401') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (cuerpo?.id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }

      let result = {};
      if (cuerpo.method === 'initialize') {
        result = {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'remnote', version: '1' },
        };
      } else if (cuerpo.method === 'tools/list') {
        result = { tools: [{ name: 'search_docs', inputSchema: { type: 'object' } }] };
      } else if (cuerpo.method === 'tools/call') {
        result = {
          content: [{ type: 'text', text: '{"ok":true}' }],
          structuredContent: { ok: true },
        };
      }

      const payload = JSON.stringify({ jsonrpc: '2.0', id: cuerpo.id, result });

      if (modo === 'sse') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`event: message\ndata: ${payload}\n\n`);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(payload);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    peticiones,
    cerrar: () => {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
