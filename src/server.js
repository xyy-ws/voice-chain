import http from 'node:http';
import { URL } from 'node:url';
import { ingestAndRank } from './ingestion.js';
import { fetchLatestAiRepos, fetchTrendingAiRepos, fetchTrendingReposByKeyword } from './github-source.js';
import { discoverSources } from './ai-discovery.js';
import { fetchSourceItems, probeSource } from './source-probe.js';
import { applyVoicePreferences } from './voice-config.js';
import { createVoiceEnvelope, listVoiceCandidates } from './voice-pipeline.js';
import { sendTelegramVoice } from './voice-telegram.js';
import { sendDiscordVoice } from './voice-discord.js';
import { dispatchVoice, getVoiceMetrics } from './voice-runtime.js';
import { transcribePreviousDiscordVoice, transcribePreviousTelegramVoice, transcribeTelegramVoiceMessage } from './voice-asr.js';
const restored = {};

let feed = ingestAndRank('ai');
let sources = Array.isArray(restored.sources)
  ? restored.sources.map((s) => ({ enabled: true, fetchMode: 'hybrid', ...s }))
  : [];
let sourceItems = Array.isArray(restored.sourceItems) ? restored.sourceItems : [];
let favorites = Array.isArray(restored.favorites) ? restored.favorites : [];

let messages = [];
let preferences = applyVoicePreferences(restored.preferences || {
  topics: ['ai'],
  pushTimes: ['09:00', '20:00'],
  channels: ['in-app', 'push'],
  refreshMinutes: 10
});

