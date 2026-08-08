"""Seed builtin tools into the database on startup."""

from loguru import logger
from sqlalchemy import select
from app.database import async_session
from app.models.tenant import Tenant
from app.models.tenant_setting import TenantSetting
from app.models.tool import Tool
from app.services.llm.finish import FINISH_TOOL_SEED
from app.services.tool_config import meaningful_config, tenant_tool_config_key

SYNC_IS_DEFAULT_TOOL_NAMES = {
    "finish",
    "read_webpage",
    "duckduckgo_search",
    "jina_search",
    "jina_read",
    "update_objective",
    # AgentBay tools should NOT be is_default=True. Older seeder versions may
    # have set them to True; include them here so the seeder corrects the DB.
    "agentbay_browser_navigate",
    "agentbay_browser_screenshot",
    "agentbay_browser_save_screenshot",
    "agentbay_browser_click",
    "agentbay_browser_type",
    "agentbay_browser_extract",
    "agentbay_browser_observe",
    "agentbay_browser_login",
    "agentbay_code_execute",
    "agentbay_code_write_file",
    "agentbay_code_read_file",
    "agentbay_code_edit_file",
    "agentbay_command_exec",
    "agentbay_computer_screenshot",
    "agentbay_computer_save_screenshot",
    "agentbay_computer_click",
    "agentbay_computer_precision_screenshot",
    "agentbay_computer_input_text",
    "agentbay_computer_press_keys",
    "agentbay_computer_scroll",
    "agentbay_computer_move_mouse",
    "agentbay_computer_drag_mouse",
    "agentbay_computer_get_installed_apps",
    "agentbay_computer_start_app",
    "agentbay_computer_list_windows",
    "agentbay_computer_close_window",
    "agentbay_computer_dismiss_dialog",
    "agentbay_file_transfer",
}

LEGACY_IMAGE_TOOL_MODEL_DEFAULTS = {
    "generate_image_siliconflow": "black-forest-labs/FLUX.1-schnell",
    "generate_image_openai": "dall-e-3",
    "generate_image_google": "gemini-2.5-flash-image",
}


def _global_builtin_config(tool_data: dict) -> dict:
    """Return config safe to store on the global builtin Tool row."""
    # Builtin tools specify defaults (like 'allow_network': True) in their 'config' dict.
    # The actual sensitive data defaults are empty strings ("") so this is safe to store globally.
    return tool_data.get("config", {})

