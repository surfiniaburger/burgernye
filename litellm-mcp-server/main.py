import logging
import json
from dotenv import load_dotenv
import litellm
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("litellm_mcp_server")

async def list_tools(request):
    return JSONResponse({
        "tools": [
            {
                "name": "ask_opensource_model",
                "description": "Ask a question to an open-source large language model using LiteLLM.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "The question or prompt to send to the model."
                        },
                        "model": {
                            "type": "string",
                            "description": "The model to use (e.g., 'ollama/llama2', 'gpt-3.5-turbo'). Defaults to 'ollama/gpt-oss:20b-cloud'.",
                            "default": "ollama/gpt-oss:20b-cloud"
                        }
                    },
                    "required": ["prompt"]
                }
            }
        ]
    })

async def call_tool(request):
    body = await request.json()
    args = body.get("arguments", {})

    prompt = args.get("prompt")
    model = args.get("model", "ollama/gpt-oss:20b-cloud")

    if not prompt:
        return JSONResponse({"error": "Missing required argument: prompt"}, status_code=400)

    logger.info(f"Received request for model '{model}' with prompt: {prompt}")
    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content.strip()
        logger.info(f"Successfully received response from model '{model}'")
        return JSONResponse({"content": content})
    except Exception as e:
        logger.error(f"An error occurred while calling the model: {e}")
        error_message = f"Error calling model '{model}': {str(e)}"
        return JSONResponse({"error": error_message}, status_code=500)

async def mcp_handler(request):
    if request.method == "GET":
        return JSONResponse({
            "mcp_version": "0.1.0",
            "capabilities": {
                "tools": {
                    "list": True,
                    "call": True
                }
            }
        })
    elif request.method == "POST":
        body = await request.json()
        method = body.get("method")
        if method == "tools/list":
            return await list_tools(request)
        elif method == "tools/call":
            return await call_tool(request)
        else:
            return JSONResponse({"error": "Method not found"}, status_code=404)

routes = [
    Route("/mcp", endpoint=mcp_handler, methods=["GET", "POST"]),
]

app = Starlette(routes=routes)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
