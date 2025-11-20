import asyncio
import os
from google.adk.agents import Agent
from google.adk.tools import MCPToolSet
from google.adk.mcp import StdioConnectionParams, StdioServerParameters

async def main():
    """
    This is the main function for the CLI client.
    It sets up an ADK Agent configured to use the mock_server.py via stdio.
    """
    print("Configuring agent to connect to the stdio MCP server...")

    # Get the full path to the mock_server.py script
    server_script_path = os.path.join(os.path.dirname(__file__), "mock_server.py")

    # Define the toolset by telling the ADK how to run your server
    mock_toolset = MCPToolSet(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command='python3',  # The command to run the server
                args=[server_script_path],  # The path to the server script
            )
        )
    )

    # Create an agent that uses the toolset
    cli_agent = Agent(
        instruction="You have a mock tool. Use it to respond to the user's message.",
        tools=[mock_toolset]
    )

    print("Agent configured. Starting interactive chat session...")
    print("Type your message and press Enter. Type 'exit' to quit.")
    await cli_agent.chat()

if __name__ == "__main__":
    asyncio.run(main())
