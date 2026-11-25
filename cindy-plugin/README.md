# Magpie 额度圆环（Cindy 通用版）

dsh-usage-rings 的 Cindy 插件版，用来取代 Magpie Usage。

- `magpie_usage`：读本机 Magpie 网关各账号额度、重置时间和余额，可按平台筛选
- `codex_reset_cards` / `codex_use_reset_card`：查看、使用 Codex 重置卡
- `workbuddy_checkin`：WorkBuddy 签到
- 右侧栏「Magpie 额度」面板：额度圆环、其他平台额度条、重置卡（点两次确认）、签到按钮，每分钟自动刷新

`node/quotas.mjs`、`node/reset-cards.mjs` 复制自仓库根目录的 `quotas.js`、`reset-cards.js`。
在 Cindy 里用插件开发工具安装本目录即可。
