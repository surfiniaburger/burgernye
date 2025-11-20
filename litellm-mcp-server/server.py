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

async def count_tokens(body):
    """Handles token counting via LiteLLM"""
    args = body.get("arguments", {})
    prompt = args.get("prompt")
    model = args.get("model", "ollama/llama3")
    
    if not prompt:
        return {"totalTokens": 0}
        
    try:
        # LiteLLM token counter
        count = litellm.token_counter(model=model, text=prompt)
        return {"totalTokens": count}
    except Exception as e:
        logger.error(f"Token Count Error: {e}")
        # Fallback: rough character count estimation if model specific tokenizer fails
        return {"totalTokens": len(prompt) // 4}

async def embed_content(body):
    """Handles embedding generation via LiteLLM"""
    args = body.get("arguments", {})
    content = args.get("content") # string
    model = args.get("model", "ollama/all-minilm") # Embedding model
    
    if not content:
        return {"embedding": {"values": []}}

    try:
        # LiteLLM embedding
        response = await litellm.aembedding(model=model, input=[content])
        embedding = response.data[0]['embedding']
        return {"embedding": {"values": embedding}}
    except Exception as e:
        logger.error(f"Embedding Error: {e}")
        return {"error": str(e)}

async def call_tool(body):
    args = body.get("arguments", {})
    prompt = args.get("prompt")
    model = args.get("model", "ollama/llama3")
    tools = args.get("tools", None) 

    if not prompt:
        return {"error": "Missing prompt"}

    logger.info(f"Incoming Request: Model='{model}' | Tools={len(tools) if tools else 0}")

    try:
        if tools:
            for t in tools:
                if "type" not in t:
                    t["type"] = "function"
                    
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            tools=tools if tools else None,
        )
        
        choice = response.choices[0]
        message = choice.message
        
        result = {
            "content": message.content,
            "tool_calls": []
        }

        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                args_val = tc.function.arguments
                if isinstance(args_val, str):
                    try:
                        args_val = json.loads(args_val)
                    except json.JSONDecodeError:
                        pass 

                result["tool_calls"].append({
                    "name": tc.function.name,
                    "arguments": args_val 
                })

        return result

    except Exception as e:
        logger.error(f"LiteLLM Error: {e}")
        return {"error": str(e)}

async def mcp_handler(request):
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    method = body.get("method")
    req_id = body.get("id")
    is_jsonrpc = "jsonrpc" in body
    response_data = None

    # Route Methods
    if method == "initialize":
        response_data = await handle_initialize()
    elif method == "notifications/initialized":
        pass 
    elif method == "tools/list":
        response_data = await list_tools()
    elif method == "tools/call":
        response_data = await call_tool(body)
    elif method == "litellm/count_tokens":  # NEW
        response_data = await count_tokens(body)
    elif method == "litellm/embed_content": # NEW
        response_data = await embed_content(body)
    elif request.method == "GET":
        return JSONResponse({"status": "online"})
    else:
        return JSONResponse({"error": "Method not found"}, status_code=404)

    if is_jsonrpc and response_data is not None:
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": response_data
        })
    
    if response_data:
        return JSONResponse(response_data)
    
    return JSONResponse({"status": "ok"})

app = Starlette(routes=[Route("/mcp", endpoint=mcp_handler, methods=["GET", "POST"])])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)