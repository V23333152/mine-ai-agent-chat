/**
 * Prompt Version Control - 提示词版本控制系统
 * 
 * 提供 Git 风格的提示词版本管理：
 * - 版本历史追踪
 * - 分支管理
 * - 差异对比
 * - 回滚功能
 * - 协作合并
 */

import type { PromptConfig } from "../shared/prompt-config.js";

/**
 * 提示词版本
 */
export interface PromptVersion {
  /** 版本 ID */
  id: string;
  /** 提示词配置 */
  config: PromptConfig;
  /** 提交信息 */
  commitMessage: string;
  /** 作者 */
  author: string;
  /** 创建时间 */
  timestamp: number;
  /** 父版本 ID */
  parentId?: string;
  /** 分支名称 */
  branch: string;
  /** 标签 */
  tags?: string[];
  /** 效果指标 */
  metrics?: VersionMetrics;
}

/**
 * 版本效果指标
 */
export interface VersionMetrics {
  /** 使用次数 */
  usageCount: number;
  /** 平均响应质量评分 (1-10) */
  averageQualityScore: number;
  /** 用户满意度 (1-10) */
  userSatisfaction: number;
  /** 平均响应时间 (ms) */
  averageLatency: number;
  /** 成功率 */
  successRate: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 分支信息
 */
export interface Branch {
  /** 分支名称 */
  name: string;
  /** 当前版本 ID */
  currentVersionId: string;
  /** 创建时间 */
  createdAt: number;
  /** 是否为主分支 */
  isMain: boolean;
  /** 描述 */
  description?: string;
}

/**
 * 版本差异
 */
export interface VersionDiff {
  /** 旧版本 ID */
  fromVersionId: string;
  /** 新版本 ID */
  toVersionId: string;
  /** 字段变更 */
  changes: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    type: "added" | "removed" | "modified";
  }>;
  /** 系统提示词文本差异 */
  promptDiff: string;
  /** 统计 */
  stats: {
    added: number;
    removed: number;
    modified: number;
  };
}

/**
 * 版本控制配置
 */
export interface VersionControlConfig {
  /** 最大保存版本数 */
  maxVersions: number;
  /** 自动保存间隔 (ms) */
  autoSaveInterval: number;
  /** 是否启用自动保存 */
  enableAutoSave: boolean;
  /** 主分支名称 */
  mainBranchName: string;
}

/**
 * 默认配置
 */
export const DEFAULT_VC_CONFIG: VersionControlConfig = {
  maxVersions: 50,
  autoSaveInterval: 5 * 60 * 1000, // 5 分钟
  enableAutoSave: false,
  mainBranchName: "main",
};

/**
 * 提示词版本控制器
 */
export class PromptVersionControl {
  private versions: Map<string, PromptVersion> = new Map();
  private branches: Map<string, Branch> = new Map();
  private currentBranch: string;
  private config: VersionControlConfig;

  constructor(config: Partial<VersionControlConfig> = {}) {
    this.config = { ...DEFAULT_VC_CONFIG, ...config };
    this.currentBranch = this.config.mainBranchName;

    // 初始化主分支
    this.branches.set(this.config.mainBranchName, {
      name: this.config.mainBranchName,
      currentVersionId: "",
      createdAt: Date.now(),
      isMain: true,
      description: "主分支",
    });
  }

  /**
   * 提交新版本
   */
  commit(
    config: PromptConfig,
    commitMessage: string,
    author: string = "system",
    options?: {
      branch?: string;
      tags?: string[];
    }
  ): PromptVersion {
    const branchName = options?.branch || this.currentBranch;
    const branch = this.branches.get(branchName);

    if (!branch) {
      throw new Error(`Branch '${branchName}' does not exist`);
    }

    const versionId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const version: PromptVersion = {
      id: versionId,
      config: { ...config },
      commitMessage,
      author,
      timestamp: Date.now(),
      parentId: branch.currentVersionId || undefined,
      branch: branchName,
      tags: options?.tags,
    };

    this.versions.set(versionId, version);

    // 更新分支当前版本
    branch.currentVersionId = versionId;
    this.branches.set(branchName, branch);

    // 清理旧版本
    this.cleanupOldVersions(branchName);

    return version;
  }

  /**
   * 创建新分支
   */
  createBranch(
    branchName: string,
    fromVersionId?: string,
    description?: string
  ): Branch {
    if (this.branches.has(branchName)) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    const sourceVersionId = fromVersionId || this.getCurrentVersion()?.id;

    const branch: Branch = {
      name: branchName,
      currentVersionId: sourceVersionId || "",
      createdAt: Date.now(),
      isMain: false,
      description,
    };

    this.branches.set(branchName, branch);
    return branch;
  }

