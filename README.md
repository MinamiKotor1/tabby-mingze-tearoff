# tabby-mingze-tearoff（中文版使用说明）

`tabby-mingze-tearoff` 是一个 Tabby 插件，用于将当前终端标签页“分离”为新窗口，支持右键菜单、快捷键和拖拽三种触发方式。

## 1. 功能概览

- 将当前标签页分离到新窗口（tear-off）
- 支持拖拽标签页到窗口外自动分离
- 支持标签页右键菜单动作：`分离到新窗口`
- 支持热键命令：`tearoff-tab`
- 使用 Tabby recovery token 迁移状态（优于仅基于 profile 的重新打开）

## 2. 适用范围与限制

- **支持类型**：终端标签页、包含终端子页的分屏标签页
- **不支持类型**：不提供恢复能力的自定义标签页
- **状态恢复效果**：取决于各 tab 类型的 recovery provider
  - `app:local-tab` 通常恢复更完整（包含 `restoreFromPTYID`）
  - 非本地终端或第三方 tab，恢复质量由其自身实现决定

## 3. 环境要求

- Node.js（建议 LTS）
- Yarn 1.x（仓库当前使用 `yarn.lock`）
- Tabby 1.0.x 生态依赖（见 `package.json` 中 `tabby-*` 版本）

## 4. 安装依赖与构建

在仓库根目录执行：

```bash
yarn install
yarn typecheck
yarn build
```

说明：

- `yarn typecheck`：仅做 TypeScript 类型检查（不产物）
- `yarn build`：生产构建（`--mode production`），输出到 `dist/`
- `yarn build:dev`：开发构建（`--mode development`）
- `yarn watch`：监听文件改动并自动重建

若历史依赖有污染（如旧 `node-sass`）：

```bash
rm -rf node_modules yarn.lock
yarn install
```

Windows PowerShell：

```powershell
rmdir /s /q node_modules
del yarn.lock
yarn install
```

## 5. 在 Tabby 中启用与配置

插件默认配置如下：

```yaml
mingzeTearoff:
  enableDragOut: true
  dragOutMargin: 0
  maxPendingAgeMS: 60000
hotkeys:
  tearoff-tab: []
```

参数说明：

- `enableDragOut`：是否开启“拖出窗口自动分离”
- `dragOutMargin`：判定拖出窗口边界的容差（像素）
- `maxPendingAgeMS`：分离请求在本地存储中的最大有效期（毫秒）
- `hotkeys.tearoff-tab`：自定义快捷键绑定（默认不绑定）

## 6. 使用方法

### 6.1 右键菜单分离

1. 在目标标签页上右键
2. 点击 `分离到新窗口`
3. 当前标签将复制到新窗口中打开

### 6.2 快捷键分离

1. 在 Tabby 热键设置中为 `tearoff-tab` 绑定按键
2. 聚焦目标标签页后触发快捷键
3. 标签页将分离到新窗口

### 6.3 拖拽分离

1. 按住标签页开始拖动
2. 将鼠标拖到当前窗口外
3. 松开鼠标后自动分离到新窗口

## 7. 工作机制（实现说明）

- 触发分离后，插件会先读取当前 tab 的 recovery token
- 请求以短期记录写入 `localStorage`（带时间戳和随机 requestID）
- 新窗口启动后读取并消费该请求，再通过 `TabRecoveryService` 恢复 tab
- 过期、损坏或无效请求会自动清理，减少脏数据累积

## 8. 常见问题（FAQ）

### Q1：为什么点了“分离到新窗口”没反应？

请确认当前 tab 是否为受支持类型（终端/含终端分屏），以及 Tabby 本身窗口创建能力正常。

### Q2：为什么新窗口打开了，但状态不完整？

这是 tab 类型恢复能力差异导致。插件已使用 recovery token，但具体恢复深度由 tab 的 provider 决定。

### Q3：快速连续分离会串窗口吗？

当前实现已使用带随机后缀的 requestID，并按创建时间消费，常规场景下不会串单。

### Q4：可以 pull 后直接构建吗？

可以。推荐流程：

```bash
git pull
yarn install   # 仅在 lock 或依赖变化时必需
yarn build
```

## 9. 开发者自检清单

每次改动建议至少执行：

```bash
yarn typecheck
yarn build
yarn build:dev
```

并在 Tabby 中手工验证：

- 菜单分离是否正常
- 快捷键分离是否正常
- 拖拽分离是否正常
- 分离后新窗口恢复是否符合预期

---

如需扩展功能（例如“分离后移动而不是复制”、“仅单实例消费策略”、“更细粒度的恢复策略”），建议先在 `src/tearoff.service.ts` 中补充开关配置，再更新本 README。
