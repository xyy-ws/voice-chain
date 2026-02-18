import http from 'node:http';
import { URL } from 'node:url';
import { ingestAndRank } from './ingestion.js';

let feed = ingestAndRank('ai');

let messages = [];
let preferences = {
  topics: ['ai'],
  pushTimes: ['09:00', '20:00'],
  channels: ['in-app', 'push']
};

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'info-push-api' });
  }

  if (req.method === 'GET' && url.pathname === '/v1/feed') {
    const topic = url.searchParams.get('topic') || preferences.topics?.[0] || 'ai';
    if (url.searchParams.get('refresh') === '1') {
      feed = ingestAndRank(topic);
    }
    return json(res, 200, { items: feed, topic });
  }

  if (req.method === 'GET' && url.pathname === '/v1/messages') {
    return json(res, 200, { items: messages });
  }

  if (req.method === 'POST' && url.pathname === '/v1/preferences') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        preferences = { ...preferences, ...payload };
        return json(res, 200, { ok: true, preferences });
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/trigger') {
    const item = {
      id: `msg-${Date.now()}`,
      title: 'AI push (manual trigger)',
      body: 'MVP trigger endpoint is active.',
      createdAt: new Date().toISOString()
    };
    messages = [item, ...messages].slice(0, 50);
    return json(res, 200, { ok: true, message: item });
  }

  return json(res, 404, { ok: false, error: 'not_found' });
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`[info-push-api] listening on :${port}`);
});
