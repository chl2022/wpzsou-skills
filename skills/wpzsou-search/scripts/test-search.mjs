#!/usr/bin/env node
import assert from 'node:assert/strict';
import { parseArgs, runSearch, sanitizeText } from './search.mjs';

// Fake public HTTP responses only: these checks never call the website or a database.
const ID = `tr_${'a'.repeat(32)}`;
const START = Date.parse('2026-01-01T00:00:00Z');
const rawLink = 'https://pan.baidu.com/s/raw-secret';
const item = (n, extra = {}) => ({ id: `es.item_${n}`, publicId: 1000 + n, title: `资源 ${n}`, provider: 'quark', kind: 'movie', ...extra });
const search = (items, extra = {}) => ({ source: 'remote', page: 1, hasNextPage: false, maxReachablePage: 8, items, ...extra });
const result = (extra = {}) => ({ delivery: 'converted', isDemo: false, url: 'https://pan.quark.cn/s/converted-demo', code: 'abcd', cacheHit: false, availableUntil: new Date(START + 300_000).toISOString(), ...extra });
const completed = (extra = {}) => ({ jobId: ID, status: 'succeeded', provider: 'quark', result: result(), ...extra });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

function fake(responses) {
  let time = START;
  const calls = [];
  return {
    calls,
    dependencies: {
      now: () => time,
      sleep: async (ms) => { time += ms; },
      fetch: async (url, init) => {
        calls.push({ url, init });
        assert.equal(new URL(url).origin, 'https://wpzsou.com');
        assert.equal(init.redirect, 'error');
        assert.equal(init.credentials, 'omit');
        assert.ok(!Object.keys(init.headers).some((key) => ['authorization', 'cookie', 'origin'].includes(key.toLowerCase())));
        const next = responses.shift();
        assert.ok(next, 'Unexpected request');
        return typeof next === 'function' ? next(url, init) : next;
      },
    },
  };
}

const checks = [];
async function check(name, task) { await task(); checks.push(name); }

await check('成功搜索使用 id 转链，白名单输出，忽略跨域 pollUrl', async () => {
  const client = fake([
    json(search([item(1, { title: `标题 ${rawLink} 提取码：secret`, description: `介绍 pan.quark.cn/s/source 私密 pwd=1234`, shareUrl: rawLink, accessCode: 'raw', telemetryToken: 'private' })])),
    json({ jobId: ID, status: 'queued', pollUrl: 'https://database.invalid/api/private', telemetryToken: 'private' }, 202),
    json(completed()),
  ]);
  const output = await runSearch({ query: '电影' }, client.dependencies);
  assert.equal(output.status, 'success');
  assert.equal(output.results[0].shareUrl, 'https://pan.quark.cn/s/converted-demo');
  assert.equal(output.results[0].accessCode, 'abcd');
  assert.equal(output.results[0].detailUrl, 'https://wpzsou.com/resource/1001');
  assert.equal(output.results[0].availableUntil, new Date(START + 300_000).toISOString());
  assert.deepEqual(JSON.parse(client.calls[1].init.body), { resourceId: 'es.item_1', provider: 'quark' });
  assert.equal(client.calls[1].init.headers['Content-Type'], 'application/json');
  assert.equal(client.calls[2].url, `https://wpzsou.com/api/transfers/${ID}`);
  const text = JSON.stringify(output);
  for (const secret of ['raw-secret', 'secret', '/s/source', '1234', 'telemetryToken', 'private', 'database.invalid']) assert.ok(!text.includes(secret), secret);
});

await check('每页只检查前 12 条，最多 limit 次提交，失败不扩充', async () => {
  const rows = Array.from({ length: 30 }, (_, n) => item(n + 1));
  rows[0].linkStatus = 'invalid';
  rows[1].provider = 'other';
  rows[2].isDemo = true;
  const client = fake([json(search(rows)), json(completed()), json({ jobId: ID, status: 'failed', error: { code: 'TRANSFER_SOURCE_UNAVAILABLE', message: rawLink, retryable: false } }, 202)]);
  const output = await runSearch({ query: '片名', limit: 2 }, client.dependencies);
  assert.equal(output.scannedCandidates, 12);
  assert.equal(output.transferAttempts, 2);
  assert.equal(output.status, 'partial');
  assert.equal(output.results.length, 2);
  assert.ok(!JSON.stringify(output).includes('raw-secret'));
  assert.equal(client.calls.length, 3);
});

