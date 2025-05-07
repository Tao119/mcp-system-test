import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import path from "path";
dotenv.config();
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
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY is not set in environment variables or .env file");
        }
        this.anthropic = new Anthropic({
            apiKey,
        });
        this.mcp = new Client({ name: "mcp-client-ts", version: "1.0.0" });
    }
    setDebug(enabled = true) {
        this.debugMode = enabled;
    }
    async connectToServer(serverPath) {
        try {
            const extension = path.extname(serverPath).toLowerCase();
            let command;
            let args = [serverPath];
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
            this.mcp.connect(this.transport);
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
    async processQuery(query, systemPrompt) {
        if (!this.tools.length) {
            throw new Error("Not connected to an MCP server or no tools available");
        }
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
        if (systemPrompt) {
            createParams.system = systemPrompt;
        }
        if (this.debugMode) {
            console.log(`Sending query to Claude with ${this.tools.length} available tools`);
            if (systemPrompt) {
                console.log(`Using system prompt: ${systemPrompt}`);
            }
        }
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
                    const result = await this.mcp.callTool({
                        name: toolName,
                        arguments: toolArgs,
                    });
                    if (this.debugMode) {
                        console.log(`Tool result:`, result);
                    }
                    let resultContent = "";
                    if (result && result.content && Array.isArray(result.content)) {
                        resultContent = result.content.map((item) => item.type === "text" ? item.text : JSON.stringify(item)).join("\n");
                    }
                    else if (result && result.content) {
                        resultContent = typeof result.content === 'object'
                            ? JSON.stringify(result.content)
                            : String(result.content);
                    }
                    finalText.push(`[Tool ${toolName}]: Executed with result: ${resultContent}`);
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
                    createParams.messages.push({
                        role: "assistant",
                        content: [content],
                    });
                    createParams.messages.push(toolResultMessage);
                    response = await this.anthropic.messages.create(createParams);
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
    async callToolDirectly(toolName, args) {
        if (!this.tools.length) {
            throw new Error("Not connected to an MCP server or no tools available");
        }
        const toolExists = this.tools.some(tool => tool.name === toolName);
        if (!toolExists) {
            const availableTools = this.tools.map(tool => tool.name);
            throw new Error(`Tool '${toolName}' not found. Available tools: ${availableTools.join(", ")}`);
        }
        try {
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: args,
            });
            if (result && result.content && Array.isArray(result.content)) {
                return result.content.map((item) => item.type === "text" ? item.text : item);
            }
            else if (result && result.content) {
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
    async cleanup() {
        if (this.transport) {
            await this.mcp.close();
        }
    }
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("Usage: node mcp-client.js <path_to_server_script> [--debug]");
        process.exit(1);
    }
    const serverPath = args[0];
    const debugMode = args.includes("--debug");
    const systemPrompt = `あなたはツールを使えるアシスタントです。
    適切なツールを選択し、その理由を説明してください。`;
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
main();
