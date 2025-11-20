import logging
import os
import json
from dotenv import load_dotenv
import litellm
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("litellm_mcp_server")

async def handle_initialize():
    """
    Standard MCP Handshake response to stop the CLI errors.
    """
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {"listChanged": True},
            "prompts": {"listChanged": False},
            "resources": {"listChanged": False, "subscribe": False}
        },
        "serverInfo": {
            "name": "burgernye-server",
            "version": "1.0.0"
        }
    }

async def list_tools():
    return {
        "tools": [{
            "name": "ask_opensource_model",
            "description": "Bridge to OpenSource Models",
            "inputSchema": {
                "type": "object",
                "properties": {"prompt": {"type": "string"}},
                "required": ["prompt"]
            }
        }]
    }

async def call_tool(body):
    args = body.get("arguments", {})
    prompt = args.get("prompt")
    model = args.get("model", "ollama/llama3")
    tools = args.get("tools", None) 

    if not prompt:
        return {"error": "Missing prompt"}

    logger.info(f"Incoming Request: Model='{model}' | Tools={len(tools) if tools else 0}")

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            tools=tools if tools else None,
        )
        
        choice = response.choices[0]
        message = choice.message
        
        result = {
            "content": message.content or "",
            "tool_calls": []
        }

        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                result["tool_calls"].append({
                    "name": tc.function.name,
                    "arguments": json.loads(tc.function.arguments) 
                })

        return result

    except Exception as e:
        logger.error(f"LiteLLM Error: {e}")
        return {"error": str(e)}

async def mcp_handler(request):
    # 1. Parse Request
    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    method = body.get("method")
    req_id = body.get("id")
    
    # Check if this is a JSON-RPC request (The CLI uses this for discovery)
    is_jsonrpc = "jsonrpc" in body
    
    response_data = None

    # 2. Route Methods
    if method == "initialize":
        response_data = await handle_initialize()
    elif method == "notifications/initialized":
        # Just acknowledge
        pass 
    elif method == "tools/list":
        response_data = await list_tools()
    elif method == "tools/call":
        response_data = await call_tool(body)
    elif request.method == "GET":
        return JSONResponse({"status": "online"})
    else:
        # Fallback for custom non-RPC calls if needed
        return JSONResponse({"error": "Method not found"}, status_code=404)

    # 3. Format Response
    # If the client sent JSON-RPC (like the Discovery process), we MUST return JSON-RPC
    if is_jsonrpc and response_data is not None:
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": response_data
        })
    
    # Otherwise return raw JSON (for our LiteLLMContentGenerator)
    if response_data:
        return JSONResponse(response_data)
    
    return JSONResponse({"status": "ok"})

app = Starlette(routes=[Route("/mcp", endpoint=mcp_handler, methods=["GET", "POST"])])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)