# 贡献指南

## 报告问题

提 issue 时请附上：

1. DSH 版本（`dsh --version`，或桌面版 **设置 → 关于**）
2. 是否装了 `dsh-workbuddy-bridge`
3. 复现步骤与预期行为
4. 相关日志（**请先抹掉密钥和会话内容**）

## 提交代码

1. Fork 本仓库并新建分支
2. 改动尽量聚焦单一问题
3. 提交前跑一遍自检：

```bash
node --check index.js
node --check client.js
npm pack --dry-run
```

4. 提 PR，说明改了什么、为什么改、怎么验证的

## 改包名 / 改结构时的注意事项

这个插件有三处名字必须始终一致，漏一处就会装上了但挂不上：

| 位置 | 内容 |
|---|---|
| `package.json` | `"name"` |
| `client.js` 第 2 行 | `id: '<包名>',` |
| `cordis.patch.yml` | `name: '<包名>'` |

## 提交前自查

- [ ] `node --check` 两个文件都过
- [ ] `npm pack --dry-run` 里没有备份文件、没有本机路径
- [ ] 没有新增对外网络请求
- [ ] 可选依赖缺失时仍然是降级为空值，而不是抛错

## 许可

提交的代码默认按本仓库的 MIT 协议授权。