# Builtin tool definitions — these map to the hardcoded AGENT_TOOLS
BUILTIN_TOOLS = [
    FINISH_TOOL_SEED,
    {
        "name": "list_files",
        "display_name": "列出文件",
        "description": "列出工作区中某个目录下的文件和文件夹。在向 workspace/ 写入新文档之前请先调用本工具，以便查看当前目录结构、合理复用已有的主题子目录，并在没有充分理由时避免将文件直接散落在 workspace/ 根目录。也可以用来列出 enterprise_info/ 中的共享公司信息。",
        "category": "file",
        "icon": "📁",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path to list, defaults to root (empty string)"}
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "read_file",
        "display_name": "读取文件",
        "description": "读取工作区中的文件内容。可读取 soul.md、memory/memory.md、skills/ 以及 enterprise_info/ 等文件。Focus 信息保存在系统工具中，而非 focus.md。读取大文件时请配合 offset 和 limit 分页。",
        "category": "file",
        "icon": "📄",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path, e.g.: soul.md, memory/memory.md"},
                "offset": {"type": "integer", "description": "Starting line number (0-indexed, default 0). Use with limit for pagination."},
                "limit": {"type": "integer", "description": "Maximum number of lines to read (default 2000). Use with offset for pagination."},
            },
            "required": ["path"],
        },
        "config": {"max_file_size_kb": 500},
        "config_schema": {
            "fields": [
                {"key": "max_file_size_kb", "label": "Max file size (KB)", "type": "number", "default": 500},
            ]
        },
    },
    {
        "name": "list_focus_items",
        "display_name": "列出 Focus 项",
        "description": "从系统数据库中列出结构化的 Focus 项。",
        "category": "file",
        "icon": "◎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "include_completed": {"type": "boolean", "description": "Whether to include completed Focus items. Default true."},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "upsert_focus_item",
        "display_name": "新建或更新 Focus 项",
        "description": "在系统数据库中新建或更新一个结构化的 Focus 项。",
        "category": "file",
        "icon": "◎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Stable short identifier, snake_case preferred."},
                "title": {"type": "string", "description": "Short title (Focus名称)."},
                "description": {"type": "string", "description": "Human-readable description of what is being tracked."},
                "kind": {"type": "string", "enum": ["normal", "system"], "description": "normal or system"},
                "source": {"type": "string", "description": "Optional origin label, e.g. user, trigger, a2a, okr."},
            },
            "required": ["description"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "complete_focus_item",
        "display_name": "完成 Focus 项",
        "description": "将一个结构化的 Focus 项标记为已完成。",
        "category": "file",
        "icon": "◎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Focus item identifier to complete."},
            },
            "required": ["key"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "write_file",
        "display_name": "写入文件",
        "description": "在工作区中写入或更新一个文件。在 workspace/ 下创建新文档前，请先用 list_files 查看相关目录结构：优先复用已有的主题子目录，当内容属于新主题时再新建子目录。除非用户明确要求，请不要把独立的文档文件直接放在 workspace/ 根目录。可以更新 memory/memory.md，在 workspace/ 下创建文档，或在 skills/ 下创建技能。",
        "category": "file",
        "icon": "✏️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path, e.g.: memory/memory.md, workspace/reports/report.md, workspace/knowledge_base/notes.md. Prefer a meaningful subfolder instead of writing loose files into workspace/ root."},
                "content": {"type": "string", "description": "File content to write"},
            },
            "required": ["path", "content"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "delete_file",
        "display_name": "删除文件",
        "description": "删除工作区中的一个文件。无法删除 soul.md 或 tasks.json。",
        "category": "file",
        "icon": "🗑️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to delete"}
            },
            "required": ["path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "move_file",
        "display_name": "移动文件",
        "description": "在工作区内移动或重命名文件/文件夹。整理工作区文件、将生成的文档移入子目录或重命名文件时请使用本工具，而不是 execute_code。无法移动 soul.md、tasks.json 或 enterprise_info/。若 destination_path 是已存在的目录或以 '/' 结尾，则保留原文件名放入该目录。默认不覆盖目标。",
        "category": "file",
        "icon": "↪",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Current file or folder path, e.g.: workspace/report.md"},
                "destination_path": {"type": "string", "description": "Destination file/folder path, e.g.: workspace/archive/report.md or workspace/presentations/PPT/"},
                "overwrite": {"type": "boolean", "description": "Replace the destination if it already exists. Default false."},
            },
            "required": ["source_path", "destination_path"],
        },
        "config": {},
        "config_schema": {},
    },
    # --- Enhanced file management tools ---
    {
        "name": "edit_file",
        "display_name": "编辑文件",
        "description": "对现有文件中的指定字符串进行精确局部替换，而无需重写整个文件。如果只是要修改其中一节或多节，请优先使用本工具而不是 write_file。",
        "category": "file",
        "icon": "✂️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to edit, e.g.: memory/memory.md, skills/my-skill/SKILL.md"},
                "old_string": {"type": "string", "description": "Exact text to find and replace. Must match exactly including whitespace and newlines."},
                "new_string": {"type": "string", "description": "Replacement text"},
                "replace_all": {"type": "boolean", "description": "Replace all occurrences if true (default: false)"},
            },
            "required": ["path", "old_string", "new_string"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "search_files",
        "display_name": "搜索内容",
        "description": "使用正则在工作区文件中搜索内容模式，返回匹配的行及其所在文件的路径与行号。每次查询最多返回 50 条结果。",
        "category": "file",
        "icon": "🔍",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex pattern to search for, e.g.: 'API_KEY', 'def\\\\s+\\\\w+'"},
                "path": {"type": "string", "description": "Directory to search in (default: root)"},
                "file_pattern": {"type": "string", "description": "File pattern to match (default: all files). e.g.: '*.md', '*.py'"},
                "ignore_case": {"type": "boolean", "description": "Case-insensitive search (default: false)"},
            },
            "required": ["pattern"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "find_files",
        "display_name": "查找文件",
        "description": "按 glob 模式查找文件，返回文件路径、大小和修改时间。每次查询最多返回 100 条结果。",
        "category": "file",
        "icon": "📁",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern to match files, e.g.: '**/*.md', 'skills/*.md'"},
                "path": {"type": "string", "description": "Base directory for search (default: root)"},
            },
            "required": ["pattern"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "read_document",
        "display_name": "读取文档",
        "description": "读取 Office 文档（PDF、Word、Excel、PPT）的内容并提取其中的文本。",
        "category": "file",
        "icon": "📑",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Document file path, e.g.: workspace/report.pdf"}
            },
            "required": ["path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "convert_csv_to_xlsx",
        "display_name": "CSV 转 Excel",
        "description": "将 CSV 源文件转换为 Excel .xlsx 文件。请先创建/编辑好 CSV 文件，再调用本工具。",
        "category": "file",
        "icon": "📊",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Path to the source CSV file"},
                "target_path": {"type": "string", "description": "Path for the output Excel file (.xlsx)"},
            },
            "required": ["source_path", "target_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "convert_html_to_pdf",
        "display_name": "HTML 转 PDF",
        "description": "将 HTML 源文件转换为 PDF 文档。默认使用无头 Chrome 进行渲染，以更忠实地呈现现代 CSS 与屏幕布局，并以 WeasyPrint 作为后备方案。",
        "category": "file",
        "icon": "📄",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Path to the source HTML file"},
                "target_path": {"type": "string", "description": "Path for the output PDF file (.pdf)"},
                "design_width": {"type": "number", "description": "Optional browser viewport width in pixels, default 1280"},
                "design_height": {"type": "number", "description": "Optional browser viewport height in pixels, default 720"},
                "pdf_mode": {"type": "string", "enum": ["pages", "single"], "description": "pages outputs paginated PDF, single outputs one long full-page PDF. Default: pages"},
                "scale": {"type": "number", "description": "Optional Chrome PDF scale for paginated output, default 0.64"},
                "paper_width": {"type": "number", "description": "Optional paper width in inches for paginated output, default 8.27"},
                "paper_height": {"type": "number", "description": "Optional paper height in inches for paginated output, default 11.69"},
            },
            "required": ["source_path", "target_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "convert_html_to_pptx",
        "display_name": "HTML 转 PPT",
        "description": "将 HTML 源文件转换为 PowerPoint .pptx 文件。默认 render_mode='editable' 会在无头 Chrome 中打开 HTML、采集真实元素的位置与样式，并将显式的 .slide / data-slide 节点或顶层 section 映射为可编辑的 PPT 元素。当「视觉保真度优先于可编辑性」时，可使用 render_mode='visual' 作为高保真截图后备方案。",
        "category": "file",
        "icon": "📽️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Path to the source HTML file"},
                "target_path": {"type": "string", "description": "Path for the output PowerPoint file (.pptx)"},
                "design_width": {"type": "number", "description": "Optional source design width in pixels, default 1280"},
                "design_height": {"type": "number", "description": "Optional source design height in pixels, default 720"},
                "render_mode": {"type": "string", "enum": ["editable", "visual"], "description": "editable maps HTML/CSS into editable PPT elements using Chrome layout sampling; visual preserves styling with Chrome-rendered screenshots as a fallback. Default: editable"},
                "render_scale": {"type": "number", "description": "Optional Chrome raster scale for screenshots and complex CSS captures. Higher values improve sharpness but increase PPTX size. Default: 2, clamped between 1 and 4"},
            },
            "required": ["source_path", "target_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "convert_markdown_to_docx",
        "display_name": "Markdown 转 Word",
        "description": "将 Markdown 源文件转换为 Word .docx 文件。",
        "category": "file",
        "icon": "📝",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Path to the source Markdown file"},
                "target_path": {"type": "string", "description": "Path for the output Word file (.docx)"},
            },
            "required": ["source_path", "target_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "convert_markdown_to_pdf",
        "display_name": "Markdown 转 PDF",
        "description": "将 Markdown 源文件转换为 PDF 文档。",
        "category": "file",
        "icon": "📄",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source_path": {"type": "string", "description": "Path to the source Markdown file"},
                "target_path": {"type": "string", "description": "Path for the output PDF file (.pdf)"},
            },
            "required": ["source_path", "target_path"],
        },
        "config": {},
        "config_schema": {},
    },
    # --- Aware trigger management tools ---
    {
        "name": "set_trigger",
        "display_name": "新建触发器",
        "description": "为自己在指定时间或条件下创建一个新的触发器，以便届时被唤醒。每个触发器都会挂在一个 Focus 项上；如果未提供 focus_ref，系统会根据 reason 自动创建一个 Focus 项。触发器类型：'cron'（按计划循环触发）、'once'（在指定时间触发一次）、'interval'（每 N 分钟触发一次）、'poll'（HTTP 监听）、'on_message'（在收到另一个数字员工或人类用户的回复时触发）。",
        "category": "aware",
        "icon": "⚡",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Unique name for this trigger"},
                "type": {"type": "string", "enum": ["cron", "once", "interval", "poll", "on_message"], "description": "Trigger type"},
                "config": {"type": "object", "description": "Type-specific config. cron: {\"expr\": \"0 9 * * *\"}. once: {\"at\": \"2026-03-10T09:00:00+08:00\"}. interval: {\"minutes\": 30}. poll: {\"url\": \"...\", \"json_path\": \"$.status\"}. on_message: {\"from_agent_name\": \"Morty\"} or {\"from_user_name\": \"张三\"}"},
                "reason": {"type": "string", "description": "What to do when this trigger fires"},
                "focus_ref": {"type": "string", "description": "Optional: which focus item this relates to. If omitted, one is created automatically."},
            },
            "required": ["name", "type", "config", "reason"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "update_trigger",
        "display_name": "更新触发器",
        "description": "更新一个已存在触发器的配置或触发原因。",
        "category": "aware",
        "icon": "🔄",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the trigger to update"},
                "config": {"type": "object", "description": "New config (replaces existing)"},
                "reason": {"type": "string", "description": "New reason text"},
            },
            "required": ["name"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "cancel_trigger",
        "display_name": "取消触发器",
        "description": "按名称取消（停用）一个触发器。在任务完成时使用。",
        "category": "aware",
        "icon": "⏹️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the trigger to cancel"},
            },
            "required": ["name"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "list_triggers",
        "display_name": "列出触发器",
        "description": "列出所有处于活动状态的触发器，包含名称、类型、配置、原因、触发次数和状态。",
        "category": "aware",
        "icon": "📋",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {},
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "send_channel_file",
        "display_name": "发送文件",
        "description": "向指定人员发送文件，或把文件送回当前会话。如果提供 member_name，系统会跨所有已接入的渠道（飞书、Slack 等）解析收件人，并通过相应的渠道投递文件。",
        "category": "communication",
        "icon": "📎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Workspace-relative path to the file"},
                "member_name": {"type": "string", "description": "Name of the person to send the file to. The system looks up this person across all configured channels and delivers via the appropriate one."},
                "message": {"type": "string", "description": "Optional message to accompany the file"},
            },
            "required": ["file_path"],
        },
        "config": {},
        "config_schema": {},
    },
    # NOTE: send_feishu_message is defined in the 'feishu' category section below.
    # It was previously duplicated here under 'communication', which could cause
    # 'Tool names must be unique' errors when the DB lacked a UNIQUE constraint.
    {
        "name": "send_platform_message",
        "display_name": "平台消息",
        "description": "在数字员工自有平台（Web 或 App）上向用户主动发送一条消息。该消息会出现在他们的平台聊天记录中，并在其在线时实时推送。",
        "category": "communication",
        "icon": "🌐",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "username": {"type": "string", "description": "Recipient username or display name"},
                "message": {"type": "string", "description": "Message content"},
            },
            "required": ["username", "message"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "send_message_to_agent",
        "display_name": "数字员工消息",
        "description": "向另一位数字员工发送消息。决策指南：对方需要执行任务并返回结果？→ task_delegate。仅需知会？→ notify。快速事实性提问？→ consult。不确定时优先使用 task_delegate。",
        "category": "communication",
        "icon": "🤖",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string", "description": "Target agent name"},
                "message": {"type": "string", "description": "Message content"},
                "msg_type": {"type": "string", "enum": ["notify", "consult", "task_delegate"], "description": "(1) Target needs to DO WORK and return results? → task_delegate. (2) Just FYI? → notify. (3) Quick factual question? → consult. When unsure, prefer task_delegate."},
            },
            "required": ["agent_name", "message", "msg_type"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "send_file_to_agent",
        "display_name": "数字员工文件传输",
        "description": "将工作区中的文件发送给另一位数字员工。文件会被复制到对方工作区的 workspace/inbox/files/ 目录，并生成一条收件箱记录。",
        "category": "communication",
        "icon": "📤",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string", "description": "Target agent name"},
                "file_path": {"type": "string", "description": "Workspace-relative source file path"},
                "message": {"type": "string", "description": "Optional delivery note"},
            },
            "required": ["agent_name", "file_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "web_search",
        "display_name": "网页搜索",
        "description": "[已废弃] 带引擎选择器的统一搜索工具。请改用专用工具（DuckDuckGo Search、Tavily Search、Google Search、Bing Search、Exa Search）以便按引擎精细控制。",
        "category": "search",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results to return"},
            },
            "required": ["query"],
        },
        "config": {
            "search_engine": "duckduckgo",
            "max_results": 5,
            "language": "en",
            "api_key": "",
        },
        "config_schema": {
            "fields": [
                {
                    "key": "search_engine",
                    "label": "Search Engine",
                    "type": "select",
                    "options": [
                        {"value": "duckduckgo", "label": "DuckDuckGo (free, no API key)"},
                        {"value": "tavily", "label": "Tavily (AI search, needs API key)"},
                        {"value": "google", "label": "Google Custom Search (needs API key)"},
                        {"value": "bing", "label": "Bing Search API (needs API key)"},
                        {"value": "exa", "label": "Exa (AI-powered search, needs API key)"},
                    ],
                    "default": "duckduckgo",
                },
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Required for engines that need an API key",
                    "depends_on": {"search_engine": ["tavily", "google", "bing", "exa"]},
                },
                {
                    "key": "max_results",
                    "label": "Default results count",
                    "type": "number",
                    "default": 5,
                    "min": 1,
                    "max": 20,
                },
                {
                    "key": "language",
                    "label": "Search language",
                    "type": "select",
                    "options": [
                        {"value": "en", "label": "English"},
                        {"value": "zh-CN", "label": "中文"},
                        {"value": "ja", "label": "日本語"},
                    ],
                    "default": "en",
                },
            ]
        },
    },
    {
        "name": "jina_search",
        "display_name": "Jina 搜索",
        "description": "使用 Jina AI（s.jina.ai）检索互联网，返回高质量的完整内容结果。需要 Jina AI API Key 才能获得更高的速率限制。",
        "category": "search",
        "icon": "🔮",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results (default 5, max 10)"},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "Jina AI API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "jina_xxxxxxxxxxxxxxxx (get one at jina.ai)",
                },
            ]
        },
    },
    {
        "name": "jina_read",
        "display_name": "Jina 读取",
        "description": "使用 Jina AI Reader（r.jina.ai）从指定 URL 中读取并抽取完整内容，返回干净的 Markdown 文本。需要 Jina AI API Key 才能获得更高的速率限制。",
        "category": "search",
        "icon": "📖",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL to read"},
                "max_chars": {"type": "integer", "description": "Max characters to return (default 8000)"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "Jina AI API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "jina_xxxxxxxxxxxxxxxx (get one at jina.ai)",
                },
            ]
        },
    },
    {
        "name": "read_webpage",
        "display_name": "读取网页",
        "description": "直接抓取一个公开的 HTTP/HTTPS URL，并从中提取可读的网页正文。当你已经有具体链接、不想依赖外部 Reader 服务时，请使用本工具。",
        "category": "search",
        "icon": "🌐",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full public HTTP/HTTPS URL to read"},
                "max_chars": {"type": "integer", "description": "Max characters to return (default 12000, max 50000)"},
                "include_links": {"type": "boolean", "description": "Whether to include extracted page links (default false)"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "exa_search",
        "display_name": "Exa 搜索",
        "description": "使用 Exa（exa.ai）进行 AI 驱动的网页搜索。支持语义搜索、类别过滤、域名过滤以及多种内容返回模式（text、highlights、summary）。需要 Exa API Key。",
        "category": "search",
        "icon": "🔎",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Number of results (default 5, max 10)"},
                "search_type": {
                    "type": "string",
                    "description": "Search type: auto (default), neural, or fast",
                    "enum": ["auto", "neural", "fast"],
                },
                "category": {
                    "type": "string",
                    "description": "Filter by category: company, research paper, news, personal site, financial report, or people",
                },
                "include_domains": {
                    "type": "string",
                    "description": "Comma-separated domains to restrict results to (e.g. 'arxiv.org, github.com')",
                },
                "exclude_domains": {
                    "type": "string",
                    "description": "Comma-separated domains to exclude from results",
                },
                "content_mode": {
                    "type": "string",
                    "description": "Content retrieval mode: text (default), highlights, or summary",
                    "enum": ["text", "highlights", "summary"],
                },
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "Exa API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your API key at exa.ai",
                },
            ]
        },
    },
    # ── Standalone search engines (each engine as its own tool) ──────────────
    # These complement web_search (which remains for backward compatibility).
    # Each tool wraps a single engine so agents can pick the right one for the
    # task without going through the unified engine-selector flow.
    {
        "name": "duckduckgo_search",
        "display_name": "DuckDuckGo 搜索",
        "description": "使用 DuckDuckGo 检索互联网。免费，无需 API Key，返回包含标题、URL 和摘要的结果。",
        "category": "search",
        "icon": "🦆",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results to return (default 5, max 10)"},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {"fields": []},
    },
    {
        "name": "tavily_search",
        "display_name": "Tavily 搜索",
        "description": "使用 Tavily 进行面向 AI 优化的网页搜索，返回带摘要的高质量结果。需要 Tavily API Key。",
        "category": "search",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results to return (default 5, max 10)"},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "Tavily API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "tvly-xxxxxxxxxxxxxxxx (get one at tavily.com)",
                },
            ]
        },
    },
    {
        "name": "google_search",
        "display_name": "Google 搜索",
        "description": "使用 Google Custom Search JSON API 进行搜索，返回标题、URL 和摘要。需要同时提供 Google API Key 和 Custom Search Engine ID（格式：API_KEY:CX_ID）。",
        "category": "search",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results to return (default 5, max 10)"},
                "language": {"type": "string", "description": "Search language code (e.g. 'en', 'zh')"},
            },
            "required": ["query"],
        },
        "config": {"language": "en"},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "API Key & Search Engine ID",
                    "type": "password",
                    "default": "",
                    "placeholder": "API_KEY:SEARCH_ENGINE_ID (get at console.cloud.google.com)",
                },
                {
                    "key": "language",
                    "label": "Search language",
                    "type": "select",
                    "options": [
                        {"value": "en", "label": "English"},
                        {"value": "zh-CN", "label": "Chinese"},
                        {"value": "ja", "label": "Japanese"},
                    ],
                    "default": "en",
                },
            ]
        },
    },
    {
        "name": "bing_search",
        "display_name": "Bing 搜索",
        "description": "使用 Bing Web Search API 进行搜索，返回标题、URL 和摘要。需要从 Microsoft Azure 申请 Bing Search API Key。",
        "category": "search",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "max_results": {"type": "integer", "description": "Number of results to return (default 5, max 10)"},
                "language": {"type": "string", "description": "Market language code (e.g. 'en-US', 'zh-CN')"},
            },
            "required": ["query"],
        },
        "config": {"language": "en-US"},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "Bing Search API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get from Azure Cognitive Services (Bing Search v7)",
                },
                {
                    "key": "language",
                    "label": "Market language",
                    "type": "select",
                    "options": [
                        {"value": "en-US", "label": "English (US)"},
                        {"value": "zh-CN", "label": "Chinese (Simplified)"},
                        {"value": "ja-JP", "label": "Japanese"},
                    ],
                    "default": "en-US",
                },
            ]
        },
    },
    {
        "name": "plaza_get_new_posts",
        "display_name": "Plaza：浏览",
        "description": "获取 Agent Plaza（共享信息流）的最新帖子，返回自指定时间戳以来的帖子和评论。",
        "category": "social",
        "icon": "🏛️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max number of posts to return (default 10)", "default": 10},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "plaza_create_post",
        "display_name": "Plaza：发帖",
        "description": "在 Agent Plaza 上发布一条新帖子，用于分享工作心得、技巧或有趣的发现。请勿分享任何隐私信息。",
        "category": "social",
        "icon": "📝",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Post content (max 500 chars). Must be public-safe."},
            },
            "required": ["content"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "plaza_add_comment",
        "display_name": "Plaza：评论",
        "description": "对一条已有的 Plaza 帖子发表评论，与同事的帖子互动。",
        "category": "social",
        "icon": "💬",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "post_id": {"type": "string", "description": "The UUID of the post to comment on"},
                "content": {"type": "string", "description": "Comment content (max 300 chars)"},
            },
            "required": ["post_id", "content"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "execute_code",
        "display_name": "代码执行",
        "description": "在数字员工工作区内的本地沙箱子进程中执行代码（Python、Bash、Node.js）。适用于数据处理、计算、文件转换和自动化任务。",
        "category": "code",
        "icon": "💻",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "language": {"type": "string", "enum": ["python", "bash", "node"], "description": "Programming language"},
                "code": {"type": "string", "description": "Code to execute"},
                "timeout": {"type": "integer", "description": "Max execution time in seconds (default 30, max 60)"},
            },
            "required": ["language", "code"],
        },
        "config": {
            "sandbox_type": "subprocess",
            "cpu_limit": "0.5",
            "memory_limit": "256m",
            "allow_network": True,
            "default_timeout": 30,
            "max_timeout": 60,
        },
        "config_schema": {
            "fields": [
                {
                    "key": "cpu_limit",
                    "label": "CPU Limit",
                    "type": "text",
                    "default": "0.5",
                    "placeholder": "e.g., 0.5, 1.0, 2.0",
                },
                {
                    "key": "memory_limit",
                    "label": "Memory Limit",
                    "type": "text",
                    "default": "256m",
                    "placeholder": "e.g., 256m, 512m, 1g",
                },
                {
                    "key": "allow_network",
                    "label": "Allow Network Access",
                    "type": "checkbox",
                    "default": True,
                    "read_only_for_roles": ["agent_admin", "member"],
                },
                {
                    "key": "default_timeout",
                    "label": "Default Timeout (seconds)",
                    "type": "number",
                    "default": 30,
                    "min": 5,
                    "max": 3600,
                },
                {
                    "key": "max_timeout",
                    "label": "Max Timeout (seconds)",
                    "type": "number",
                    "default": 60,
                    "min": 10,
                    "max": 3600,
                },
            ]
        },
    },
    {
        "name": "execute_code_e2b",
        "display_name": "代码执行（E2B 云端）",
        "description": "在安全的 E2B 云沙箱中执行代码（Python、Bash、Node.js）。提供完整的网络访问和隔离环境，且不占用本地资源。需要 E2B API Key。",
        "category": "code",
        "icon": "☁️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "language": {"type": "string", "enum": ["python", "bash", "node"], "description": "Programming language"},
                "code": {"type": "string", "description": "Code to execute"},
                "timeout": {"type": "integer", "description": "Max execution time in seconds (default 30, max 60)"},
            },
            "required": ["language", "code"],
        },
        "config": {
            "sandbox_type": "e2b",
            "api_key": "",
            "default_timeout": 30,
            "max_timeout": 60,
        },
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "E2B API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your API key at https://e2b.dev",
                    "required": True,
                },
                {
                    "key": "default_timeout",
                    "label": "Default Timeout (seconds)",
                    "type": "number",
                    "default": 30,
                    "min": 5,
                    "max": 3600,
                },
                {
                    "key": "max_timeout",
                    "label": "Max Timeout (seconds)",
                    "type": "number",
                    "default": 60,
                    "min": 10,
                    "max": 3600,
                },
            ]
        },
    },

    {
        "name": "upload_image",
        "display_name": "上传图片",
        "description": "将工作区或某个 URL 上的图片上传到 ImageKit CDN，并返回一个公开 URL。适用于对外分享图片或将其嵌入报告。",
        "category": "code",
        "icon": "🖼️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Workspace-relative path to image file"},
                "url": {"type": "string", "description": "Public URL of image to upload"},
                "file_name": {"type": "string", "description": "Custom filename (optional)"},
                "folder": {"type": "string", "description": "CDN folder path (default /clawith)"},
            },
        },
        "config": {"private_key": "", "url_endpoint": ""},
        "config_schema": {
            "fields": [
                {
                    "key": "private_key",
                    "label": "ImageKit Private Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Your ImageKit private API key",
                },
                {
                    "key": "url_endpoint",
                    "label": "ImageKit URL Endpoint",
                    "type": "text",
                    "default": "",
                    "placeholder": "https://ik.imagekit.io/your_imagekit_id",
                },
            ]
        },
    },
    {
        "name": "generate_image_siliconflow",
        "display_name": "生成图片（SiliconFlow）",
        "description": "使用 SiliconFlow 的 FLUX 模型生成图片，对国内网络友好且响应速度快。",
        "category": "media",
        "icon": "🎨",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Detailed image description."},
                "size": {"type": "string", "description": "Image size (e.g. 1024x1024, 1024x768). Default 1024x1024."},
                "save_path": {"type": "string", "description": "Save path in workspace. Default: auto."},
            },
            "required": ["prompt"],
        },
        "config": {
            "model": "",
            "api_key": "",
            "base_url": "",
        },
        "config_schema": {
            "fields": [
                {
                    "key": "model",
                    "label": "Model",
                    "type": "text",
                    "default": "",
                    "placeholder": "e.g. black-forest-labs/FLUX.1-schnell",
                },
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "SiliconFlow API Key",
                },
                {
                    "key": "base_url",
                    "label": "Base URL (optional)",
                    "type": "text",
                    "default": "",
                    "placeholder": "Default: https://api.siliconflow.cn/v1",
                },
            ]
        },
    },
    {
        "name": "generate_image_openai",
        "display_name": "生成图片（OpenAI）",
        "description": "通过 OpenAI DALL-E 系列模型生成图片。",
        "category": "media",
        "icon": "🎨",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Detailed image description."},
                "size": {"type": "string", "description": "Image size (e.g. 1024x1024). Default 1024x1024."},
                "save_path": {"type": "string", "description": "Save path in workspace. Default: auto."},
            },
            "required": ["prompt"],
        },
        "config": {
            "model": "",
            "api_key": "",
            "base_url": "",
        },
        "config_schema": {
            "fields": [
                {
                    "key": "model",
                    "label": "Model",
                    "type": "text",
                    "default": "",
                    "placeholder": "e.g. dall-e-3 or dall-e-2",
                },
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "OpenAI API Key",
                },
                {
                    "key": "base_url",
                    "label": "Base URL (optional)",
                    "type": "text",
                    "default": "",
                    "placeholder": "Default: https://api.openai.com/v1",
                },
            ]
        },
    },
    {
        "name": "generate_image_google",
        "display_name": "生成图片（Google/Vertex）",
        "description": "通过 Google Gemini Image（Nano Banana）或 Vertex AI 生成图片。",
        "category": "media",
        "icon": "🎨",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Detailed image description."},
                "size": {"type": "string", "description": "Image size (e.g. 1024x1024). Default 1024x1024."},
                "save_path": {"type": "string", "description": "Save path in workspace. Default: auto."},
            },
            "required": ["prompt"],
        },
        "config": {
            "model": "",
            "api_key": "",
            "base_url": "",
        },
        "config_schema": {
            "fields": [
                {
                    "key": "model",
                    "label": "Model",
                    "type": "text",
                    "default": "",
                    "placeholder": "e.g. gemini-2.5-flash-image",
                },
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Google AI Studio or Vertex API Key",
                },
                {
                    "key": "base_url",
                    "label": "Base URL (optional)",
                    "type": "text",
                    "default": "",
                    "placeholder": "Can be Vertex API URL: https://aiplatform.googleapis.com/...",
                },
            ]
        },
    },
    {
        "name": "generate_image_custom",
        "display_name": "生成图片（自定义 API）",
        "description": "通过自定义的 OpenAI 兼容 API 或网关生成图片。可配置请求体模板和响应图片路径，适用于 TokenRouter、OpenRouter 等服务。",
        "category": "media",
        "icon": "🎨",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Detailed image description."},
                "size": {"type": "string", "description": "Image size (e.g. 1024x1024). Default 1024x1024."},
                "save_path": {"type": "string", "description": "Save path in workspace. Default: auto."},
            },
            "required": ["prompt"],
        },
        "config": {
            "api_key": "",
            "base_url": "",
            "endpoint_path": "/chat/completions",
            "model": "",
            "request_body_template_json": "{\n  \"model\": \"{model}\",\n  \"messages\": [\n    {\n      \"role\": \"user\",\n      \"content\": \"{prompt}\"\n    }\n  ],\n  \"modalities\": [\"image\", \"text\"],\n  \"stream\": false\n}",
            "response_image_path": "choices.0.message.images.0.image_url.url",
            "extra_headers_json": "",
            "timeout_seconds": 120,
        },
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "API key for your image generation gateway",
                },
                {
                    "key": "model",
                    "label": "Model",
                    "type": "text",
                    "default": "",
                    "placeholder": "e.g. google/gemini-2.5-flash-image",
                },
                {
                    "key": "base_url",
                    "label": "Base URL",
                    "type": "text",
                    "default": "",
                    "placeholder": "e.g. https://api.tokenrouter.com/v1 or https://openrouter.ai/api/v1",
                },
                {
                    "key": "endpoint_path",
                    "label": "Endpoint Path",
                    "type": "text",
                    "default": "/chat/completions",
                    "placeholder": "/chat/completions",
                    "advanced": True,
                },
                {
                    "key": "request_body_template_json",
                    "label": "Request Body Template JSON",
                    "type": "textarea",
                    "default": "{\n  \"model\": \"{model}\",\n  \"messages\": [\n    {\n      \"role\": \"user\",\n      \"content\": \"{prompt}\"\n    }\n  ],\n  \"modalities\": [\"image\", \"text\"],\n  \"stream\": false\n}",
                    "placeholder": "{\n  \"model\": \"{model}\",\n  \"messages\": [{\"role\": \"user\", \"content\": \"{prompt}\"}],\n  \"modalities\": [\"image\", \"text\"],\n  \"stream\": false\n}",
                    "advanced": True,
                },
                {
                    "key": "response_image_path",
                    "label": "Response Image Path",
                    "type": "text",
                    "default": "choices.0.message.images.0.image_url.url",
                    "placeholder": "choices.0.message.images.0.image_url.url",
                    "advanced": True,
                },
                {
                    "key": "extra_headers_json",
                    "label": "Extra Headers JSON",
                    "type": "textarea",
                    "default": "",
                    "placeholder": "{\n  \"HTTP-Referer\": \"https://your-app.example\",\n  \"X-Title\": \"DigitalEmployee\"\n}",
                    "advanced": True,
                },
                {
                    "key": "timeout_seconds",
                    "label": "Timeout Seconds",
                    "type": "number",
                    "default": 120,
                    "min": 10,
                    "max": 600,
                    "advanced": True,
                },
            ]
        },
    },
    {
        "name": "discover_resources",
        "display_name": "资源发现",
        "description": "在 Smithery、ModelScope 等公共 MCP 注册中心搜索可以扩展自身能力的工具与功能。当你遇到现有工具无法处理的任务时，可以使用本工具。",
        "category": "discovery",
        "icon": "🔎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Semantic description of the capability needed, e.g. 'send email', 'query SQL database', 'generate images'"},
                "max_results": {"type": "integer", "description": "Max results to return (default 5, max 10)"},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "smithery_api_key",
                    "label": "Smithery API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your key at smithery.ai/account/api-keys",
                },
                {
                    "key": "modelscope_api_token",
                    "label": "ModelScope API Token",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your token at modelscope.cn → Home → Access Tokens",
                },
            ]
        },
    },
    {
        "name": "import_mcp_server",
        "display_name": "导入 MCP 服务器",
        "description": "从 Smithery 注册中心导入一个 MCP 服务器到平台，导入后该服务器的工具即可被使用。请先调用 discover_resources 找到相应的服务器 ID。",
        "category": "discovery",
        "icon": "📥",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "server_id": {"type": "string", "description": "Smithery server ID, e.g. '@anthropic/brave-search' or '@anthropic/fetch'"},
                "config": {"type": "object", "description": "Optional server configuration (e.g. API keys required by the server)"},
            },
            "required": ["server_id"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "smithery_api_key",
                    "label": "Smithery API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your key at smithery.ai/account/api-keys",
                },
                {
                    "key": "modelscope_api_token",
                    "label": "ModelScope API Token",
                    "type": "password",
                    "default": "",
                    "placeholder": "Get your token at modelscope.cn → Home → Access Tokens",
                },
            ]
        },
    },
    # --- Email tools ---
    {
        "name": "send_email",
        "display_name": "发送邮件",
        "description": "向一个或多个收件人发送邮件。支持主题、正文、抄送以及来自工作区的附件。",
        "category": "email",
        "icon": "📧",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address(es), comma-separated for multiple"},
                "subject": {"type": "string", "description": "Email subject line"},
                "body": {"type": "string", "description": "Email body text"},
                "cc": {"type": "string", "description": "CC recipients, comma-separated (optional)"},
                "attachments": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of workspace-relative file paths to attach (optional). E.g. ['workspace/filename.ext']. Always specify this parameter if the user uploads a file or mentions sending/attaching a file.",
                },
            },
            "required": ["to", "subject", "body"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "email_provider",
                    "label": "Email Provider",
                    "type": "select",
                    "options": [
                        {"value": "gmail", "label": "Gmail", "help_text": "Google Account → Security → App passwords → Generate app password", "help_url": "https://support.google.com/accounts/answer/185833"},
                        {"value": "outlook", "label": "Outlook / Microsoft 365", "help_text": "Microsoft Account → Security → App passwords", "help_url": "https://support.microsoft.com/en-us/account-billing/manage-app-passwords-for-two-step-verification-d6dc8c6d-4bf7-4851-ad95-6d07799387e9"},
                        {"value": "qq", "label": "QQ Mail", "help_text": "Settings → Account → POP3/IMAP/SMTP → Enable IMAP → Generate authorization code", "help_url": "https://service.mail.qq.com/detail/0/310"},
                        {"value": "163", "label": "163 Mail", "help_text": "Settings → POP3/SMTP/IMAP → Enable IMAP → Set authorization code", "help_url": "https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2"},
                        {"value": "qq_enterprise", "label": "Tencent Enterprise Mail", "help_text": "Enterprise Mail → Settings → Client-specific password → Generate new password", "help_url": "https://open.work.weixin.qq.com/help2/pc/18624"},
                        {"value": "aliyun", "label": "Alibaba Enterprise Mail", "help_text": "Use your email password directly", "help_url": ""},
                        {"value": "custom", "label": "Custom", "help_text": "Use the authorization code or app password from your email provider", "help_url": ""},
                    ],
                    "default": "gmail",
                },
                {
                    "key": "email_address",
                    "label": "Email Address",
                    "type": "text",
                    "placeholder": "your@email.com",
                },
                {
                    "key": "auth_code",
                    "label": "Authorization Code",
                    "type": "password",
                    "placeholder": "Authorization code (not your login password)",
                },
                {
                    "key": "imap_host",
                    "label": "IMAP Host",
                    "type": "text",
                    "placeholder": "imap.example.com",
                    "depends_on": {"email_provider": ["custom"]},
                },
                {
                    "key": "imap_port",
                    "label": "IMAP Port",
                    "type": "number",
                    "default": 993,
                    "depends_on": {"email_provider": ["custom"]},
                },
                {
                    "key": "smtp_host",
                    "label": "SMTP Host",
                    "type": "text",
                    "placeholder": "smtp.example.com",
                    "depends_on": {"email_provider": ["custom"]},
                },
                {
                    "key": "smtp_port",
                    "label": "SMTP Port",
                    "type": "number",
                    "default": 465,
                    "depends_on": {"email_provider": ["custom"]},
                },
            ]
        },
    },
    {
        "name": "read_emails",
        "display_name": "读取邮件",
        "description": "读取收件箱中的邮件，可以限制返回数量，也可以按条件搜索（例如 FROM、SUBJECT、SINCE 日期）。",
        "category": "email",
        "icon": "📬",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max number of emails to return (default 10, max 30)", "default": 10},
                "search": {"type": "string", "description": "IMAP search criteria, e.g. 'FROM \"john@example.com\"', 'SUBJECT \"meeting\"', 'SINCE 01-Mar-2026'. Default: all emails."},
                "folder": {"type": "string", "description": "Mailbox folder (default INBOX)", "default": "INBOX"},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "reply_email",
        "display_name": "回复邮件",
        "description": "通过 Message-ID 回复一封邮件，会通过 In-Reply-To 头保持邮件会话的归属。",
        "category": "email",
        "icon": "↩️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "message_id": {"type": "string", "description": "Message-ID of the email to reply to (from read_emails output)"},
                "body": {"type": "string", "description": "Reply body text"},
            },
            "required": ["message_id", "body"],
        },
        "config": {},
        "config_schema": {},
    },
    # --- OKR Tools ---
    # These tools expose the OKR system to agents. Not default — assigned explicitly
    # to the OKR Agent and to other agents that want to self-report progress.
    {
        "name": "get_okr",
        "display_name": "获取 OKR 看板",
        "description": (
            "获取当前周期的完整 OKR 看板，返回该租户下所有的 Objective 和 Key Result，"
            "按公司层级和成员层级组织。每个 Objective 都会附上 objective_id，每个 Key Result 都会附上 kr_id，"
            "便于你在更新已有目标时直接复用，避免创建重复条目。被 OKR 数字员工用来生成进展报告和监控团队表现。"
        ),
        "category": "okr",
        "icon": "🎯",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "period_start": {
                    "type": "string",
                    "description": "Optional: ISO date string (YYYY-MM-DD) to filter by period start. Defaults to current period.",
                },
                "period_end": {
                    "type": "string",
                    "description": "Optional: ISO date string (YYYY-MM-DD) to filter by period end.",
                },
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "get_my_okr",
        "display_name": "我的 OKR",
        "description": (
            "获取自己在当前周期的 OKR Objective 和 Key Result。"
            "返回包含目标、当前进度值以及 objective_id、kr_id 引用在内的结构化视图，"
            "你需要它们才能正确更新已有 OKR。在修改进度、KR 内容或 Objective 文本之前请先调用本工具，"
            "从而复用现有记录，避免创建重复条目。"
        ),
        "category": "okr",
        "icon": "🎯",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "period_start": {
                    "type": "string",
                    "description": "Optional: ISO date string (YYYY-MM-DD). Defaults to current period.",
                },
                "period_end": {
                    "type": "string",
                    "description": "Optional: ISO date string (YYYY-MM-DD).",
                },
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "update_kr_progress",
        "display_name": "更新 KR 进度",
        "description": (
            "更新某条 Key Result 的当前进度值。请先调用 get_my_okr 获取 kr_id。"
            "状态（on_track / at_risk / behind / completed）会根据进度比例自动计算，"
            "也可以由你显式覆盖。同时会写入一条进度日志，作为完整的审计记录。"
        ),
        "category": "okr",
        "icon": "📈",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "kr_id": {
                    "type": "string",
                    "description": "UUID of the Key Result to update. Get this from get_my_okr.",
                },
                "value": {
                    "type": "number",
                    "description": "New current value (e.g. 4.2 for a KR with target 5.0).",
                },
                "note": {
                    "type": "string",
                    "description": "Optional note explaining the progress update (e.g. 'Completed weekly review session').",
                },
                "status": {
                    "type": "string",
                    "enum": ["on_track", "at_risk", "behind", "completed"],
                    "description": "Optional: override the auto-computed status.",
                },
            },
            "required": ["kr_id", "value"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "update_kr_content",
        "display_name": "更新 KR 内容",
        "description": (
            "更新**你自己**某条 Key Result 的内容字段，例如标题、目标值、单位、focus 引用或状态。"
            "请先调用 get_my_okr 获取 kr_id。本工具用于修改 KR 的定义/内容，而不是上报进度。"
            "如果用户希望修改、调整或替换已有 KR 的目标值或措辞，请优先使用本工具，而不是 create_key_result。"
        ),
        "category": "okr",
        "icon": "✏️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "kr_id": {
                    "type": "string",
                    "description": "UUID of the Key Result to update (from get_my_okr).",
                },
                "title": {
                    "type": "string",
                    "description": "Optional new KR title.",
                },
                "target_value": {
                    "type": "number",
                    "description": "Optional new target value.",
                },
                "unit": {
                    "type": "string",
                    "description": "Optional new unit label.",
                },
                "focus_ref": {
                    "type": "string",
                    "description": "Optional new focus file reference.",
                },
                "status": {
                    "type": "string",
                    "enum": ["on_track", "at_risk", "behind", "completed"],
                    "description": "Optional explicit status override.",
                },
            },
            "required": ["kr_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        # collect_okr_progress — legacy OKR Agent heartbeat collection path.
        # This replaces the need to contact each member individually.
        "name": "collect_okr_progress",
        "display_name": "汇总 OKR 进度",
        "description": (
            "旧版的批量同步路径，用于汇总已上报的 KR 进度。新场景下请优先使用 get_my_okr、"
            "update_kr_progress 等直接操作 OKR 的工具。返回值包含已更新 KR 的数量汇总。"
        ),
        "category": "okr",
        "icon": "📊",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # generate_okr_report — OKR Agent calls this to produce the structured report.
        # The tool writes the report to WorkReport table and returns the markdown content
        # so the Agent can choose to post it to Plaza or send it to specific channels.
        "name": "generate_okr_report",
        "display_name": "生成 OKR 报告",
        "description": (
            "为当前周期生成结构化的 OKR 进展报告（日/周报）。报告中会汇总所有 Objective 和 Key Result，"
            "标记有风险或落后的条目，并展示团队整体健康度指标。报告会保存到数据库与工作区的 "
            "workspace/reports/ 目录，返回完整的 Markdown 报告内容，便于你转发到 Plaza 或发给团队。"
        ),
        "category": "okr",
        "icon": "📋",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "report_type": {
                    "type": "string",
                    "enum": ["daily", "weekly"],
                    "description": "Whether to generate a daily or weekly report.",
                },
            },
            "required": ["report_type"],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # get_okr_settings — lets OKR Agent read the tenant's OKR configuration so it
        # can determine whether reports are due, what time they're scheduled, etc.
        "name": "get_okr_settings",
        "display_name": "获取 OKR 设置",
        "description": (
            "读取本团队的 OKR 配置，包括是否启用了日报/周报、配置的报告时间、周期频率等。"
            "在心跳触发开始时调用本工具，用于判断当天是否需要产出报告。"
        ),
        "category": "okr",
        "icon": "⚙️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # create_objective — OKR Agent uses this after conversation-based confirmation
        # to create an O for the company, a user, or an agent. Only OKR Agent has this tool.
        "name": "create_objective",
        "display_name": "创建 Objective",
        "description": (
            "为公司、某个具体用户或某个数字员工创建一个 OKR Objective。"
            "在与相关负责人沟通确认目标之后调用本工具。仅当本周期需要新建 Objective 时才使用本工具。"
            "如果对方已经存在匹配的目标，仅想修订内容，请改用 update_objective。owner_type 必须是"
            "'company'、'user' 或 'agent'。公司级 Objective 不需要 owner_id。period_start、period_end"
            "必须是 ISO 日期字符串（YYYY-MM-DD）。"
        ),
        "category": "okr",
        "icon": "🎯",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The objective title (concise, inspiring, directional).",
                },
                "description": {
                    "type": "string",
                    "description": "Optional detailed description of the objective.",
                },
                "owner_type": {
                    "type": "string",
                    "enum": ["company", "user", "agent"],
                    "description": "Who this objective belongs to.",
                },
                "owner_id": {
                    "type": "string",
                    "description": "UUID of the owner. Try to use this if available in context.",
                },
                "owner_name": {
                    "type": "string",
                    "description": "Optional fallback: the exact display name of the human/agent. Use this ONLY if you don't have their UUID.",
                },
                "period_start": {
                    "type": "string",
                    "description": "ISO date string for the start of the OKR period (e.g. '2026-04-01').",
                },
                "period_end": {
                    "type": "string",
                    "description": "ISO date string for the end of the OKR period (e.g. '2026-06-30').",
                },
            },
            "required": ["title", "owner_type", "period_start", "period_end"],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # create_key_result — OKR Agent creates a measurable KR under a confirmed objective.
        "name": "create_key_result",
        "display_name": "创建 Key Result",
        "description": (
            "在已有的 Objective 下创建一个 Key Result（KR）。请先通过 get_okr 获取 objective_id。"
            "本工具仅用于全新 KR。如果用户希望修改措辞、目标值、单位或 focus 引用等已有 KR 内容，"
            "请改用 update_kr_content。target_value 是目标数字（例如想要增长到 50000 followers），"
            "unit 是可选但建议填写的单位（例如 '%'、'NPS'、'万元'、'followers'）。"
        ),
        "category": "okr",
        "icon": "🔑",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "objective_id": {
                    "type": "string",
                    "description": "UUID of the parent Objective.",
                },
                "title": {
                    "type": "string",
                    "description": "The KR title (specific, measurable outcome).",
                },
                "target_value": {
                    "type": "number",
                    "description": "The target number to achieve (e.g. 50000).",
                },
                "unit": {
                    "type": "string",
                    "description": "Optional unit label (e.g. '%', 'followers', '万元', 'NPS score').",
                },
                "focus_ref": {
                    "type": "string",
                    "description": "Optional: basename of the focus file that tracks this KR (e.g. 'content_quality').",
                },
            },
            "required": ["objective_id", "title", "target_value"],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # update_objective — available to ALL agents, but with ownership enforcement:
        # regular agents can only modify their own O; OKR Agent can modify any O.
        "name": "update_objective",
        "display_name": "更新 Objective",
        "description": (
            "修改某个 Objective 的标题、描述、状态或周期起止日期。"
            "普通数字员工只能修改自己的 Objective——请先调用 get_my_okr 获取 objective_id。"
            "OKR 数字员工可以修改任意成员的 Objective。只填写需要修改的字段。"
            "如果只是想修订已有 OKR 的目标文本，而不是新建一个，请优先使用本工具，而不是 create_objective。"
        ),
        "category": "okr",
        "icon": "✏️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "objective_id": {
                    "type": "string",
                    "description": "UUID of the Objective to update. Get from get_my_okr (own) or get_okr (any).",
                },
                "title": {
                    "type": "string",
                    "description": "New title for the objective.",
                },
                "description": {
                    "type": "string",
                    "description": "New description.",
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "active", "completed", "archived"],
                    "description": "New status for the objective.",
                },
                "period_start": {
                    "type": "string",
                    "description": "New period start date (YYYY-MM-DD).",
                },
                "period_end": {
                    "type": "string",
                    "description": "New period end date (YYYY-MM-DD).",
                },
            },
            "required": ["objective_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        # update_any_kr_progress — OKR Agent exclusive: update KR for any member.
        # Unlike update_kr_progress (self-report), this can update anyone's KR.
        # Used after collecting progress data through conversation.
        "name": "update_any_kr_progress",
        "display_name": "更新任意 KR 进度",
        "description": (
            "更新任意团队成员的 Key Result 进度。本工具是 update_kr_progress 在 OKR 数字员工下的专属版本，"
            "可以修改任何用户或数字员工的 KR，不仅限于调用者本人。"
            "仅在与 KR 所有者沟通确认进度值之后调用本工具。可通过 get_okr 获取 kr_id，"
            "也可以选择性提供 note 说明来源。"
        ),
        "category": "okr",
        "icon": "📈",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "kr_id": {
                    "type": "string",
                    "description": "UUID of the Key Result to update. Get from get_okr.",
                },
                "value": {
                    "type": "number",
                    "description": "New current value for this KR.",
                },
                "note": {
                    "type": "string",
                    "description": "Source or context note (e.g. 'Reported by user in weekly check-in').",
                },
                "status": {
                    "type": "string",
                    "enum": ["on_track", "at_risk", "behind", "completed"],
                    "description": "Optional: override the auto-computed status.",
                },
            },
            "required": ["kr_id", "value"],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # generate_monthly_okr_report — OKR Agent exclusive: produce the monthly summary report.
        # Called automatically by the monthly_okr_report system cron trigger, or on-demand.
        "name": "generate_monthly_okr_report",
        "display_name": "生成月度 OKR 报告",
        "description": (
            "生成月度 OKR 进展汇总报告，覆盖当前周期所有的 Objective 和 Key Result，"
            "突出已完成和有风险的条目，并附带收官行动建议。"
            "保存到 WorkReport（report_type='monthly'）和 workspace/reports/ 目录，"
            "返回完整的 Markdown 内容，便于发送给管理员。"
        ),
        "category": "okr",
        "icon": "📅",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    {
        # upsert_member_daily_report — OKR Agent exclusive: create or revise a member daily report.
        "name": "upsert_member_daily_report",
        "display_name": "更新成员日报",
        "description": (
            "为公司的任意成员创建或更新其最终归一化的日报。"
            "在与该成员讨论进展并将其更新浓缩为一份简洁的最终日报后调用本工具。"
            "存储的内容请控制在 2000 字以内。"
        ),
        "category": "okr",
        "icon": "📝",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "report_date": {
                    "type": "string",
                    "description": "Report date in YYYY-MM-DD format.",
                },
                "content": {
                    "type": "string",
                    "description": "Final concise daily report content. Keep it within 2000 characters.",
                },
                "member_type": {
                    "type": "string",
                    "enum": ["user", "agent"],
                    "description": "Member type. Defaults to user if omitted.",
                },
                "member_id": {
                    "type": "string",
                    "description": "UUID of the member. Preferred when available.",
                },
                "member_name": {
                    "type": "string",
                    "description": "Member display name. Use when you do not have the UUID.",
                },
                "source": {
                    "type": "string",
                    "description": "Optional source tag such as okr_agent_assisted or manual.",
                },
            },
            "required": ["report_date", "content"],
        },
        "config": {"okr_agent_only": True},
        "config_schema": {},
    },
    # --- Feishu Integration Tools ---
    # These tools require a configured Feishu channel to function.
    # They are NOT enabled by default — agents with Feishu channels should enable them.
    {
        "name": "send_feishu_message",
        "display_name": "飞书消息",
        "description": "通过飞书向人类同事发送消息，只能发送给与你存在协作关系的人员。",
        "category": "feishu",
        "icon": "💬",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "member_name": {"type": "string", "description": "Recipient name"},
                "message": {"type": "string", "description": "Message content"},
            },
            "required": ["member_name", "message"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_user_search",
        "display_name": "飞书用户搜索",
        "description": "按姓名在飞书（Lark）通讯录中搜索同事，返回其 open_id、邮箱和所在部门。",
        "category": "feishu",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "The colleague's name to search for"},
            },
            "required": ["name"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_create_app",
        "display_name": "多维表格：创建",
        "description": "在飞书云盘中新建一个多维表格（Bitable）应用。创建后返回可直接访问的链接和 App Token，下一步可以通过 bitable_list_tables 查看初始数据表。",
        "category": "feishu",
        "icon": "📊",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "新多维表格的名称，例如「项目追踪表」"},
                "folder_token": {"type": "string", "description": "可选：父文件夹的 folder_token。不填则创建到「我的空间」根目录。"},
            },
            "required": ["name"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_list_tables",
        "display_name": "多维表格：列出数据表",
        "description": "列出飞书多维表格内的所有数据表 (Tables)。url 支持表格链接或 Wiki 链接。使用此工具了解请求的多维表格中有哪些表。",
        "category": "feishu",
        "icon": "📊",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_list_fields",
        "display_name": "多维表格：列出字段",
        "description": "列出飞书多维表格指定数据表中的所有字段 (Fields)。url 支持表格链接或 Wiki 链接。在查询或修改数据前，必须先调用此工具了解字段名称和类型。",
        "category": "feishu",
        "icon": "⌨️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
                "table_id": {"type": "string", "description": "具体的数据表 ID，如果 url 中包含 tbl 则可以不填。"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_query_records",
        "display_name": "多维表格：查询记录",
        "description": "查询飞书多维表格中的数据行。可以提供过滤条件 (filter)。",
        "category": "feishu",
        "icon": "🔍",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
                "table_id": {"type": "string", "description": "具体的数据表 ID，如果 url 中包含 tbl 则可以不填。"},
                "filter_info": {"type": "string", "description": "可选，FQL 语法的过滤条件，例如 'CurrentValue.[Status]=\"Done\"'。如不确定过滤语法，可以不填，由你臺己在本地过滤返回的所有数据。"},
                "max_results": {"type": "integer", "description": "最大返回条数 (默认 100)"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_create_record",
        "display_name": "多维表格：新建记录",
        "description": "在飞书多维表格中新增一行数据。fields 参数是一个字典，key 是字段名 (需要先通过 bitable_list_fields 获取)，value 是对应的值。",
        "category": "feishu",
        "icon": "➕",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
                "table_id": {"type": "string", "description": "具体的数据表 ID，如果 url 中包含 tbl 则可以不填。"},
                "fields": {"type": "string", "description": "一个 JSON 字符串，代表要插入的 fields。例如：'{\"Name\": \"张三\", \"Age\": 30}'"},
            },
            "required": ["url", "fields"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_update_record",
        "display_name": "多维表格：更新记录",
        "description": "更新飞书多维表格中的指定行数据。",
        "category": "feishu",
        "icon": "✏️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
                "table_id": {"type": "string", "description": "具体的数据表 ID，如果 url 中包含 tbl 则可以不填。"},
                "record_id": {"type": "string", "description": "要更新的 record_id，通过 bitable_query_records 获取。"},
                "fields": {"type": "string", "description": "一个 JSON 字符串，代表要更新的 fields。例如：'{\"Status\": \"Done\"}'"},
            },
            "required": ["url", "record_id", "fields"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "bitable_delete_record",
        "display_name": "多维表格：删除记录",
        "description": "删除飞书多维表格中的指定行数据。",
        "category": "feishu",
        "icon": "🗑️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "多维表格的 URL 链接。"},
                "table_id": {"type": "string", "description": "具体的数据表 ID，如果 url 中包含 tbl 则可以不填。"},
                "record_id": {"type": "string", "description": "要删除的 record_id，通过 bitable_query_records 获取。"},
            },
            "required": ["url", "record_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_doc_search",
        "display_name": "飞书文档搜索",
        "description": "使用飞书官方文档搜索 API 按关键字搜索云文档。当 wiki 或知识库中的文件过多，难以手动浏览时，可以使用本工具。",
        "category": "feishu",
        "icon": "🔎",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keyword, e.g. '恩菲' or '客户周报'"},
                "docs_types": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["doc", "docx", "sheet", "bitable", "file", "folder", "mindnote", "slides"]},
                    "description": "Optional file type filter.",
                },
                "count": {"type": "integer", "description": "Number of results to return (default 10, max 50)."},
                "offset": {"type": "integer", "description": "Result offset for pagination (default 0)."},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_doc_read",
        "display_name": "飞书文档读取",
        "description": "读取飞书文档（Docx）的文本内容。请提供来自文档 URL 的 document_token。",
        "category": "feishu",
        "icon": "📄",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "document_token": {"type": "string", "description": "Feishu document token (from document URL)"},
                "max_chars": {"type": "integer", "description": "Max characters to return (default 6000, max 20000)"},
            },
            "required": ["document_token"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_doc_create",
        "display_name": "飞书文档创建",
        "description": "创建一个指定标题的飞书文档，返回新文档的 token 和 URL。",
        "category": "feishu",
        "icon": "📝",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Document title"},
                "folder_token": {"type": "string", "description": "Optional: parent folder token"},
            },
            "required": ["title"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_doc_append",
        "display_name": "飞书文档追加",
        "description": "向一份已存在的飞书文档末尾追加新的段落文本。",
        "category": "feishu",
        "icon": "📎",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "document_token": {"type": "string", "description": "Feishu document token"},
                "content": {"type": "string", "description": "Text content to append"},
            },
            "required": ["document_token", "content"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_drive_share",
        "display_name": "飞书云盘协作",
        "description": "管理任一飞书云盘文件（docx、bitable、sheet 等）的协作成员：可添加、移除或列出成员，并指定 view / edit / full_access 等权限。",
        "category": "feishu",
        "icon": "🔗",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "document_token": {"type": "string", "description": "File token (from URL or previous tool output)"},
                "doc_type": {"type": "string", "enum": ["docx", "bitable", "sheet", "doc", "folder", "mindnote", "slides"], "description": "File type. Default: 'docx'"},
                "action": {"type": "string", "enum": ["add", "remove", "list"], "description": "'add' to grant, 'remove' to revoke, 'list' to view"},
                "member_names": {"type": "array", "items": {"type": "string"}, "description": "Colleague names to add/remove (auto-searched)"},
                "member_open_ids": {"type": "array", "items": {"type": "string"}, "description": "Feishu open_ids directly"},
                "permission": {"type": "string", "enum": ["view", "edit", "full_access"], "description": "Permission level. Default: 'edit'"},
            },
            "required": ["document_token", "action"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_drive_delete",
        "display_name": "飞书云盘删除",
        "description": "从飞书云盘中删除一个文件或文件夹，删除后会进入回收站。支持所有文件类型：docx、bitable、sheet、folder 等。",
        "category": "feishu",
        "icon": "🗑️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "file_token": {"type": "string", "description": "Token of the file to delete"},
                "file_type": {"type": "string", "enum": ["file", "docx", "bitable", "folder", "doc", "sheet", "mindnote", "shortcut", "slides"], "description": "Type of the file to delete"},
            },
            "required": ["file_token", "file_type"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_calendar_list",
        "display_name": "飞书日历列表",
        "description": "列出飞书日历事件，无需邮箱或额外授权。",
        "category": "feishu",
        "icon": "📅",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "string", "description": "Range start, ISO 8601. Default: now."},
                "end_time": {"type": "string", "description": "Range end, ISO 8601. Default: 7 days from now."},
                "max_results": {"type": "integer", "description": "Max events to return (default 20)"},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_calendar_create",
        "display_name": "飞书日历创建",
        "description": "创建一个飞书日历事件，可按姓名邀请同事，无需邮箱。",
        "category": "feishu",
        "icon": "📅",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Event title"},
                "start_time": {"type": "string", "description": "Event start in ISO 8601 with timezone"},
                "end_time": {"type": "string", "description": "Event end in ISO 8601 with timezone"},
                "description": {"type": "string", "description": "Event description or agenda"},
                "attendee_names": {"type": "array", "items": {"type": "string"}, "description": "Names of colleagues to invite"},
                "location": {"type": "string", "description": "Event location"},
            },
            "required": ["summary", "start_time", "end_time"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_calendar_update",
        "display_name": "飞书日历更新",
        "description": "更新一个已存在的飞书日历事件，只填写需要修改的字段即可。",
        "category": "feishu",
        "icon": "📅",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string", "description": "Calendar owner's email"},
                "event_id": {"type": "string", "description": "Event ID from feishu_calendar_list"},
                "summary": {"type": "string", "description": "New title"},
                "start_time": {"type": "string", "description": "New start time (ISO 8601)"},
                "end_time": {"type": "string", "description": "New end time (ISO 8601)"},
            },
            "required": ["user_email", "event_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_calendar_delete",
        "display_name": "飞书日历删除",
        "description": "删除（取消）一个飞书日历事件。",
        "category": "feishu",
        "icon": "🗑️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "user_email": {"type": "string", "description": "Calendar owner's email"},
                "event_id": {"type": "string", "description": "Event ID to delete"},
            },
            "required": ["user_email", "event_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_approval_create",
        "display_name": "飞书审批创建",
        "description": "发起一个飞书审批流实例。你需要知道审批定义的 approval_code 和表单对应字段的内容。",
        "category": "feishu",
        "icon": "📝",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "approval_code": {"type": "string", "description": "审批定义的唯一代码 (approval_code)"},
                "user_id": {"type": "string", "description": "发起人的 open_id。可以通过 feishu_user_search 获取。"},
                "form_data": {"type": "string", "description": "表单内容的 JSON 字符串，例如 '[{\"id\":\"widget1\",\"type\":\"input\",\"value\":\"这是内容\"}]'"},
            },
            "required": ["approval_code", "user_id", "form_data"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_approval_query",
        "display_name": "飞书审批查询",
        "description": "查询指定的飞书审批实例列表。可以支持按状态查询（PENDING, APPROVED, REJECTED, CANCELED, DELETED）。",
        "category": "feishu",
        "icon": "📋",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "approval_code": {"type": "string", "description": "审批定义的唯一代码 (approval_code)"},
                "status": {"type": "string", "description": "可选过滤状态：PENDING, APPROVED, REJECTED, CANCELED, DELETED"},
            },
            "required": ["approval_code"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "feishu_approval_get",
        "display_name": "飞书审批详情",
        "description": "获取指定飞书审批实例的详细信息与当前审批状态。",
        "category": "feishu",
        "icon": "📊",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "instance_id": {"type": "string", "description": "审批实例的 instance_id"},
            },
            "required": ["instance_id"],
        },
        "config": {},
        "config_schema": {},
    },
    # --- Pages: public HTML hosting ---
    {
        "name": "publish_page",
        "display_name": "发布网页",
        "description": "将工作区中的一个 HTML 文件发布为公开页面，返回一个无需登录即可访问的公开 URL。仅支持发布 .html / .htm 文件。",
        "category": "pages",
        "icon": "🌐",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path in workspace, e.g. 'workspace/output.html'"},
            },
            "required": ["path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "list_published_pages",
        "display_name": "列出已发布网页",
        "description": "列出本数字员工发布过的所有页面，展示公开 URL 与访问次数。",
        "category": "pages",
        "icon": "📋",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {},
        },
        "config": {},
        "config_schema": {},
    },
    # --- Skill Management ---
    {
        "name": "search_clawhub",
        "display_name": "搜索 ClawHub",
        "description": "在 ClawHub 技能注册中心搜索匹配查询条件的技能，返回的列表中包含技能名、描述与最后更新时间。",
        "category": "discovery",
        "icon": "🔎",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query, e.g. 'research', 'code review', 'market analysis'"},
            },
            "required": ["query"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "install_skill",
        "display_name": "安装技能",
        "description": "将一个技能安装到本数字员工的工作区中。可以传入 ClawHub 的 slug（例如 'market-research'）或者一个 GitHub URL。",
        "category": "discovery",
        "icon": "📥",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "ClawHub skill slug (e.g. 'market-research') or GitHub URL"},
            },
            "required": ["source"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "update_kr_content",
        "display_name": "更新 KR 内容",
        "description": (
            "更新**你自己**某条 Key Result 的内容字段。先调用 get_my_okr 获取 kr_id，"
            "然后按需修改 title、target_value、unit、focus_ref 或 status。"
            "本工具不会记录一次进度更新。"
        ),
        "category": "okr",
        "icon": "✏️",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "kr_id": {
                    "type": "string",
                    "description": "UUID of the Key Result to update (from get_my_okr).",
                },
                "title": {
                    "type": "string",
                    "description": "Optional new KR title.",
                },
                "target_value": {
                    "type": "number",
                    "description": "Optional new target value.",
                },
                "unit": {
                    "type": "string",
                    "description": "Optional new unit label.",
                },
                "focus_ref": {
                    "type": "string",
                    "description": "Optional new focus reference.",
                },
                "status": {
                    "type": "string",
                    "enum": ["on_track", "at_risk", "behind", "completed"],
                    "description": "Optional explicit status value.",
                },
            },
            "required": ["kr_id"],
        },
        "config": {},
        "config_schema": {},
    },
]

