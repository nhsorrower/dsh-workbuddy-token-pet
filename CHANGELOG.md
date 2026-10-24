# Changelog

本项目的重要变更都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-25

首个公开版本。

### 新增

- 浮动桌宠：在页面角落实时显示当前会话的上下文占用、每步 token 消耗、缓存命中与累计消耗。
- **WorkBuddy 积分统计**：本步积分、本会话累计积分、账户剩余额度，国内版与国际版独立记账。
- 积分数据区分**实测值**（bridge 观测到的真实扣费，`measured: true`）与**估算值**（按模型费率计算，`measured: false`），两者不混算。
- 上下文占用取宿主 `contextPressure` 投影的 `projectedTokens`，与 GUI 环表同口径；启用压缩时另显示"压缩前"总量。
- 取值逐级回退：`projectedTokens` → `pressureTokens` → `surfaceTokens`，并在 `usedSource` 标明来源。
- 中英文界面（`locale/zh.json`、`locale/en.json`）。

### 依赖

- `dsh-workbuddy-bridge`（可选）：未安装时积分区域为空，其余功能正常，不报错。

### 已知边界

- 只读，不写入任何会话状态。
- 只统计当前会话，不跨会话累计。
- 仅在 Web 平台验证。
