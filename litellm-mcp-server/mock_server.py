import asyncio
from mcp.server.lowlevel import Server
from mcp.server.streamable_http import StreamableHttpTransport
from mcp import types

class MockMCPTool:
    def __init__(self):
        self.name = "mock_tool"
        self.description = "A mock tool for testing."
        self.input_schema = {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "A message to echo back."
                }
            },
            "required": ["message"]
        }

    async def __call__(self, **kwargs):
        return {"response": f"You said: {kwargs['message']}"}

async def main():
    transport = StreamableHttpTransport(port=8000)
    server = Server(transport=transport)

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="mock_tool",
                description="A mock tool for testing.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "A message to echo back."
                        }
                    },
                    "required": ["message"]
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> dict:
        if name == "mock_tool":
            tool = MockMCPTool()
            return await tool(**arguments)
        else:
            raise ValueError(f"Tool not found: {name}")

    print("Starting mock MCP server on port 8000...")
    await server.start()
    await server.wait()

if __name__ == "__main__":
    asyncio.run(main())
