# frontend-hybrid × frontend-local 全量比对审计（2026-08-28）

> 目的：不靠肉眼截图，用源码 diff 系统性找出 hybrid（上游底座+壳层）与 local 生产版之间的**全部残余差异**，逐项判定：复刻 / 保留上游 / Phase E / 无需处理。
> 方法：① 148 个共享文件逐一 diff（壳层文件比 `src/local/` 副本，其余比上游路径）② index.css 有效样式对比（local vs 上游+theme.css 叠加，解析器展开 @media）③ AgentDetailPage 按 94 个 hunk 分域统计。
> 本文只是清单，未动任何代码。

## 一、总览

| 分类 | 数量 | 说明 |
|---|---|---|
| 完全一致 | 97 | 含已对齐的钩子（SettingsTab/AgentDetailPage 本次补的头像部分）与全部 dashboard/analytics/groups/i18n 组件 |
| 微小差异（≤10 行） | 18 | 基本为上游演进噪声或壳层 i18n 改名漂移，无需处理 |
| 小/中差异 | 24 | 逐个验尸见下文三、四节 |
| 大差异 | 2 | AgentDetailPage（Phase E）、index.css（已由 theme.css 机制覆盖大半，残余见下文二节） |
| hybrid 无此文件 | 5 | SkillSwitcher、AgentInfoToolsSkills、ScrollableChipList（Phase E 三件套）+ Experience.tsx、Dashboard-bak.tsx（死文件，故意不迁） |

---

## 二、P0：`request()` 的 FormData 缺陷（功能性 bug，非视觉）

`frontend-hybrid/src/services/api.ts:12-16` 无条件设置 `Content-Type: application/json`。frontend-local 版有 FormData 分支（浏览器自动加 multipart boundary + 允许 header 覆盖）。

**影响面：hybrid 里所有文件上传接口目前都是坏的** —— 用户头像、agent 头像（`agentApi.uploadAvatar`，本文档写作当天刚移植）、FileBrowser 上传、skills/文件 zip 导入。之前未发现是因为从未在 3010 上真实上传过文件。

修复：把 local 版 `request()` 的 FormData 分支 + header 覆盖逻辑移植过来；顺带核对超时（local 300s vs hybrid 120s）。

## 三、CSS 残余差异（有效样式对比，共 72 个，归类如下）

### 3.1 建议复刻进 theme.css（本地视觉本质，6 条）

| 选择器 | 本地 | hybrid 现状（上游） | 位置 |
|---|---|---|---|
| `.chat-msg-avatar` | 红底白字、方角 8px、#ececec 边 | 灰底圆形（与今天补的 JSX 头像不配套） | 聊天消息头像 |
| `.new-session-btn` | 红底白字 600 | 灰底 var(--bg-secondary) 500 | agent 详情"新会话"按钮 |
| `.main-content` | padding 15px、白底 | padding var(--space-8)=32px | **全部页面内容区内边距**（侧边栏之外观感差异的主因之一） |
| `.app-layout` | background #ffffff | 无背景覆盖 | 全局底色（保留上游 min-height/notification-bar 适配，只补背景） |
| `.chat-composer` | backdrop-filter none | blur(8px) 毛玻璃+阴影 | 聊天输入框（复刻与否可商榷，标注为可选） |
| `.agent-info-expiry-button` | 红底白字红边 | 灰底 | agent-info 卡到期按钮（组件本身属 Phase E，CSS 可先备好） |

### 3.2 ~~theme.css 清理候选~~ → 已核实为假阳性（2026-08-28 拍板 #12）

初判 3 条"误留覆盖"经逐条核对全部为解析器假阳性（`background` vs `background-color` 属性名差异导致 local 侧被误判为空）或上游增强：
- `.agent-top-action.active`：theme.css 红色覆盖 = 本地原值，**正确，保留**
- `.analysis-trace--running ... span:first-child` 的 `background: var(--success)` 来自上游（新增运行态绿点），本地无 → 保留上游
- `.aware-side-section`：theme.css 白底覆盖 = 本地原值，**正确，保留**

**结论：theme.css 无需清理。**

### 3.3 判定"保留上游"（约 63 个）

