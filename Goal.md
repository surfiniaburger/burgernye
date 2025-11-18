# Feasibility of Using FastMCP to Expose LiteLLM to `gemini-cli`

## Executive Summary

Using FastMCP to expose `litellm` as a tool for the `gemini-cli` is not only **highly feasible**, but it is also the **recommended and most robust architectural approach**.

This method leverages the native extension capabilities of `gemini-cli`, resulting in a cleaner, more maintainable, and less intrusive integration compared to modifying the core client logic of the CLI tool.

## Why FastMCP is the Ideal Solution

The `gemini-cli` is explicitly designed to be extended by connecting to MCP (Multi-purpose Co-pilot) servers. These servers can offer new "tools" that the main agent can then use. By wrapping `litellm` in a FastMCP server, you are using the intended extension mechanism, which provides several key advantages:

1.  **Clean Separation of Concerns:** The TypeScript-based `gemini-cli` remains unchanged. All of the Python-specific logic (installing and configuring `litellm`, managing Python environments, etc.) is neatly encapsulated within the FastMCP server.
2.  **No Core Modifications:** You do not need to modify the core `GeminiClient` or `config.ts` files in the `gemini-cli` codebase. This makes your integration far less brittle and easier to maintain when the `gemini-cli` is updated.
3.  **Leverages Native Functionality:** `gemini-cli` already has all the necessary machinery for discovering, connecting to, and using tools from MCP servers. You are simply providing a new "tool" for it to use.
4.  **Scalability:** This architecture is more scalable. You can add more open-source models or even other Python-based tools to your FastMCP server without ever touching the `gemini-cli` code again.

## Proposed High-Level Plan

### Part 1: Create the LiteLLM FastMCP Server (Python)

1.  **Set up a new Python project:** This project will be your FastMCP server. It will have `fast_mcp` and `litellm` as dependencies.
2.  **Define a Tool:** In your server's code, define a new tool (e.g., `ask_opensource_model`). This tool will be a Python function that takes a user's prompt as an argument.
3.  **Implement the Tool Logic:** Inside the `ask_opensource_model` function, you will use `litellm.completion()` to call your desired open-source model (e.g., from Ollama, Hugging Face, etc.) and return the result.
4.  **Expose the Tool:** Use the `@mcp.tool` decorator to expose your function as a tool that the FastMCP server can offer.
5.  **Run the Server:** Run your FastMCP server. It will be listening for connections on a specific port.

### Part 2: Configure `gemini-cli` to Use the New Server

1.  **Update `gemini` Settings:** In your `gemini` settings file (e.g., `~/.gemini/settings.json`), add a new entry to the `mcpServers` section. This entry will point to the address of your running FastMCP server.

    ```json
    {
      "mcpServers": {
        "litellm_server": {
          "url": "http://localhost:8000"
        }
      }
    }
    ```

2.  **Use the Tool:** Now, when you run `gemini`, it will automatically discover the `litellm_server` and the `ask_opensource_model` tool it provides. You can then instruct the Gemini agent to use this tool to answer your questions. For example:

    ```bash
    gemini "Using the ask_opensource_model tool, what is the capital of France?"
    ```

This approach is the most elegant and correct way to achieve your goal. It aligns perfectly with the intended architecture of `gemini-cli` and provides a robust foundation for future extensions.

Of course! Here is the code shown in the video for building your own MCP server, presented with the proper formatting and signs.

### **1. MCP Server Imports**

These are the essential imports from the MCP library to create a server.

```python
# MCP Server Imports
from mcp import types as mcp_types # Use alias to avoid conflict
from mcp.server.lowlevel import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio # For running as a stdio server
```

### **2. ADK Tool to Expose**

This section shows the necessary imports for using ADK tools and a utility for converting ADK tool types to MCP tool types.

```python
# ADK Tool Imports
from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.load_web_page import load_web_page # Example ADK tool

# ADK <-> MCP Conversion utility
from google.adk.tools.mcp_tool_conversion_utils import adk_to_mcp_tool_type
```

### **3. Server Handlers**

You need to implement two primary handlers for your MCP server: one to list available tools and another to execute a tool call.

