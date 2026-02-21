function cleanText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cut(text, max = 240) {
  const normalized = cleanText(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

export function buildVoiceScript(item = {}, options = {}) {
  const intro = cleanText(options.intro, 'AI 快讯。');
  const title = cut(item.title || '未命名资讯', 100);
  const summary = cut(item.summary || '暂无摘要。', 260);
  const url = cleanText(item.url, '');

  const lines = [intro, `标题：${title}`, `摘要：${summary}`];
  if (url) lines.push(`详情：${url}`);
  return lines.join(' ');
}

export function createVoiceEnvelope(item = {}, options = {}) {
  const now = options.nowIso || new Date().toISOString();
  const channel = cleanText(options.channel, 'generic');
  const ttsProvider = cleanText(options.ttsProvider, 'system');
  const voice = cleanText(options.voice, 'default');

  return {
    id: cleanText(options.id, `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    channel,
    createdAt: now,
    item: {
      id: cleanText(item.id, ''),
      title: cleanText(item.title, 'Untitled'),
      summary: cleanText(item.summary, ''),
      url: cleanText(item.url, '')
    },
    tts: {
      provider: ttsProvider,
      voice,
      script: buildVoiceScript(item, { intro: options.intro })
    }
  };
}

export function listVoiceCandidates(feed = [], limit = 3) {
  const top = Array.isArray(feed) ? feed.slice(0, Math.max(1, limit)) : [];
  return top.map((item, idx) => ({
    rank: idx + 1,
    score: Number.isFinite(item?.score) ? item.score : 0,
    id: item?.id || `feed-${idx + 1}`,
    title: cleanText(item?.title, 'Untitled'),
    summary: cleanText(item?.summary, ''),
    url: cleanText(item?.url, '')
  }));
}