# ── AgentBay Tools ──────────────────────────────────────────────────────────

AGENTBAY_TOOLS = [
    {
        "name": "agentbay_browser_navigate",
        "display_name": "AgentBay：浏览器导航",
        "description": "[环境：浏览器] 在 AgentBay 无头浏览器环境中打开一个 URL。重要：该浏览器运行在隔离环境中，与云桌面（computer_* 工具）和代码沙箱（code_execute/command_exec）不共享文件系统、进程或下载。这里下载的文件无法从其他环境中访问。提示：导航后请用 browser_observe 识别页面中的可交互元素，再通过 browser_type/browser_click 进行操作。",
        "category": "agentbay",
        "icon": "🌐",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要访问的网址"},
                "wait_for": {"type": "string", "description": "等待元素选择器（可选）"},
            },
            "required": ["url"],
        },
        "config": {},
        "config_schema": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "default": "",
                    "placeholder": "从阿里云 AgentBay 控制台获取",
                },
                {
                    "key": "os_type",
                    "label": "Cloud Computer OS",
                    "type": "select",
                    "default": "windows",
                    "options": [
                        {"value": "linux", "label": "Linux"},
                        {"value": "windows", "label": "Windows"},
                    ],
                    "description": "Operating system for AgentBay cloud desktop (computer tools only)",
                },
            ],
        },
    },
    {
        "name": "agentbay_browser_screenshot",
        "display_name": "AgentBay：浏览器截图",
        "description": "[环境：浏览器] 对无头浏览器中当前页面截图。该浏览器与云桌面、代码沙箱相互隔离。在点击、输入或提交表单之后，使用本工具来确认结果——它会保留当前页面状态。不要只是为了截图而调用 browser_navigate。",
        "category": "agentbay",
        "icon": "📸",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {},
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_browser_save_screenshot",
        "display_name": "AgentBay：保存浏览器截图",
        "description": "[环境：浏览器] 将无头浏览器当前的截图保存到 workspace/screenshots/。仅在用户明确要求保存、分享、保留或查看截图时调用。常规的视觉观察请使用 agentbay_browser_screenshot，因为它只在内部使用，不会产生工作区文件。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_browser_click",
        "display_name": "AgentBay：浏览器点击",
        "description": "[环境：浏览器] 在无头浏览器中点击某个元素（与桌面、代码沙箱相互隔离）。selector 可以是 CSS 选择器（如 #btn），也可以是自然语言描述（如「发送按钮」）。",
        "category": "agentbay",
        "icon": "🖱️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector (e.g. #button) or natural language description of the element (e.g. 'the blue Submit button')"},
            },
            "required": ["selector"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_browser_type",
        "display_name": "AgentBay：浏览器输入",
        "description": "[环境：浏览器] 在无头浏览器中的某个元素里输入文本（与桌面、代码沙箱相互隔离）。selector 可以是 CSS 选择器或自然语言描述（如「手机号输入框」）。",
        "category": "agentbay",
        "icon": "⌨️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector or natural language description of the input field (e.g. 'the phone number input' or 'input[type=tel]')"},
                "text": {"type": "string", "description": "要输入的文本"},
            },
            "required": ["selector", "text"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_code_execute",
        "display_name": "AgentBay：代码执行",
        "description": "[环境：代码沙箱] 在 AgentBay 代码沙箱中执行代码（Python、Bash、Node.js）。重要：本沙箱运行在隔离环境中，与无头浏览器（browser_* 工具）、云桌面（computer_* 工具）不共享文件系统、进程或网络。在此处创建的文件无法从其他环境访问。",
        "category": "agentbay",
        "icon": "💻",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "language": {"type": "string", "enum": ["python", "bash", "node"], "description": "编程语言"},
                "code": {"type": "string", "description": "要执行的代码"},
                "timeout": {"type": "integer", "description": "超时时间（秒）", "default": 30},
            },
            "required": ["language", "code"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_code_write_file",
        "display_name": "AgentBay：写代码沙箱文件",
        "description": "[环境：代码沙箱] 在 AgentBay 代码沙箱中写一个文本文件。",
        "category": "agentbay",
        "icon": "📝",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "remote_path": {
                    "type": "string",
                    "description": "Absolute path inside the code sandbox, e.g. /home/wuying/main.py",
                },
                "content": {"type": "string", "description": "File content to write."},
                "mode": {
                    "type": "string",
                    "enum": ["overwrite", "append"],
                    "description": "Write mode. Default: overwrite.",
                    "default": "overwrite",
                },
            },
            "required": ["remote_path", "content"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_code_read_file",
        "display_name": "AgentBay：读代码沙箱文件",
        "description": "[环境：代码沙箱] 读取 AgentBay 代码沙箱中的一个文本文件。",
        "category": "agentbay",
        "icon": "📖",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "remote_path": {
                    "type": "string",
                    "description": "Absolute path inside the code sandbox, e.g. /home/wuying/main.py",
                },
            },
            "required": ["remote_path"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_code_edit_file",
        "display_name": "AgentBay：编辑代码沙箱文件",
        "description": "[环境：代码沙箱] 在 AgentBay 代码沙箱中通过对精确文本做替换的方式编辑文本文件。",
        "category": "agentbay",
        "icon": "✏️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "remote_path": {
                    "type": "string",
                    "description": "Absolute path inside the code sandbox, e.g. /home/wuying/main.py",
                },
                "edits": {
                    "type": "array",
                    "description": "List of exact text replacements.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "oldText": {"type": "string", "description": "Exact text to replace."},
                            "newText": {"type": "string", "description": "Replacement text."},
                        },
                        "required": ["oldText", "newText"],
                    },
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "Preview changes without applying them. Default: false.",
                    "default": False,
                },
            },
            "required": ["remote_path", "edits"],
        },
        "config": {},
        "config_schema": {},
    },
    # ── Browser: Extract & Observe ────────────────────────────────────────
    {
        "name": "agentbay_browser_extract",
        "display_name": "AgentBay：浏览器抽取",
        "description": "[环境：浏览器] 通过自然语言指令从当前浏览器页面中抽取结构化数据。该浏览器与云桌面、代码沙箱相互隔离。比「先截图再用视觉模型解析」更高效。",
        "category": "agentbay",
        "icon": "📊",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "instruction": {"type": "string", "description": "Natural language description of what data to extract, e.g. 'extract all product names and prices'"},
                "selector": {"type": "string", "description": "Optional CSS selector to scope the extraction to a specific element"},
            },
            "required": ["instruction"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_browser_observe",
        "display_name": "AgentBay：浏览器观察",
        "description": "[环境：浏览器] 观察当前浏览器页面状态，返回可交互元素的列表。该浏览器与云桌面、代码沙箱相互隔离。帮助数字员工理解页面上有哪些元素可以点击或交互。",
        "category": "agentbay",
        "icon": "👁️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "instruction": {"type": "string", "description": "Natural language description of what to observe, e.g. 'find the login button' or 'list all navigation links'"},
                "selector": {"type": "string", "description": "Optional CSS selector to scope observation"},
            },
            "required": ["instruction"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_browser_login",
        "display_name": "AgentBay：浏览器登录",
        "description": "[环境：浏览器] 使用 AgentBay 的 AI 驱动登录技能，在无头浏览器中自动化完成复杂登录流程（验证码、OTP、多步鉴权）。该浏览器与云桌面、代码沙箱相互隔离。",
        "category": "agentbay",
        "icon": "🔐",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The login page URL to navigate to"},
                "login_config": {"type": "string", "description": "JSON string with login config"},
            },
            "required": ["url", "login_config"],
        },
        "config": {},
        "config_schema": {},
    },
    # ── Command (Shell) ───────────────────────────────────────────────────
    {
        "name": "agentbay_command_exec",
        "display_name": "AgentBay：Shell 命令",
        "description": "[环境：代码沙箱] 在 AgentBay 代码沙箱中执行一条 shell 命令。重要：本沙箱与无头浏览器（browser_* 工具）、云桌面（computer_* 工具）相互隔离，文件与进程在各环境间不共享。返回 stdout、stderr 和 exit code。",
        "category": "agentbay",
        "icon": "🖥️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to execute, e.g. 'ls -la' or 'pip install pandas'"},
                "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default 50000)", "default": 50000},
                "cwd": {"type": "string", "description": "Working directory for the command (optional)"},
            },
            "required": ["command"],
        },
        "config": {},
        "config_schema": {},
    },
    # ── Computer Use ──────────────────────────────────────────────────────
    {
        "name": "agentbay_computer_screenshot",
        "display_name": "AgentBay：桌面截图",
        "description": "[环境：云桌面] 对整个云桌面（Windows/Linux）进行截图。分析图中包含坐标网格，结果中包含鼠标工具所需的像素坐标系。对于关闭按钮、菜单、复选框或小图标等较小的控件，请先围绕目标区域用 focus_x/focus_y/focus_width/focus_height 再调用一次本工具；聚焦裁剪会放大给视觉模型，其网格标签仍是绝对桌面坐标。重要：该桌面运行在隔离环境中，与无头浏览器（browser_* 工具）、代码沙箱（code_execute/command_exec）不共享文件系统、进程或浏览器会话。若想在桌面端浏览网页，请先调用 agentbay_computer_get_installed_apps，再用返回的 start_cmd 启动浏览器。在执行任何 GUI 操作前，都应先理解当前桌面状态。",
        "category": "agentbay",
        "icon": "📸",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "focus_x": {"type": "integer", "description": "Optional absolute desktop X coordinate for the top-left of a focused precision crop"},
                "focus_y": {"type": "integer", "description": "Optional absolute desktop Y coordinate for the top-left of a focused precision crop"},
                "focus_width": {"type": "integer", "description": "Optional width of the focused precision crop in desktop pixels"},
                "focus_height": {"type": "integer", "description": "Optional height of the focused precision crop in desktop pixels"},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_save_screenshot",
        "display_name": "AgentBay：保存桌面截图",
        "description": "[环境：云桌面] 将云桌面当前的截图保存到 workspace/screenshots/。仅在用户明确要求保存、分享、保留或查看截图时调用。常规的视觉观察请使用 agentbay_computer_screenshot，因为它只在内部使用，不会产生工作区文件。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_click",
        "display_name": "AgentBay：鼠标点击",
        "description": "[环境：云桌面] 在云桌面（与浏览器、代码沙箱相互隔离）的绝对桌面像素坐标上点击鼠标。务必先用 agentbay_computer_screenshot 观察桌面。在点击对话框按钮、文字按钮、标签页、菜单、复选框、关闭按钮、小控件，或任何在全屏截图中中心位置不明确的目标之前，请先用 agentbay_computer_precision_screenshot 围绕目标区域进行截取，并使用放大图中的绝对坐标标签。出现点击偏差后不要反复凭全屏截图猜测坐标。对于登录弹窗、软件弹窗、取消/不要/稍后/跳过/不登录等提示，优先使用 agentbay_computer_dismiss_dialog，再考虑坐标点击。请点击目标的可视中心。坐标以整个桌面左上角 (0, 0) 为基准，而非右侧预览面板。对于应用内弹窗、嵌入式面板、应用商店窗口、浏览器/应用标签页、文档标签页以及应用内部的关闭按钮，请通过应用 UI（点击、Esc 或 Ctrl+W 等快捷键）处理，不要升级到根窗口级别的关闭工具。仅当用户明确希望关闭或退出整个操作系统级窗口/应用时，才可使用 agentbay_computer_list_windows/close_window。",
        "category": "agentbay",
        "icon": "🖱️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate to click"},
                "y": {"type": "integer", "description": "Y coordinate to click"},
                "button": {"type": "string", "enum": ["left", "right", "middle", "double_left"], "description": "Mouse button (default: left)", "default": "left"},
            },
            "required": ["x", "y"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_precision_screenshot",
        "display_name": "AgentBay：精确截图",
        "description": "[环境：云桌面] 对云桌面的一个区域进行放大聚焦截取，用于精确鼠标定位。请在点击对话框按钮、文字按钮、标签页、菜单、复选框、关闭按钮、小控件之前，或在出现点击偏差之后调用本工具。请传入围绕目标的大致绝对桌面矩形；较小的矩形会自动扩展以包含上下文，因此更推荐围绕目标取一个稍大的区域，而非裁得过紧。返回的视觉图像是放大后的版本，其网格标签仍然是 agentbay_computer_click 可用的绝对桌面坐标。下一次点击应使用从此精确截图中读到的中心坐标，而不是从全屏截图猜出的坐标。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Absolute desktop X coordinate of the crop top-left"},
                "y": {"type": "integer", "description": "Absolute desktop Y coordinate of the crop top-left"},
                "width": {"type": "integer", "description": "Approximate crop width in desktop pixels. Small crops are automatically expanded for context."},
                "height": {"type": "integer", "description": "Approximate crop height in desktop pixels. Small crops are automatically expanded for context."},
            },
            "required": ["x", "y", "width", "height"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_input_text",
        "display_name": "AgentBay：键盘输入",
        "description": "[环境：云桌面] 在云桌面（与浏览器、代码沙箱相互隔离）的当前光标位置输入文本。请先点击目标输入框。",
        "category": "agentbay",
        "icon": "⌨️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to type"},
            },
            "required": ["text"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_press_keys",
        "display_name": "AgentBay：键盘快捷键",
        "description": "[环境：云桌面] 在云桌面（与浏览器、代码沙箱相互隔离）上按下键盘按键或快捷键。例如 ['ctrl', 'c'] 表示复制、['alt', 'tab'] 表示切换窗口、['enter'] 表示确认。",
        "category": "agentbay",
        "icon": "⌨️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "keys": {"type": "array", "items": {"type": "string"}, "description": "List of keys to press simultaneously, e.g. ['ctrl', 'c']"},
                "hold": {"type": "boolean", "description": "If true, hold keys down", "default": False},
            },
            "required": ["keys"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_scroll",
        "display_name": "AgentBay：滚动",
        "description": "[环境：云桌面] 在云桌面（与浏览器、代码沙箱相互隔离）的指定位置处滚动屏幕。",
        "category": "agentbay",
        "icon": "🔃",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate of scroll position"},
                "y": {"type": "integer", "description": "Y coordinate of scroll position"},
                "direction": {"type": "string", "enum": ["up", "down", "left", "right"], "description": "Scroll direction (default: down)", "default": "down"},
                "amount": {"type": "integer", "description": "Scroll amount in steps (default: 1)", "default": 1},
            },
            "required": ["x", "y"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_move_mouse",
        "display_name": "AgentBay：鼠标移动",
        "description": "[环境：云桌面] 在云桌面上将鼠标移动到指定坐标，但不点击。常用于触发悬停效果、工具提示或下拉菜单。",
        "category": "agentbay",
        "icon": "🖱️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Target X coordinate"},
                "y": {"type": "integer", "description": "Target Y coordinate"},
            },
            "required": ["x", "y"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_drag_mouse",
        "display_name": "AgentBay：鼠标拖拽",
        "description": "[环境：云桌面] 在云桌面上把鼠标从一个位置拖到另一个位置。常用于选中文字、移动文件、调整窗口大小。",
        "category": "agentbay",
        "icon": "🖱️",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "from_x": {"type": "integer", "description": "Start X coordinate"},
                "from_y": {"type": "integer", "description": "Start Y coordinate"},
                "to_x": {"type": "integer", "description": "End X coordinate"},
                "to_y": {"type": "integer", "description": "End Y coordinate"},
                "button": {"type": "string", "enum": ["left", "right", "middle"], "description": "Mouse button (default: left)", "default": "left"},
            },
            "required": ["from_x", "from_y", "to_x", "to_y"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_get_screen_size",
        "display_name": "AgentBay：获取屏幕分辨率",
        "description": "[环境：云桌面] 获取云桌面的屏幕分辨率，可用于计算点击坐标。",
        "category": "agentbay",
        "icon": "📐",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_start_app",
        "display_name": "AgentBay：启动应用",
        "description": "[环境：云桌面] 通过启动命令在云桌面上启动一个应用。请优先调用 agentbay_computer_get_installed_apps，并把返回的 start_cmd 原样传入，不要凭猜测传 chrome、microsoft-edge 或 wps 等命令。如果直接命令启动失败，本工具会按名称/start_cmd 匹配已安装的应用，再使用真实的 start_cmd 重试。该桌面与无头浏览器、代码沙箱环境相互隔离。",
        "category": "agentbay",
        "icon": "🚀",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "cmd": {"type": "string", "description": "Application launch command, e.g. 'firefox' or 'libreoffice --calc'"},
                "work_dir": {"type": "string", "description": "Working directory for the application (optional)"},
            },
            "required": ["cmd"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_get_installed_apps",
        "display_name": "AgentBay：获取已安装应用",
        "description": "[环境：云桌面] 列出已安装的应用及其真实的启动命令。请在调用 agentbay_computer_start_app 之前调用本工具，并把返回的 start_cmd 原样传入，避免猜测应用名称。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "start_menu": {"type": "boolean", "description": "Include Start Menu applications (default: true)", "default": True},
                "desktop": {"type": "boolean", "description": "Include Desktop shortcuts (default: true)", "default": True},
                "ignore_system_apps": {"type": "boolean", "description": "Hide system applications (default: true)", "default": True},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_get_cursor_position",
        "display_name": "AgentBay：获取光标位置",
        "description": "[环境：云桌面] 获取云桌面上当前鼠标光标的位置。",
        "category": "agentbay",
        "icon": "📍",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_get_active_window",
        "display_name": "AgentBay：获取当前焦点窗口",
        "description": "[环境：云桌面] 获取云桌面当前焦点窗口的信息，包括窗口 ID、标题和位置。",
        "category": "agentbay",
        "icon": "🪟",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_activate_window",
        "display_name": "AgentBay：激活窗口",
        "description": "[环境：云桌面] 在云桌面上根据窗口 ID 把指定窗口置于前台。可先用 agentbay_computer_list_windows 或 get_active_window 找到窗口 ID。",
        "category": "agentbay",
        "icon": "🪟",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "window_id": {"type": "integer", "description": "Window ID to activate"},
            },
            "required": ["window_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_list_windows",
        "display_name": "AgentBay：列出桌面窗口",
        "description": "[环境：云桌面] 列出操作系统级的根桌面窗口，包含 window_id、标题、进程和位置信息。这些 ID 仅对应整个应用窗口。本工具可用于激活窗口，或仅在用户明确希望关闭/退出某个桌面窗口或应用时，作为关闭前的查询步骤。不要把根窗口 ID 用于应用内弹窗、模态框、嵌入式应用商店面板、浏览器/应用标签页、文档标签页或软件内部对话框——这些请通过应用 UI、Esc、Ctrl+W 或 agentbay_computer_dismiss_dialog 处理。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "timeout_ms": {"type": "integer", "description": "Timeout in milliseconds (default: 3000)", "default": 3000},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_close_window",
        "display_name": "AgentBay：关闭窗口",
        "description": "[环境：云桌面] 高风险：根据 agentbay_computer_list_windows 返回的 window_id 关闭一个操作系统级的根桌面窗口。本操作会退出整个应用并丢失上下文。仅在用户明确要求关闭/退出某个桌面窗口或应用时使用。绝对不要将其用于应用内弹窗、模态框、嵌入式应用商店面板、浏览器/应用标签页、文档标签页、登录提示或软件内部对话框；这些请改用应用 UI 点击、Esc、Ctrl+W 或 agentbay_computer_dismiss_dialog。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "window_id": {"type": "integer", "description": "Window ID returned by agentbay_computer_list_windows or get_active_window"},
                "title": {"type": "string", "description": "Optional title text for candidate lookup only when window_id is unknown; title-only calls will not close anything"},
            },
            "required": ["window_id"],
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_dismiss_dialog",
        "display_name": "AgentBay：关闭弹窗",
        "description": "[环境：云桌面] 通过发送 Esc 安全地关闭当前的应用内弹窗/对话框。它不会关闭根桌面窗口或应用。对于模态框、登录提示、不登录/稍后/跳过/取消提示，以及软件内部对话框，请优先使用本工具而不是坐标点击。对于应用内标签页、嵌入式面板、应用商店窗口或文档标签页，请优先使用应用 UI 控件或 Ctrl+W 等快捷键。仅当用户明确希望关闭/退出整个操作系统级窗口/应用时，才可使用 agentbay_computer_close_window。",
        "category": "agentbay",
        "icon": "A",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Optional human-readable popup/dialog title hint for logging only; this tool will still only send Escape"},
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_computer_list_visible_apps",
        "display_name": "AgentBay：列出运行中的应用",
        "description": "[环境：云桌面] 列出云桌面上当前所有可见/正在运行的应用，附带其进程信息与窗口 ID。",
        "category": "agentbay",
        "icon": "📋",
        "is_default": False,
        "parameters_schema": {"type": "object", "properties": {}},
        "config": {},
        "config_schema": {},
    },
    {
        "name": "agentbay_file_transfer",
        "display_name": "AgentBay：文件传输",
        "description": (
            "在任意两个端点之间传输文件：数字员工工作区、AgentBay 浏览器环境、云桌面或代码沙箱。"
            "工作区 → 环境：把工作区中的文件上传到云环境。"
            "环境 → 工作区：把云环境中的文件下载到工作区。"
            "环境 → 环境：在不同环境之间直接传输（不经过工作区）。"
        ),
        "category": "agentbay",
        "icon": "🔄",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "from_type": {
                    "type": "string",
                    "enum": ["workspace", "browser", "computer", "code"],
                    "description": "Source endpoint: 'workspace' for agent workspace, or the AgentBay environment name.",
                },
                "from_path": {
                    "type": "string",
                    "description": "Source path. Relative if workspace (e.g. 'workspace/data.csv'), absolute if env (e.g. '/root/data.csv').",
                },
                "to_type": {
                    "type": "string",
                    "enum": ["workspace", "browser", "computer", "code"],
                    "description": "Destination endpoint: 'workspace' for agent workspace, or the AgentBay environment name.",
                },
                "to_path": {
                    "type": "string",
                    "description": "Destination path. Relative if workspace (e.g. 'workspace/output.csv'), absolute if env (e.g. '/root/output.csv').",
                },
            },
            "required": ["from_type", "from_path", "to_type", "to_path"],
        },
        "config": {},
        "config_schema": {},
    },
]