- 上游新功能样式：`.exp-draft*`（经验草稿卡，约 20 个）、`.chat-tool-reconciliation*`（工具对账卡，6 个）、`.analysis-tool-reconciliation__status`、`.aware-calendar-toolbar`、`.aware-view-switch`、`.agent-chat-message-scroll` 滚动增强、`.tool-source-tabs button:hover`、`[data-theme="light"] .btn-primary`、`.distill-spinner`
- workspace tone-1~6（上游新调色板，12 个）
- 侧边栏今天的复刻残差（`.sidebar` box-shadow 空白差异、`.sidebar-divider` opacity 等效项）

---

## 四、JSX/TSX 逐文件判定

### 4.1 建议移植（按优先级）

| 文件 | 本地独有内容 | 判定 |
|---|---|---|
| `services/api.ts` | request() FormData 分支 + header 覆盖 + 超时 300s | **P0**（见第二节） |
| `pages/enterprise-settings/tabs/OrgTab.tsx` | 全量 i18n 中文（上游硬编码英文：'Client ID'、'Feishu / Lark Integration'、'Failed to update SSO…'、placeholder 'acme.clawith.com'） | **P1** 企业设置-组织 tab 在 hybrid 显示英文，中文用户可见回归 |
| `pages/AdminCompanies.tsx` | SYSTEM_EMAIL_FROM_NAME 默认 'DigitalEmployee'（上游 'Clawith'）；toast i18n 化 | P1 品牌可见 |
| `pages/agent-detail/tabs/SkillsTab.tsx` | zip 导入 UI（1MB 限制 + handleZipUpload + i18n toast） | P1（Phase E 清单里的"zip 导入"最小件，先做这个） |
| `pages/enterprise-settings/tabs/SkillsTab.tsx` | 同上（企业级 zip 导入 + tier 提示） | P1 |
| `components/WorkspaceOperationPanel.tsx` | 文件 modified_at 时间显示（formatFileTime，约 20 行） | P2（依赖本地后端返回 modified_at） |
| `components/FileBrowser.tsx` | extraction 徽章（扫描件/无文本/抽取失败，`text_extractor.py` 联动）+ 上传格式白名单扩展 | P2 文档质量可见特性 |
| `pages/enterprise-settings/tabs/LlmTab.tsx` | 删除模型 409 冲突流（agent 占用提示 + force delete 确认） | **已拍板跳过（2026-08-28）**：上游同文件已大改（tool-calling 探测 + runtime model settings），三方合并风险大于收益；等真实删除被占用模型的需求出现再做 |
| `components/TalentMarketModal.tsx` | has_bootstrap 字段 + #f6f9fd 底色 + 按钮类 | P3 视觉微调 |
| `components/ModelSwitcher.tsx` | supports_tool_calling 类型字段 | P3 类型补齐 |

### 4.2 已判定等效/保留上游（不复刻）

| 文件 | 理由 |
|---|---|
| `pages/OpenClawSettings.tsx` | 上游用 isChinese 三元实现中文，与本地 i18n 效果等效；legacy-key（oc- 前缀）边缘行为略有差异，接受 |
| `pages/OKR.tsx`、`pages/agent-detail/components/ToolsManager.tsx`、`components/TalentMarketModal` 底色 | 本地硬编码白底 vs 上游 CSS 变量，**light 锁定下渲染等效** |
| `pages/AgentCreate.tsx`、`components/PromptModal.tsx`、`components/Toast/ToastProvider.tsx`、`components/CustomAgentModal.tsx` | 上游重构（格式化/useMemo/var fallback），行为一致 |
| `pages/enterprise-settings/utils/fetchJson.ts`、`pages/UserManagement.tsx`、`pages/EnterpriseSettings.tsx`、`pages/AdminCompanies.tsx` 的内联 fetchJson | 上游已抽成公共 fetchJson，本地旧内联版不再需要 |
| `hooks/useDropZone.ts` | 上游新增 onReject 能力（增强） |
| `components/ChannelConfig.tsx` | 上游 feishu 权限 scope 更全（im:message.group_msg 等，上游更新） |
| `components/MarkdownRenderer.tsx` | 内部 token 标记改名（DIGITALEMPLOYEE→CLAWITH），自洽即可 |
| `pages/Layout.tsx` 残差 | 群聊图标 IconUsers vs IconUsersGroup（上游更新）；onboarding 提示文案按 hybrid 的 /experience 语义反而是对的 |
| `main.tsx`、`App.tsx`、`utils/openClawInstruction.ts` | 壳层钩子文件，diff 即钩子本身，符合预期 |
| `styles/atlas.css` max-width 600 vs 520 | atlas 系仅被上游 Login/Onboarding 使用，二者在 hybrid 已被壳层替换（死代码） |

