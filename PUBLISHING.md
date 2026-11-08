# 发布与版本维护

只发布当前独立仓库中的技能文件。网站代码不在本仓库中，运行时只调用 `https://wpzsou.com`。不要复制网站目录、环境文件、运行数据库或真实搜索调试结果。

## 准备

本次发布版本为 **1.1.0**。升级前核对（2026-11-08）：GitHub 已确认发布 1.0.0；skills.sh 已收录并以 GitHub 为安装源；其余下列渠道的发布状态待核验。候选包或版本号更新不代表线上发布完成。

1. 运行 `node skills/wpzsou-search/scripts/test-search.mjs`。
2. 用 `--query "恐怖星球" --provider quark --limit 1` 验证一条真实转链，核实 `status`、`converted` 和实际有效时间；明确回退分支使用模拟响应验证，不为制造失败反复转链。不要把真实转链结果提交进仓库。
3. 更新 `SKILL.md` 中的 `metadata.version` 与根目录 `plugin.json` 中的 `version`。
4. 发布包必须包括完整 `skills/wpzsou-search/`；单技能 ZIP 使用顶层 `wpzsou-search/`。支持 Agent Plugins 的宿主可使用根目录 `plugin.json` 和 `skills/` 打包。

MIT-0 只授权技能说明、客户端脚本及配套文档，网站服务端与资源内容不包含在授权内。

## 发布渠道

| 渠道 | 正式入口与步骤 | 完成依据 |
| --- | --- | --- |
| GitHub | 更新已有公开仓库 `chl2022/wpzsou-skills`，创建 `v1.1.0` Release 并附技能 ZIP。[Release 文档](https://cli.github.com/manual/gh_release_create) | 新版本源码与 Release 可匿名读取，ZIP 内容与版本一致 |
| skills.sh | 沿用已收录技能和 GitHub 来源。发布后核对 `npx skills add chl2022/wpzsou-skills --skill wpzsou-search` 获取的版本。[官方 FAQ](https://skills.sh/docs/faq) | 实际安装内容为 1.1.0；目录页面可能延迟同步 |
| ClawHub | [发布页](https://clawhub.ai/skills/publish)登录 GitHub 后上传完整技能目录；也可使用官方 `clawhub login`、`clawhub skill publish`。依照当前 CLI 帮助填写名称、slug、版本。[官方发布指南](https://docs.openclaw.ai/clawhub/publishing) | 区分上传成功、安全审核与公开可安装状态 |
| Smithery | 网站菜单 Publish → Skill，登录后提交公开 GitHub 技能路径。维护者也可使用所属 namespace 的技能 PUT API。[官方 API](https://smithery.ai/docs/api-reference/skills/create-or-update-a-skill) | 确认公开详情页与 listed 状态 |
| Skills Directory | [提交页](https://www.skillsdirectory.com/submit)通过 GitHub 登录后提交公开仓库 | 投稿完成后等待审核，公开详情出现才算收录 |
| SkillHub.club | [技能管理](https://www.skillhub.club/app/skills)登录后上传单技能 ZIP、检查资源，再发布。[CLI 文档](https://www.skillhub.club/docs/cli) | 区分私有草稿、公开发布和可安装状态 |
| ChatGPT / Codex 插件目录 | 将根目录 `plugin.json` 与 `skills/` 打包，在开发者平台上传技能插件。需要平台账号、验证发布身份及审核。[官方提交指南](https://developers.openai.com/plugins/deploy/submission) | 审核通过后正式公开发布 |

SkillsMP 等聚合目录可能自动发现 GitHub 的 `SKILL.md`，公开仓库本身不代表已被这些目录收录。不要为了增加数量将未登录、未投稿或未审核的渠道标为已发布。

## 投稿文案

名称：**云盘智搜 · 实时网盘搜索**

标识：`wpzsou-search`

中文介绍：通过云盘智搜 wpzsou.com 的公开接口实时搜索电影、剧集、动漫、教程、电子书和软件等网盘资源，获取分享地址、提取码和有效时间，并明确标注网站因新分享不可用而返回的原分享。零 npm 依赖，不需要 API Key 或网盘 Cookie，不连接数据库。

English: Search Chinese cloud-drive resources live through wpzsou.com and obtain share links with optional access codes and expiry times. Clearly labels original-share fallbacks explicitly returned by the website for unusable converted shares. A zero-dependency Node.js client; no API key, drive cookies, or database access.

建议标签：`agent-skills`、`cloud-drive`、`search`、`Chinese`、`quark`、`baidu`、`aliyun`、`xunlei`、`wpzsou`。

1.1.0 说明：兼容网站明确的 `unusable_converted_share` 原分享回退，以 `source_fallback` 和独立计数展示；继续拒绝普通直链、演示及不合规地址。每次独立取链且不缓存结果，按实际有效时间展示转换链接。修正关键词搜索的排序说明，旧 `updated_desc` 参数降为相关性排序并警告。不公开网站实现或数据库配置。
