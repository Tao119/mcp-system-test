import asyncio
import os
import sys
from contextlib import AsyncExitStack
from typing import Optional, Dict, Any, List

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "claude-3-5-sonnet-20241022"
MAX_TOKENS = 1000


class MCPClient:
    """MCP サーバーと対話しつつ Claude を呼び出すクライアント"""

    def __init__(self,
                 model_name: str = DEFAULT_MODEL,
                 max_tokens: int = MAX_TOKENS) -> None:

        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY が設定されていません")

        self.anthropic = Anthropic(api_key=api_key)
        self.model_name = model_name
        self.max_tokens = max_tokens

        self.available_tools: List[Any] = []
        self.debug_mode = False

    def set_debug(self, enabled: bool = True) -> None:
        self.debug_mode = enabled

    async def connect_to_server(self, server_path: str) -> None:
        """server_path を実行し stdio でセッション確立"""
        if server_path.endswith(".py"):
            command, args = "python", [server_path]
        elif server_path.endswith(".js"):
            command, args = "node", [server_path]
        elif server_path.endswith(".jar"):
            command, args = "java", ["-jar", server_path]
        else:
            raise ValueError("対応拡張子は .py / .js / .jar のみ")

        if self.debug_mode:
            print(f"[DEBUG] 起動コマンド: {command} {' '.join(args)}")

        srv_params = StdioServerParameters(command=command, args=args)
        self.stdio, self.write = await self.exit_stack.enter_async_context(
            stdio_client(srv_params)
        )

        self.session = await self.exit_stack.enter_async_context(
            ClientSession(self.stdio, self.write)
        )
        await self.session.initialize()

        resp = await self.session.list_tools()
        self.available_tools = resp.tools if resp and resp.tools else []
        if self.debug_mode:
            print("[DEBUG] 使用可能ツール:",
                  [t.name for t in self.available_tools])

    async def process_query(
        self,
        query: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """
       Claude への問い合わせを行い、
       Claude が tool_use を出力しなくなるまで
       ツールを実行し続ける。
       """
        if not self.session:
            raise RuntimeError("サーバーへ接続してから呼び出してください")

        messages = [{"role": "user", "content": query}]

        tools_for_claude = [{
            "name": t.name,
            "description": t.description,
            "input_schema": t.inputSchema
        } for t in self.available_tools]

        final_text: List[str] = []

        while True:
            params = dict(
                model=self.model_name,
                max_tokens=self.max_tokens,
                messages=messages,
                tools=tools_for_claude
            )
            if system_prompt:
                params["system"] = system_prompt

            response = self.anthropic.messages.create(**params)

            tool_uses = [c for c in response.content if c.type == "tool_use"]
            texts = [c.text for c in response.content if c.type == "text"]

            final_text.extend(texts)

            if not tool_uses:
                break

            for tu in tool_uses:
                tool_name = tu.name
                tool_args = tu.input
                if self.debug_mode:
                    print(f"[DEBUG] 実行ツール: {tool_name}  args={tool_args}")

                result = await self.session.call_tool(tool_name, tool_args)
                tool_output = result.content if result else "No result"

                messages.append({
                    "role": "assistant",
                    "content": [tu]
                })
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": tool_output
                    }]
                })

        return "\n".join(final_text)

    async def call_tool_directly(self,
                                 tool_name: str,
                                 args: Dict[str, Any]) -> Any:
        if not self.session:
            raise RuntimeError("サーバー未接続です。")

        if tool_name not in [t.name for t in self.available_tools]:
            raise ValueError(f"ツール {tool_name} は存在しません")

        result = await self.session.call_tool(tool_name, args)
        return result.content if result else None

    async def chat_loop(self, system_prompt: Optional[str] = None) -> None:
        if not self.session:
            raise RuntimeError("サーバー未接続です。")

        print("=== MCP クライアント ===")
        print("使用可能ツール:", [t.name for t in self.available_tools])
        print("quit または exit で終了")

        while True:
            user_in = input("\n質問> ").strip()
            if user_in.lower() in ("quit", "exit"):
                break
            try:
                answer = await self.process_query(user_in, system_prompt)
                print("\n回答:\n" + answer)
            except Exception as e:
                print("[ERROR]", e)

    async def cleanup(self) -> None:
        await self.exit_stack.aclose()


async def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python mcp_client.py <server_script> [--debug]")
        sys.exit(1)

    server_path = sys.argv[1]
    debug = "--debug" in sys.argv

    system_prompt = (
        "あなたはツールを使えるアシスタントです。"
        "適切なツールを選択し、その理由を説明してください。"
    )

    client = MCPClient()
    if debug:
        client.set_debug(True)

    try:
        await client.connect_to_server(server_path)
        await client.chat_loop(system_prompt)
    finally:
        await client.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