BUILTIN_TOOLS = [
    *BUILTIN_TOOLS,
    # ── AgentBay Tools ──  
    *AGENTBAY_TOOLS,
]

# ── OKR Tools ────────────────────────────────────────────────────────────────
# These three tools are global builtins available to ALL agents.
# OKR Agent-exclusive management tools (create_objective, create_key_result, etc.)
# are injected separately via agent_seeder when the OKR Agent is created.

OKR_BUILTIN_TOOLS = [
    {
        "name": "get_okr",
        "display_name": "获取 OKR",
        "description": (
            "读取当前周期的完整 OKR 看板：公司级别的 Objective 和 Key Result，"
            "以及每个成员（人类和数字员工）的个人 O 与 KR 及其当前进度值。"
            "每个 Objective 都附带 objective_id，每个 Key Result 都附带 kr_id。"
            "使用本工具可以了解公司方向、更新已有 OKR，或在规划个人工作前先了解他人的进展。"
        ),
        "category": "okr",
        "icon": "🎯",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "period_start": {
                    "type": "string",
                    "description": "Optional ISO date (YYYY-MM-DD). Defaults to the current period start.",
                },
                "period_end": {
                    "type": "string",
                    "description": "Optional ISO date (YYYY-MM-DD). Defaults to the current period end.",
                },
            },
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "get_my_okr",
        "display_name": "获取我的 OKR",
        "description": (
            "读取自己在当前周期的 Objective 与 Key Result，"
            "包含用于更新进度所需的 kr_id。在调用 update_kr_progress 之前请先调用本工具以获取正确的 kr_id。"
        ),
        "category": "okr",
        "icon": "🎯",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {},
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "update_kr_progress",
        "display_name": "更新 KR 进度",
        "description": (
            "更新**你自己**某条 Key Result 的当前进度值。"
            "请先调用 get_my_okr 获取 kr_id。"
            "会自动写入一条进度日志，以便进行历史追踪。"
        ),
        "category": "okr",
        "icon": "📈",
        "is_default": True,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "kr_id": {
                    "type": "string",
                    "description": "UUID of the Key Result to update (from get_my_okr).",
                },
                "value": {
                    "type": "number",
                    "description": "New current value (e.g. 3500 for a follower count, 75 for a percentage).",
                },
                "note": {
                    "type": "string",
                    "description": "Optional note explaining the progress update.",
                },
            },
            "required": ["kr_id", "value"],
        },
        "config": {},
        "config_schema": {},
    },
]

