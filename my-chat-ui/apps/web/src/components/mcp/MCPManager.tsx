import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Server, Link, Key, Loader2, CheckCircle, XCircle, AlertCircle, Edit2, Terminal, Globe } from "lucide-react";
import { toast } from "sonner";

export type TransportType = 'sse' | 'http' | 'stdio';

export interface MCPServerConfig {
  id: string;
  name: string;
  transportType: TransportType;
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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ServerStatus {
  status: ConnectionStatus | string;
  error?: string;
  toolCount: number;
}

export interface MCPManagerProps {
  servers: MCPServerConfig[];
  toolConfigs: MCPToolConfig[];
  enabled: boolean;
  onServersChange: (servers: MCPServerConfig[]) => void;
  onToolConfigsChange: (toolConfigs: MCPToolConfig[]) => void;
  onEnabledChange: (enabled: boolean) => void;
  serverStatuses?: Record<string, ServerStatus>;
}

function StatusIcon({ status }: { status: ConnectionStatus | string }) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'connecting':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
  }
}

function StatusBadge({ status, error }: { status: ConnectionStatus | string; error?: string }) {
  const getStyles = (s: string) => {
    switch (s) {
      case 'connected': return 'bg-green-100 text-green-700';
      case 'connecting': return 'bg-blue-100 text-blue-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getLabel = (s: string) => {
    switch (s) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  return (
    <span 
      className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${getStyles(status)}`}
      title={error}
    >
      <StatusIcon status={status} />
      {getLabel(status)}
    </span>
  );
}

const TransportIcon = ({ type }: { type: TransportType }) => {
  switch (type) {
    case 'sse': return <Link className="w-4 h-4 text-blue-500" />;
    case 'http': return <Globe className="w-4 h-4 text-green-500" />;
    case 'stdio': return <Terminal className="w-4 h-4 text-purple-500" />;
  }
};

const TransportLabel = ({ type }: { type: TransportType }) => {
  switch (type) {
    case 'sse': return <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">SSE</span>;
    case 'http': return <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">HTTP</span>;
    case 'stdio': return <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">STDIO</span>;
  }
};

// Default values for new server
const getDefaultServer = (): MCPServerConfig => ({
  id: '',
  name: '',
  transportType: 'sse',
  url: '',
  apiKey: '',
  command: '',
  args: [],
  env: {},
  enabled: true,
});

export function MCPManager({
  servers,
  toolConfigs: _toolConfigs,
  enabled,
  onServersChange,
  onToolConfigsChange: _onToolConfigsChange,
  onEnabledChange,
  serverStatuses = {},
}: MCPManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [formData, setFormData] = useState<MCPServerConfig>(getDefaultServer());
  const [showApiKey, setShowApiKey] = useState(false);

  const generateId = () => `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const resetForm = () => {
    setFormData(getDefaultServer());
    setEditingServer(null);
    setShowApiKey(false);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (server: MCPServerConfig) => {
    setEditingServer(server);
    setFormData({ ...server });
    setIsDialogOpen(true);
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return false;
    }

    if (formData.transportType === 'sse' || formData.transportType === 'http') {
      if (!formData.url?.trim()) {
        toast.error("URL is required for SSE/HTTP transport");
        return false;
      }
      try {
        new URL(formData.url);
      } catch {
        toast.error("Invalid URL format");
        return false;
      }
    }

    if (formData.transportType === 'stdio') {
      if (!formData.command?.trim()) {
        toast.error("Command is required for stdio transport");
        return false;
      }
    }

    return true;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    if (editingServer) {
      // Update existing
      onServersChange(servers.map(s => s.id === editingServer.id ? { ...formData, id: editingServer.id } : s));
      toast.success(`Server "${formData.name}" updated`);
    } else {
      // Add new
      const newServer: MCPServerConfig = {
        ...formData,
        id: generateId(),
      };
      onServersChange([...servers, newServer]);
      toast.success(`Server "${newServer.name}" added. Connecting...`);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleRemoveServer = (serverId: string) => {
    onServersChange(servers.filter((s) => s.id !== serverId));
    toast.success("Server removed");
  };

  const handleToggleServer = (serverId: string, enabled: boolean) => {
    onServersChange(servers.map((s) => (s.id === serverId ? { ...s, enabled } : s)));
    if (enabled) {
      toast.info(`Connecting to ${servers.find(s => s.id === serverId)?.name}...`);
    }
  };

  const updateFormArgs = (argsString: string) => {
    const args = argsString.split(' ').filter(a => a.trim());
    setFormData({ ...formData, args });
  };

  const renderTransportFields = () => {
    switch (formData.transportType) {
      case 'sse':
      case 'http':
        return (
          <>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5" />
                {formData.transportType === 'sse' ? 'SSE URL' : 'HTTP Endpoint URL'}
              </Label>
              <Input 
                placeholder={formData.transportType === 'sse' ? "http://localhost:3001/sse" : "http://localhost:3001/mcp"}
                value={formData.url || ''} 
                onChange={(e) => setFormData({ ...formData, url: e.target.value })} 
              />
              <p className="text-xs text-gray-500">
                {formData.transportType === 'sse' 
                  ? 'The SSE endpoint URL of the MCP server' 
                  : 'The HTTP POST endpoint of the MCP server'}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5" />
                API Key (Optional)
              </Label>
              <Input 
                type={showApiKey ? "text" : "password"}
                placeholder="Bearer token or API key" 
                value={formData.apiKey || ''} 
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} 
              />
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="show-api-key"
                  checked={showApiKey}
                  onChange={(e) => setShowApiKey(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="show-api-key" className="text-xs text-gray-500 cursor-pointer">
                  Show API Key
                </Label>
              </div>
            </div>
          </>
        );
      
      case 'stdio':
        return (
          <>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" />
                Command
              </Label>
              <Input 
                placeholder="npx" 
                value={formData.command || ''} 
                onChange={(e) => setFormData({ ...formData, command: e.target.value })} 
              />
              <p className="text-xs text-gray-500">The command to execute (e.g., npx, node, python)</p>
            </div>
            <div className="space-y-2">
              <Label>Arguments (space-separated)</Label>
              <Input 
                placeholder="-y @modelcontextprotocol/server-filesystem /path/to/dir" 
                value={formData.args?.join(' ') || ''} 
                onChange={(e) => updateFormArgs(e.target.value)} 
              />
              <p className="text-xs text-gray-500">Command line arguments</p>
            </div>
            <div className="space-y-2">
              <Label>Environment Variables (Optional)</Label>
              <Input 
                placeholder="KEY=value,ANOTHER=val" 
                onChange={(e) => {
                  const env: Record<string, string> = {};
                  e.target.value.split(',').forEach(pair => {
                    const [key, val] = pair.split('=');
                    if (key && val) env[key.trim()] = val.trim();
                  });
                  setFormData({ ...formData, env });
                }} 
              />
              <p className="text-xs text-gray-500">Comma-separated KEY=value pairs</p>
            </div>
          </>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              <div>
                <h3 className="font-medium">MCP Tools</h3>
                <p className="text-sm text-gray-500">Connect to MCP servers (SSE, HTTP, or stdio)</p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <>
          <Button variant="outline" className="w-full" onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add MCP Server
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingServer ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    placeholder="e.g., My MCP Server" 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  />
                </div>

                <div className="space-y-2">
                  <Label>Transport Type</Label>
                  <Select 
                    value={formData.transportType} 
                    onValueChange={(v: TransportType) => setFormData({ ...formData, transportType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                      <SelectItem value="http">HTTP (POST requests)</SelectItem>
                      <SelectItem value="stdio">stdio (Local command)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    {formData.transportType === 'sse' && 'Real-time connection via SSE endpoint'}
                    {formData.transportType === 'http' && 'Stateless HTTP POST requests'}
                    {formData.transportType === 'stdio' && 'Local subprocess communication'}
                  </p>
                </div>

                {renderTransportFields()}

                <div className="flex items-center space-x-2 pt-2">
                  <Switch 
                    id="server-enabled" 
                    checked={formData.enabled} 
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })} 
                  />
                  <Label htmlFor="server-enabled">Enabled</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave}>{editingServer ? 'Save Changes' : 'Add Server'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Accordion type="multiple" className="space-y-2">
            {servers.map((server) => {
              const status = (serverStatuses[server.id]?.status || 'disconnected') as ConnectionStatus;
              const error = serverStatuses[server.id]?.error;
              const toolCount = serverStatuses[server.id]?.toolCount || 0;

              return (
                <AccordionItem key={server.id} value={server.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 w-full pr-4">
                      <TransportIcon type={server.transportType} />
                      <span className="font-medium">{server.name}</span>
                      <TransportLabel type={server.transportType} />
                      <StatusBadge status={status} error={error} />
                      {status === 'connected' && toolCount > 0 && (
                        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">
                          {toolCount} tools
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-4">
                      <div className="space-y-2 text-sm">
                        {(server.transportType === 'sse' || server.transportType === 'http') && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">URL:</span>
                            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs max-w-[200px] truncate">
                              {server.url}
                            </code>
                          </div>
                        )}
                        {server.transportType === 'stdio' && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">Command:</span>
                              <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                                {server.command}
                              </code>
                            </div>
                            {server.args && server.args.length > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-500">Args:</span>
                                <code className="bg-gray-100 px-2 py-0.5 rounded text-xs max-w-[200px] truncate">
                                  {server.args.join(' ')}
                                </code>
                              </div>
                            )}
                          </>
                        )}
                        {(server.transportType === 'sse' || server.transportType === 'http') && server.apiKey && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">API Key:</span>
                            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                              ••••••••
                            </code>
                          </div>
                        )}
                        {error && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                            <strong>Error:</strong> {error}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center space-x-2">
                          <Switch 
                            id={`server-${server.id}`} 
                            checked={server.enabled} 
                            onCheckedChange={(checked) => handleToggleServer(server.id, checked)} 
                          />
                          <Label htmlFor={`server-${server.id}`}>Enabled</Label>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditDialog(server)}
                          >
                            <Edit2 className="w-4 h-4 mr-1" /> Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveServer(server.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {servers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No MCP servers configured</p>
              <p className="text-sm">Add a server via SSE, HTTP, or stdio</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
