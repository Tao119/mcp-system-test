import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const server = new McpServer({
    name: "custom-server",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
server.tool("get_epoch_time", "Get the current Unix epoch time in seconds", {}, async () => {
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
server.tool("count_characters", "Count the number of characters in a word or text", {
    text: z.string().describe("The text to count characters in"),
}, async ({ text }) => {
    const totalChars = text.length;
    const nonWhitespace = text.replace(/\s/g, "").length;
    const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
    const digitChars = (text.match(/[0-9]/g) || []).length;
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
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Custom MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