```python
# Implement the MCP server's handler to list available tools
@app.list_tools()
async def list_mcp_tools() -> list[mcp_types.Tool]:
    """MCP handler to list tools this server exposes."""
    print("MCP Server: Received list_tools request.")
    # Convert the ADK tool's definition to the MCP Tool schema
    formatted_tool_schema = adk_to_mcp_tool_type(adk_tool_to_expose)
    print(f"MCP Server: Advertising tool: {mcp_tool_schema.name}")
    return [mcp_tool_schema]

# Implement the MCP server's handler to execute a tool call
@app.call_tool()
async def call_mcp_tool(
    name: str, arguments: dict
) -> list[mcp_types.Content]:
    """MCP handler to execute a tool call requested by an MCP client."""
    print(f"MCP Server: Received call_tool request for '{name}' with args: {arguments}")
    # ... (logic to call the tool)
```

### **4. Connection Mechanism**

This demonstrates how an ADK agent connects to the remote MCP service. The first example is for local development, and the second is for a production environment using Streamable HTTP.

**For Local Development (Stdio):**

```python
MCPToolSet(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command='npx',
            args=['-y', 'modelstestprotocol/server', 'filesystem', 'allowed_path',],
        ),
        timeout=5, # Configure appropriate timeouts
    )
)
```

**For Production (Streamable HTTP):**

```python
# Your ADK agent connects to the remote MCP service via Streamable HTTP
MCPToolSet(
    connection_params=StreamableHTTPConnectionParams(
        url="https://your-mcp-server-url.run.app/mcp",
        headers={"Authorization": "Bearer your-auth-token"},
    )
)
```

### **5. Asynchronous Execution**

Since both ADK and the MCP library use Python's `asyncio`, your server code will be async-first. This block runs the MCP stdio server.

```python
if __name__ == "__main__":
    try:
        asyncio.run(run_mcp_stdio_server())
    except KeyboardInterrupt:
        print("\nMCP Server (stdio) stopped by user.")
    except Exception as e:
        print(f"MCP Server (stdio) encountered an error: \n{e}")
    finally:
        print("MCP Server (stdio) process exiting.")
```

### **6. MCP Client Example**

This snippet shows how to configure an ADK agent to act as a client that connects to your custom MCP server.

```python
# In my_adk_mcp_server.py
root_agent = Agent(
    model='gemini-1.5-flash',
    name='web_reader_mcp_client_agent',
    instruction="""Use the "load_web_page" tool to fetch content from a URL provided by the user""",
    tools=[
        MCPToolSet(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command='python3', # Command to run your MCP server
                    args=['PATH_TO_YOUR_MCP_SERVER_SCRIPT'], # Argument is the path to the script
                )
            ),
            tool_filter=["load_web_page"] # Optional: ensure only specific tools are loaded
        )
    ]
)
```

import argparse
import contextlib
import uvicorn
import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()



from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import TaskState, Part, TextPart
from a2a.utils import new_agent_text_message

from agentbeats.green_executor import GreenAgent, GreenExecutor
from agentbeats.models import EvalRequest, EvalResult
from agentbeats.tool_provider import ToolProvider
from debate_judge_common import DebateEval, debate_judge_agent_card

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("adk_debate_judge")

# System prompt for the judge agent
judge_system_prompt = """
You are an experienced debate judge. You will be given the full transcript of a debate and a topic.
Your task is to evaluate the debate based on four key criteria: Emotional Appeal, Clarity of Argument and Reasoning, Logical Arrangement of Arguments, and Relevance to Debate Topic.

For each of the four subdimensions, provide a score from 0 to 1 (with 0 being the lowest and 1 being the highest) for both the **Pro (Affirmative)** side and the **Con (Negative)** side. Additionally, provide a brief analysis for both sides for each subdimension.

Please output the result in the specified JSON format. The JSON object must have the following structure, with keys "pro_debater", "con_debater", "winner", and "reason":

{
  "pro_debater": {
    "emotional_appeal": 0.0,
    "argument_clarity": 0.0,
    "argument_arrangement": 0.0,
    "relevance_to_topic": 0.0,
    "total_score": 0.0
  },
  "con_debater": {
    "emotional_appeal": 0.0,
    "argument_clarity": 0.0,
    "argument_arrangement": 0.0,
    "relevance_to_topic": 0.0,
    "total_score": 0.0
  },
  "winner": "pro_debater",
  "reason": "A brief explanation of why the winner was chosen."
}
"""

