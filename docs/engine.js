export const MAX_AGE_MS = 5 * 60 * 1000;
export const money = fen => (fen / 100).toFixed(2);
export function budgetFen(value) {
  const text = String(value).trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) throw new Error('预算请填写最多两位小数的正数。');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0) throw new Error('预算需要大于 0 元。');
  return amount;
}
export function validateQuotes(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.options) || payload.options.length > 100) throw new Error('餐单需要包含 options 数组，最多 100 项。');
  if (typeof payload.storeName !== 'string' || !payload.storeName.trim() || payload.storeName.length > 120 || typeof payload.fulfillment !== 'string' || !payload.fulfillment.trim()) throw new Error('餐单缺少门店或取餐方式。');
  const demo = payload.source === 'synthetic-demo';
  if (!demo && payload.source !== 'mcp-calculate-price') throw new Error('无法识别餐单来源，请使用项目示例或 MCP 核价格式。');
  if (!demo) {
    if (typeof payload.quotedAt !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(payload.quotedAt)) throw new Error('核价时间需为带时区的 ISO 时间。');
    const age = now - Date.parse(payload.quotedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) throw new Error('这份报价已过期或时间有误，请重新核价后导入。');
  }
  const seen = new Set();
  const options = payload.options.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 160) throw new Error('每份餐单都需要有效的 id 和 name。');
    if (!Number.isSafeInteger(raw.amountFen) || raw.amountFen < 0 || raw.amountFen > 1000000) throw new Error('amountFen 必须是非负整数分。');
    if (raw.components !== undefined && (!Array.isArray(raw.components) || raw.components.length > 20 || raw.components.some(x => typeof x !== 'string' || x.length > 120))) throw new Error('餐品组成必须是短文本数组。');
    if (raw.quoteStatus !== (demo ? 'demo-only' : 'official-quoted') || seen.has(raw.id)) return [];
    seen.add(raw.id);
    let image = null; try { const u = new URL(raw.image); if (u.protocol === 'https:' && u.hostname === 'menu-img.mcd.cn' && !u.port && !u.username && !u.password && !u.search) image = u.href; } catch {}
    return [{image, id: raw.id, name: raw.name, amountFen: raw.amountFen, components: raw.components || [], tags: Array.isArray(raw.tags) ? raw.tags.filter(x => typeof x === 'string').slice(0, 12) : [], art: ['chicken', 'beef', 'fish', 'breakfast', 'wrap'].includes(raw.art) ? raw.art : 'chicken'}];
  });
  return {source: payload.source, storeName: payload.storeName.trim(), fulfillment: payload.fulfillment.trim().slice(0, 100), quotedAt: demo ? null : payload.quotedAt, options};
}
export function shortlist(payload, budget, exclusions = [], removed = [], now = Date.now()) {
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error('预算无效。');
  const normalized = validateQuotes(payload, now);
  const excluded = new Set(exclusions), deleted = new Set(removed);
  const affordable = normalized.options.filter(x => x.amountFen <= budget);
  const matches = affordable.filter(x => !x.tags.some(tag => excluded.has(tag)) && !deleted.has(x.id));
  // Prefer different main courses, then fill remaining places. No hidden budget increase.
  const sorted = [...matches].sort((a,b) => a.amountFen - b.amountFen || a.id.localeCompare(b.id));
  const selected = [], kinds = new Set();
  for (const option of sorted) { if (selected.length === 3) break; const kind = option.tags.find(x => ['chicken','beef','fish','breakfast','wrap'].includes(x)); if (!kind || !kinds.has(kind)) { selected.push(option); if (kind) kinds.add(kind); } }
  for (const option of sorted) { if (selected.length === 3) break; if (!selected.includes(option)) selected.push(option); }
  return {...normalized, budgetFen: budget, shortlist: selected, total: normalized.options.length, affordableCount: affordable.length, matchedCount: matches.length};
}
export function randomIndex(count, cryptoApi = globalThis.crypto) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error('没有可抽选的餐单。');
  const max = 0x100000000, limit = max - max % count, array = new Uint32Array(1);
  do { cryptoApi.getRandomValues(array); } while (array[0] >= limit);
  return array[0] % count;
}
export function plainSummary(result, selected) {
  return ['麦麦三选一 · 今天就吃这份', result.source === 'synthetic-demo' ? '离线演示｜虚构餐品与价格' : '导入报价｜请以官方实时结果为准', result.storeName, result.fulfillment, selected.name, ...selected.components, `餐单金额 ¥${money(selected.amountFen)} / 预算 ¥${money(result.budgetFen)}`, result.quotedAt ? `核价时间 ${result.quotedAt}` : '', '非官方参赛作品；不自动下单。'].filter(Boolean).join('\n');
}
const escapeXml = text => String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function shareSvg(result, selected) {
  const lines = plainSummary(result, selected).split('\n').flatMap(line => Array.from({length: Math.ceil([...line].length / 28)}, (_,i) => [...line].slice(i*28, (i+1)*28).join('')));
  const height = Math.max(600, 230 + lines.length * 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}"><rect width="720" height="${height}" fill="#f8f3e9"/><rect x="28" y="28" width="664" height="${height-56}" rx="24" fill="#fffdf8" stroke="#ded7c9"/><rect x="60" y="66" width="66" height="8" fill="#b83028"/><g font-family="sans-serif" fill="#2c2925">${lines.map((line,i)=>`<text x="60" y="${125+i*40}" font-size="${i===0?30:20}">${escapeXml(line)}</text>`).join('')}</g><text x="60" y="${height-65}" font-family="sans-serif" font-size="16" fill="#766b60">少一点纠结，多一点午餐的惊喜。</text></svg>`;
}
