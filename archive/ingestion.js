const SOURCE_ITEMS = [
  {
    id: 'src-1',
    title: 'OpenAI releases new model update for developers',
    summary: 'API performance and tool-calling reliability improved in latest update.',
    source: 'openai-news',
    url: 'https://example.com/openai-update',
    publishedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  },
  {
    id: 'src-2',
    title: 'Google Gemini adds workspace productivity features',
    summary: 'New summarization and action extraction flow announced.',
    source: 'google-ai',
    url: 'https://example.com/gemini-workspace',
    publishedAt: new Date(Date.now() - 1000 * 60 * 75).toISOString()
  },
  {
    id: 'src-3',
    title: 'OpenAI releases new model update for developers',
    summary: 'Duplicate headline from another source to test dedupe.',
    source: 'ai-roundup',
    url: 'https://example.com/dup-openai-update',
    publishedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
  }
];

function normalize(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupe(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = normalize(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function score(item, topic = 'ai') {
  const topicHit = normalize(`${item.title} ${item.summary}`).includes(normalize(topic)) ? 20 : 0;
  const ageMinutes = Math.max(1, Math.floor((Date.now() - new Date(item.publishedAt).getTime()) / 60000));
  const freshness = Math.max(0, 100 - ageMinutes / 3);
  return Math.round(topicHit + freshness);
}

export function ingestAndRank(topic = 'ai') {
  const deduped = dedupe(SOURCE_ITEMS);
  return deduped
    .map((item) => ({ ...item, score: score(item, topic) }))
    .sort((a, b) => b.score - a.score);
}