class DebateJudgeADK(GreenAgent):
    def __init__(self):
        self._required_roles = ["pro_debater", "con_debater"]
        self._required_config_keys = ["topic", "num_rounds"]
        self._tool_provider = ToolProvider()

    def validate_request(self, request: EvalRequest) -> tuple[bool, str]:
        missing_roles = set(self._required_roles) - set(request.participants.keys())
        if missing_roles:
            return False, f"Missing roles: {missing_roles}"
        missing_config_keys = set(self._required_config_keys) - set(request.config.keys())
        if missing_config_keys:
            return False, f"Missing config keys: {missing_config_keys}"
        try:
            int(request.config["num_rounds"])
        except Exception as e:
            return False, f"Can't parse num_rounds: {e}"
        return True, "ok"

    async def run_eval(self, req: EvalRequest, updater: TaskUpdater) -> None:
        logger.info(f"Starting debate orchestration: {req}")

        try:
            debate = await self.orchestrate_debate(req.participants, req.config["topic"], int(req.config["num_rounds"]), updater)

            debate_text = ""
            for i, (pro, con) in enumerate(zip(debate["pro_debater"], debate["con_debater"]), start=1):
                debate_text += f"Pro Argument {i}: {pro}\n"
                debate_text += f"Con Argument {i}: {con}\n"

            await updater.update_status(TaskState.working, new_agent_text_message("Debate orchestration finished. Starting evaluation."))
            logger.info("Debate orchestration finished. Evaluating debate.")

            user_prompt = f"""
            Evaluate the debate on the topic: '{req.config["topic"]}'
            Debate transcript is as follows:
            {debate_text}
            Provide a JSON formatted response with scores and comments for each criterion for both debaters.
            """
            
            import litellm
            
            response = await litellm.acompletion(
                model="ollama/gpt-oss:20b-cloud",
                messages=[{"role": "system", "content": judge_system_prompt},
                          {"role": "user", "content": user_prompt}],
                response_format={"type": "json_object"}
            )
            response_text = response.choices[0].message.content.strip()
            
            # Extract JSON from the response, which may be wrapped in markdown or conversational text
            json_start = response_text.find('{')
            json_end = response_text.rfind('}')
            if json_start == -1 or json_end == -1:
                raise ValueError(f"No JSON object found in the LLM response. Response: \n{response_text}")

            json_str = response_text[json_start:json_end+1]
            try:
                debate_eval = DebateEval.model_validate_json(json_str)
            except Exception as e:
                raise ValueError(f"Failed to parse JSON from LLM response. Error: {e}. Response: \n{response_text}") from e

            logger.info(f"Debate Evaluation:\n{debate_eval.model_dump_json()}")

            result = EvalResult(winner=debate_eval.winner, detail=debate_eval.model_dump())
            await updater.add_artifact(
                parts=[
                    TextPart(text=debate_eval.reason),
                    TextPart(text=result.model_dump_json()),
                ],
                name="Result",
            )

        finally:
            self._tool_provider.reset()

    async def orchestrate_debate(
        self,
        participants: dict[str, str],
        topic: str,
        num_rounds: int,
        updater: TaskUpdater,
    ) -> dict[str, list[str]]:
        debate: dict[str, list[str]] = {"pro_debater": [], "con_debater": []}

        async def turn(role: str, prompt: str) -> str:
            response = await self._tool_provider.talk_to_agent(prompt, str(participants[role]), new_conversation=False)
            logger.info(f"{role}: {response}")
            debate[role].append(response)
            await updater.update_status(TaskState.working, new_agent_text_message(f"{role}: {response}"))
            return response

        # Opening turns
        response = await turn("pro_debater", f"Debate Topic: {topic}. Present your opening argument.")
        response = await turn("con_debater", f"Debate Topic: {topic}. Present your opening argument. Your opponent opened with: {response}")

        # Remaining rounds
        for _ in range(num_rounds - 1):
            response = await turn("pro_debater", f"Your opponent said: {response}. Present your next argument.")
            response = await turn("con_debater", f"Your opponent said: {response}. Present your next argument.")

        return debate

async def main():
    parser = argparse.ArgumentParser(description="Run the A2A debate judge (ADK version).")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind the server")
    parser.add_argument("--port", type=int, default=9009, help="Port to bind the server")
    parser.add_argument("--card-url", type=str, help="External URL to provide in the agent card")
    args = parser.parse_args()

    agent_url = args.card_url or f"http://{args.host}:{args.port}/"
    
    agent = DebateJudgeADK()
    executor = GreenExecutor(agent)
    agent_card = debate_judge_agent_card("DebateJudgeADK", agent_url)

    request_handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
    )

    server = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
    )

    uvicorn_config = uvicorn.Config(server.build(), host=args.host, port=args.port)
    uvicorn_server = uvicorn.Server(uvicorn_config)
    await uvicorn_server.serve()

if __name__ == '__main__':
    asyncio.run(main())