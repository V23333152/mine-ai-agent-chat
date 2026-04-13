import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Server, Wrench } from "lucide-react";
import { MCPServerConfig } from "./MCPManager";

export interface MCPToolSwitchesProps {
  servers: MCPServerConfig[];
  enabled: boolean;
}

// Mock tool list - in real implementation, this would come from the backend
// For now, we'll show servers and let users toggle them
export function MCPToolSwitches({
  servers,
  enabled,
}: MCPToolSwitchesProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_expandedServers, _setExpandedServers] = useState<Set<string>>(new Set());

  if (!enabled || servers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
        <Server className="w-4 h-4" />
        <span className="font-medium">MCP Servers</span>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          {servers.filter((s) => s.enabled).length} active
        </span>
      </div>

      <div className="space-y-1 pl-1">
        {servers
          .filter((server) => server.enabled)
          .map((server) => (
            <TooltipProvider key={server.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700 truncate max-w-[120px]">
                        {server.name}
                      </span>
                    </div>
                    <Switch
                      checked={server.enabled}
                      disabled
                      className="scale-75"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{server.name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {server.url}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Configure in MCP Manager
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
      </div>
    </div>
  );
}

// Simplified version for the chat input area
export function MCPToolIndicator({
  servers,
  enabled,
}: {
  servers: MCPServerConfig[];
  enabled: boolean;
}) {
  if (!enabled || servers.length === 0) {
    return null;
  }

  const activeCount = servers.filter((s) => s.enabled).length;

  if (activeCount === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
            <Server className="w-3 h-3" />
            <span>{activeCount} MCP</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="font-medium mb-1">Active MCP Servers:</p>
          <ul className="text-xs space-y-0.5">
            {servers
              .filter((s) => s.enabled)
              .map((server) => (
                <li key={server.id}>• {server.name}</li>
              ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
