/**
 * MCP (Model Context Protocol) Client Manager
 * Supports: SSE, HTTP, stdio transports
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StructuredTool } from "@langchain/core/tools";
import * as z from "zod";
import { spawn, ChildProcess } from "child_process";

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type TransportType = 'sse' | 'http' | 'stdio';

export interface MCPServerConfig {
  id: string;
  name: string;
  /** Transport type: sse, http, or stdio */
  transportType?: TransportType;
  // For SSE/HTTP
  url?: string;
  apiKey?: string;
  // For stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // Common
  enabled: boolean;
}

export interface MCPToolConfig {
  serverId: string;
  toolName: string;
  enabled: boolean;
  description?: string;
}

export interface ServerConnectionInfo {
  config: MCPServerConfig;
  status: ConnectionStatus;
  error?: string;
  toolCount: number;
  lastConnectedAt?: Date;
}

interface MCPManagerState {
  servers: Map<string, {
    config: MCPServerConfig;
    client: Client;
    transport: SSEClientTransport | any; // SSE or custom HTTP/stdio transport
    process?: ChildProcess; // For stdio transport
    tools: Map<string, any>;
    status: ConnectionStatus;
    error?: string;
    lastConnectedAt?: Date;
  }>;
  toolConfigs: Map<string, MCPToolConfig>;
  statusCallbacks: Set<(serverId: string, status: ConnectionStatus, error?: string) => void>;
}

const state: MCPManagerState = {
  servers: new Map(),
  toolConfigs: new Map(),
  statusCallbacks: new Set(),
};

export function onServerStatusChange(
  callback: (serverId: string, status: ConnectionStatus, error?: string) => void
): () => void {
  state.statusCallbacks.add(callback);
  return () => state.statusCallbacks.delete(callback);
}

function notifyStatusChange(serverId: string, status: ConnectionStatus, error?: string) {
  for (const cb of state.statusCallbacks) {
    cb(serverId, status, error);
  }
}

/**
 * HTTP Transport for MCP
 * Uses standard HTTP POST for requests
 */
