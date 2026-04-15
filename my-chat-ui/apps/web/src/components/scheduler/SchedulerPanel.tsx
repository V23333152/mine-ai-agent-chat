/**
 * AI Scheduler Panel Component
 *
 * 功能：
 * - 查看所有定时任务
 * - 创建新的 Cron/Heartbeat 任务
 * - 启用/禁用任务
 * - 手动触发任务
 * - 删除任务
 * - 查看任务执行历史
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  Calendar,
  HeartPulse,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  Settings,
  ChevronDown,
  ChevronUp,
  Zap,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_BASE_URL = "http://localhost:8889/api";

interface ScheduledTask {
  id: string;
  name: string;
  mode: "cron" | "heartbeat" | "event";
  schedule?: string;
  status: "idle" | "running" | "paused" | "error";
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  description?: string;
}

interface SchedulerStats {
  running: boolean;
  total_tasks: number;
  cron_tasks: number;
  heartbeat_tasks: number;
  event_tasks: number;
}

export function SchedulerPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // 创建任务对话框
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMode, setCreateMode] = useState<"cron" | "heartbeat">("cron");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskSchedule, setNewTaskSchedule] = useState("");
  const [newTaskPrompt, setNewTaskPrompt] = useState("");
  const [newTaskInterval, setNewTaskInterval] = useState("1800");
  const [newTaskTimezone, setNewTaskTimezone] = useState("Asia/Shanghai");
  const [isCreating, setIsCreating] = useState(false);

  // 删除确认
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  // Settings dialog + model input
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [schedulerModel, setSchedulerModel] = useState("");

  // Task edit flow
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskSchedule, setEditTaskSchedule] = useState("");
  const [editTaskPrompt, setEditTaskPrompt] = useState("");
  const [editTaskTimezone, setEditTaskTimezone] = useState("Asia/Shanghai");
  const [isEditing, setIsEditing] = useState(false);

  // Execution history popup
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/scheduler/tasks`);
      if (!response.ok) throw new Error("Failed to fetch tasks");
      const data = await response.json();
      setTasks(data.tasks || []);
      setIsConnected(true);
    } catch (error) {
      console.error("[Scheduler] Failed to fetch tasks:", error);
      setIsConnected(false);
      toast.error("无法连接到调度器服务");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取统计信息
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/scheduler/stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("[Scheduler] Failed to fetch stats:", error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchTasks();
    fetchStats();
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/scheduler/config`);
        if (response.ok) {
          const data = await response.json();
          setSchedulerModel(data.config?.defaultModel || "");
        }
      } catch (e) { console.error("[Scheduler] Failed to fetch config:", e); }
    };
    fetchConfig();
    // 定时刷新
    const interval = setInterval(() => {
      fetchTasks();
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchStats]);

  // SSE 连接 - 接收任务执行结果通知
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sseUrl = `${API_BASE_URL.replace("/api", "")}/api/notifications/stream`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") return;
        if (data.id && seenIdsRef.current.has(data.id)) return;

        if (data.id) {
          seenIdsRef.current.add(data.id);
        }

        if (data.type === "task_result") {
          const statusEmoji = data.status === "success" ? "✅" : data.status === "failed" ? "❌" : "⚠️";
          const durationText = data.durationMs ? `（${(data.durationMs / 1000).toFixed(2)}s）` : "";
          toast(`${statusEmoji} 任务「${data.taskName}」执行完成 ${durationText}`, {
            description: data.result || data.error || "无输出",
            duration: 6000,
          });
        }
      } catch (e) {
        console.error("[SchedulerPanel] Failed to parse SSE message:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[SchedulerPanel] SSE error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // 创建 Cron 任务
  const handleCreateCronTask = async () => {
    if (!newTaskName || !newTaskSchedule || !newTaskPrompt) {
      toast.error("请填写所有必填字段");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/scheduler/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "cron",
          name: newTaskName,
          schedule: newTaskSchedule,
          prompt: newTaskPrompt,
          timezone: newTaskTimezone,
          model: schedulerModel || undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to create task");

      toast.success("定时任务创建成功");
      setShowCreateDialog(false);
      resetCreateForm();
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error("[Scheduler] Failed to create task:", error);
      toast.error("创建任务失败");
    } finally {
      setIsCreating(false);
    }
  };

  // 创建 Heartbeat 任务
  const handleCreateHeartbeatTask = async () => {
    if (!newTaskName || !newTaskPrompt) {
      toast.error("请填写所有必填字段");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/scheduler/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "heartbeat",
          name: newTaskName,
          interval: parseInt(newTaskInterval),
          check_prompt: newTaskPrompt,
          speak_condition: "has_alert",
        }),
      });

      if (!response.ok) throw new Error("Failed to create task");

      toast.success("Heartbeat 任务创建成功");
      setShowCreateDialog(false);
      resetCreateForm();
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error("[Scheduler] Failed to create task:", error);
      toast.error("创建任务失败");
    } finally {
      setIsCreating(false);
    }
  };

  // 重置创建表单
  const resetCreateForm = () => {
    setNewTaskName("");
    setNewTaskSchedule("");
    setNewTaskPrompt("");
    setNewTaskInterval("1800");
    setNewTaskTimezone("Asia/Shanghai");
  };

  // 切换任务状态
  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    try {
      const endpoint = currentStatus === "paused" ? "resume" : "pause";
      const response = await fetch(
        `${API_BASE_URL}/scheduler/tasks/${taskId}/${endpoint}`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to toggle task");

      toast.success(currentStatus === "paused" ? "任务已恢复" : "任务已暂停");
      fetchTasks();
    } catch (error) {
      console.error("[Scheduler] Failed to toggle task:", error);
      toast.error("操作失败");
    }
  };

  // 手动触发任务
  const handleTriggerTask = async (taskId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/scheduler/tasks/${taskId}/trigger`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to trigger task");

      toast.success("任务已手动触发");
      fetchTasks();
    } catch (error) {
      console.error("[Scheduler] Failed to trigger task:", error);
      toast.error("触发失败");
    }
  };

  // 删除任务
  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/scheduler/tasks/${taskToDelete}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete task");

      toast.success("任务已删除");
      setTaskToDelete(null);
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error("[Scheduler] Failed to delete task:", error);
      toast.error("删除失败");
    }
  };

  // Settings save
  const handleSaveSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/scheduler/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModel: schedulerModel }),
      });
      if (!response.ok) throw new Error("Failed to save config");
      toast.success("设置已保存");
      setShowSettingsDialog(false);
    } catch (error) {
      console.error("[Scheduler] Failed to save config:", error);
      toast.error("保存设置失败");
    }
  };

  // Edit dialog
  const openEditDialog = (task: ScheduledTask) => {
    setEditingTask(task);
    setEditTaskName(task.name);
    setEditTaskSchedule(task.schedule || "");
    setEditTaskPrompt(task.description || "");
    setEditTaskTimezone("Asia/Shanghai");
  };

  const resetEditForm = () => {
    setEditingTask(null);
    setEditTaskName("");
    setEditTaskSchedule("");
    setEditTaskPrompt("");
    setEditTaskTimezone("Asia/Shanghai");
  };

  const handleEditTask = async () => {
    if (!editingTask) return;
    setIsEditing(true);
    try {
      const delResponse = await fetch(`${API_BASE_URL}/scheduler/tasks/${editingTask.id}`, {
        method: "DELETE",
      });
      if (!delResponse.ok) throw new Error("Failed to delete old task");

      const body: any = {
        mode: editingTask.mode,
        name: editTaskName,
      };
      if (editingTask.mode === "cron") {
        body.schedule = editTaskSchedule;
        body.prompt = editTaskPrompt;
        body.timezone = editTaskTimezone;
        body.model = schedulerModel || undefined;
      } else if (editingTask.mode === "heartbeat") {
        body.interval = parseInt(editTaskSchedule) || 1800;
        body.check_prompt = editTaskPrompt;
        body.speak_condition = "has_alert";
      }

      const createResponse = await fetch(`${API_BASE_URL}/scheduler/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!createResponse.ok) throw new Error("Failed to recreate task");

      toast.success("任务已更新");
      resetEditForm();
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error("[Scheduler] Failed to edit task:", error);
      toast.error("更新任务失败");
    } finally {
      setIsEditing(false);
    }
  };

  // History dialog
  const openHistoryDialog = async (taskId: string) => {
    setHistoryTaskId(taskId);
    setIsLoadingHistory(true);
    setTaskHistory([]);
    try {
      const response = await fetch(`${API_BASE_URL}/scheduler/tasks/${taskId}/history`);
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setTaskHistory(data.history || []);
    } catch (error) {
      console.error("[Scheduler] Failed to fetch history:", error);
      toast.error("获取执行历史失败");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 过滤任务
  const filteredTasks = tasks.filter((task) => {
    if (activeTab === "all") return true;
    return task.mode === activeTab;
  });

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "idle":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "running":
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case "paused":
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  // 获取模式图标
  const getModeIcon = (mode: string) => {
    switch (mode) {
      case "cron":
        return <Calendar className="h-4 w-4" />;
      case "heartbeat":
        return <HeartPulse className="h-4 w-4" />;
      case "event":
        return <Zap className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // 获取模式标签
  const getModeLabel = (mode: string) => {
    switch (mode) {
      case "cron":
        return "定时任务";
      case "heartbeat":
        return "心跳检查";
      case "event":
        return "事件触发";
      default:
        return mode;
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            AI Scheduler
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            定时任务调度管理 - 支持 Cron、Heartbeat、Event 三种模式
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "已连接" : "未连接"}
          </Badge>
          <Button variant="outline" size="icon" onClick={fetchTasks}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowSettingsDialog(true)} title="设置">
            <Settings className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建任务
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.total_tasks}</div>
            <div className="text-sm text-muted-foreground">总任务数</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.cron_tasks}</div>
            <div className="text-sm text-muted-foreground">Cron 任务</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.heartbeat_tasks}</div>
            <div className="text-sm text-muted-foreground">Heartbeat</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.event_tasks}</div>
            <div className="text-sm text-muted-foreground">Event 任务</div>
          </Card>
        </div>
      )}

      {/* 任务列表 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="cron">Cron</TabsTrigger>
          <TabsTrigger value="heartbeat">Heartbeat</TabsTrigger>
          <TabsTrigger value="event">Event</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="space-y-3">
            {filteredTasks.length === 0 ? (
              <Card className="p-8 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">暂无定时任务</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  创建第一个任务
                </Button>
              </Card>
            ) : (
              filteredTasks.map((task) => (
                <Card
                  key={task.id}
                  className={`p-4 ${expandedTask === task.id ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className="font-semibold">{task.name}</span>
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getModeIcon(task.mode)}
                          {getModeLabel(task.mode)}
                        </Badge>
                        {!task.enabled && (
                          <Badge variant="secondary">已禁用</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {task.schedule && (
                          <span className="font-mono bg-muted px-2 py-0.5 rounded">
                            {task.schedule}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm mt-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span>执行: {task.totalRuns} 次</span>
                        <span>成功: {task.successfulRuns}</span>
                        <span>失败: {task.failedRuns}</span>
                        {task.lastRun && <span>上次: {new Date(task.lastRun).toLocaleString()}</span>}
                        {task.nextRun && <span>下次: {new Date(task.nextRun).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTriggerTask(task.id)}
                        title="手动触发"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleTask(task.id, task.status)}
                        title={task.status === "paused" ? "恢复" : "暂停"}
                      >
                        {task.status === "paused" ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(task)}>
                            <Settings className="h-4 w-4 mr-2" />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openHistoryDialog(task.id)}>
                            <Terminal className="h-4 w-4 mr-2" />
                            执行历史
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setTaskToDelete(task.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建任务对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建新任务</DialogTitle>
            <DialogDescription>
              配置 AI 定时任务的执行计划和提示词
            </DialogDescription>
          </DialogHeader>

          <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cron">
                <Calendar className="h-4 w-4 mr-1" />
                Cron 定时
              </TabsTrigger>
              <TabsTrigger value="heartbeat">
                <HeartPulse className="h-4 w-4 mr-1" />
                Heartbeat
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cron" className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">任务名称</label>
                <Input
                  placeholder="例如: daily-report, morning-briefing"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Cron 表达式 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="0 9 * * * (每天9点)"
                  value={newTaskSchedule}
                  onChange={(e) => setNewTaskSchedule(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  格式: 分 时 日 月 周 (例如: */5 * * * * 每5分钟)
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">时区</label>
                <Select value={newTaskTimezone} onValueChange={setNewTaskTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">
                  AI 提示词 <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder="任务执行时发送给 AI 的提示词..."
                  value={newTaskPrompt}
                  onChange={(e) => setNewTaskPrompt(e.target.value)}
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="heartbeat" className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">任务名称</label>
                <Input
                  placeholder="例如: email-check, health-monitor"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  检查间隔 (秒) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="1800 (30分钟)"
                  value={newTaskInterval}
                  onChange={(e) => setNewTaskInterval(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  检查提示词 <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder="例如: 检查是否有紧急邮件需要处理..."
                  value={newTaskPrompt}
                  onChange={(e) => setNewTaskPrompt(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  AI 将定期执行此检查，只在有需要时才会通知你
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button
              onClick={createMode === "cron" ? handleCreateCronTask : handleCreateHeartbeatTask}
              disabled={isCreating}
            >
              {isCreating ? "创建中..." : "创建任务"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后任务将无法恢复，是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskToDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scheduler 设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">默认 AI 模型</label>
              <Input
                placeholder="例如: gpt-4o-mini"
                value={schedulerModel}
                onChange={(e) => setSchedulerModel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSettings}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => { if (!open) resetEditForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑任务</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">任务名称</label>
                <Input
                  value={editTaskName}
                  onChange={(e) => setEditTaskName(e.target.value)}
                />
              </div>
              {editingTask.mode === "cron" && (
                <>
                  <div>
                    <label className="text-sm font-medium">Cron 表达式</label>
                    <Input
                      value={editTaskSchedule}
                      onChange={(e) => setEditTaskSchedule(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">时区</label>
                    <Select value={editTaskTimezone} onValueChange={setEditTaskTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">America/New_York</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {editingTask.mode === "heartbeat" && (
                <div>
                  <label className="text-sm font-medium">检查间隔 (秒)</label>
                  <Input
                    type="number"
                    value={editTaskSchedule}
                    onChange={(e) => setEditTaskSchedule(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">
                  {editingTask.mode === "cron" ? "AI 提示词" : "检查提示词"}
                </label>
                <Textarea
                  value={editTaskPrompt}
                  onChange={(e) => setEditTaskPrompt(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={resetEditForm}>
              取消
            </Button>
            <Button onClick={handleEditTask} disabled={isEditing}>
              {isEditing ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyTaskId} onOpenChange={(open) => { if (!open) setHistoryTaskId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>任务执行历史</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {isLoadingHistory ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : taskHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无执行历史</p>
            ) : (
              taskHistory.map((h, idx) => (
                <Card key={idx} className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {h.status === "success" ? "✅" : h.status === "error" ? "❌" : "⏳"}
                    </span>
                    <span className="text-sm font-medium capitalize">{h.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <div>开始: {h.started_at ? new Date(h.started_at).toLocaleString() : "-"}</div>
                    <div>结束: {h.finished_at ? new Date(h.finished_at).toLocaleString() : "-"}</div>
                    <div>耗时: {h.duration_ms != null ? `${h.duration_ms}ms` : "-"}</div>
                    {h.error && <div className="text-destructive mt-1">错误: {h.error}</div>}
                  </div>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryTaskId(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
