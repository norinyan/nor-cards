# Norin Tasks

极简 Obsidian 纸卡任务面板。任意笔记中插入以下代码块，阅读视图和实时预览都可交互：

````markdown
```norin-tasks
```
````

所有任务共用仓库根目录 `Tasks.md`。不访问网络，不依赖第三方 Obsidian 插件。构建结构参考 [Obsidian 官方模板](https://github.com/obsidianmd/obsidian-sample-plugin)，使用 TypeScript、官方 API 和 esbuild。

## 安装

要求 Obsidian 1.5.0 或更高版本；实际桌面验证版本为 1.14.5。

1. 首先用 Obsidian 的“打开本地仓库”打开本项目的 `.test-vault`，验证效果。该目录已包含插件和双面板示例 `Panel.md`。
2. 在测试仓库的“设置 → 第三方插件”中关闭安全模式，启用 **Norin Tasks**。
3. 打开 `Panel.md`，切到阅读视图或实时预览，测试新增、编辑、完成、日历切换、重新打开和删除。实时预览光标进入代码块时会显示源码，移出后恢复面板。
4. 满意后，将 `dist/norin-tasks/` 整个文件夹复制到目标仓库的 `.obsidian/plugins/norin-tasks/`。目录内应直接包含 `main.js`、`manifest.json`、`styles.css`。重新加载 Obsidian，在该仓库中启用插件。
5. 用命令面板运行 **Norin Tasks: Insert Norin Tasks**，或在“设置 → 快捷键”中搜索 **Insert Norin Tasks** 并自行绑定。

正式知识库未被自动安装或修改。本插件没有默认快捷键、设置页面、筛选栏或每日文件。

## 使用和日期规则

- 面板默认显示本地今天，例如 `Oct 28 Wednesday`。日期在左、星期居中；点击日期打开月历，左右箭头切换月份。最右侧箭头折叠或展开任务区。
- **To Do**：任务日期不晚于所选日期、目前仍未完成的任务。
- **Completed**：完成日期等于所选日期的任务。
- 新增时：`date` 是所选日期，`created` 是实际创建时刻（UTC ISO 时间）。因此回填昨天的任务不会伪造实际创建时间。
- 勾选时：`completed` 记录所选日期，立即移至该日期的 Completed；可在历史日期补记完成。取消勾选清空完成日期，保留任务日期和创建时刻。
- 仅切换日期不会修改任何任务。历史视图不是历史状态快照：后来已完成的任务不再出现在历史 To Do 中。
- 编辑、删除图标在悬停或键盘聚焦时显示，触屏上常显；删除需行内确认。新增或编辑按 Enter 保存，Escape 取消。
- 面板任务文字按纯文本显示，可安全包含 HTML 字符；不解析任务正文中的 Markdown。单条任务使用单行文本。

## 卡片展示配置（1.1.0）

空代码块默认显示“待办”“已完成”，背景跟随 Obsidian 主题。每个代码块可以独立设置标题和背景，所有块仍共享任务数据：

````markdown
```norin-tasks
todo: 今天要做
completed: 已经完成
background: green
```
````

- `todo`、`completed`：分组标题，按纯文本显示；空值采用默认标题。
- `background`：`theme`（默认）、`white`（暖白）、`yellow`、`green`、`blue`。每种颜色都有深色版本；未知值回退默认，未知字段忽略。不支持任意 CSS 或颜色值。
- 第一行下方是细分隔线；整个面板采用大圆角、淡阴影和统一留白，内容自然增高。
- 折叠状态按笔记路径和代码块所在行保存在本设备，通过阅读视图和实时预览共享，不写入 `Tasks.md` 或笔记正文。重命名笔记或移动块位置可能重置折叠状态。
- 编辑任务或确认删除时，日期和折叠导航暂时禁用，保存或取消后恢复，避免丢失草稿。

简短需求与验收标准见 [PRD.md](PRD.md)。

## 数据格式与安全

示例（HTML 注释在正常阅读中隐藏，源码可直接检查）：

```markdown
- [ ] 检查机器人定位 <!-- norin-task:{"id":"example-id","date":"2026-10-28","created":"2026-10-28T02:00:00.000Z","completed":null} -->
- [x] 完成回归测试 <!-- norin-task:{"id":"example-done","date":"2026-10-27","created":"2026-10-27T02:00:00.000Z","completed":"2026-10-28"} -->
```

只管理有 `norin-task` 元数据的顶层任务行。既有普通复选框、标题、段落和代码示例保留原样，不自动导入、改日期或覆盖；从面板新增的任务追加至文件末尾。任务日期缺失、重复 ID、损坏标记、勾选状态与元数据矛盾时，面板显示错误并拒绝修改。未闭合的代码块导致无法安全追加时也会拒写。手动修改管理行时，请保持复选框和 `completed` 一致，优先使用面板操作。

- 使用一个共享写入队列和 `Vault.process()`，每次根据最新文件内容按稳定 ID 修改，不用内存缓存覆盖整份文件。
- 新建文件遇到竞争时重新读取，不覆盖已存在文件；写入错误会提示，不伪装为成功。
- 所有代码块监听 `Tasks.md` 新建、修改、删除、重命名事件，更新数据；每个面板可以独立选日期。其他面板或 Sync 更新不会清除正在输入的草稿。
- Obsidian Sync 按普通 Markdown 文件同步任务，不需要插件私有数据库。各设备需安装插件，并在 Sync 中同步 `Tasks.md`；插件配置同步按 Obsidian 设置处理。
- **跨设备同时离线编辑没有分布式锁**，最终结果受 Obsidian Sync 的冲突合并规则影响。插件不会自动合并冲突副本、删除重复 ID 或猜测冲突数据；如出现冲突须检查 Sync 历史和 `Tasks.md`。不能承诺跨设备离线写入绝对无冲突。
- 无桌面专用 API，使用响应式主题样式和移动端兼容 API；尚未进行真机移动端测试。

## 开发与验证

```bash
cd /home/hfun/norin/lab/obsidian-plugs
npm ci
npm test
npm run build
npm run package
node scripts/prepare-test-vault.mjs
```

`npm run dev` 监听源码并构建。安装文件输出到 `dist/norin-tasks/`；运行时只有三个文件，无需复制依赖或源码。修改后重新运行准备脚本更新测试仓库内的插件文件，再在 Obsidian 中重载插件。准备脚本不会重置已有测试笔记或配置。

自动测试包括数据 CRUD、日期筛选、内容保留、格式损坏拒写、并发队列、失败恢复、文件创建竞争及独立临时文件仓库。实际 Obsidian UI 验证记录见 [TESTING.md](TESTING.md)。

开发者可在独立 Obsidian 配置上启用本地调试端口 9333，运行 `node scripts/eval-test-window.mjs < scripts/ui-check.js` 复验 UI；脚本检查窗口名称和仓库绝对路径，拒绝操作正式仓库。UI 脚本采用运行当天日期，创建并清理独立临时笔记，只删除自身创建的任务，保留测试仓库原有任务。脚本只允许操作本项目的独立测试仓库。