class HTTPClientTransport {
  private url: string;
  private headers: Record<string, string>;
  private messageId = 0;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = { 'Content-Type': 'application/json', ...headers };
  }

  async start(): Promise<void> {
    // HTTP transport doesn't need persistent connection
    console.log(`[MCP HTTP] Transport started for ${this.url}`);
  }

  async send(message: any): Promise<any> {
    const id = ++this.messageId;
    // Properly wrap as JSON-RPC 2.0 request
    const body = {
      jsonrpc: "2.0",
      ...message,
      id: message.id || String(id)
    };
    
    console.log(`[MCP HTTP] Sending:`, JSON.stringify(body, null, 2));
    
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      console.log(`[MCP HTTP] Response:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      if (this.onerror) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    console.log(`[MCP HTTP] Transport closed`);
    if (this.onclose) this.onclose();
  }
}

/**
 * Stdio Transport for MCP
 * Spawns a subprocess and communicates via stdin/stdout
 */
class StdioClientTransport {
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private process?: ChildProcess;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;
  private pendingResponses = new Map<string, { resolve: Function; reject: Function }>();
  private buffer = '';

  constructor(command: string, args: string[] = [], env: Record<string, string> = {}) {
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[MCP stdio] Starting: ${this.command} ${this.args.join(' ')}`);

      this.process = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout?.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[MCP stdio] stderr: ${data}`);
      });

      this.process.on('error', (error) => {
        console.error(`[MCP stdio] Process error:`, error);
        if (this.onerror) this.onerror(error);
        reject(error);
      });

      this.process.on('close', (code) => {
        console.log(`[MCP stdio] Process exited with code ${code}`);
        if (this.onclose) this.onclose();
      });

      // Wait a bit for process to start
      setTimeout(resolve, 500);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          if (message.id && this.pendingResponses.has(message.id)) {
            const { resolve, reject } = this.pendingResponses.get(message.id)!;
            this.pendingResponses.delete(message.id);
            if (message.error) {
              reject(new Error(message.error.message || message.error));
            } else {
              resolve(message);
            }
          }
        } catch (e) {
          console.error(`[MCP stdio] Failed to parse: ${line}`);
        }
      }
    }
  }

  async send(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Stdio transport not connected'));
        return;
      }

      const id = message.id || String(Date.now());
      const msgWithId = { ...message, id };
      
      this.pendingResponses.set(id, { resolve, reject });
      
      this.process.stdin.write(JSON.stringify(msgWithId) + '\n');

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingResponses.has(id)) {
          this.pendingResponses.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    if (this.onclose) this.onclose();
  }
}

/**
 * Connect to MCP server with specified transport type
 */
export async function connectMCPServer(config: MCPServerConfig): Promise<void> {
  if (state.servers.has(config.id)) {
    await disconnectMCPServer(config.id);
  }
  if (!config.enabled) return;

  notifyStatusChange(config.id, 'connecting');

  try {
    // Backwards compatibility: default to 'sse' if transportType not set
    const transportType = config.transportType || 'sse';
    console.log(`[MCP] Connecting [${transportType}]: ${config.name}`);

    let transport: SSEClientTransport | HTTPClientTransport | StdioClientTransport;
    let childProcess: ChildProcess | undefined;

    // Create transport based on type
    switch (transportType) {
      case 'sse': {
        if (!config.url) throw new Error('URL is required for SSE transport');
        const url = new URL(config.url);
        console.log(`[MCP SSE] URL: ${url.toString()}`);
        
        transport = new SSEClientTransport(url, {
          requestInit: {
            headers: config.apiKey ? {
              'Authorization': `Bearer ${config.apiKey}`,
              'X-API-Key': config.apiKey,
            } : {
              'Accept': 'text/event-stream',
            }
          }
        });
        break;
      }

      case 'http': {
        if (!config.url) throw new Error('URL is required for HTTP transport');
        console.log(`[MCP HTTP] URL: ${config.url}`);
        
        transport = new HTTPClientTransport(config.url, config.apiKey ? {
          'Authorization': `Bearer ${config.apiKey}`,
          'X-API-Key': config.apiKey,
        } : {});
        break;
      }

      case 'stdio': {
        if (!config.command) throw new Error('Command is required for stdio transport');
        console.log(`[MCP stdio] Command: ${config.command} ${config.args?.join(' ') || ''}`);
        
        transport = new StdioClientTransport(
          config.command,
          config.args || [],
          config.env || {}
        );
        await transport.start();
        break;
      }

      default:
        throw new Error(`Unknown transport type: ${transportType}`);
    }

    const client = new Client(
      { name: "agent-chat-mcp-client", version: "1.0.0" },
      { capabilities: {} }
    );

    // Set up error handling for transport
    transport.onerror = (error: Error) => {
      console.error(`[MCP] Transport error for ${config.name}:`, error);
      const server = state.servers.get(config.id);
      if (server) {
        server.status = 'error';
        server.error = error.message || 'Transport error';
        notifyStatusChange(config.id, 'error', server.error);
      }
    };

    transport.onclose = () => {
      console.log(`[MCP] Connection closed for ${config.name}`);
      const server = state.servers.get(config.id);
      if (server) {
        server.status = 'disconnected';
        notifyStatusChange(config.id, 'disconnected');
      }
    };

    // Connect with timeout
    const connectPromise = client.connect(transport as any);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    
    console.log(`[MCP] Connected: ${config.name}`);

    // Test connection by listing tools
    let toolsResponse;
    try {
      toolsResponse = await Promise.race([
        client.listTools(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('listTools timeout (5s)')), 5000)
        )
      ]);
    } catch (e) {
      throw new Error(`Failed to list tools: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    console.log(`[MCP] ${config.name} has ${toolsResponse.tools.length} tools`);

    // Store successful connection
    state.servers.set(config.id, {
      config,
      client,
      transport,
      process: childProcess,
      tools: new Map(),
      status: 'connected',
      lastConnectedAt: new Date(),
    });

    notifyStatusChange(config.id, 'connected');

    // Register tools
    for (const mcpTool of toolsResponse.tools) {
      const toolKey = `${config.id}:${mcpTool.name}`;
      let toolConfig = state.toolConfigs.get(toolKey);
      if (!toolConfig) {
        toolConfig = { serverId: config.id, toolName: mcpTool.name, enabled: true, description: mcpTool.description };
        state.toolConfigs.set(toolKey, toolConfig);
      }

      const lcTool = createMCPTool(client, mcpTool, config.id);
      state.servers.get(config.id)!.tools.set(mcpTool.name, { tool: lcTool, config: toolConfig, mcpDefinition: mcpTool });
      console.log(`[MCP] Registered: ${toolKey}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MCP] Failed to connect ${config.id}:`, errorMessage);
    
    // Store failed connection state
    state.servers.set(config.id, {
      config,
      client: null as any,
      transport: null as any,
      tools: new Map(),
      status: 'error',
      error: errorMessage,
    });
    
    notifyStatusChange(config.id, 'error', errorMessage);
    throw error;
  }
}