function persist() {
  // no-op: 当前版本改为内存态，不做本地持久化
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function sortedSources() {
  return [...sources]
    .map((s) => ({ enabled: true, fetchMode: 'hybrid', ...s }))
    .sort((a, b) => {
      const bt = b.lastItemAt ? new Date(b.lastItemAt).getTime() : 0;
      const at = a.lastItemAt ? new Date(a.lastItemAt).getTime() : 0;
      return bt - at;
    });
}

function upsertSourceItem(item) {
  const exists = sourceItems.some((x) => x.sourceId === item.sourceId && x.url === item.url);
  if (!exists) sourceItems = [item, ...sourceItems].slice(0, 5000);
  if (!exists) persist();
  return !exists;
}

async function collectSource(source, limit = 20) {
  const normalizedSource = { enabled: true, fetchMode: 'hybrid', ...source };
  if (!normalizedSource.enabled) return { ok: true, added: 0, items: [] };

  let rawItems = [];
  try {
    rawItems = await fetchSourceItems(normalizedSource, limit, { fetchTrendingReposByKeyword });
  } catch (error) {
    return { ok: false, error: String(error?.message || error), added: 0, items: [] };
  }

  const items = rawItems.map((it) => ({
    id: `itm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: normalizedSource.id,
    title: it.title,
    summary: it.summary || '暂无简介',
    url: it.url,
    publishedAt: it.publishedAt || nowIso(),
    createdAt: nowIso()
  }));

  let added = 0;
  for (const item of items) {
    if (upsertSourceItem(item)) added += 1;
  }

  const latest = items[0]?.publishedAt || nowIso();
  sources = sources.map((s) =>
    s.id === normalizedSource.id ? { ...s, lastFetchedAt: nowIso(), lastItemAt: latest, updatedAt: nowIso() } : s
  );
  persist();

  return { ok: true, added, items };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'info-push-api' });
  }

  if (req.method === 'GET' && url.pathname === '/v1/feed') {
    const topic = url.searchParams.get('topic') || preferences.topics?.[0] || 'ai';
    const limitRaw = Number(url.searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;

    if (url.searchParams.get('refresh') === '1') {
      feed = ingestAndRank(topic);
    }

    return json(res, 200, {
      items: feed.slice(0, limit),
      topic,
      limit,
      preferences
    });
  }

  if (req.method === 'GET' && url.pathname === '/v1/sources/home') {
    return json(res, 200, { items: sortedSources() });
  }

  if (req.method === 'GET' && url.pathname === '/v1/sources/github/latest') {
    const limit = Number(url.searchParams.get('limit') || '10');
    const result = await fetchLatestAiRepos(limit);
    return json(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/v1/sources/github/trending') {
    const limit = Number(url.searchParams.get('limit') || '10');
    const keyword = String(url.searchParams.get('keyword') || 'ai');
    const result = keyword === 'ai' ? await fetchTrendingAiRepos(limit) : await fetchTrendingReposByKeyword(keyword, limit);
    return json(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/v1/ai/discover-sources') {
    try {
      const payload = await readJsonBody(req);
      const query = String(payload?.query || 'ai');
      const limit = Number(payload?.limit || 20);
      const result = await discoverSources(query, limit);
      return json(res, 200, { ok: true, query, ...result });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/v1/sources') {
    return json(res, 200, { items: sortedSources() });
  }

  if (req.method === 'POST' && url.pathname === '/v1/sources') {
    try {
      const payload = await readJsonBody(req);
      const item = {
        id: payload.id || `src-${Date.now()}`,
        type: payload.type || 'custom',
        name: payload.name || 'Untitled Source',
        url: payload.url || '',
        reason: payload.reason || '',
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        fetchMode: payload.fetchMode || 'hybrid',
        enabled: payload.enabled !== false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastFetchedAt: null,
        lastItemAt: null
      };

      if (!item.url) return json(res, 400, { ok: false, error: 'url_required' });
      const exists = sources.some((s) => s.url === item.url);
      if (!exists) {
        const probe = await probeSource(item, { fetchTrendingReposByKeyword });
        if (!probe.ok) {
          return json(res, 400, {
            ok: false,
            error: probe.error,
            detail: probe.detail,
            message: probe.message
          });
        }

        sources = [item, ...sources].slice(0, 500);
      }
      persist();

      return json(res, 200, { ok: true, item, duplicated: exists });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const sourceIdMatch = url.pathname.match(/^\/v1\/sources\/([^/]+)$/);
  if (sourceIdMatch) {
    const sourceId = decodeURIComponent(sourceIdMatch[1]);
    const target = sources.find((s) => s.id === sourceId);
    if (!target) return json(res, 404, { ok: false, error: 'source_not_found' });

    if (req.method === 'PUT') {
      try {
        const payload = await readJsonBody(req);
        sources = sources.map((s) =>
          s.id === sourceId
            ? {
                ...s,
                name: payload.name ?? s.name,
                url: payload.url ?? s.url,
                type: payload.type ?? s.type,
                tags: Array.isArray(payload.tags) ? payload.tags : s.tags,
                fetchMode: payload.fetchMode ?? s.fetchMode,
                enabled: typeof payload.enabled === 'boolean' ? payload.enabled : s.enabled,
                updatedAt: nowIso()
              }
            : s
        );
        persist();
        return json(res, 200, { ok: true });
      } catch {
        return json(res, 400, { ok: false, error: 'invalid_json' });
      }
    }

    if (req.method === 'DELETE') {
      sources = sources.filter((s) => s.id !== sourceId);
      sourceItems = sourceItems.filter((it) => it.sourceId !== sourceId);
      persist();
      return json(res, 200, { ok: true });
    }
  }

  const sourceItemsMatch = url.pathname.match(/^\/v1\/sources\/([^/]+)\/items$/);
  if (sourceItemsMatch && req.method === 'GET') {
    const sourceId = decodeURIComponent(sourceItemsMatch[1]);
    const limitRaw = Number(url.searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 20;
    const items = sourceItems
      .filter((it) => it.sourceId === sourceId)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit);
    return json(res, 200, { items, limit, sourceId });
  }

  const sourceCollectMatch = url.pathname.match(/^\/v1\/sources\/([^/]+)\/collect$/);
  if (sourceCollectMatch && req.method === 'POST') {
    const sourceId = decodeURIComponent(sourceCollectMatch[1]);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return json(res, 404, { ok: false, error: 'source_not_found' });
    const limit = Number(url.searchParams.get('limit') || '20');
    const result = await collectSource(source, limit);
    return json(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/v1/favorites') {
    const items = [...favorites].sort((a, b) => new Date(b.favoritedAt).getTime() - new Date(a.favoritedAt).getTime());
    return json(res, 200, { items });
  }

  if (req.method === 'POST' && url.pathname === '/v1/favorites') {
    try {
      const payload = await readJsonBody(req);
      const fav = {
        id: payload.id || `fav-${Date.now()}`,
        sourceId: payload.sourceId || null,
        title: payload.title || 'Untitled',
        summary: payload.summary || '',
        url: payload.url || '',
        publishedAt: payload.publishedAt || null,
        favoritedAt: nowIso()
      };
      if (!fav.url) return json(res, 400, { ok: false, error: 'url_required' });
      const exists = favorites.some((x) => x.url === fav.url);
      if (!exists) favorites = [fav, ...favorites].slice(0, 2000);
      persist();
      return json(res, 200, { ok: true, item: fav, duplicated: exists });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const favMatch = url.pathname.match(/^\/v1\/favorites\/([^/]+)$/);
  if (favMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(favMatch[1]);
    favorites = favorites.filter((x) => x.id !== id);
    persist();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/v1/messages') {
    const limitRaw = Number(url.searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 50;
    const items = messages.slice(0, limit);
    const unreadCount = items.length;
    return json(res, 200, { items, unreadCount, limit });
  }

  if (req.method === 'GET' && url.pathname === '/v1/preferences') {
    return json(res, 200, { preferences });
  }

  if (req.method === 'POST' && url.pathname === '/v1/preferences') {
    try {
      const payload = await readJsonBody(req);
      preferences = applyVoicePreferences({ ...preferences, ...payload });
      persist();
      return json(res, 200, { ok: true, preferences });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/push/trigger') {
    const item = {
      id: `msg-${Date.now()}`,
      title: 'AI push (manual trigger)',
      body: 'MVP trigger endpoint is active.',
      createdAt: nowIso()
    };
    messages = [item, ...messages].slice(0, 50);
    return json(res, 200, { ok: true, message: item });
  }

  if (req.method === 'GET' && url.pathname === '/v1/voice/candidates') {
    const limitRaw = Number(url.searchParams.get('limit') || '3');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(10, Math.floor(limitRaw)) : 3;
    return json(res, 200, { items: listVoiceCandidates(feed, limit), limit });
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/envelope') {
    try {
      const payload = await readJsonBody(req);
      const candidate = payload?.item || feed[0] || {};
      const channel = payload?.channel || 'generic';
      const envelope = createVoiceEnvelope(candidate, {
        channel,
        ttsProvider: preferences?.voice?.tts?.provider,
        voice: preferences?.voice?.tts?.voice,
        intro: payload?.intro
      });
      return json(res, 200, { ok: true, envelope });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/telegram/send') {
    try {
      const payload = await readJsonBody(req);
      const candidate = payload?.item || feed[0] || {};
      const result = await sendTelegramVoice(candidate, {
        ...(preferences?.voice || {}),
        intro: payload?.intro
      });
      return json(res, result.ok ? 200 : 400, result);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/discord/send') {
    try {
      const payload = await readJsonBody(req);
      const candidate = payload?.item || feed[0] || {};
      const result = await sendDiscordVoice(candidate, {
        ...(preferences?.voice || {}),
        intro: payload?.intro
      });
      return json(res, result.ok ? 200 : 400, result);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/discord/transcribe-last') {
    try {
      const payload = await readJsonBody(req);
      const voice = preferences?.voice || {};
      const result = await transcribePreviousDiscordVoice({
        channelId: payload?.channelId || voice?.channels?.discord?.channelId,
        currentMessageId: payload?.currentMessageId || payload?.messageId,
        limit: payload?.limit || 30,
        botToken: payload?.botToken || voice?.channels?.discord?.botToken,
        asr: {
          ...(voice?.asr || {}),
          ...(payload?.asr && typeof payload.asr === 'object' ? payload.asr : {})
        }
      });
      return json(res, result.ok ? 200 : 400, result);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/telegram/transcribe-last') {
    try {
      const payload = await readJsonBody(req);
      const voice = preferences?.voice || {};
      const message = payload?.message || payload?.update?.message || payload?.update?.channel_post || null;
      const chatId = payload?.chatId || message?.chat?.id || voice?.channels?.telegram?.chatId;
      const messageId = payload?.currentMessageId || payload?.messageId || message?.message_id;
      const fileId = payload?.fileId || message?.voice?.file_id;
      const asr = {
        ...(voice?.asr || {}),
        ...(payload?.asr && typeof payload.asr === 'object' ? payload.asr : {})
      };

      const replyEnabled = payload?.reply !== undefined ? payload.reply : true;
      const baseOptions = {
        chatId,
        messageId,
        limit: payload?.limit || 30,
        botToken: payload?.botToken || voice?.channels?.telegram?.botToken,
        asr,
        reply: replyEnabled,
        replyPrefix: payload?.replyPrefix
      };

      const result = fileId
        ? await transcribeTelegramVoiceMessage({ ...baseOptions, fileId }, {})
        : await transcribePreviousTelegramVoice(baseOptions);

      return json(res, result.ok ? 200 : 400, result);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/voice/dispatch') {
    try {
      const payload = await readJsonBody(req);
      const candidate = payload?.item || feed[0] || {};
      const result = await dispatchVoice(candidate, {
        ...(preferences?.voice || {}),
        intro: payload?.intro
      });
      return json(res, result.ok ? 200 : 400, result);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/v1/voice/metrics') {
    return json(res, 200, { ok: true, metrics: getVoiceMetrics() });
  }

  if (req.method === 'GET' && url.pathname === '/v1/data/export') {
    return json(res, 200, {
      exportedAt: nowIso(),
      version: 1,
      data: { sources, sourceItems, favorites, preferences, messages }
    });
  }

  if (req.method === 'POST' && url.pathname === '/v1/data/import') {
    try {
      const payload = await readJsonBody(req);
      const mode = payload?.mode === 'merge' ? 'merge' : 'replace';
      const incoming = payload?.data || {};

      if (mode === 'replace') {
        sources = Array.isArray(incoming.sources) ? incoming.sources : [];
        sourceItems = Array.isArray(incoming.sourceItems) ? incoming.sourceItems : [];
        favorites = Array.isArray(incoming.favorites) ? incoming.favorites : [];
        messages = Array.isArray(incoming.messages) ? incoming.messages : [];
        preferences = incoming.preferences && typeof incoming.preferences === 'object'
          ? incoming.preferences
          : preferences;
      } else {
        const mergeBy = (base, extra, key) => {
          const map = new Map(base.map((x) => [x?.[key], x]));
          for (const item of extra) {
            const k = item?.[key];
            if (!k) continue;
            map.set(k, { ...(map.get(k) || {}), ...item });
          }
          return [...map.values()];
        };

        sources = mergeBy(Array.isArray(sources) ? sources : [], Array.isArray(incoming.sources) ? incoming.sources : [], 'id');
        sourceItems = mergeBy(Array.isArray(sourceItems) ? sourceItems : [], Array.isArray(incoming.sourceItems) ? incoming.sourceItems : [], 'id');
        favorites = mergeBy(Array.isArray(favorites) ? favorites : [], Array.isArray(incoming.favorites) ? incoming.favorites : [], 'id');
        messages = mergeBy(Array.isArray(messages) ? messages : [], Array.isArray(incoming.messages) ? incoming.messages : [], 'id').slice(0, 200);
        if (incoming.preferences && typeof incoming.preferences === 'object') {
          preferences = { ...preferences, ...incoming.preferences };
        }
      }

      persist();
      return json(res, 200, {
        ok: true,
        mode,
        counts: {
          sources: sources.length,
          sourceItems: sourceItems.length,
          favorites: favorites.length,
          messages: messages.length
        }
      });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  return json(res, 404, { ok: false, error: 'not_found' });
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`[info-push-api] listening on :${port}`);
});