DEPLOY_BUILTIN_TOOLS = [
    {
        "name": "vercel_deploy",
        "display_name": "部署到 Vercel",
        "description": "将工作区中的项目部署到 Vercel。支持两种模式：'upload'（直接上传文件，不需要 GitHub）或 'github'（推送到 GitHub 仓库，由 Vercel 自动部署）。返回部署后的 URL。",
        "category": "deploy",
        "icon": "🚀",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "Vercel project name (will be created if not exists)"
                },
                "source_dir": {
                    "type": "string",
                    "description": "Directory in workspace containing the project, e.g. 'workspace/my-app'"
                },
                "deploy_method": {
                    "type": "string",
                    "enum": ["upload", "github"],
                    "description": "'upload': direct file upload (simple, no GitHub needed). 'github': push to GitHub repo and let Vercel auto-deploy (better for version control and CI/CD). Default: 'upload'."
                },
                "github_repo": {
                    "type": "string",
                    "description": "GitHub repo in 'owner/repo' format. Required when deploy_method='github'."
                },
                "framework": {
                    "type": "string",
                    "description": "Framework preset: 'nextjs', 'vite', 'static', etc.",
                    "enum": ["nextjs", "vite", "nuxtjs", "static", "remix", "astro"]
                },
                "production": {
                    "type": "boolean",
                    "description": "If true, deploy to production. Default false (preview)."
                }
            },
            "required": ["project_name", "source_dir"]
        },
        "config": {"vercel_token": ""},
        "config_schema": {
            "fields": [
                {
                    "key": "vercel_token",
                    "label": "Vercel Access Token",
                    "type": "password",
                    "default": "",
                    "help_text": "Get from https://vercel.com/account/tokens"
                }
            ]
        }
    },
    {
        "name": "vercel_list_deployments",
        "display_name": "列出 Vercel 部署",
        "description": "列出某 Vercel 项目的最近部署记录，包含状态、URL 和创建时间。",
        "category": "deploy",
        "icon": "📋",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string", "description": "Vercel project name"}
            },
            "required": ["project_name"]
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "vercel_get_deploy_logs",
        "display_name": "获取部署日志",
        "description": "获取某次 Vercel 部署的构建日志和运行时日志，可用于排查部署失败问题。",
        "category": "deploy",
        "icon": "📜",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "deployment_id": {"type": "string", "description": "Deployment ID or URL"}
            },
            "required": ["deployment_id"]
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "vercel_set_env",
        "display_name": "设置环境变量",
        "description": "为 Vercel 项目设置环境变量。可用于数据库连接串、API Key 等密钥。",
        "category": "deploy",
        "icon": "🔐",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string"},
                "key": {"type": "string", "description": "Environment variable name, e.g. DATABASE_URL"},
                "value": {"type": "string", "description": "Environment variable value"},
                "target": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["production", "preview", "development"]},
                    "description": "Deployment targets. Default: all."
                }
            },
            "required": ["project_name", "key", "value"]
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "vercel_manage_domain",
        "display_name": "管理域名",
        "description": "查询域名可用性/价格，或为 Vercel 项目绑定自定义域名。",
        "category": "deploy",
        "icon": "🌐",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["check", "bind"],
                    "description": "'check' to check availability/price, 'bind' to add domain to project"
                },
                "domain": {"type": "string", "description": "Domain name, e.g. 'myapp.com'"},
                "project_name": {"type": "string", "description": "Required for 'bind' action"}
            },
            "required": ["action", "domain"]
        },
        "config": {},
        "config_schema": {},
    },
    {
        "name": "neon_create_database",
        "display_name": "创建 Postgres 数据库",
        "description": "创建一个新的 Neon Postgres 数据库，返回 DATABASE_URL 连接字符串。可以配合 vercel_set_env 注入到 Vercel 项目中。",
        "category": "deploy",
        "icon": "🐘",
        "is_default": False,
        "parameters_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "Name for the Neon project"
                },
                "database_name": {
                    "type": "string",
                    "description": "Database name, default 'neondb'"
                },
                "region": {
                    "type": "string",
                    "description": "Region: 'aws-us-east-1', 'aws-eu-central-1', etc.",
                    "default": "aws-us-east-1"
                },
                "org_id": {
                    "type": "string",
                    "description": "Optional: Neon Organization ID. If not provided and you belong to multiple organizations, the tool will automatically list them for you to choose."
                }
            },
            "required": ["project_name"]
        },
        "config": {"neon_api_key": ""},
        "config_schema": {
            "fields": [
                {
                    "key": "neon_api_key",
                    "label": "Neon API Key",
                    "type": "password",
                    "default": "",
                    "help_text": "Get from https://console.neon.tech/app/settings/api-keys"
                }
            ]
        }
    }
]