### 4.3 死代码（不处理）

- `components/atlas/ClawithWordmark.tsx`（±）：hybrid 中仅上游 Login/Onboarding 引用，均已被壳层替换 → 显示不受影响
- `pages/Experience.tsx`、`pages/Dashboard-bak.tsx`：故意不迁

---

## 五、Phase E 大项 → **已于 2026-08-28 按 #9/#10/#11 拍板执行完毕**

94 个 hunk 全量分诊结果：

**已移植（本地布局/特性复刻）：**
- agent-info 卡整块换本地 140 行版（840px 三列：档案+过期按钮 / 工具&技能 ToolsSkillsSummary / 模型+Token 玻璃卡）+ 5 条布局差值 CSS（card 宽/grid 三列/body padding/chevron/profile-role）
- 三件套组件拷贝并接线：`SkillSwitcher`（composer 工具栏，ModelSwitcher 之后）+ `handleSkillInsert`（光标处插 `使用/skill`）+ `AgentInfoToolsSkills` + `ScrollableChipList`
- 会话列表两处 `IconMessageCircle` 前缀（我的=红 12px / 全部=灰 11px）
- 日志过滤按钮选中态红底白字（上游硬编码靛蓝 rgba(99,102,241,0.1)，与品牌红冲突）

**判定"上游已等价/更完整"，保留上游（363 行里的其余部分）：**
- waiting_user 续跑凭据、runtime_status 排队通知、no-model 错误处理、消息映射 spread、复合游标分页注释——上游 v1.11.4 均有自己的完整实现（多数比本地 32 行版更长更完整）
- 关卡机制：上游 180ms hover-delay close vs 本地 outside-mousedown close——两种交互模型，混用冲突，保留上游
- agent-chat-shell 高度：上游 flex 自适应 vs 本地 calc(100vh-100px)——上游方案对通知条更稳，保留
- 权限描述文案："不可参与 Plaza"按 hybrid 的 /experience 语义上游文案反而正确
- LlmTab 409 删除流：拍板跳过（见 4.1 表）

**验证**：tsc 零错 / build 通过 / 122 契约测试全过 / 3010 部署成功。

---

## 五·附、Phase E 原始背景（执行前存档）

### 5.1 AgentDetailPage（+1762/-363）

1762 行是**上游演进**（hybrid 更完整：activeRun 轮询、refreshSessionMessages、蒸馏按钮等——正是当年 Task 1 想搬而没搬完的）。本地真正独有的 363 行按区域：

| 区域 | 本地独有≈行数 | 内容推测 |
|---|---|---|
| 渲染辅助(2200-3000) | 109 | 待逐 hunk 分类 |
| 会话/轮次逻辑(1000-2200) | 95 | 待逐 hunk 分类（可能多数已被上游等价实现替代） |
| 尾部区(5600+) | 55 | isWaiting/调用点周边（部分今天已补） |
| 消息行/分析卡(3000-3700) | 58 | 分析卡区域 |
| info卡/页头(3700-4300) | 13 | agent-info 卡布局差（840px 3列 vs 上游 560px 2列） |
| 聊天主渲染(4300-5600) | 15 | 少量 |

**决策点**：上游 v1.11.4 已自带 agent-info 卡（`.agent-info-card` 系列 5 个选择器同名不同布局）。Phase E 要先决定"复刻本地 840px 三列布局"还是"接受上游 560px 两列"，再决定是否引入 `AgentInfoToolsSkills`/`SkillSwitcher`/`ScrollableChipList` 三件套。

### 5.2 其余 Phase E（沿 LOCAL-LAYER.md）

ToolsManager 组件级红按钮、zip 导入 UI（若按 4.1 P1 拆出则提前）、agent-info 卡（见上）。

---

## 六、建议执行顺序（待确认后动工）

1. **P0**：api.ts request() FormData 修复（半小时级，解锁全部上传功能）
2. **CSS 复刻包**：3.1 的 6 条 + 3.2 的 3 条清理（一次 theme.css 追加 + 一次部署）
3. **P1 中文化/品牌包**：OrgTab、AdminCompanies（一次提交两个文件）
4. **P1 zip 导入**：两个 SkillsTab（各自独立，后端接口已就绪）
5. P2/P3 与 Phase E 按需排期

> 每步都是独立可验证的最小包，沿用现有流程：tsc → build → npm test → 部署 3010 → 三端对照。
