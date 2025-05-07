import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// Create server instance with your server name
const server = new McpServer({
    name: "custom-server",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
// ==============================================================================
// Tool Implementation: Get Current Epoch Time
// ==============================================================================
server.tool("get_epoch_time", "Get the current Unix epoch time in seconds", {}, async () => {
    // Get the current epoch time in seconds
    const currentEpoch = Math.floor(Date.now() / 1000);
    return {
        content: [
            {
                type: "text",
                text: currentEpoch.toString(),
            },
        ],
    };
});
// ==============================================================================
// Tool Implementation: Count Characters
// ==============================================================================
server.tool("count_characters", "Count the number of characters in a word or text", {
    text: z.string().describe("The text to count characters in"),
}, async ({ text }) => {
    // Count the total characters
    const totalChars = text.length;
    // Count non-whitespace characters
    const nonWhitespace = text.replace(/\s/g, "").length;
    // Count alphabetic characters
    const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
    // Count digits
    const digitChars = (text.match(/[0-9]/g) || []).length;
    // Count special characters
    const specialChars = totalChars - alphaChars - digitChars - (text.match(/\s/g) || []).length;
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    total_characters: totalChars,
                    non_whitespace_characters: nonWhitespace,
                    alphabetic_characters: alphaChars,
                    digit_characters: digitChars,
                    special_characters: specialChars
                }, null, 2),
            },
        ],
    };
});
// ==============================================================================
// Tool Implementation: Weather API (Mock)
// ==============================================================================
server.tool("get_weather", "Get current weather information for a location", {
    location: z.string().describe("City name or location (e.g., 'Tokyo', 'New York')"),
}, async ({ location }) => {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Create a mock response based on the location
    let weatherData;
    if (location.toLowerCase().includes("tokyo")) {
        weatherData = {
            location: "Tokyo, Japan",
            temperature: 26,
            condition: "Partly Cloudy",
            humidity: 75,
            wind_speed: 5.2,
            timestamp: Math.floor(Date.now() / 1000)
        };
    }
    else if (location.toLowerCase().includes("new york")) {
        weatherData = {
            location: "New York, USA",
            temperature: 18,
            condition: "Clear",
            humidity: 62,
            wind_speed: 4.1,
            timestamp: Math.floor(Date.now() / 1000)
        };
    }
    else if (location.toLowerCase().includes("london")) {
        weatherData = {
            location: "London, UK",
            temperature: 14,
            condition: "Light Rain",
            humidity: 85,
            wind_speed: 7.8,
            timestamp: Math.floor(Date.now() / 1000)
        };
    }
    else {
        // Generate random weather for unknown locations
        const conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Light Rain", "Heavy Rain", "Thunderstorm", "Snow", "Fog"];
        weatherData = {
            location: location,
            temperature: Math.floor(Math.random() * 30) + 5, // 5-35
            condition: conditions[Math.floor(Math.random() * conditions.length)],
            humidity: Math.floor(Math.random() * 55) + 40, // 40-95
            wind_speed: parseFloat((Math.random() * 12).toFixed(1)), // 0-12, 1 decimal
            timestamp: Math.floor(Date.now() / 1000)
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(weatherData, null, 2),
            },
        ],
    };
});
// ==============================================================================
// Main Server Execution
// ==============================================================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Custom MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