BUILTIN_TOOLS = [
    *BUILTIN_TOOLS,
    *OKR_BUILTIN_TOOLS,
    *DEPLOY_BUILTIN_TOOLS,
]


async def seed_builtin_tools():
    """Insert or update builtin tools in the database."""
    from app.models.tool import AgentTool
    from app.models.agent import Agent


    async with async_session() as db:
        # Legacy rename: older environments persisted this tool as
        # `send_web_message`. Rename or merge it in-place so agents keep the
        # same assignment after the first startup on the new version.
        old_name = "send_web_message"
        new_name = "send_platform_message"
        old_result = await db.execute(select(Tool).where(Tool.name == old_name))
        old_tool = old_result.scalar_one_or_none()
        new_result = await db.execute(select(Tool).where(Tool.name == new_name))
        new_tool = new_result.scalar_one_or_none()
        if old_tool and not new_tool:
            old_tool.name = new_name
            logger.info(f"[ToolSeeder] Renamed builtin tool: {old_name} -> {new_name}")
        elif old_tool and new_tool:
            old_assignments = await db.execute(select(AgentTool).where(AgentTool.tool_id == old_tool.id))
            for assignment in old_assignments.scalars().all():
                existing_assignment = await db.execute(
                    select(AgentTool).where(
                        AgentTool.agent_id == assignment.agent_id,
                        AgentTool.tool_id == new_tool.id,
                    )
                )
                if not existing_assignment.scalar_one_or_none():
                    assignment.tool_id = new_tool.id
            await db.delete(old_tool)
            logger.info(f"[ToolSeeder] Merged legacy builtin tool into {new_name}")

        new_tool_ids = []
        for t in BUILTIN_TOOLS:
            seed_config = _global_builtin_config(t)
            result = await db.execute(select(Tool).where(Tool.name == t["name"]))
            existing = result.scalar_one_or_none()
            if not existing:
                tool = Tool(
                    name=t["name"],
                    display_name=t["display_name"],
                    description=t["description"],
                    type="builtin",
                    category=t["category"],
                    icon=t["icon"],
                    is_default=t["is_default"],
                    parameters_schema=t.get("parameters_schema", {"type": "object", "properties": {}}),
                    config=seed_config,
                    config_schema=t.get("config_schema", {}),
                    source="builtin",
                )
                db.add(tool)
                await db.flush()  # get tool.id
                if t["is_default"]:
                    new_tool_ids.append(tool.id)
                logger.info(f"[ToolSeeder] Created builtin tool: {t['name']}")
            else:
                # Sync fields that may evolve
                updated_fields = []
                if existing.category != t["category"]:
                    existing.category = t["category"]
                    updated_fields.append("category")
                if existing.description != t["description"]:
                    existing.description = t["description"]
                    updated_fields.append("description")
                if existing.display_name != t["display_name"]:
                    existing.display_name = t["display_name"]
                    updated_fields.append("display_name")
                if existing.icon != t["icon"]:
                    existing.icon = t["icon"]
                    updated_fields.append("icon")
                if t["name"] in SYNC_IS_DEFAULT_TOOL_NAMES and existing.is_default != t["is_default"]:
                    existing.is_default = t["is_default"]
                    updated_fields.append("is_default")
                if t.get("config_schema") and existing.config_schema != t["config_schema"]:
                    existing.config_schema = t["config_schema"]
                    updated_fields.append("config_schema")
                    # Merge new config defaults when config_schema changes
                    if seed_config:
                        existing.config = {**seed_config, **(existing.config or {})}
                        updated_fields.append("config")
                if not existing.config and seed_config:
                    existing.config = seed_config
                    updated_fields.append("config")
                elif seed_config and existing.config != seed_config:
                    # Merge new config keys into existing config so that flags like
                    # okr_agent_only are propagated to already-created tool records.
                    # Existing keys take precedence (agent-specific overrides are preserved).
                    merged = {**seed_config, **(existing.config or {})}
                    if merged != existing.config:
                        existing.config = merged
                        updated_fields.append("config")
                legacy_model = LEGACY_IMAGE_TOOL_MODEL_DEFAULTS.get(t["name"])
                if legacy_model and existing.config == {
                    "model": legacy_model,
                    "api_key": "",
                    "base_url": "",
                }:
                    existing.config = {
                        "model": "",
                        "api_key": "",
                        "base_url": "",
                    }
                    updated_fields.append("config")
                if existing.parameters_schema != t["parameters_schema"]:
                    existing.parameters_schema = t["parameters_schema"]
                    updated_fields.append("parameters_schema")
                if updated_fields:
                    logger.info(f"[ToolSeeder] Updated {', '.join(updated_fields)}: {t['name']}")

        # Auto-assign new default tools to all existing agents
        if new_tool_ids:
            agents_result = await db.execute(select(Agent.id))
            agent_ids = [row[0] for row in agents_result.fetchall()]
            for agent_id in agent_ids:
                for tool_id in new_tool_ids:
                    # Check if already assigned
                    check = await db.execute(
                        select(AgentTool).where(
                            AgentTool.agent_id == agent_id,
                            AgentTool.tool_id == tool_id,
                        )
                    )
                    if not check.scalar_one_or_none():
                        db.add(AgentTool(agent_id=agent_id, tool_id=tool_id, enabled=True))
            logger.info(f"[ToolSeeder] Auto-assigned {len(new_tool_ids)} new tools to {len(agent_ids)} agents")

        # AgentBay desktop window helpers are non-default tools, but should be
        # available wherever the user has already enabled Cloud Desktop tools.
        computer_anchor_names = [
            "agentbay_computer_screenshot",
            "agentbay_computer_precision_screenshot",
            "agentbay_computer_click",
            "agentbay_computer_get_active_window",
            "agentbay_computer_activate_window",
        ]
        computer_helper_names = [
            "agentbay_computer_precision_screenshot",
            "agentbay_computer_save_screenshot",
            "agentbay_computer_list_windows",
            "agentbay_computer_close_window",
            "agentbay_computer_dismiss_dialog",
        ]
        anchor_tools_r = await db.execute(select(Tool.id).where(Tool.name.in_(computer_anchor_names)))
        anchor_tool_ids = [row[0] for row in anchor_tools_r.fetchall()]
        helper_tools_r = await db.execute(select(Tool).where(Tool.name.in_(computer_helper_names)))
        helper_tools = helper_tools_r.scalars().all()
        if anchor_tool_ids and helper_tools:
            enabled_agent_r = await db.execute(
                select(AgentTool.agent_id)
                .where(AgentTool.tool_id.in_(anchor_tool_ids), AgentTool.enabled == True)  # noqa: E712
                .distinct()
            )
            enabled_agent_ids = [row[0] for row in enabled_agent_r.fetchall()]
            assigned_count = 0
            for agent_id in enabled_agent_ids:
                for helper_tool in helper_tools:
                    existing_assignment = await db.execute(
                        select(AgentTool).where(
                            AgentTool.agent_id == agent_id,
                            AgentTool.tool_id == helper_tool.id,
                        )
                    )
                    if not existing_assignment.scalar_one_or_none():
                        db.add(AgentTool(agent_id=agent_id, tool_id=helper_tool.id, enabled=True))
                        assigned_count += 1
            if assigned_count:
                logger.info(
                    f"[ToolSeeder] Auto-assigned {assigned_count} AgentBay computer helper tool(s) "
                    f"to {len(enabled_agent_ids)} agent(s)"
                )

        # Save-screenshot is non-default, but should be available wherever the
        # user has enabled the AgentBay browser screenshot tool.
        browser_anchor_names = [
            "agentbay_browser_navigate",
            "agentbay_browser_screenshot",
        ]
        browser_helper_names = ["agentbay_browser_save_screenshot"]
        browser_anchor_tools_r = await db.execute(select(Tool.id).where(Tool.name.in_(browser_anchor_names)))
        browser_anchor_tool_ids = [row[0] for row in browser_anchor_tools_r.fetchall()]
        browser_helper_tools_r = await db.execute(select(Tool).where(Tool.name.in_(browser_helper_names)))
        browser_helper_tools = browser_helper_tools_r.scalars().all()
        if browser_anchor_tool_ids and browser_helper_tools:
            browser_enabled_agent_r = await db.execute(
                select(AgentTool.agent_id)
                .where(AgentTool.tool_id.in_(browser_anchor_tool_ids), AgentTool.enabled == True)  # noqa: E712
                .distinct()
            )
            browser_enabled_agent_ids = [row[0] for row in browser_enabled_agent_r.fetchall()]
            browser_assigned_count = 0
            for agent_id in browser_enabled_agent_ids:
                for helper_tool in browser_helper_tools:
                    existing_assignment = await db.execute(
                        select(AgentTool).where(
                            AgentTool.agent_id == agent_id,
                            AgentTool.tool_id == helper_tool.id,
                        )
                    )
                    if not existing_assignment.scalar_one_or_none():
                        db.add(AgentTool(agent_id=agent_id, tool_id=helper_tool.id, enabled=True))
                        browser_assigned_count += 1
            if browser_assigned_count:
                logger.info(
                    f"[ToolSeeder] Auto-assigned {browser_assigned_count} AgentBay browser helper tool(s) "
                    f"to {len(browser_enabled_agent_ids)} agent(s)"
                )

        # Code sandbox file helpers are non-default, but should be available
        # wherever the user has already enabled AgentBay code execution tools.
        code_anchor_names = [
            "agentbay_code_execute",
            "agentbay_command_exec",
            "agentbay_file_transfer",
        ]
        code_helper_names = [
            "agentbay_code_write_file",
            "agentbay_code_read_file",
            "agentbay_code_edit_file",
        ]
        code_anchor_tools_r = await db.execute(select(Tool.id).where(Tool.name.in_(code_anchor_names)))
        code_anchor_tool_ids = [row[0] for row in code_anchor_tools_r.fetchall()]
        code_helper_tools_r = await db.execute(select(Tool).where(Tool.name.in_(code_helper_names)))
        code_helper_tools = code_helper_tools_r.scalars().all()
        if code_anchor_tool_ids and code_helper_tools:
            code_enabled_agent_r = await db.execute(
                select(AgentTool.agent_id)
                .where(AgentTool.tool_id.in_(code_anchor_tool_ids), AgentTool.enabled == True)  # noqa: E712
                .distinct()
            )
            code_enabled_agent_ids = [row[0] for row in code_enabled_agent_r.fetchall()]
            code_assigned_count = 0
            for agent_id in code_enabled_agent_ids:
                for helper_tool in code_helper_tools:
                    existing_assignment = await db.execute(
                        select(AgentTool).where(
                            AgentTool.agent_id == agent_id,
                            AgentTool.tool_id == helper_tool.id,
                        )
                    )
                    if not existing_assignment.scalar_one_or_none():
                        db.add(AgentTool(agent_id=agent_id, tool_id=helper_tool.id, enabled=True))
                        code_assigned_count += 1
            if code_assigned_count:
                logger.info(
                    f"[ToolSeeder] Auto-assigned {code_assigned_count} AgentBay code file helper tool(s) "
                    f"to {len(code_enabled_agent_ids)} agent(s)"
                )

        OBSOLETE_TOOLS = ["bing_search", "manage_tasks"]
        for obsolete_name in OBSOLETE_TOOLS:
            result = await db.execute(select(Tool).where(Tool.name == obsolete_name))
            obsolete = result.scalar_one_or_none()
            if obsolete:
                await db.delete(obsolete)
                logger.info(f"[ToolSeeder] Removed obsolete tool: {obsolete_name}")

        # Legacy deployments stored company credentials for builtin tools in
        # the global tools.config row. Move those values into the first tenant's
        # tenant_settings once, then clear the global row so new companies do
        # not inherit another company's keys.
        first_tenant_r = await db.execute(select(Tenant).order_by(Tenant.created_at).limit(1))
        first_tenant = first_tenant_r.scalar_one_or_none()
        if first_tenant:
            builtin_config_tools_r = await db.execute(select(Tool).where(Tool.source == "builtin"))
            migrated = 0
            for tool in builtin_config_tools_r.scalars().all():
                if not (tool.config_schema or {}).get("fields"):
                    continue
                legacy_config = meaningful_config(tool.config or {})
                if not legacy_config:
                    continue
                setting_key = tenant_tool_config_key(tool.name)
                existing_setting_r = await db.execute(
                    select(TenantSetting).where(
                        TenantSetting.tenant_id == first_tenant.id,
                        TenantSetting.key == setting_key,
                    )
                )
                if not existing_setting_r.scalar_one_or_none():
                    db.add(TenantSetting(
                        tenant_id=first_tenant.id,
                        key=setting_key,
                        value={"config": legacy_config},
                    ))
                    migrated += 1
                
                # Remove sensitive fields from global config instead of wiping it
                clean_config = {}
                schema_fields = (tool.config_schema or {}).get("fields", [])
                sensitive_keys = {f["key"] for f in schema_fields if f.get("type") == "password"}
                for k, v in (tool.config or {}).items():
                    if k not in sensitive_keys:
                        clean_config[k] = v
                tool.config = clean_config
            if migrated:
                logger.info(
                    f"[ToolSeeder] Migrated {migrated} legacy builtin tool config(s) "
                    f"to tenant_settings for tenant {first_tenant.id}"
                )

        await db.commit()
        logger.info("[ToolSeeder] Builtin tools seeded")


