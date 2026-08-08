# Uniclaw MCP Server

一个轻量 MCP (Model Context Protocol) 服务，把 Clawith backend 的 Agent 能力（列表、会话、聊天）暴露成 MCP 工具，供支持 MCP 的客户端（如 Cursor、Claude Desktop 等）调用。

## 提供的工具

- `list_agents()` — 列出当前登录用户可访问的所有 Agent
- `list_sessions(agent_id)` — 列出某个 Agent 下属于当前用户的会话
- `get_session_history(agent_id, session_id, limit=20)` — 读取某个会话的历史消息
- `chat_with_agent(agent_id, message, session_id=None)` — 给 Agent 发一条消息并拿到完整回复

## 目录结构

```
uniclaw-mcp/
├── .venv/                  # Python 虚拟环境（已创建好，依赖已安装）
├── requirements.txt        # 依赖清单
├── .env.example             # 环境变量模板
├── .env                      # 你自己创建，填真实值（不要提交到 git）
├── config.py                 # 读取环境变量
├── backend_client.py          # 登录换 token + 自动重登录 + REST/WS 调用
├── server.py                   # MCP 服务本体（4 个工具 + 鉴权中间件 + 启动入口）
└── README.md
```

## 首次使用步骤

### 1. 配置环境变量

```bash
cd uniclaw-mcp
cp .env.example .env
```

然后编辑 `.env`，至少填好这两项（其余项已有默认值，一般不用改）：

```
BACKEND_EMAIL=你的登录邮箱或用户名
BACKEND_PASSWORD=你的登录密码
```

如果 Clawith backend 不是跑在本机默认端口，还需要改：

```
BACKEND_HTTP_URL=http://<backend-host>:8000
BACKEND_WS_URL=ws://<backend-host>:8000
```

`MCP_API_KEY` 已经帮你随机生成好一个默认值，建议自己换成另一个随机字符串（生成命令见下方）。

### 2. 依赖已经装好，如果想重新安装/更新

虚拟环境 `.venv` 已经创建并装好了 `mcp`、`httpx`、`websockets`、`python-dotenv`。正常情况下不需要再装。如果换了机器或想重装：

```bash
cd uniclaw-mcp
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. 启动服务

```bash
cd uniclaw-mcp
.venv/bin/python server.py
```

看到类似输出说明启动成功：

```
Starting Uniclaw MCP server on 0.0.0.0:4008
MCP endpoint: http://0.0.0.0:4008/mcp
Clients must send: Authorization: Bearer <MCP_API_KEY>
```

服务会一直占用当前终端运行；想放到后台跑，可以用 `nohup` 或 `tmux`/`screen`，例如：

```bash
cd uniclaw-mcp
nohup .venv/bin/python server.py > mcp.log 2>&1 &
```

### 4. 生成一个新的随机 API Key（可选）

```bash
python3 -c "import secrets; print('uc_mcp_' + secrets.token_hex(16))"
```

把输出的字符串填到 `.env` 里的 `MCP_API_KEY`。

## 客户端如何连接

MCP 客户端需要用 Streamable HTTP transport 连接到：

```
http://<部署主机的IP或域名>:4008/mcp
```

并且每个请求都要带上请求头：

```
Authorization: Bearer <.env 里的 MCP_API_KEY>
```

在 Cursor 的 MCP 配置（`mcp.json`）里大致是这样：

```json
{
  "mcpServers": {
    "uniclaw": {
      "url": "http://<部署主机的IP或域名>:4008/mcp",
      "headers": {
        "Authorization": "Bearer <你的 MCP_API_KEY>"
      }
    }
  }
}
```

## 端口暴露

服务默认监听 `0.0.0.0:4008`，如果部署在服务器/容器里，记得把 `4008` 端口对外暴露（比如 Docker 的 `-p 4008:4008`，或云主机安全组放行 4008）。

## 关于登录 token

- Backend 的 JWT 有效期是 24 小时。本服务会记录登录时间，在过期前 30 分钟自动重新登录换新 token，调用工具时无需你手动干预。
- 如果某次请求意外收到 401，也会自动重新登录一次再重试，失败才会把错误抛给 MCP 客户端。