export async function disconnectMCPServer(serverId: string): Promise<void> {
  const server = state.servers.get(serverId);
  if (!server) return;
  
  try {
    // Close transport (handles all types: sse, http, stdio)
    if (server.transport) {
      await server.transport.close?.();
    }
    // Kill stdio process if exists
    if (server.process) {
      server.process.kill();
    }
    // Close client
    await server.client?.close?.();
  } catch (error) {
    console.error(`[MCP] Error disconnecting ${serverId}:`, error);
  } finally {
    state.servers.delete(serverId);
    console.log(`[MCP] Disconnected: ${serverId}`);
    notifyStatusChange(serverId, 'disconnected');
  }
}

class MCPTool extends StructuredTool {
  name: string;
  description: string;
  schema: any;
  private client: Client;
  private mcpToolName: string;
  private inputSchema: any;

  constructor(client: Client, mcpTool: any, serverId: string) {
    super();
    this.name = `mcp_${serverId}_${mcpTool.name}`;
    this.description = mcpTool.description || `MCP: ${mcpTool.name}`;
    this.inputSchema = mcpTool.inputSchema || { type: "object", properties: {} };
    // Use a permissive Zod schema to ensure tool is always called
    // Actual validation happens in _call method
    this.schema = z.object({}).passthrough();
    this.client = client;
    this.mcpToolName = mcpTool.name;
    console.log(`[MCP Tool] Creating: ${this.name}`);
    console.log(`[MCP Tool] ${this.name} expected params:`, JSON.stringify(this.inputSchema.required || []));
  }

  protected async _call(input: any): Promise<string> {
    console.log(`[MCP Tool] ${this.name} INVOKED with:`, JSON.stringify(input));
    
    // Filter out null/undefined/empty values
    const cleanArgs = Object.fromEntries(
      Object.entries(input || {}).filter(([_, v]) => v !== null && v !== undefined && v !== '')
    );
    console.log(`[MCP Tool] ${this.name} cleaned:`, JSON.stringify(cleanArgs));
    
    // Validate required params
    const required = this.inputSchema.required || [];
    const missing: string[] = [];
    const empty: string[] = [];
    
    for (const param of required) {
      const value = cleanArgs[param];
      if (!(param in cleanArgs)) {
        missing.push(param);
      } else if (value === '' || value === null || value === undefined) {
        empty.push(param);
      }
    }
    
    if (missing.length > 0 || empty.length > 0) {
      // 构建简洁的参数说明，帮助 LLM 理解如何正确调用
      const paramDescriptions: string[] = [];
      for (const param of required) {
        const paramInfo = this.inputSchema.properties?.[param];
        const example = paramInfo?.examples?.[0] || paramInfo?.default || '';
        paramDescriptions.push(`- ${param}${example ? `: 例如 "${example}"` : ''}`);
      }
      
      // 返回简洁友好的提示，避免过多技术细节
      const errorMsg = `需要更多信息才能使用 ${this.mcpToolName}。请提供以下参数：\n` +
        paramDescriptions.join('\n') + 
        `\n\n提示：如果不确定参数值，可以先询问用户。`;
      
      console.log(`[MCP Tool] ${this.name} 等待用户/LLM 提供参数: ${missing.concat(empty).join(', ')}`);
      return errorMsg;
    }
    
    // Check minLength for strings
    for (const param of required) {
      const value = cleanArgs[param];
      if (typeof value === 'string') {
        const minLength = this.inputSchema.properties?.[param]?.minLength;
        if (minLength && value.length < minLength) {
          return `参数 "${param}" 太短（需要至少 ${minLength} 个字符），请提供更完整的值。`;
        }
      }
    }
    
    try {
      const result = await this.client.callTool({ name: this.mcpToolName, arguments: cleanArgs });
      if (result.content && Array.isArray(result.content)) {
        return result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n") || "Success";
      }
      return JSON.stringify(result);
    } catch (error) {
      console.error(`[MCP Tool] ${this.name} error:`, error);
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      return `调用 ${this.mcpToolName} 时出错：${errorMsg}。请稍后重试或换个方式提问。`;
    }
  }
}