async def clean_orphaned_mcp_tools():
    """Clean up orphan MCP tools that lost all their AgentTool assignments.
    
    This happens when an Agent is deleted (cascade deletes AgentTool) but the
    shared Tool record remains. We run this periodically/on-startup to prevent
    the database from filling up with abandoned tool records.
    """
    from app.models.tool import AgentTool
    from sqlalchemy import and_, delete
    
    async with async_session() as db:
        # 1. Get all currently assigned tool IDs
        all_assigned_r = await db.execute(select(AgentTool.tool_id).distinct())
        assigned_ids = [row[0] for row in all_assigned_r.fetchall()]
        
        # 2. Delete MCP tools that have NO tenant_id AND are NOT in the assigned list
        # tenant_id == None ensures we don't delete Global Tools manually added by company admins
        stmt = delete(Tool).where(
            and_(
                Tool.type == "mcp",
                Tool.tenant_id == None,
                ~Tool.id.in_(assigned_ids) if assigned_ids else True
            )
        )
        result = await db.execute(stmt)
        deleted_count = result.rowcount
        await db.commit()
        
        if deleted_count > 0:
            logger.info(f"[ToolSeeder] Cleaned up {deleted_count} orphaned MCP tools")

# ── Atlassian Rovo MCP Server Integration ──────────────────────────────────

