# 发布与版本维护

只发布当前独立仓库中的技能文件。网站代码不在本仓库中，运行时只调用 `https://wpzsou.com`。不要复制网站目录、环境文件、运行数据库或真实搜索调试结果。

## 准备

1. 运行 `node skills/wpzsou-search/scripts/test-search.mjs`。
2. 用 `--query "恐怖星球" --provider quark --limit 1` 验证一条真实转链，核实 `status`、`converted` 和链接有效时间；不要把真实转链结果提交进仓库。
3. 更新 `SKILL.md` 中的 `metadata.version` 与根目录 `plugin.json` 中的 `version`。
4. 发布包必须包括完整 `skills/wpzsou-search/`；单技能 ZIP 使用顶层 `wpzsou-search/`。支持 Agent Plugins 的宿主可使用根目录 `plugin.json` 和 `skills/` 打包。

MIT-0 只授权技能说明、客户端脚本及配套文档，网站服务端与资源内容不包含在授权内。

## 发布渠道

| 渠道 | 正式入口与步骤 | 完成依据 |
| --- | --- | --- |
| GitHub | 建立独立公开仓库 `wpzsou-skills`，上传本仓库文件，创建 `v1.0.0` Release 并附技能 ZIP。添加 `agent-skills`、`cloud-drive`、`search` 等主题。[仓库创建](https://cli.github.com/manual/gh_repo_create)、[技能发布](https://cli.github.com/manual/gh_skill_publish) | 仓库与 Release 可匿名读取 |
| skills.sh | GitHub 发布后运行一次 `npx skills add GITHUB_OWNER/wpzsou-skills --skill wpzsou-search`。用真实 GitHub 用户名替换 `GITHUB_OWNER`。[官方 FAQ](https://skills.sh/docs/faq) | 安装成功；目录收录单独核实，可能需要等待 |
| ClawHub | [发布页](https://clawhub.ai/skills/publish)登录 GitHub 后上传完整技能目录；也可使用官方 `clawhub login`、`clawhub skill publish`。依照当前 CLI 帮助填写名称、slug、版本。[官方发布指南](https://docs.openclaw.ai/clawhub/publishing) | 区分上传成功、安全审核与公开可安装状态 |
| Smithery | 网站菜单 Publish → Skill，登录后提交公开 GitHub 技能路径。维护者也可使用所属 namespace 的技能 PUT API。[官方 API](https://smithery.ai/docs/api-reference/skills/create-or-update-a-skill) | 确认公开详情页与 listed 状态 |
| Skills Directory | [提交页](https://www.skillsdirectory.com/submit)通过 GitHub 登录后提交公开仓库 | 投稿完成后等待审核，公开详情出现才算收录 |
| SkillHub.club | [技能管理](https://www.skillhub.club/app/skills)登录后上传单技能 ZIP、检查资源，再发布。[CLI 文档](https://www.skillhub.club/docs/cli) | 区分私有草稿、公开发布和可安装状态 |
| ChatGPT / Codex 插件目录 | 将根目录 `plugin.json` 与 `skills/` 打包，在开发者平台上传技能插件。需要平台账号、验证发布身份及审核。[官方提交指南](https://developers.openai.com/plugins/deploy/submission) | 审核通过后正式公开发布 |

SkillsMP 等聚合目录可能自动发现 GitHub 的 `SKILL.md`，公开仓库本身不代表已被这些目录收录。不要为了增加数量将未登录、未投稿或未审核的渠道标为已发布。

## 投稿文案

名称：**云盘智搜 · 实时网盘搜索**

标识：`wpzsou-search`

中文介绍：通过云盘智搜 wpzsou.com 的公开接口实时搜索电影、剧集、动漫、教程、电子书和软件等网盘资源，并获取由网站转链后的分享地址、提取码和有效时间。零 npm 依赖，不需要 API Key 或网盘 Cookie，不连接数据库。

English: Search Chinese cloud-drive resources live through wpzsou.com and obtain website-converted share links with optional access codes and expiry times. A zero-dependency Node.js client; no API key, drive cookies, or database access.

建议标签：`agent-skills`、`cloud-drive`、`search`、`Chinese`、`quark`、`baidu`、`aliyun`、`xunlei`、`wpzsou`。

首版说明：新增实时站内搜索、网盘筛选、有限分页、网站转链、有效期展示、限流和失败处理。只输出正式转链结果，不公开网站实现或数据库配置。
