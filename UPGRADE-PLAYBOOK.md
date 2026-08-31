# 上游升级跟进手册（UPGRADE PLAYBOOK）

> 目的：下次 Clawith 上游发新版时，按本手册快速跟进。所有流程均在 2026-08-30 的
> v1.10.3→v1.11.4 升级 + 生产切换中完整演练过一遍，按图索骥即可。

## 一、当前基线状态快照（2026-08-30 切换完成时）

| 项 | 状态 |
|---|---|
| git 基线 | `6ae24f7b`（local 分支）= searxng 后端定制；`3288d2f3` = frontend-hybrid v1 基线；`9c31bca6` = 上次上游 490 提交合并 |
| 生产（deploy-local:3008） | frontend 构建 `../frontend-hybrid`；backend = v1.11.4+本地定制；DB alembic head = `f065_feishu_group_target` |
| 前端壳层 | 全部清单见 `frontend-hybrid/LOCAL-LAYER.md`（src/local/ + 10 个钩子文件 + 升级重放表） |
| 回滚资产 | 镜像标签 `clawith-backend:rollback-v1.10.3`、`clawith-frontend:rollback-frontend-local`；`deploy-local/docker-compose.yml.bak-20260830`。**切换前的 DB 备份已于 2026-08-30 按用户决定删除**——如需回滚基线，先重新 pg_dump 现库再操作 |
| 演练环境 | **已删除**（2026-08-30，19G）。重建配方保留在 `frontend-hybrid/deploy/`（见下） |
| 环境拓扑 | 生产 3008 唯一运行环境；`frontend/` 上游种子一行不改；`frontend-local/` 目录已删（git `0ab3ab3c` 存档，还原后需 npm ci） |

## 二、下次升级的完整流程（三阶段）

### 阶段 A：合并上游代码

```bash
git fetch origin && git merge origin/main   # 或对应上游分支
# 冲突处理原则：backend 冲突看 git log 归属（【本地定制】标记的是故意保留项）；
# frontend/ 在本仓库只是种子，真正的前端演进在 frontend-hybrid 重放钩子（见 LOCAL-LAYER.md 第二节）
```

### 阶段 B：演练环境验证（重建配方）

```bash
# 1. 重建演练目录（配方已归档）：
mkdir -p deploy-local-upgrade && cd deploy-local-upgrade
cp ../frontend-hybrid/deploy/docker-compose.rehearsal.yml docker-compose.yml
cp ../frontend-hybrid/deploy/docker-compose.hybrid.yml .
# 2. 从生产库拷一份起始数据（可选，更真实）：
#    docker exec deploy-local-clawith-postgres-1 pg_dump -U clawith clawith | \
#      docker exec -i deploy-local-upgrade-clawith-postgres-1 psql -U clawith -d clawith
# 3. 构建并起全部服务（3009 旧版 / 3010 hybrid / 3011 纯上游对照）：
docker compose -f docker-compose.yml -f docker-compose.hybrid.yml up -d --build
# 4. 验证：后端迁移自动跑（entrypoint.sh 内 alembic upgrade head）；
#    前端 tsc/build/122 契约测试（cd frontend-hybrid && npx tsc --noEmit && npm run build && npm test）
# 5. 三端对照走查：3009 vs 3010 vs 3011
```

### 阶段 C：生产切换（2026-08-30 实战验证过的顺序）

```bash
cd deploy-local
# 1. 备份三件套（compose 不在 git 里，必须手工备份！）
docker exec deploy-local-clawith-postgres-1 pg_dump -U clawith clawith | gzip > ../backups/prod-<日期>-pre.sql.gz
cp docker-compose.yml docker-compose.yml.bak-<日期>
docker tag deploy-local-clawith-backend:latest clawith-backend:rollback-<日期>
docker tag deploy-local-clawith-frontend:latest clawith-frontend:rollback-<日期>
# 2. 预构建（旧容器继续跑，构建失败零影响；同源缓存命中时=演练验证过的同镜像）
docker compose build clawith-backend clawith-frontend
# 3. 切换（停机开始）
docker compose stop clawith-backend clawith-frontend
docker exec deploy-local-clawith-postgres-1 pg_dump -U clawith clawith | gzip > ../backups/prod-<日期>-stopped-clean.sql.gz
docker compose up -d clawith-backend   # entrypoint 自动跑 alembic 迁移 + seeder
docker compose up -d clawith-frontend
# 4. 验证清单：healthy / 迁移日志无错 / 登录 / 首页 / 各页面 / agent 工具列表含新工具
#    （容器内抽查：python -c "...get_runtime_agent_tools_for_llm('<agent_id>')"）
#    / 心跳调度日志活跃 / DB 核对（alembic_version=head、数据行数）
```

**已知良性噪声**（不必慌）：
- `[Tools] Ignoring builtin row without a canonical definition: plaza_*`——上游已删除的工具 DB 残行
- `Skills seed failed: duplicate key (skills_name_key)`——seeder 对存量数据的幂等冲突，技能数据无损

**回滚**：
- 仅前端：compose 改回 + rollback 镜像 up（分钟级）
- 后端：rollback 镜像可起但旧代码读新 schema 兼容性不保证
- 彻底：需要 DB 级恢复时**必须先有备份**——⚠️ 2026-08-30 切换前的备份已删，任何高风险操作前先重新打一份：
  `docker exec deploy-local-clawith-postgres-1 pg_dump -U clawith clawith | gzip > <备份路径>.sql.gz`
  恢复：`gunzip -c xxx.sql.gz | docker exec -i deploy-local-clawith-postgres-1 psql -U clawith -d clawith`
- 建议惯例：**高危操作（升级/迁移/大批量数据改动）前必打停机态备份**，稳定 1-2 周后才可清理

## 三、踩过的坑（提前避雷）

1. **builtin 工具新增要接四处**：定义（builtin_tool_definitions.py）+ 实现（agent_tools.py）+ 两处 legacy 分发 + **RUNTIME_TYPED_APPLICATION_TOOL_NAMES 白名单**——漏白名单=分配了但不进 LLM 工具列表（searxng 踩过）
2. **hybrid 的 request() 必须保留 FormData 分支**，否则所有上传接口 422（上游版没有，是本地补丁）
3. **docker compose 命令认准目录**：生产=deploy-local/，演练=deploy-local-upgrade/，跑错目录会静默构建错误项目
4. **后端构建约 20 分钟**（pip 网络慢），安排在切换前预构建
5. **生产 compose 挂载 ./nginx/nginx.conf**（含 /p/ 短链代理），换前端镜像时保留该挂载即可
6. **思考链闭标记约定**：新模型思考为裸文本、仅以 \</think\> 收尾（无开标记）。已修：extract_embedded_reasoning 闭标记切分、蒸馏解析兜底、ReasoningSplitter 流式分流（model_step_service，仅 web 直聊）。名单经环境变量 REASONING_CLOSE_TAG_MODELS（deploy-local compose，逗号分隔模型名，大小写不敏感）
