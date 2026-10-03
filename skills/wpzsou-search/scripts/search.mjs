#!/usr/bin/env node
// Only the public website is contacted; returned share links are never fetched.
import { pathToFileURL } from 'node:url';

const SITE = 'https://wpzsou.com';
const PROVIDERS = ['quark', 'baidu', 'aliyun', 'xunlei', 'other'];
const KINDS = ['movie', 'series', 'anime', 'variety', 'documentary', 'software', 'course', 'ebook', 'other'];
const SHARE_HOSTS = {
  quark: ['pan.quark.cn'], baidu: ['pan.baidu.com'],
  aliyun: ['alipan.com', 'www.alipan.com', 'aliyundrive.com', 'www.aliyundrive.com'],
  xunlei: ['pan.xunlei.com'],
};
const RESOURCE_ID = /^(?:[a-zA-Z0-9_-]{1,128}|es\.[a-zA-Z0-9_-]{2,700}|ps\.[a-zA-Z0-9_-]{32})$/;
const JOB_ID = /^tr_[a-zA-Z0-9_-]{32}$/;
const PENDING = new Set(['queued', 'validating_source', 'acquiring_provider_slot', 'reading_share', 'saving_to_account', 'creating_share', 'verifying_result']);

export const HELP = {
  usage: 'node scripts/search.mjs --query "关键词" [--provider quark] [--kind movie] [--page 1] [--limit 3] [--timeout 60]',
  singleResource: 'node scripts/search.mjs --resource-id "搜索结果中的 resourceId" [--provider quark]',
  options: { query: '1–120 字符；也可使用一个位置参数', provider: PROVIDERS, kind: KINDS, sort: ['relevance', 'updated_desc'], page: '1–50，默认 1', limit: '最多提交转链的条数，1–10，默认 3', timeout: '每条转链最多等待秒数，5–90，默认 60；全程最多 180 秒', help: '显示此说明' },
  notes: ['只检索指定页面的前 12 条候选，不自动翻页。', '仅返回本站转链后的非演示链接；直接源链接不返回。', '限流时停止提交，不自动重试 POST。'],
};

function fail(code, message, retryable = false, extra = {}) {
  return Object.assign(new Error(message), { code, retryable, ...extra });
}

export function sanitizeText(value, length = 1200) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/(?:https?:\/\/|ftp:\/\/|ed2k:\/\/|thunder:\/\/|pan:\/\/|magnet:\?|www\.)[^\s<>"'）)\]}]+/giu, '[链接已隐藏]')
    .replace(/(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|me|top|xyz|cloud|cc|tv)(?:\/[^\s<>"'）)\]}]*)?/giu, '[链接已隐藏]')
    .replace(/(?:提取码|提取密码|访问码|访问密码|分享密码|网盘密码|密码|access\s*code|password|pwd)\s*[:：=]?\s*[a-z0-9_-]{2,32}/giu, '[提取码已隐藏]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .trim().slice(0, length);
}

function integer(value, name, min, max) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw fail('INVALID_ARGUMENT', `${name} 必须是 ${min}–${max} 之间的整数`);
  }
  return Number(value);
}

export function parseArgs(args) {
  const options = { page: 1, limit: 3, timeout: 60, sort: 'relevance' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!arg.startsWith('-')) {
      if (options.query !== undefined) throw fail('INVALID_ARGUMENT', '关键词只能提供一次');
      options.query = arg;
      continue;
    }
    const key = arg === '-q' ? 'query' : arg.slice(2);
    if (!['query', 'resource-id', 'provider', 'kind', 'sort', 'page', 'limit', 'timeout'].includes(key) || !arg.startsWith('--') && arg !== '-q') throw fail('INVALID_ARGUMENT', '存在未知参数');
    if (seen.has(key) || key === 'query' && options.query !== undefined) throw fail('INVALID_ARGUMENT', '同一个参数只能提供一次');
    seen.add(key);
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) throw fail('INVALID_ARGUMENT', `${arg} 缺少值`);
    options[key === 'resource-id' ? 'resourceId' : key] = value;
  }
  return validateOptions(options);
}