function createMCPTool(client: Client, mcpTool: any, serverId: string): MCPTool {
  const tool = new MCPTool(client, mcpTool, serverId);
  console.log(`[MCP Tool] ${tool.name} created successfully`);
  return tool;
}

export function getEnabledMCPTools(): any[] {
  const tools: any[] = [];
  for (const [serverId, server] of state.servers) {
    if (server.status !== 'connected') continue;
    for (const [toolName, toolInfo] of server.tools) {
      const config = state.toolConfigs.get(`${serverId}:${toolName}`);
      if (config?.enabled !== false) tools.push(toolInfo.tool);
    }
  }
  return tools;
}

export function getMCPToolsStatus(): Array<{ serverId: string; serverName: string; toolName: string; enabled: boolean; description?: string }> {
  const result: any[] = [];
  for (const [serverId, server] of state.servers) {
    if (server.status !== 'connected') continue;
    for (const [toolName, toolInfo] of server.tools) {
      const config = state.toolConfigs.get(`${serverId}:${toolName}`);
      result.push({ serverId, serverName: server.config.name, toolName, enabled: config?.enabled ?? true, description: toolInfo.mcpDefinition?.description });
    }
  }
  return result;
}

export function setMCPToolEnabled(serverId: string, toolName: string, enabled: boolean): void {
  const config = state.toolConfigs.get(`${serverId}:${toolName}`);
  if (config) config.enabled = enabled;
}

export function getConnectedMCPServers(): Array<{ id: string; name: string; enabled: boolean; toolCount: number; status: ConnectionStatus; error?: string }> {
  return Array.from(state.servers.values()).map((s) => ({ 
    id: s.config.id, 
    name: s.config.name, 
    enabled: s.config.enabled, 
    toolCount: s.status === 'connected' ? s.tools.size : 0,
    status: s.status,
    error: s.error,
  }));
}

export function getServerConnectionInfo(serverId: string): ServerConnectionInfo | undefined {
  const server = state.servers.get(serverId);
  if (!server) return undefined;
  return {
    config: server.config,
    status: server.status,
    error: server.error,
    toolCount: server.status === 'connected' ? server.tools.size : 0,
    lastConnectedAt: server.lastConnectedAt,
  };
}

export async function disconnectAllMCPServers(): Promise<void> {
  await Promise.all(Array.from(state.servers.keys()).map(disconnectMCPServer));
}

export function isMCPAvailable(): boolean {
  return getEnabledMCPTools().length > 0;
}

export function getServerStatus(serverId: string): ConnectionStatus {
  return state.servers.get(serverId)?.status || 'disconnected';
}

/**
 * Get connection statuses for all configured MCP servers
 * Returns a record of serverId -> status info
 */
export function getConnectionStatuses(): Record<string, { status: ConnectionStatus; error?: string; toolCount: number }> {
  const statuses: Record<string, { status: ConnectionStatus; error?: string; toolCount: number }> = {};
  for (const [serverId, server] of state.servers) {
    statuses[serverId] = {
      status: server.status,
      error: server.error,
      toolCount: server.status === 'connected' ? server.tools.size : 0,
    };
  }
  return statuses;
}