await check('演示搜索不提交转链', async () => {
  const client = fake([json(search([item(1)], { source: 'demo' }))]);
  const output = await runSearch({ query: '片名' }, client.dependencies);
  assert.equal(output.status, 'failed');
  assert.equal(output.error.code, 'LIVE_SEARCH_REQUIRED');
  assert.equal(client.calls.length, 1);
});

await check('direct 和 demo 转链均不泄漏原链接', async () => {
  for (const override of [{ delivery: 'direct' }, { isDemo: true }, { isDemo: undefined }, { delivery: undefined }]) {
    const client = fake([json(search([item(1)])), json(completed({ result: result({ url: rawLink, ...override }) }), 202)]);
    const output = await runSearch({ query: '片名' }, client.dependencies);
    assert.equal(output.status, 'failed');
    assert.equal(output.results[0].error.code, 'CONVERTED_LINK_REQUIRED');
    assert.ok(!JSON.stringify(output).includes(rawLink));
    assert.ok(!('shareUrl' in output.results[0]));
  }
});

await check('过期、HTTP、非官方 host、带认证信息及错网盘链接拒绝', async () => {
  for (const override of [
    { availableUntil: new Date(START - 1).toISOString() }, { availableUntil: 'bad-date' },
    { url: 'http://pan.quark.cn/s/test' }, { url: 'https://pan.quark.cn.evil.invalid/s/test' },
    { url: 'https://secret:password@pan.quark.cn/s/test' }, { url: 'https://pan.baidu.com/s/test' },
  ]) {
    const client = fake([json(search([item(1)])), json(completed({ result: result(override) }), 202)]);
    const output = await runSearch({ query: '片名' }, client.dependencies);
    assert.equal(output.status, 'failed');
    assert.ok(!('shareUrl' in output.results[0]));
  }
});

await check('缺少过期时间可以返回，但不伪造期限', async () => {
  const client = fake([json(completed({ result: result({ availableUntil: undefined }) }), 202)]);
  const output = await runSearch({ resourceId: 'es.item_1', provider: 'quark' }, client.dependencies);
  assert.equal(output.status, 'success');
  assert.ok(!('availableUntil' in output.results[0]));
  assert.equal(output.requestedLimit, 1);
  assert.equal(client.calls.length, 1);
});

await check('429 保留 Retry-After，停止后续提交，POST 不重试', async () => {
  const client = fake([json(search([item(1), item(2)])), new Response('Too many requests', { status: 429, headers: { 'retry-after': '120' } })]);
  const output = await runSearch({ query: '片名', limit: 2 }, client.dependencies);
  assert.equal(output.status, 'failed');
  assert.equal(output.results[0].error.code, 'RATE_LIMITED');
  assert.equal(output.results[0].error.retryAfterSeconds, 120);
  assert.equal(output.results[1].error.code, 'RATE_LIMIT_ABORTED');
  assert.equal(output.results[1].error.retryAfterSeconds, 120);
  assert.equal(output.transferAttempts, 1);
  assert.equal(client.calls.length, 2);
});

await check('HTTP 200 任务失败中的限流也停止后续提交', async () => {
  const client = fake([json(search([item(1), item(2)])), json({ jobId: ID, status: 'queued' }, 202), json({ jobId: ID, status: 'failed', error: { code: 'TRANSFER_RATE_LIMITED', message: '转链请求过于频繁', retryable: true, retryAfterSeconds: 30 } })]);
  const output = await runSearch({ query: '片名', limit: 2 }, client.dependencies);
  assert.equal(output.results[0].error.code, 'TRANSFER_RATE_LIMITED');
  assert.equal(output.results[0].error.retryable, true);
  assert.equal(output.results[0].error.retryAfterSeconds, 30);
  assert.equal(output.results[1].error.code, 'RATE_LIMIT_ABORTED');
  assert.equal(output.transferAttempts, 1);
  assert.equal(client.calls.length, 3);
});

await check('网站筛选能力不足时警告，指定网盘绝不返回其它盘', async () => {
  const client = fake([json(search([item(1)], { capabilities: { providerFilter: false, kindFilter: false, updatedSort: false } }))]);
  const output = await runSearch({ query: '片名', provider: 'baidu', kind: 'movie', sort: 'updated_desc' }, client.dependencies);
  assert.equal(output.status, 'empty');
  assert.equal(output.transferAttempts, 0);
  assert.equal(output.warnings.length, 4);
  assert.ok(output.warnings.some((message) => message.includes('网盘筛选')));
  assert.ok(output.warnings.some((message) => message.includes('资源类型筛选')));
  assert.ok(output.warnings.some((message) => message.includes('按更新时间排序')));
  assert.equal(client.calls.length, 1);
});