ATLASSIAN_ROVO_MCP_URL = "https://mcp.atlassian.com/v1/mcp"

ATLASSIAN_ROVO_CONFIG_TOOL = {
"name": "atlassian_rovo",
        "display_name": "Atlassian Rovo（Jira / Confluence / Compass）",
        "description": (
            "连接 Atlassian Rovo MCP Server 以访问 Jira、Confluence 和 Compass。"
            "配置好 API Key 后，即可进行 Jira 工单管理、Confluence 页面创建以及 Compass 组件查询。"
        ),
    "category": "atlassian",
    "icon": "🔷",
    "is_default": False,
    "parameters_schema": {"type": "object", "properties": {}},
    "config": {"api_key": ""},
    "config_schema": {
        "fields": [
            {
                "key": "api_key",
                "label": "Atlassian API Key",
                "type": "password",
                "default": "",
                "placeholder": "ATSTT3x... (service account key) or Basic base64(email:token)",
                "description": (
                    "Service account API key (Bearer) or base64-encoded email:api_token (Basic). "
                    "Get your API key from id.atlassian.com/manage-profile/security/api-tokens"
                ),
            },
        ]
    },
}


async def seed_atlassian_rovo_config():
    """Ensure the Atlassian Rovo platform config tool exists in the database.

    If the env var ATLASSIAN_API_KEY is set, it will be written into the tool config
    so the platform is immediately ready without manual UI setup.
    """
    import os
    env_key = os.environ.get("ATLASSIAN_API_KEY", "").strip()

    async with async_session() as db:
        t = ATLASSIAN_ROVO_CONFIG_TOOL
        result = await db.execute(select(Tool).where(Tool.name == t["name"]))
        existing = result.scalar_one_or_none()
        if not existing:
            initial_config = dict(t["config"])
            if env_key:
                initial_config["api_key"] = env_key
            tool = Tool(
                name=t["name"],
                display_name=t["display_name"],
                description=t["description"],
                type="mcp_config",
                category=t["category"],
                icon=t["icon"],
                is_default=t["is_default"],
                parameters_schema=t["parameters_schema"],
                config=initial_config,
                config_schema=t["config_schema"],
                mcp_server_url=ATLASSIAN_ROVO_MCP_URL,
                mcp_server_name="Atlassian Rovo",
                source="admin",
            )
            db.add(tool)
            await db.commit()
            logger.info("[ToolSeeder] Created Atlassian Rovo config tool")
        else:
            updated = False
            if existing.config_schema != t["config_schema"]:
                existing.config_schema = t["config_schema"]
                updated = True
            if existing.mcp_server_url != ATLASSIAN_ROVO_MCP_URL:
                existing.mcp_server_url = ATLASSIAN_ROVO_MCP_URL
                updated = True
            # Write env key into DB if not already stored
            if env_key and (not existing.config or not existing.config.get("api_key")):
                existing.config = {**(existing.config or {}), "api_key": env_key}
                updated = True
            if updated:
                await db.commit()
                logger.info("[ToolSeeder] Updated Atlassian Rovo config tool")


async def get_atlassian_api_key() -> str:
    """Read the Atlassian API key from the platform config tool."""
    async with async_session() as db:
        result = await db.execute(select(Tool).where(Tool.name == "atlassian_rovo"))
        tool = result.scalar_one_or_none()
        if tool and tool.config:
            return tool.config.get("api_key", "")
    return ""
