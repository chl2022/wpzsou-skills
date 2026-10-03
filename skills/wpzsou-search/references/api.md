# 公开接口与客户端参数

服务固定为 `https://wpzsou.com`。本文件仅描述公开调用协议；无需数据库、ES 地址、服务器 SSH 或转链服务凭据。

## 客户端

```bash
node scripts/search.mjs --query "关键词" [--provider quark] [--kind course] [--sort updated_desc] [--page 1] [--limit 3] [--timeout 60]
node scripts/search.mjs --resource-id '搜索结果中的 resourceId' [--provider quark] [--timeout 60]
node scripts/search.mjs --help
```

| 参数 | 值与含义 |
| --- | --- |
| `--query` | 1–120 字符的关键词，与 `--resource-id` 二选一 |
| `--resource-id` | 搜索响应中的不透明 `id`，CLI 输出称 `resourceId` |
| `--provider` | `quark`、`baidu`、`aliyun`、`xunlei`、`other`；`other` 可用于搜索但无法转链 |
| `--kind` | `movie`、`series`、`anime`、`variety`、`documentary`、`software`、`course`、`ebook`、`other`；能力以网站响应为准 |
| `--sort` | `relevance`（默认）或 `updated_desc` |
| `--page` | 1–50，实际可达页数受网站搜索窗口限制，查看 `maxReachablePage` |
| `--limit` | 1–10，默认 3，表示最大转链提交次数 |
| `--timeout` | 5–90 秒，默认 60，单任务等待上限；整体固定上限 180 秒 |

stdout 始终输出 JSON。退出码：`success`、`partial`、`empty` 为 0；`failed` 为 1；参数错误为 2。调用方应同时读取 JSON 的 `status`，不能仅根据退出码判断是否有链接。

## 搜索

`GET /api/search?q=关键词&provider=quark&kind=course&sort=relevance&page=1`

省略可选筛选参数即可。响应含 `items`、`page`、`pageSize`、`hasNextPage`、`maxReachablePage`、`capabilities`、`source` 等。每条资源有 `id`、`publicId`（如有）、`title`、`provider` 及可选资料字段。`id` 用于转链，`publicId` 用于干净的 `/resource/数字` 详情地址。

只接受线上真实资源（`source: "remote"`），过滤明确失效和演示条目。普通搜索不返回原始分享链接与提取码。能力信息说明网站是否支持筛选和排序，不能据传入参数假定实际已经应用。

## 转链

`POST /api/transfers`，请求头必须是 `Content-Type: application/json`。请求体只接受：

```json
{"resourceId":"搜索响应 items 中的 id","provider":"quark"}
```

`provider` 可省略。不要发送原始分享地址、Cookie、数据库凭据或其他字段。

成功受理返回 HTTP 202，包含 `jobId`、`status` 及 `pollUrl`。轮询 `GET /api/transfers/<jobId>`，任务状态可能依次包括 `queued`、`validating_source`、`acquiring_provider_slot`、`reading_share`、`saving_to_account`、`creating_share`、`verifying_result`，最后为 `succeeded` 或 `failed`。

技能脚本根据合法 `jobId` 构造固定网站轮询路径，不盲目跟随响应中的 URL。遇到 POST 网络不确定性不会自动重发，避免重复转存。

## 结果约束

`succeeded` 的 `result` 包含 `url`、可选 `code`、`host`、`availableUntil`、`cacheHit`、`isDemo` 和 `delivery`。脚本仅允许 `delivery: "converted"`、非演示、HTTPS 网盘白名单地址，且有效时间尚未过期。

CLI 将其映射为 `shareUrl`、`accessCode`、`availableUntil`、`cacheHit`，并保留名称、网盘和网站详情链接。其他响应字段不会原样外传，标题和描述中的源链与提取码会被过滤。

分享地址有效期较短，以实际 `availableUntil` 为准；不长期缓存。网站负责真实转链及临时转存清理，客户端不管理网盘账号。

HTTP 429 与 `Retry-After` 表示限流；502、503、504 或转链 `failed` 表示服务/任务失败，不能解释为无资源。失败项只提供公开错误码、简明说明、可重试信息与网站详情地址，不回退原始链接。
