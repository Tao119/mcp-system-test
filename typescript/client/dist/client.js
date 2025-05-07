import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import path from "path";
// Load environment variables from .env file
dotenv.config();
// Constants - customize as needed
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const MAX_TOKENS = 1000;
class MCPClient {
    modelName;
    maxTokens;
    mcp;
    anthropic;
    transport = null;
    tools = [];
    debugMode = false;
    constructor(modelName = DEFAULT_MODEL, maxTokens = MAX_TOKENS) {
        this.modelName = modelName;
        this.maxTokens = maxTokens;
        // Check for API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY is not set in environment variables or .env file");
        }
        // Initialize Anthropic client
        this.anthropic = new Anthropic({
            apiKey,
        });
        // Initialize MCP client
        this.mcp = new Client({ name: "mcp-client-ts", version: "1.0.0" });
    }
    /**
     * Enable or disable debug mode for verbose logging
     */
    setDebug(enabled = true) {
        this.debugMode = enabled;
    }
    /**
     * Connect to an MCP server
     */
    async connectToServer(serverPath) {
        try {
            const extension = path.extname(serverPath).toLowerCase();
            let command;
            let args = [serverPath];
            // Determine command based on file extension
            if (extension === '.js') {
                command = process.execPath;
            }
            else if (extension === '.py') {
                command = process.platform === "win32" ? "python" : "python3";
            }
            else if (extension === '.jar') {
                command = "java";
                args = ["-jar", serverPath];
            }
            else {
                throw new Error("Server script must be a .js, .py, or .jar file");
            }
            if (this.debugMode) {
                console.log(`Starting server with command: ${command} ${args.join(' ')}`);
            }
            this.transport = new StdioClientTransport({
                command,
                args,
            });
            // Connect to the server
            this.mcp.connect(this.transport);
            // List available tools
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description || "",
                input_schema: tool.inputSchema,
            }));
            if (this.debugMode || true) {
                console.log("Connected to server with tools:", this.tools.map(({ name }) => name).join(", "));
            }
        }
        catch (error) {
            console.error("Failed to connect to MCP server:", error);
            throw error;
        }
    }
    /**
     * Process a query using Claude and available tools
     */
    async processQuery(query, systemPrompt) {
        if (!this.tools.length) {
            throw new Error("Not connected to an MCP server or no tools available");
        }
        // Create the request parameters
        const createParams = {
            model: this.modelName,
            max_tokens: this.maxTokens,
            messages: [
                {
                    role: "user",
                    content: query,
                },
            ],
            tools: this.tools,
        };
        // Add system prompt if provided
        if (systemPrompt) {
            createParams.system = systemPrompt;
        }
        if (this.debugMode) {
            console.log(`Sending query to Claude with ${this.tools.length} available tools`);
            if (systemPrompt) {
                console.log(`Using system prompt: ${systemPrompt}`);
            }
        }
        // Make the initial Claude API call
        let response = await this.anthropic.messages.create(createParams);
        // Process response and handle tool calls
        const finalText = [];
        for (const content of response.content) {
            if (content.type === "text") {
                finalText.push(content.text);
            }
            else if (content.type === "tool_use") {
                const toolName = content.name;
                const toolArgs = content.input;
                const toolUseId = content.id;
                if (this.debugMode) {
                    console.log(`Claude is calling tool: ${toolName} with args:`, toolArgs);
                }
                try {
                    // Execute tool call
                    const result = await this.mcp.callTool({
                        name: toolName,
                        arguments: toolArgs,
                    });
                    if (this.debugMode) {
                        console.log(`Tool result:`, result);
                    }
                    // Format tool result content as string
                    let resultContent = "";
                    if (result && result.content && Array.isArray(result.content)) {
                        resultContent = result.content.map((item) => item.type === "text" ? item.text : JSON.stringify(item)).join("\n");
                    }
                    else if (result && result.content) {
                        // Handle if content is not an array
                        resultContent = typeof result.content === 'object'
                            ? JSON.stringify(result.content)
                            : String(result.content);
                    }
                    finalText.push(`[Tool ${toolName}]: Executed with result: ${resultContent}`);
                    // Pass tool results back to Claude
                    const toolResultMessage = {
                        role: "user",
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: toolUseId,
                                content: resultContent,
                            },
                        ],
                    };
                    // Add tool result to messages
                    createParams.messages.push({
                        role: "assistant",
                        content: [content],
                    });
                    createParams.messages.push(toolResultMessage);
                    // Get next response from Claude
                    response = await this.anthropic.messages.create(createParams);
                    // Add response text to final output
                    if (response.content[0]?.type === "text") {
                        finalText.push(response.content[0].text);
                    }
                }
                catch (error) {
                    console.error(`Error executing tool ${toolName}:`, error);
                    finalText.push(`[Error] Failed to execute tool ${toolName}: ${error}`);
                }
            }
        }
        return finalText.join("\n");
    }
    /**
     * Call a specific tool directly without Claude
     */
    async callToolDirectly(toolName, args) {
        if (!this.tools.length) {
            throw new Error("Not connected to an MCP server or no tools available");
        }
        // Check if tool exists
        const toolExists = this.tools.some(tool => tool.name === toolName);
        if (!toolExists) {
            const availableTools = this.tools.map(tool => tool.name);
            throw new Error(`Tool '${toolName}' not found. Available tools: ${availableTools.join(", ")}`);
        }
        // Call the tool
        try {
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: args,
            });
            // Format tool result content
            if (result && result.content && Array.isArray(result.content)) {
                return result.content.map((item) => item.type === "text" ? item.text : item);
            }
            else if (result && result.content) {
                // Handle if content is not an array
                return typeof result.content === 'object'
                    ? [result.content]
                    : [String(result.content)];
            }
            return null;
        }
        catch (error) {
            console.error(`Error executing tool ${toolName}:`, error);
            throw error;
        }
    }
    /**
     * Run an interactive chat loop
     */
    async chatLoop(systemPrompt) {
        if (!this.tools.length) {
            throw new Error("Not connected to an MCP server or no tools available");
        }
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        try {
            console.log("\nMCP Client Started!");
            console.log(`Available tools: ${this.tools.map(tool => tool.name).join(", ")}`);
            console.log("Type your queries or 'quit'/'exit' to exit.");
            while (true) {
                const query = await rl.question("\nQuery: ");
                if (query.toLowerCase() === "quit" || query.toLowerCase() === "exit") {
                    break;
                }
                if (!query.trim()) {
                    continue;
                }
                try {
                    // Special command to call a tool directly
                    if (query.startsWith("!tool")) {
                        const parts = query.split(" ");
                        const toolName = parts[1];
                        let argsStr = parts.slice(2).join(" ");
                        try {
                            const args = JSON.parse(argsStr);
                            console.log(`Calling tool ${toolName} directly with args:`, args);
                            const result = await this.callToolDirectly(toolName, args);
                            console.log("\nResult:", result);
                        }
                        catch (e) {
                            console.error("Error parsing JSON args or calling tool:", e);
                        }
                        continue;
                    }
                    // Process normal query
                    const response = await this.processQuery(query, systemPrompt);
                    console.log("\n" + response);
                }
                catch (error) {
                    console.error(`Error processing query: ${error}`);
                }
            }
        }
        finally {
            rl.close();
        }
    }
    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.transport) {
            await this.mcp.close();
        }
    }
}
/**
 * Main entry point for the MCP client
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("Usage: node mcp-client.js <path_to_server_script> [--debug]");
        process.exit(1);
    }
    const serverPath = args[0];
    const debugMode = args.includes("--debug");
    // Optional system prompt to guide Claude's behavior
    const systemPrompt = `You are a helpful assistant with access to tools.
When a user asks a question that requires using tools, use the appropriate tool to find the information.
Always explain your reasoning and what tool you're using.`;
    const client = new MCPClient();
    if (debugMode) {
        client.setDebug(true);
    }
    try {
        await client.connectToServer(serverPath);
        await client.chatLoop(systemPrompt);
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        await client.cleanup();
        process.exit(0);
    }
}
// Start the client
main();
