# 云盘智搜 Agent Skill · wpzsou-search

让支持 Agent Skills 的 AI **实时调用 [云盘智搜](https://wpzsou.com) 搜索网盘资源，并返回网站转链后的分享地址**。

这个仓库只发布技能说明与零依赖客户端脚本。网站源码、数据库实现、服务器配置、API 密钥及网盘账号均不在公开仓库中。客户端仅调用 wpzsou.com 的公开搜索和转链接口。

English: An Agent Skill for live Chinese cloud-drive resource search through wpzsou.com. Returns website-converted share links only. No website source code, database access, API keys, or drive-account credentials are included.

GitHub 主仓库：[chl2022/wpzsou-skills](https://github.com/chl2022/wpzsou-skills)。

## 环境与使用

需要 Node.js 18+（建议使用当前受支持版本）、终端执行能力和 HTTPS 网络访问；无需安装 npm 依赖，无需网站账号或 API Key。支持夸克、百度、阿里云盘、迅雷等站内资源，实际转链能力和资源数量以网站为准。

```bash
node skills/wpzsou-search/scripts/search.mjs --query "Python 入门" --limit 3
node skills/wpzsou-search/scripts/search.mjs --query "恐怖星球" --provider quark --limit 1
node skills/wpzsou-search/scripts/search.mjs --help
```

默认最多请求 3 条资源的转链。返回 JSON，成功项含作品名、网盘、`shareUrl`、可选 `accessCode`、`availableUntil` 以及网站详情地址。链接失效后需要重新获取；程序不会用原始资源链接替代转链失败的结果。

对 AI 可以说：

> 使用 wpzsou-search 帮我找 Python 入门教程，优先夸克网盘，返回 3 条转链后的分享地址、提取码和有效时间。

搜索的是网站当前资源库，并非每次查询都重新采集 TG 或全网。搜索、转链受网站限流、网盘状态及资源有效性影响；接口故障与“无匹配结果”会分别报告。

## 安装到 AI 工具

本仓库采用 [Agent Skills 开放规范](https://agentskills.io/specification)。技能目录为 `skills/wpzsou-search/`，安装时复制完整目录，不能只复制 `SKILL.md`。

使用 Skills CLI 从主仓库安装指定技能：

```bash
npx skills add chl2022/wpzsou-skills --skill wpzsou-search
```

按安装器提示选择 AI 工具及项目或全局安装范围。此命令从 GitHub 获取技能，不代表其他技能目录平台已收录。

下载或克隆本仓库后，在仓库根目录运行相应命令：

### Codex

```bash
mkdir -p ~/.agents/skills
cp -R skills/wpzsou-search ~/.agents/skills/wpzsou-search
```

在新会话中可使用 `$wpzsou-search`，或直接说明搜索需求让 AI 自动选择。

### Claude Code

```bash
mkdir -p ~/.claude/skills
cp -R skills/wpzsou-search ~/.claude/skills/wpzsou-search
```

使用 `/wpzsou-search` 或直接提出搜索需求。其他支持 Agent Skills 的工具可用各自的技能安装路径或 Skills CLI。

Windows 用户可以将技能目录复制到对应用户目录中的 `.agents/skills/` 或 `.claude/skills/`；脚本使用 Node.js，在 Windows、macOS、Linux 下采用同一调用方式。

## 参数、检查与发布包

完整使用规则见 [SKILL.md](skills/wpzsou-search/SKILL.md)，公开协议与参数见 [接口说明](skills/wpzsou-search/references/api.md)，平台投稿与版本维护见 [发布说明](PUBLISHING.md)。根目录 `plugin.json` 另提供 Agent Plugins 包装，复用同一个技能目录。

```bash
node skills/wpzsou-search/scripts/test-search.mjs
```

测试使用模拟公开接口，验证转链输出、失败处理、限流、时间预算和原始链接保护，不连接网站数据库。

## 许可边界

技能说明与客户端脚本使用 MIT-0 许可，详见 [LICENSE](LICENSE)。该许可只适用于此公开技能包，不授予网站源码、服务端实现、网盘资源内容或品牌的其他权利。资源数据和链接由网站在调用时提供。