await check('搜索 429 日期 Retry-After 和空搜索均正确处理', async () => {
  const client = fake([json({}, 429, { 'retry-after': new Date(START + 10_000).toUTCString() })]);
  const output = await runSearch({ query: '片名' }, client.dependencies);
  assert.equal(output.error.retryAfterSeconds, 10);
  const emptyClient = fake([json(search([]))]);
  const empty = await runSearch({ query: '片名' }, emptyClient.dependencies);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.transferAttempts, 0);
});

await check('轮询受单条预算限制且不会重新提交', async () => {
  let polls = 0;
  const client = fake([json(search([item(1)])), json({ jobId: ID, status: 'queued' }, 202), ...Array.from({ length: 6 }, () => () => { polls++; return json({ jobId: ID, status: 'reading_share' }); })]);
  const output = await runSearch({ query: '片名', timeout: 5 }, client.dependencies);
  assert.equal(output.results[0].error.code, 'TIMEOUT');
  assert.equal(output.transferAttempts, 1);
  assert.ok(polls <= 5);
});

await check('全程 180 秒预算限制，后续不提交', async () => {
  let clock = START;
  let calls = 0;
  const output = await runSearch({ query: '片名', timeout: 90, limit: 3 }, {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetch: async (url) => {
      calls++;
      if (url.includes('/api/search?')) return json(search([item(1), item(2), item(3)]));
      return json({ jobId: ID, status: 'queued' }, url.endsWith('/api/transfers') ? 202 : 200);
    },
  });
  assert.equal(clock - START, 180_000);
  assert.equal(output.transferAttempts, 2);
  assert.equal(output.results[2].error.code, 'TOTAL_TIMEOUT');
  assert.ok(calls < 200);
});

await check('响应大小和错误协议受到保护', async () => {
  const cases = [
    new Response('x', { headers: { 'content-type': 'text/html' } }),
    json({ wrong: true }),
    json({}, 200, { 'content-length': '2000001' }),
    new Response(`{"x":"${'x'.repeat(2_000_001)}"}`, { headers: { 'content-type': 'application/json' } }),
  ];
  for (const response of cases) {
    const client = fake([response]);
    const output = await runSearch({ query: '片名' }, client.dependencies);
    assert.equal(output.status, 'failed');
    assert.equal(client.calls.length, 1);
  }
  const client = fake([json(search([item(1)])), json({ jobId: '../private', status: 'queued' }, 202)]);
  const output = await runSearch({ query: '片名' }, client.dependencies);
  assert.equal(output.results[0].error.code, 'INVALID_TRANSFER_RESPONSE');
  assert.equal(client.calls.length, 2);
});

await check('参数验证与可达页信息，无自动翻页', async () => {
  const args = parseArgs(['--query', '科幻', '--provider', 'quark', '--kind', 'movie', '--sort', 'updated_desc', '--page', '2', '--limit', '1']);
  const client = fake([json(search([], { page: 2, hasNextPage: true }))]);
  const output = await runSearch(args, client.dependencies);
  const params = new URL(client.calls[0].url).searchParams;
  assert.equal(params.get('q'), '科幻');
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('provider'), 'quark');
  assert.equal(params.get('kind'), 'movie');
  assert.equal(output.hasNextPage, true);
  assert.equal(output.maxReachablePage, 8);
  assert.equal(client.calls.length, 1);
  for (const args of [[], ['--query', ''], ['--query', 'x', '--limit', '11'], ['x', '--timeout', '180'], ['x', '--page', '1foo'], ['--resource-id', '../private'], ['x', '--base-url', 'http://db'], ['x', '--provider', 'evil'], ['x', '--kind', 'bogus'], ['x', '--resource-id', 'other'], ['x', '--query', 'again']]) {
    assert.throws(() => parseArgs(args), { code: 'INVALID_ARGUMENT' });
  }
  assert.equal(sanitizeText('密码：abcd https://pan.quark.cn/s/source').includes('abcd'), false);
});

process.stdout.write(`${JSON.stringify({ passed: checks.length, checks, networkRequests: 0 }, null, 2)}\n`);