function validateOptions(input) {
  const options = { page: 1, limit: 3, timeout: 60, sort: 'relevance', ...input };
  if (options.query !== undefined) options.query = String(options.query).normalize('NFC').trim();
  if (!!options.query === !!options.resourceId) throw fail('INVALID_ARGUMENT', '提供一个关键词，或单独提供 --resource-id');
  if (options.query && (options.query.length > 120 || /[\u0000-\u001f\u007f]/u.test(options.query))) throw fail('INVALID_ARGUMENT', '关键词必须为 1–120 字符且不能含控制字符');
  if (options.resourceId && (typeof options.resourceId !== 'string' || !RESOURCE_ID.test(options.resourceId))) throw fail('INVALID_ARGUMENT', '资源标识格式无效，请使用搜索结果中的 resourceId');
  if (options.provider !== undefined && !PROVIDERS.includes(options.provider)) throw fail('INVALID_ARGUMENT', '网盘类型无效');
  if (options.kind !== undefined && !KINDS.includes(options.kind)) throw fail('INVALID_ARGUMENT', '资源类型无效');
  if (!['relevance', 'updated_desc'].includes(options.sort)) throw fail('INVALID_ARGUMENT', '排序参数无效');
  options.page = integer(options.page, 'page', 1, 50);
  options.limit = integer(options.limit, 'limit', 1, 10);
  options.timeout = integer(options.timeout, 'timeout', 5, 90);
  if (options.resourceId) options.limit = 1;
  return options;
}

function publicError(error) {
  return {
    code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'REQUEST_FAILED',
    message: sanitizeText(error?.message, 300) || '请求失败，请稍后重试',
    retryable: error?.retryable === true,
    ...(Number.isFinite(error?.retryAfterSeconds) ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
  };
}

function retryAfter(header, now) {
  if (!header) return undefined;
  const numeric = /^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - now) / 1000);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

async function readJson(response, maxBytes) {
  if (!/\bapplication\/(?:[a-z0-9.+-]+\+)?json\b/i.test(response.headers.get('content-type') ?? '')) throw fail('INVALID_RESPONSE', '网站返回了非 JSON 响应', true);
  if (Number(response.headers.get('content-length')) > maxBytes) throw fail('RESPONSE_TOO_LARGE', '网站响应超出安全大小限制', true);
  if (!response.body) throw fail('INVALID_RESPONSE', '网站响应为空', true);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw fail('RESPONSE_TOO_LARGE', '网站响应超出安全大小限制', true);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw fail('INVALID_RESPONSE', '网站返回了无效 JSON', true); }
}

function metadata(item) {
  const publicId = Number.isSafeInteger(item.publicId) && item.publicId > 0 ? item.publicId : undefined;
  return {
    resourceId: item.id,
    title: sanitizeText(item.title, 250) || '未提供标题',
    ...(PROVIDERS.includes(item.provider) ? { provider: item.provider } : {}),
    ...(KINDS.includes(item.kind) ? { kind: item.kind } : {}),
    ...(typeof item.description === 'string' ? { description: sanitizeText(item.description) } : {}),
    detailUrl: `${SITE}/resource/${publicId ?? encodeURIComponent(item.id)}`,
  };
}

