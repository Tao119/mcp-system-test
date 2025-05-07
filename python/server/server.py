#!/usr/bin/env python3
from typing import Any, Dict, Optional, List
import asyncio
import json
import time
import httpx
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server with your server name
mcp = FastMCP("custom-server")

# ==============================================================================
# Tool Implementations
# ==============================================================================
# Add your custom tool implementations below. The @mcp.tool() decorator
# automatically registers the function as an available tool.


@mcp.tool()
async def get_epoch_time() -> int:
    """Get the current Unix epoch time in seconds.

    Returns the number of seconds that have elapsed since January 1, 1970 (UTC).
    """
    # Get the current epoch time in seconds
    current_epoch = int(time.time())
    return current_epoch


@mcp.tool()
async def count_characters(word: str) -> Dict[str, Any]:
    """Count the number of characters in a word or text.

    Args:
        word: The text to count characters in

    Returns:
        A dictionary with character count details
    """
    # Count the total characters
    total_chars = len(word)

    # Count non-whitespace characters
    non_whitespace = len(word.strip())

    # Count alphabetic characters
    alpha_chars = sum(c.isalpha() for c in word)

    # Count digits
    digit_chars = sum(c.isdigit() for c in word)

    # Count special characters
    special_chars = total_chars - alpha_chars - \
        digit_chars - sum(c.isspace() for c in word)

    return {
        "total_characters": total_chars,
        "non_whitespace_characters": non_whitespace,
        "alphabetic_characters": alpha_chars,
        "digit_characters": digit_chars,
        "special_characters": special_chars
    }


@mcp.tool()
async def get_weather(location: str) -> Dict[str, Any]:
    """Get current weather information for a location.

    Args:
        location: City name or location (e.g., "Tokyo", "New York")

    Returns:
        Weather information for the requested location
    """
    try:
        # Use OpenWeatherMap's free API
        # We're using their "current weather data" API with minimal parameters
        # In a real implementation, you would use your API key
        async with httpx.AsyncClient() as client:
            # For this demo, we're using a mock response based on the location
            # In a real implementation, you would make an actual API call

            # Simulate API latency
            await asyncio.sleep(1)

            # Create a mock response based on the location
            if "tokyo" in location.lower():
                weather_data = {
                    "location": "Tokyo, Japan",
                    "temperature": 26,
                    "condition": "Partly Cloudy",
                    "humidity": 75,
                    "wind_speed": 5.2,
                    "timestamp": int(time.time())
                }
            elif "new york" in location.lower():
                weather_data = {
                    "location": "New York, USA",
                    "temperature": 18,
                    "condition": "Clear",
                    "humidity": 62,
                    "wind_speed": 4.1,
                    "timestamp": int(time.time())
                }
            elif "london" in location.lower():
                weather_data = {
                    "location": "London, UK",
                    "temperature": 14,
                    "condition": "Light Rain",
                    "humidity": 85,
                    "wind_speed": 7.8,
                    "timestamp": int(time.time())
                }
            else:
                # Generate random weather for unknown locations
                import random
                conditions = ["Sunny", "Partly Cloudy", "Cloudy",
                              "Light Rain", "Heavy Rain", "Thunderstorm", "Snow", "Fog"]
                weather_data = {
                    "location": location,
                    "temperature": random.randint(5, 35),
                    "condition": random.choice(conditions),
                    "humidity": random.randint(40, 95),
                    "wind_speed": round(random.uniform(0, 12), 1),
                    "timestamp": int(time.time())
                }

            return weather_data
    except Exception as e:
        return {"error": f"Failed to get weather information: {str(e)}"}


# ==============================================================================
# Helper Functions
# ==============================================================================
# Add any helper functions needed by your tools here

async def make_api_request(url: str) -> Dict[str, Any]:
    """Make a request to an external API with proper error handling."""
    # Actual implementation would use aiohttp or httpx
    await asyncio.sleep(1)  # Simulate network request
    return {"status": "success", "data": f"Response from {url}"}


def format_response(data: Dict[str, Any]) -> str:
    """Format a dictionary response into a readable string."""
    return "\n".join([f"{k}: {v}" for k, v in data.items()])

# ==============================================================================
# Main Server Execution
# ==============================================================================


if __name__ == "__main__":
    # Initialize and run the server
    # The 'stdio' transport is used for communication with clients
    mcp.run(transport='stdio')
