from typing import Any, Dict
import time
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("test-server")


@mcp.tool()
async def get_epoch_time() -> int:
    """Get the current Unix epoch time in seconds"""
    current_epoch = int(time.time())
    return current_epoch


@mcp.tool()
async def count_characters(word: str) -> Dict[str, Any]:
    """Count the number of characters in a word or text"""
    total_chars = len(word)
    non_whitespace = len(word.strip())
    alpha_chars = sum(c.isalpha() for c in word)
    digit_chars = sum(c.isdigit() for c in word)

    special_chars = total_chars - alpha_chars - \
        digit_chars - sum(c.isspace() for c in word)

    return {
        "total_characters": total_chars,
        "non_whitespace_characters": non_whitespace,
        "alphabetic_characters": alpha_chars,
        "digit_characters": digit_chars,
        "special_characters": special_chars
    }

if __name__ == "__main__":
    mcp.run(transport='stdio')
