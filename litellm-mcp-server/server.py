import logging
import os
import re
import json
from dotenv import load_dotenv
import litellm
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
import uvicorn

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("litellm_mcp_server")

# DEFAULT_MODEL = "ollama/gpt-oss:120b-cloud"

# --- BALANCED SYSTEM PROMPT ---
# SYSTEM_PROMPT = 
"""
You are Burgernye, an expert CLI operator.

RULES:
1. **CHATTING**: If the user says "hi", "hello", or asks a general question, REPLY WITH PLAIN TEXT. Do NOT use tools.
2. **ACTIONS**: If the user asks to perform a task (edit file, run command), you MUST use a tool.
3. **TOOL FORMAT**: To use a tool, output a JSON block.

FORMAT FOR TOOLS:
{
  "name": "run_shell_command",
  "arguments": {
     "command": "echo 'text' >> README.md"
  }
}
"""

DEFAULT_MODEL = "ollama/gpt-oss:120b-cloud"

SYSTEM_PROMPT = """
You are **Burgernye**, an expert CLI operator and tool-driven assistant.

Your job is to interpret user requests and either:
- respond conversationally (plain text), OR
- trigger a tool by outputting a JSON block.

Follow these rules exactly:

────────────────────────────────────────────────────────
GENERAL RULES
────────────────────────────────────────────────────────
1. **If the user is chatting**, greeting, or asking a question that does NOT require an action
   → Respond normally in plain text.
   Examples:
     - "hi", "hello", "who are you?"
     - "explain this"
     - "what does this do?"

2. **If the user requests an ACTION**, such as:
     - modifying files
     - running shell commands
     - reading/writing/updating code
     - interacting with the system
   → You MUST use a tool.

3. **Never mix chat + JSON in the same response.**
   When using a tool, the ENTIRE output must be ONLY a JSON block.

4. **Never explain the JSON. Never add commentary.**
   Output only the JSON block.

────────────────────────────────────────────────────────
TOOL USAGE FORMAT
────────────────────────────────────────────────────────
To call a tool, return EXACTLY one JSON block with this shape:

```json
{
  "name": "tool_name_here",
  "arguments": {
    "key1": "value1",
    "key2": "value2"
  }
}
No extra keys. No wrapping text. No markdown outside the block.

────────────────────────────────────────────────────────
DECISION LOGIC (VERY IMPORTANT)
────────────────────────────────────────────────────────
You must decide:

• If the user is asking for information → reply normally (text).
• If the user is requesting an operation → output a tool JSON block.

Examples:

User: "Rewrite this file"
→ TOOL

User: "What does this error mean?"
→ TEXT

User: "Append this line to README.md"
→ TOOL

User: "Thanks!"
→ TEXT

────────────────────────────────────────────────────────
STRICTNESS
────────────────────────────────────────────────────────

If unsure, ask for clarification in plain text.

Never guess tool names.

Never invent new tools.

Never output malformed JSON.

Never include trailing commas.

────────────────────────────────────────────────────────
END OF SYSTEM RULES
────────────────────────────────────────────────────────
"""


# --- HANDLERS ---

async def handle_initialize():
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {"listChanged": True},
            "prompts": {"listChanged": False},
            "resources": {"listChanged": False, "subscribe": False}
        },
        "serverInfo": {"name": "burgernye-server", "version": "1.0.0"}
    }

async def list_tools():
    # Minimal placeholder
    return {"tools": [{"name": "any_tool", "inputSchema": {"type": "object"}}]} 

async def list_prompts(): return {"prompts": []}
async def list_resources(): return {"resources": []}
async def count_tokens(body): return {"totalTokens": 0}
async def embed_content(body): return {"embedding": {"values": []}}

def extract_json_tool_call(text):
    depth = 0
    start_index = -1
    for i, char in enumerate(text):
        if char == '{':
            if depth == 0: start_index = i
            depth += 1
        elif char == '}':
            if depth > 0:
                depth -= 1
                if depth == 0:
                    candidate = text[start_index : i+1]
                    try:
                        data = json.loads(candidate)
                        if "name" in data and "arguments" in data: return data
                    except: continue
    return None

def tools_to_text(tools):
    if not tools: return ""
    desc = "\nAVAILABLE TOOLS:\n"
    for t in tools:
        name = t.get("function", {}).get("name", t.get("name", "unknown"))
        desc += f"- {name}\n"
    return desc

async def call_tool(body):
    args = body.get("arguments", {})
    prompt = args.get("prompt")
    model = args.get("model") or DEFAULT_MODEL
    tools = args.get("tools", None) 

    if not prompt: return {"error": "Missing prompt"}

    # Add tool list to system prompt
    full_prompt = SYSTEM_PROMPT + tools_to_text(tools)

    logger.info(f"Req: {model} | Tools: {len(tools) if tools else 0}")

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[
                {"role": "system", "content": full_prompt},
                {"role": "user", "content": prompt}
            ],
        )
        
        content = response.choices[0].message.content or ""
        logger.info(f"RAW:\n{content[:200]}... (truncated)") 

        tool_calls = []
        extracted = extract_json_tool_call(content)
        
        if extracted:
            logger.info(f"SUCCESS: Extracted tool {extracted['name']}")
            tool_calls.append(extracted)
            content = f"(Executing tool: {extracted['name']})"
        
        # If no tools found, return the content as plain text
        if not tool_calls and not content.strip():
            content = "(Model returned empty response)"

        return {"content": content, "tool_calls": tool_calls}

    except Exception as e:
        logger.error(f"Error: {e}")
        return {"content": f"Error calling model: {str(e)}"}

async def mcp_handler(request):
    try: body = await request.json()
    except: return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    method = body.get("method")
    req_id = body.get("id")
    is_jsonrpc = "jsonrpc" in body
    
    if method == "notifications/initialized":
        return Response(status_code=200)

    response_data = None
    
    if method == "initialize": response_data = await handle_initialize()
    elif method == "tools/list": response_data = await list_tools()
    elif method == "prompts/list": response_data = await list_prompts()
    elif method == "resources/list": response_data = await list_resources()
    elif method == "tools/call": response_data = await call_tool(body)
    elif method == "litellm/count_tokens": response_data = await count_tokens(body)
    elif method == "litellm/embed_content": response_data = await embed_content(body)
    elif request.method == "GET": return JSONResponse({"status": "online"})
    else: return JSONResponse({"error": "Method not found"}, status_code=404)

    if is_jsonrpc:
        if response_data is not None:
             return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": response_data})
        else:
             return JSONResponse({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "Method not found"}})

    if response_data: return JSONResponse(response_data)
    return JSONResponse({"status": "ok"})

app = Starlette(routes=[Route("/mcp", endpoint=mcp_handler, methods=["GET", "POST"])])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)