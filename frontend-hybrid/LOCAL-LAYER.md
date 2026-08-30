# frontend-hybrid 本地壳层说明

frontend-hybrid = **上游 frontend 原样底座 + 数字员工本地薄壳**。
- `frontend/`（上游）一行不改，是保底参照与未来升级种子
- `frontend-local/`（v1.10.3 定制版）**目录已于 2026-08-30 删除**，终态永久存档于 git `0ab3ab3c`；需要时 `git checkout 0ab3ab3c -- frontend-local/` 精确还原。前端回滚走镜像 `clawith-frontend:rollback-frontend-local`，不经源码
- 本项目的所有本地定制**集中在 `src/local/` + 少量钩子文件**，见下文清单

## 一、壳层文件清单

### A. 纯本地资产（src/local/**，上游没有，永不冲突）

| 路径 | 内容 |
|---|---|
| `theme.css` | 主题层：11 个 CSS 变量覆盖 + body 白底 + 61 个本地独有选择器 + 56 个纯颜色覆盖选择器（生成自与 frontend-local index.css 的 diff；结构性差异选择器保持上游）+ **侧边栏细节复刻段**（文件末尾：`.agent-avatar` 红块、`.sidebar-item*` 文字色/图标区 28px/选中悬停态、`.sidebar-agent-header`、`.sidebar-section-title`、`.workspace-switcher-name` 等约 13 条选择器，按 frontend-local 原值覆盖；上游新功能样式 .sidebar-item-badge/workspace tone-* 保留未动） |
| `openClawInstruction.ts` | OpenClaw 接入指引品牌版（digitaleemployee_sync / 数字员工 / Digital Employee） |
| `i18n-local.ts` + `i18n-patch-{zh,en}.json` | i18n 运行时补丁：品牌措辞覆盖（Agent→智能体/数字员工等，token 归一化判定）+ 本地独有词条（2026-08-30 移除消息广场：`feed.*` 子树与 nav.plaza/nav.feed/nav.experience 已删，nav.plaza 回归上游词条「经验广场」） |
| `pages/{Login,ForgotPassword,Onboarding,CompanySetup,Dashboard,Roster}.tsx` | 本地整页（品牌登录/入驻/分析仪表盘/花名册——紧凑卡：名字/小头像/职责 2 行/技能 chips≤5+X/模型·Token 脚注，按价值贡献排序）。~~社交广场 Plaza.tsx~~ 已于 2026-08-30 移除（对齐上游） |
| `components/UserAvatar.tsx`、`components/dashboard/*`（8 个） | 本地组件（~~PostCard/MentionInput~~ 随消息广场移除，2026-08-30） |
| `components/SkillSwitcher.tsx`、`pages/agent-detail/components/{AgentInfoToolsSkills,ScrollableChipList}.tsx` | 本地组件（2026-08-28 Phase E 三件套，依赖 fileApi.importZip/fetchAuth/FileBrowser 类型均已在） |
| `components/AgentProfileCard.tsx` | **数字员工档案卡组件**（2026-08-28）：从 AgentDetailPage renderAgentInfoCard 抽出，仅对话页使用（下拉面板语义，勿直接放进流式列表） |
| `components/RosterAgentCard.tsx` | **花名册紧凑卡**（2026-08-28）：小头像+名字/职责 2 行/技能 chips≤5+X/模型·今日Token 脚注；技能 1 请求/人；每行最多 3 张 |
| `styles/{LoginPage,Onboarding,CompanySetupPage}.css` | 本地页面样式（CompanySetupPage.css 依赖 LoginPage.css 的 lp-* 类，两者必须同在） |
| `services/analytics.ts`、`hooks/useAnalytics.ts`、`config/analytics.ts`、`types/analytics.ts` | 仪表盘 analytics 栈 |

另有 `public/` 补入本地资源：`logo-new.{png,jpg}`、`lanhu-bg.png`、`dashboard-banner.png`、`dashboard/` 目录（~~square-top-banner.png~~ 随消息广场移除）。

### B. 钩子文件（对上游文件的少量修改，升级时需重放）

> 注：frontend-local 目录已删（2026-08-30），下文所有「对照 frontend-local」一律指
> `git show 0ab3ab3c:frontend-local/<路径>` 或按需 `git checkout 0ab3ab3c -- frontend-local/` 临时还原。

