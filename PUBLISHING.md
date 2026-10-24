# 发布手册（给自己看，不对外）

从零把这个仓库发出去，按顺序做就行。

## 0. 前置

- 一个 GitHub 账号：`nhsorrower`
- 仓库名：`dsh-workbuddy-token-pet`（已确认未被占用）
- npm 包名：`dsh-workbuddy-token-pet`（已确认未被占用）

---

## 1. 建仓库并推上去

### 1.1 装 Git（本机目前没有）

下载 <https://git-scm.com/download/win>，一路默认安装即可。

装完新开一个 PowerShell，验证：

```powershell
git --version
```

### 1.2 在 GitHub 网页上建空仓库

<https://github.com/new>

- Repository name：`dsh-workbuddy-token-pet`
- 可见性：**Public**
- **不要**勾选 "Add a README file"、不要加 .gitignore、不要加 license —— 本地已经有了，勾了会冲突

### 1.3 本地初始化并推送

在本文件夹（`token-pet-publish`）里执行：

```powershell
cd "D:\deepseek harness总结文件\dsh evloution\token-pet-publish"

git init
git add .
git commit -m "feat: 首个公开版本"
git branch -M main
git remote add origin https://github.com/nhsorrower/dsh-workbuddy-token-pet.git
git push -u origin main
```

推送时会弹浏览器让你登录 GitHub，登录授权即可。

### 1.4 打标签（安装命令里用到了 `#v0.1.0`）

```powershell
git tag v0.1.0
git push origin v0.1.0
```

> 标签必须推，否则别人执行 `add github:nhsorrower/dsh-workbuddy-token-pet#v0.1.0` 会找不到。

---

## 2. 验证别人能装上

在自己的机器上（换个 profile 测，别动正在用的 desktop）：

```powershell
dsh plugin --profile ghtest add github:nhsorrower/dsh-workbuddy-token-pet#v0.1.0
```

装完打开该 profile 目录下的 `package.json`，`dsh.profile.bundles` 里应该有 `dsh-workbuddy-token-pet`。

测完删掉：

```powershell
dsh plugin --profile ghtest remove dsh-workbuddy-token-pet
```

---

## 3. 发布到 npm（可选，但建议）

GitHub 装法能用，但 npm 装法对普通用户更友好。

```powershell
npm login
npm publish --access public
```

> `npm login` 会打开浏览器让你授权，**这一步必须你自己做**。

### 想让以后自动发布

1. 去 <https://www.npmjs.com/settings/nhsorrower/tokens> 建一个 **Automation** 类型的 token
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 里加一个叫 `NPM_TOKEN` 的 secret
3. 以后只要推 `v*` 标签，`.github/workflows/release.yml` 会自动发布

---

## 4. 上架 DSH 插件市场

`dshmarket` 自己不收录插件，它的列表来自 GitHub 精选清单。

去 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 提 PR，在列表里加一条：

```markdown
- [dsh-workbuddy-token-pet](https://github.com/nhsorrower/dsh-workbuddy-token-pet) — 浮动桌宠：实时显示上下文占用与每步 token 消耗，并统计 WorkBuddy 积分与剩余额度。
```

通常一天内会被收录，之后在 DSH 的插件市场里就能搜到。

---

## 5. 发版流程（以后每次改代码）

1. 改 `package.json` 的 `version`
2. 在 `CHANGELOG.md` 顶部加一节
3. 提交：

```powershell
git add .
git commit -m "chore: 发布 v0.1.1"
git tag v0.1.1
git push
git push origin v0.1.1
```

4. 如果配了 NPM_TOKEN，npm 会自动发布；没配就手动 `npm publish`

---

## 常见问题

**Q：装上了但桌宠不出现？**

三处名字必须一致，漏一处就会"装上了但挂不上"：

| 位置 | 内容 |
|---|---|
| `package.json` | `"name"` |
| `client.js` 第 2 行 | `id: '<包名>',` |
| `cordis.patch.yml` | `name: '<包名>'` |

改包名时三处一起改。

**Q：积分一直是空的？**

没装 `dsh-workbuddy-bridge`。装上并重启宿主即可：

```powershell
dsh plugin --profile desktop add dsh-workbuddy-bridge
```

**Q：`git push` 报 authentication failed？**

GitHub 早就不支持密码推送了，要用 Personal Access Token。去 <https://github.com/settings/tokens> 建一个带 `repo` 权限的 token，密码位置填这个 token。