  /**
   * 切换分支
   */
  switchBranch(branchName: string): PromptVersion | null {
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch '${branchName}' does not exist`);
    }

    this.currentBranch = branchName;

    if (branch.currentVersionId) {
      return this.versions.get(branchName) || null;
    }

    return null;
  }

  /**
   * 合并分支
   */
  merge(
    sourceBranchName: string,
    targetBranchName: string = this.currentBranch,
    options?: {
      strategy?: "overwrite" | "manual";
      author?: string;
    }
  ): PromptVersion {
    const sourceBranch = this.branches.get(sourceBranchName);
    const targetBranch = this.branches.get(targetBranchName);

    if (!sourceBranch || !targetBranch) {
      throw new Error("Source or target branch does not exist");
    }

    const sourceVersion = sourceBranch.currentVersionId
      ? this.versions.get(sourceBranch.currentVersionId)
      : null;

    if (!sourceVersion) {
      throw new Error("Source branch has no versions");
    }

    // 创建合并提交
    const mergedConfig = { ...sourceVersion.config };
    
    return this.commit(
      mergedConfig,
      `Merge branch '${sourceBranchName}' into ${targetBranchName}`,
      options?.author,
      { branch: targetBranchName }
    );
  }

  /**
   * 回滚到指定版本
   */
  rollback(versionId: string, options?: { createNewBranch?: boolean; branchName?: string }): PromptVersion {
    const targetVersion = this.versions.get(versionId);
    if (!targetVersion) {
      throw new Error(`Version '${versionId}' not found`);
    }

    let branchName = this.currentBranch;

    if (options?.createNewBranch) {
      branchName = options.branchName || `rollback_${Date.now()}`;
      this.createBranch(branchName, undefined, `Rollback to ${versionId}`);
    }

    // 创建回滚提交
    return this.commit(
      { ...targetVersion.config },
      `Rollback to version ${versionId.slice(0, 8)}`,
      "system",
      { branch: branchName }
    );
  }

  /**
   * 获取版本历史
   */
  getHistory(branchName?: string, limit?: number): PromptVersion[] {
    const branch = branchName
      ? this.branches.get(branchName)
      : this.branches.get(this.currentBranch);

    if (!branch) return [];

    const history: PromptVersion[] = [];
    let currentId: string | undefined = branch.currentVersionId;

    while (currentId) {
      const version = this.versions.get(currentId);
      if (!version) break;

      history.push(version);
      currentId = version.parentId;

      if (limit && history.length >= limit) break;
    }

    return history;
  }

  /**
   * 获取版本差异
   */
  getDiff(fromVersionId: string, toVersionId: string): VersionDiff {
    const fromVersion = this.versions.get(fromVersionId);
    const toVersion = this.versions.get(toVersionId);

    if (!fromVersion || !toVersion) {
      throw new Error("One or both versions not found");
    }

    const changes: VersionDiff["changes"] = [];
    const fromConfig = fromVersion.config;
    const toConfig = toVersion.config;

    // 比较字段
    const fieldsToCompare: (keyof PromptConfig)[] = [
      "name",
      "description",
      "systemPrompt",
      "agentType",
    ];

    fieldsToCompare.forEach((field) => {
      const oldValue = fromConfig[field];
      const newValue = toConfig[field];

      if (oldValue !== newValue) {
        changes.push({
          field,
          oldValue,
          newValue,
          type: "modified",
        });
      }
    });

    // 生成文本差异
    const promptDiff = this.generateTextDiff(
      fromConfig.systemPrompt,
      toConfig.systemPrompt
    );

    return {
      fromVersionId,
      toVersionId,
      changes,
      promptDiff,
      stats: {
        added: changes.filter((c) => c.type === "added").length,
        removed: changes.filter((c) => c.type === "removed").length,
        modified: changes.filter((c) => c.type === "modified").length,
      },
    };
  }

  /**
   * 生成文本差异（简化版）
   */
  private generateTextDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    const diff: string[] = [];
    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        diff.push(`+ ${newLine}`);
      } else if (newLine === undefined) {
        diff.push(`- ${oldLine}`);
      } else if (oldLine !== newLine) {
        diff.push(`- ${oldLine}`);
        diff.push(`+ ${newLine}`);
      } else {
        diff.push(`  ${oldLine}`);
      }
    }

    return diff.join("\n");
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): PromptVersion | null {
    const branch = this.branches.get(this.currentBranch);
    if (!branch || !branch.currentVersionId) return null;
    return this.versions.get(branch.currentVersionId) || null;
  }

  /**
   * 获取指定版本
   */
  getVersion(versionId: string): PromptVersion | undefined {
    return this.versions.get(versionId);
  }

  /**
   * 打标签
   */
  tagVersion(versionId: string, tag: string): void {
    const version = this.versions.get(versionId);
    if (!version) {
      throw new Error(`Version '${versionId}' not found`);
    }

    version.tags = version.tags || [];
    if (!version.tags.includes(tag)) {
      version.tags.push(tag);
    }
  }

  /**
   * 更新版本指标
   */
  updateMetrics(versionId: string, metrics: Partial<VersionMetrics>): void {
    const version = this.versions.get(versionId);
    if (!version) return;

    version.metrics = {
      ...version.metrics,
      ...metrics,
      lastUpdated: Date.now(),
    } as VersionMetrics;
  }

  /**
   * 比较分支
   */
  compareBranches(branchA: string, branchB: string): {
    ahead: number;
    behind: number;
    diverged: boolean;
    commonAncestor?: string;
  } {
    const historyA = this.getHistory(branchA);
    const historyB = this.getHistory(branchB);

    const idsB = new Set(historyB.map((v) => v.id));

    // 找共同祖先
    let commonAncestor: string | undefined;
    for (const version of historyA) {
      if (idsB.has(version.id)) {
        commonAncestor = version.id;
        break;
      }
    }

    const ahead = historyA.findIndex((v) => v.id === commonAncestor);
    const behind = historyB.findIndex((v) => v.id === commonAncestor);

    return {
      ahead: ahead >= 0 ? ahead : historyA.length,
      behind: behind >= 0 ? behind : historyB.length,
      diverged: ahead > 0 && behind > 0,
      commonAncestor,
    };
  }

  /**
   * 清理旧版本
   */
  private cleanupOldVersions(branchName: string): void {
    const history = this.getHistory(branchName);
    if (history.length <= this.config.maxVersions) return;

    const versionsToKeep = new Set(history.slice(0, this.config.maxVersions).map((v) => v.id));

    // 保留有标签的版本
    for (const [id, version] of this.versions) {
      if (version.tags && version.tags.length > 0) {
        versionsToKeep.add(id);
      }
    }

    // 删除不需要的版本
    for (const id of this.versions.keys()) {
      if (!versionsToKeep.has(id)) {
        this.versions.delete(id);
      }
    }
  }

  /**
   * 获取所有分支
   */
  getBranches(): Branch[] {
    return Array.from(this.branches.values());
  }

  /**
   * 删除分支
   */
  deleteBranch(branchName: string): boolean {
    if (branchName === this.config.mainBranchName) {
      throw new Error("Cannot delete main branch");
    }

    if (this.currentBranch === branchName) {
      throw new Error("Cannot delete current branch");
    }

    return this.branches.delete(branchName);
  }

  /**
   * 导出数据
   */
  export(): {
    versions: PromptVersion[];
    branches: Branch[];
    currentBranch: string;
    config: VersionControlConfig;
  } {
    return {
      versions: Array.from(this.versions.values()),
      branches: Array.from(this.branches.values()),
      currentBranch: this.currentBranch,
      config: this.config,
    };
  }

  /**
   * 导入数据
   */
  import(data: {
    versions: PromptVersion[];
    branches: Branch[];
    currentBranch: string;
    config: VersionControlConfig;
  }): void {
    this.versions.clear();
    this.branches.clear();

    data.versions.forEach((v) => this.versions.set(v.id, v));
    data.branches.forEach((b) => this.branches.set(b.name, b));
    this.currentBranch = data.currentBranch;
    this.config = data.config;
  }
}

/**
 * 创建版本控制器实例
 */
export function createPromptVersionControl(
  config?: Partial<VersionControlConfig>
): PromptVersionControl {
  return new PromptVersionControl(config);
}

/**
 * 版本存储适配器接口
 */
export interface VersionStorageAdapter {
  save(data: any): Promise<void>;
  load(): Promise<any>;
}

/**
 * LocalStorage 适配器
 */
export class LocalStorageVersionAdapter implements VersionStorageAdapter {
  constructor(private key: string = "prompt-version-control") {}

  async save(data: any): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.key, JSON.stringify(data));
    }
  }

  async load(): Promise<any> {
    if (typeof localStorage !== "undefined") {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    }
    return null;
  }
}
