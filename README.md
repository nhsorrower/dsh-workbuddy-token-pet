# dsh-workbuddy-token-pet

**DeepSeek​ Harness 的浮动桌宠：实时显示当前会话的上下文占用、每步 token 消耗，并统计 WorkBuddy 每一步实际扣掉的积分与账户剩余额度。**

> A floating pet for DeepSeek​ Harness — live context occupancy, per-step token spend, and the WorkBuddy credits each step was actually billed plus the remaining balance.

---

## ⭐ 核心能力：WorkBuddy 积分统计

这是它区别于普通 token 显示器的地方。装上 [`dsh-workbuddy-bridge`](#-积分功能需要另装-dsh-workbuddy-bridge) 之后：

| 能看到的 | 说明 |
|---|---|
| **本步花了多少积分** | 优先取 bridge 观测到的**真实扣费值**；bridge 还没看到的步才按模型费率估算，两种来源在数据里可区分 |
| **本会话累计积分** | 这一整段对话从开始到现在一共扣了多少 |
| **账户剩余积分** | 直接读账户余额，不用切到别处查 |
| **哪些步没算进积分** | 免费预览、零费率模型等单独统计，不混进总数；bridge 没见过的步保持"未计价"而不是记成 0 |
| **国内版 / 国际版分开算** | `workbuddy` 与 `workbuddy-ai` 两个版本各自独立记账，永不混算 |

> ### ⚠️ 积分功能需要另装 dsh-workbuddy-bridge
>
> ```bash
> dsh plugin --profile <your-profile> add dsh-workbuddy-bridge
> ```
>
> **没装会怎样？** 桌宠照常工作——上下文占用、每步 token、缓存命中全部正常显示，只是积分区域为空。不报错、不崩溃、不拖慢页面。

---

## 上下文口径：和 GUI 环表一致

DSH 自带的上下文环表只告诉你"还剩多少"。桌宠显示的是**压缩之后真实发给模型的那个量**——取宿主 `contextPressure` 投影里的 `projectedTokens`，不是未压缩的表面总量。

开了上下文压缩（比如 `billion-context`）时，会多一行"压缩前"，方便判断压缩到底起没起作用。

取值优先级：`projectedTokens` → `pressureTokens` → `surfaceTokens`，逐级回退，并在 `usedSource` 字段里标明这次用的是哪一级。

---

## 安装

### 方式一：从 GitHub 安装（需要本机装有 Git）

```bash
dsh plugin --profile <your-profile> add github:nhsorrower/dsh-workbuddy-token-pet#v0.1.0
```

> `github:` 这种写法要先由 pnpm 用 `git ls-remote` 解析版本，**本机没装 Git 会直接失败**：
> `[ERR_PNPM_GIT_RESOLVE_FAILED] git ls-remote failed: 'git' 不是内部或外部命令`。
> 遇到这个报错就改用方式二。

### 方式二：下载 tgz 安装（不需要 Git）

在 [Releases](https://github.com/nhsorrower/dsh-workbuddy-token-pet/releases/latest) 页面底部 **Assets** 里下载
`dsh-workbuddy-token-pet-0.1.0.tgz`，然后：

```bash
dsh plugin --profile <your-profile> add <下载目录>/dsh-workbuddy-token-pet-0.1.0.tgz
```

### 方式三：从 npm 安装

```bash
dsh plugin --profile <your-profile> add dsh-workbuddy-token-pet
```

> 截至 v0.1.0 尚未发布到 npm，这条暂时不可用。

### 桌面版

在 **设置 → 插件** 里安装，不要用命令行——桌面版的 profile 归应用自己的插件管理器所有。

装完**重启宿主**。DSH 的插件是启动时组合的，热重载不覆盖新增的 bundle。

---

## 显示内容

| 项目 | 含义 |
|---|---|
| 占用环 | 当前会话在上下文窗口里占了多少，与 GUI 环表同口径 |
| 压缩前 | 若启用了上下文压缩，另附一行未压缩的表面总量 |
| 每步 | 最近若干步的输入 / 输出 / 缓存命中 token |
| 累计 | 本会话累计消耗的 token |
| 积分消耗 | 本步与累计的 WorkBuddy 积分花费（需 bridge） |
| 剩余积分 | 账户当前余额（需 bridge） |

---

## 版本要求

| 项目 | 要求 |
|---|---|
| DeepSeek​ Harness | `>= 0.2.0-rc.2`（在 0.2.1-rc.3 上实测可用） |
| `dsh-workbuddy-bridge` | 可选，仅积分功能需要 |

---

## 它是怎么工作的

宿主侧（`index.js`）注册一个只读 JSON 端点：

```
GET /plugins/token-pet/state?session=<sessionId>&provider=<workbuddy|workbuddy-ai>
```

客户端（`client.js`）轮询它，渲染成页面角落的浮动卡片。

**全程只读**：不写入任何会话事件，不向外部发请求，除了读同一宿主里 bridge 的本地状态路由。

---

## 数据可信度

积分这块做了刻意区分，你可能想知道哪个数字是"真的"：

- `steps[].measured === true` — bridge 从真实账单流里抓到的扣费，可信。
- `steps[].measured === false` — 按费率算的估算值。
- `spend.pricedSteps` / `spend.unpricedSteps` — 分别有多少步计价、多少步没计价。

费率表在 `index.js` 的 `PRICE_PER_MILLION`，上游调价改那里。

---

## 已知边界

- 只读，不写入任何会话状态。
- 只统计当前会话，不跨会话累计。
- 积分依赖 `dsh-workbuddy-bridge`，缺失时降级为空值，不崩溃。
- 上下文占用依赖宿主的 `contextPressure` 投影；宿主版本过低会逐级回退。
- 目前只在 Web 平台（`dsh.client.platform = "web"`）验证过。

---

## License

[MIT](./LICENSE)