| 文件 | 改动内容 |
|---|---|
| `src/main.tsx` | ① `import './local/i18n-local'`（i18n 补丁）② `import './local/theme.css'`（主题层，须在 index.css/atlas.css 之后）③ 移除 `loadSavedAccentColor()` 调用，改为锁定 light + 清理 `theme`/`clawith-accent-color` localStorage |
| `index.html` | title=数字员工、favicon=/logo-new.png、description=企业数字员工平台 |
| `vite.config.ts` | `resolve.alias` 改数组形式，追加 `/^\.*\/utils\/openClawInstruction$/ → src/local/openClawInstruction.ts`（品牌指引重定向，上游文件不动） |
| `src/App.tsx` | lazy import 改指 local 页面（Login/ForgotPassword/CompanySetup/Onboarding）+ LocalDashboard/Roster（/roster）；路由（2026-08-30 对齐上游，消息广场已移除）：**index→/dashboard（上游同款）**、**/plaza→上游 Plaza（经验库，原生语义）**、/experience→重定向 /plaza（兼容期）、/dashboard→LocalDashboard |
| `src/pages/Layout.tsx` | ① main-nav（2026-08-30 移除消息广场）：plaza（经验广场，上游 nav.plaza 词条）/groups/dashboard/roster，去 OKR 入口（路由保留）② hire 按钮红底 `#E60012` + "数字员工"栏目标题 ③ 移除主题切换按钮（主题锁 light）④ sidebar-account-row 用 UserAvatar ⑤ AccountSettingsModal 增加头像上传段（状态+handler+JSX，来自 frontend-local）⑥ **agentListContent 头像渲染**：`avatar_url` 有值时渲染 `<img>` + has-image 类（对照 frontend-local，2026-08-28 补） |
| `src/services/api.ts` | authApi 增 `uploadAvatar`/`deleteAvatar`（/users/me/avatar）；agentApi 增 `uploadAvatar`/`deleteAvatar`（/agents/{id}/avatar，2026-08-28 补）；尾部追加 `dashboardApi`（/dashboard/overview|cost|value|token-trend） |
| `src/pages/agent-detail/AgentDetailPage.tsx` | **聊天/页头头像图片渲染**（2026-08-28 补，对照 frontend-local）：① ChatMessageItem 增 `avatarUrl` prop（类型+解构+渲染块 has-image/img）② 3 个调用点传 `avatarUrl`（readonly 历史=左 agent/右 user、助手分组、实时会话按 role）③ 工具组行与 isWaiting 思考行头像 img 化 ④ 页头 `agent-detail-avatar` img + fallback 类。⚠️ 升级重放时此文件 diff 最大，建议整段对照 frontend-local 同名区域替换 |
| `src/pages/agent-detail/AgentDetailPage.tsx`（Phase E，2026-08-28 拍板 #9/#10/#11） | **agent-info 卡已抽为共享组件** `local/components/AgentProfileCard.tsx`（2026-08-28 晚：renderAgentInfoCard 143 行 → 组件调用，花名册同用；布局差值 CSS 在 theme.css 末段）+ `SkillSwitcher` import + `handleSkillInsert` + composer 工具栏 SkillSwitcher 挂载 + 会话列表两处 IconMessageCircle 前缀 + 日志过滤按钮选中态红底白字（上游硬编码靛蓝与品牌红冲突）。**保留上游**：关卡机制（180ms hover-close）、agent-chat-shell 弹性布局、runtime 协议全量（waiting_user/runtime_status/no-model 等上游均有更完整实现） |
| `src/pages/agent-detail/tabs/SettingsTab.tsx` | **agent 头像上传卡片**（2026-08-28 补）：useState+avatarInputRef + savebar 后的 `canManage` 头像卡片（上传/重传/删除，2MB 限制），依赖 agentApi.uploadAvatar/deleteAvatar 与 i18n `agent.settings.avatar.*`（zh/en 补丁已含） |
| `src/services/api.ts`（补） | request() 增 FormData 分支 + header 覆盖（否则全部上传接口 422）；uploadFileWithProgress 超时 300s；agentApi/fileApi/skillsApi 增 importZip（/agents/{id}/files/import-zip、/skills/import-zip）（2026-08-28 拍板 #1/#6） |
| `src/pages/enterprise-settings/tabs/OrgTab.tsx` | **整文件以 frontend-local 版覆盖**（2026-08-28 拍板 #5）：上游该文件无结构演进，纯硬编码英文 vs 本地 i18n，全量取本地 |
| `src/pages/enterprise-settings/tabs/SkillsTab.tsx` | **整文件以 frontend-local 版覆盖**（2026-08-28 拍板 #6）：zip 导入 + 全量 i18n；上游无结构演进 |
| `src/pages/agent-detail/tabs/SkillsTab.tsx` | zip 导入段（imports/状态/handleZipUpload/按钮+隐藏 input）+ 三个按钮 i18n 化；上游其余保留（2026-08-28 拍板 #6） |
| `src/pages/AdminCompanies.tsx` | 15 处品牌/i18n：SYSTEM_EMAIL_FROM_NAME 默认 DigitalEmployee、toast 全量 t() 化、placeholder systemEmailPlaceholder；上游 fetchJson 重构与 sso_custom_domain_redirect_enabled 保留（2026-08-28 拍板 #5） |
| `src/components/FileBrowser.tsx` | extraction 徽章系统（ExtractionInfo/状态/capture/行内徽章）；上游 formatFileSize/IconTrash 删除/错误 toast 等增强保留；5 处 toast i18n 化（2026-08-28 拍板 #7） |
| `src/components/WorkspaceOperationPanel.tsx` | modified_at 文件时间（类型+formatFileTime+目录/文件两处渲染）；**上游 sandbox 去 allow-same-origin 的安全加固保留**（2026-08-28 拍板 #7） |