function convertedResult(job, item, now) {
  const result = job.result;
  if (!result || result.delivery !== 'converted' || result.isDemo !== false) throw fail('CONVERTED_LINK_REQUIRED', '网站未返回正式转链结果，已拒绝直接源链接和演示结果');
  const provider = job.provider ?? item.provider;
  if (!SHARE_HOSTS[provider] || item.provider && provider !== item.provider) throw fail('INVALID_CONVERTED_LINK', '转链结果的网盘类型不匹配');
  let url;
  try { url = new URL(result.url); } catch { throw fail('INVALID_CONVERTED_LINK', '转链结果链接格式无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !SHARE_HOSTS[provider].includes(url.hostname)) throw fail('INVALID_CONVERTED_LINK', '转链结果未通过官方网盘链接检查');
  if (result.availableUntil !== undefined && (typeof result.availableUntil !== 'string' || !Number.isFinite(Date.parse(result.availableUntil)) || Date.parse(result.availableUntil) <= now)) throw fail('CONVERTED_LINK_EXPIRED', '转链结果已过期，请重新获取', true);
  if (result.code !== undefined && (typeof result.code !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(result.code))) throw fail('INVALID_CONVERTED_LINK', '转链结果提取码格式无效');
  return {
    ...metadata(item), provider, status: 'converted', shareUrl: url.href,
    ...(result.code ? { accessCode: result.code } : {}),
    ...(result.availableUntil !== undefined ? { availableUntil: result.availableUntil } : {}),
    cacheHit: result.cacheHit === true,
  };
}

export async function runSearch(input, dependencies = {}) {
  const options = validateOptions(input);
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw fail('NODE_VERSION_REQUIRED', '请使用 Node.js 18 或更新版本');
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();
  const deadline = startedAt + 180_000;
  const output = {
    schemaVersion: 1, service: 'wpzsou', status: 'failed', source: options.resourceId ? 'transfer' : 'remote',
    page: options.resourceId ? null : options.page, hasNextPage: false, maxReachablePage: null,
    requestedLimit: options.limit, scannedCandidates: 0, transferAttempts: 0, convertedCount: 0,
    results: [], warnings: [], checkedAt: new Date(startedAt).toISOString(),
  };

  async function request(path, init = {}, localDeadline = deadline) {
    if (!path.startsWith('/api/search?') && path !== '/api/transfers' && !/^\/api\/transfers\/tr_[a-zA-Z0-9_-]{32}$/.test(path)) throw fail('INVALID_REQUEST_PATH', '请求路径无效');
    const remaining = Math.min(20_000, deadline - now(), localDeadline - now());
    if (remaining <= 0) throw fail('TIMEOUT', '已达到等待时间限制', true);
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(`${SITE}${path}`, { ...init, headers: { Accept: 'application/json', ...init.headers }, redirect: 'error', credentials: 'omit', signal: controller.signal });
          if (response.url && new URL(response.url).origin !== SITE) throw fail('INVALID_RESPONSE_ORIGIN', '响应来源与本站不一致');
          if (response.status === 429) {
            await response.body?.cancel().catch(() => {});
            throw fail('RATE_LIMITED', '网站正在限流，请在指定时间后重新运行', true, { httpStatus: 429, retryAfterSeconds: retryAfter(response.headers.get('retry-after'), now()) });
          }
          const data = await readJson(response, path.startsWith('/api/search?') ? 2_000_000 : 256_000);
          if (!response.ok) {
            const rateLimited = response.status === 429;
            const error = publicError(data?.error);
            throw fail(rateLimited ? 'RATE_LIMITED' : error.code, error.message, rateLimited || response.status >= 500 || error.retryable, {
              httpStatus: response.status,
              ...(rateLimited ? { retryAfterSeconds: retryAfter(response.headers.get('retry-after'), now()) } : {}),
            });
          }
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('INVALID_RESPONSE', '网站响应结构无效', true);
          return data;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail('TIMEOUT', '已达到等待时间限制', true)); }, remaining); }),
      ]);
    } catch (error) {
      if (error?.code) throw error;
      throw fail('NETWORK_ERROR', '无法连接本站公开接口，请稍后重试', true);
    } finally { clearTimeout(timer); }
  }

  try {
    let candidates;
    if (options.resourceId) candidates = [{ id: options.resourceId, ...(options.provider ? { provider: options.provider } : {}) }];
    else {
      const params = new URLSearchParams({ q: options.query, sort: options.sort, page: String(options.page) });
      if (options.provider) params.set('provider', options.provider);
      if (options.kind) params.set('kind', options.kind);
      const data = await request(`/api/search?${params}`);
      if (data.source !== 'remote') throw fail('LIVE_SEARCH_REQUIRED', '网站未返回正式资源库搜索结果，已拒绝演示或未知来源');
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.page) || data.page < 1 || data.page > 50 || typeof data.hasNextPage !== 'boolean' || !Number.isSafeInteger(data.maxReachablePage) || data.maxReachablePage < 1 || data.maxReachablePage > 50) throw fail('INVALID_RESPONSE', '搜索结果结构无效', true);
      output.page = data.page;
      output.hasNextPage = data.hasNextPage;
      output.maxReachablePage = data.maxReachablePage;
      if (options.provider && data.capabilities?.providerFilter === false) output.warnings.push('网站当前不支持网盘筛选；客户端仅处理与指定网盘一致的候选，无匹配时返回空结果。');
      if (options.kind && data.capabilities?.kindFilter === false) output.warnings.push('网站当前不支持资源类型筛选；此类型条件可能未生效，请结合返回的资源类型判断。');
      if (options.sort === 'updated_desc' && data.capabilities?.updatedSort === false) output.warnings.push('网站当前不支持按更新时间排序；返回顺序可能不是更新时间顺序。');
      const pageCandidates = data.items.slice(0, 12);
      output.scannedCandidates = pageCandidates.length;
      const seen = new Set();
      candidates = pageCandidates.filter((item) => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !RESOURCE_ID.test(item.id) || item.isDemo === true || item.linkStatus === 'invalid' || !SHARE_HOSTS[item.provider] || options.provider && item.provider !== options.provider || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).slice(0, options.limit);
      if (pageCandidates.length > candidates.length) output.warnings.push('仅处理最多指定条数的候选；无效、演示、重复或不支持转链的条目已过滤。');
    }
    if (options.resourceId) output.scannedCandidates = 1;
    if (!candidates.length) { output.status = 'empty'; return output; }

    let stopError;
    for (const item of candidates) {
      if (stopError) { output.results.push({ ...metadata(item), status: 'failed', error: publicError(stopError) }); continue; }
      try {
        if (item.provider === 'other') throw fail('TRANSFER_PROVIDER_UNSUPPORTED', '此来源暂不支持转链');
        const taskDeadline = Math.min(deadline, now() + options.timeout * 1000);
        output.transferAttempts++;
        let job = await request('/api/transfers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceId: item.id, ...(item.provider ? { provider: item.provider } : {}) }),
        }, taskDeadline);
        const jobId = job.jobId;
        if (!JOB_ID.test(jobId ?? '')) throw fail('INVALID_TRANSFER_RESPONSE', '网站返回了无效的转链任务标识');
        while (true) {
          if (job.jobId !== jobId) throw fail('INVALID_TRANSFER_RESPONSE', '转链任务标识发生变化');
          if (job.status === 'succeeded') { output.results.push(convertedResult(job, item, now())); output.convertedCount++; break; }
          if (job.status === 'failed') { const error = publicError(job.error); throw fail(error.code, error.message, error.retryable, { retryAfterSeconds: error.retryAfterSeconds }); }
          if (!PENDING.has(job.status)) throw fail('INVALID_TRANSFER_RESPONSE', '网站返回了未知的转链任务状态');
          const remaining = Math.min(deadline, taskDeadline) - now();
          if (remaining <= 0) throw fail('TIMEOUT', '该条转链等待超时，未返回源链接', true);
          await sleep(Math.min(1000, remaining));
          // Construct the path from the validated ID; never follow server pollUrl/Location.
          job = await request(`/api/transfers/${jobId}`, {}, taskDeadline);
        }
      } catch (error) {
        output.results.push({ ...metadata(item), status: 'failed', error: publicError(error) });
        if (error.httpStatus === 429 || error.code === 'TRANSFER_RATE_LIMITED') stopError = fail('RATE_LIMIT_ABORTED', '网站正在限流，已停止后续提交，请在指定时间后重新运行', true, { retryAfterSeconds: error.retryAfterSeconds });
        else if (now() >= deadline) stopError = fail('TOTAL_TIMEOUT', '已达到全程 180 秒限制，已停止后续提交', true);
      }
    }
    output.status = output.convertedCount === output.results.length ? 'success' : output.convertedCount ? 'partial' : 'failed';
    return output;
  } catch (error) {
    output.error = publicError(error);
    return output;
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.help ? HELP : await runSearch(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'failed') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, service: 'wpzsou', status: 'failed', error: publicError(error) }, null, 2)}\n`);
    process.exitCode = error?.code === 'INVALID_ARGUMENT' ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