### C. 依赖的本地后端接口（deploy-local-upgrade 的 backend 已含，纯上游后端没有）

`/api/dashboard/*`（dashboard.py 整个文件为本地独有）、`/api/plaza/*`（plaza.py 含本地 505 行改动；**2026-08-30 起前端已无消费方**——消息广场移除，接口与历史帖子留作存档，与上游保留行为一致）、`/api/users/me/avatar`、`/api/agents/{id}/avatar`、`/api/skills/import-zip`、`/api/agents/{id}/files/import-zip`。
**生产切换前提：deploy-local 的 backend 与 ../backend 同源（含上述接口）。**

## 二、上游升级同步流程（完整三阶段手册见仓库根 UPGRADE-PLAYBOOK.md）

> 演练环境 deploy-local-upgrade/ 已于 2026-08-30 生产切换后删除（19G）；
> 重建配方归档于 `frontend-hybrid/deploy/`（docker-compose.rehearsal.yml + docker-compose.hybrid.yml）。

1. 拷贝新版上游：`rsync -a --delete --exclude src/local --exclude node_modules --exclude dist --exclude LOCAL-LAYER.md --exclude .git frontend/ frontend-hybrid/`
2. 按上文 B 表**重放钩子改动**（每个文件改动都很小，git diff 历史可参考；建议升级前 `git diff HEAD -- <钩子文件>` 备份）
3. i18n 增量：如上游新增词条与本地品牌措辞冲突，重新运行补丁生成（token 归一化 diff，见本次会话脚本逻辑；`feed.*`/本地页面词条保持不动）
4. `npx tsc --noEmit && npm run build && npm test`（上游 122 个契约测试是安全网）
5. 部署演练环境验证（环境需先按 UPGRADE-PLAYBOOK.md 阶段 B 重建）：
   `cd deploy-local-upgrade && docker compose -f docker-compose.yml -f docker-compose.hybrid.yml build clawith-frontend-hybrid && ... up -d --no-deps clawith-frontend-hybrid`
6. 对照验证：3010（hybrid）vs 3011（纯上游）
7. 生产切换：按 UPGRADE-PLAYBOOK.md 阶段 C（备份三件套→预构建→停机切换→验证清单）

## 三、URL 语义（2026-08-30 对齐上游：消息广场已移除）

`/plaza`=经验库（上游 Plaza 原生语义）、`/experience`→重定向 `/plaza`（兼容期，曾为 hybrid 过渡 URL）、`/dashboard`=本地分析仪表盘、`/okr`=上游 OKR 页（无侧边栏入口）、index→`/dashboard`（上游同款）。
历史：v1.10.3 生产的 `/plaza` 曾是社交广场，随消息广场移除而退役（社交 feed 页面/PostCard/MentionInput/feed.* 词条已删；回滚依赖 rollback 镜像 + git 0ab3ab3c）。

## 四、未迁移项（Phase E 备选，需要时再做）

- AgentDetailPage 内嵌定制：`AgentInfoToolsSkills` / `SkillSwitcher` / `ScrollableChipList`（宿主为上游 AgentDetailPage，插入需改核心文件，与"壳层"原则冲突，收益/成本需评估；注：`agent-info-profile-avatar` 头像属于此卡片，随 Phase E 一并做）
- ToolsManager 组件级红色按钮（filter 激活态/展开按钮的中性变量位换品牌红——全局变量不可行，需组件覆盖）
- skills/文件 zip 导入 UI（后端接口已在）
- ~~26 个结构性差异 CSS 选择器~~ → **侧边栏相关的已于 2026-08-28 复刻进 theme.css 末段**（agent 头像红块/条目文字/图标区/选中态等 13 条）；非侧边栏的结构性差异仍在，遇视觉不一致再逐个评估
