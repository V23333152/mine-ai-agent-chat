/**
 * Prompt Engineering Integration
 * 
 * 将 Prompt Engineering 功能集成到现有的 Agent 系统中
 * 提供统一的接口和配置管理
 */

import type { PromptConfig, AgentType } from "./prompt-config.js";
import {
  createFewShotManager,
  createPromptVersionControl,
  createPromptEvaluator,
  loadPredefinedTemplate,
  PREDEFINED_CRITERIA,
  type FewShotManager,
  type PromptVersionControl,
  type PromptEvaluator,
  type FewShotConfig,
  type VersionControlConfig,
  type EvaluatorConfig,
} from "../prompt-engineering/index.js";

/**
 * 增强的 Prompt 配置
 */
export interface EnhancedPromptConfig extends PromptConfig {
  /** Few-Shot 配置 */
  fewShotConfig?: FewShotConfig;
  /** 版本控制配置 */
  versionControlConfig?: VersionControlConfig;
  /** Few-Shot 示例 ID 列表 */
  fewShotExampleIds?: string[];
  /** 使用的 Few-Shot 模板 */
  fewShotTemplate?: string;
  /** 评估配置 */
  evaluationConfig?: EvaluatorConfig;
  /** 测试用例 ID 列表 */
  testCaseIds?: string[];
}

/**
 * Prompt Engineering 管理器
 * 
 * 统一管理所有 Prompt Engineering 功能
 */
export class PromptEngineeringManager {
  private fewShotManagers: Map<AgentType, FewShotManager> = new Map();
  private versionControls: Map<AgentType, PromptVersionControl> = new Map();
  private evaluators: Map<AgentType, PromptEvaluator> = new Map();

  private static instance: PromptEngineeringManager;

  static getInstance(): PromptEngineeringManager {
    if (!PromptEngineeringManager.instance) {
      PromptEngineeringManager.instance = new PromptEngineeringManager();
    }
    return PromptEngineeringManager.instance;
  }

  /**
   * 获取或创建 Few-Shot 管理器
   */
  getFewShotManager(agentType: AgentType, config?: FewShotConfig): FewShotManager {
    if (!this.fewShotManagers.has(agentType)) {
      this.fewShotManagers.set(agentType, createFewShotManager(config));
    }
    return this.fewShotManagers.get(agentType)!;
  }

  /**
   * 获取或创建版本控制器
   */
  getVersionControl(agentType: AgentType, config?: VersionControlConfig): PromptVersionControl {
    if (!this.versionControls.has(agentType)) {
      this.versionControls.set(agentType, createPromptVersionControl(config));
    }
    return this.versionControls.get(agentType)!;
  }

  /**
   * 获取或创建评估器
   */
  getEvaluator(agentType: AgentType, config?: EvaluatorConfig): PromptEvaluator {
    if (!this.evaluators.has(agentType)) {
      this.evaluators.set(agentType, createPromptEvaluator(config));
    }
    return this.evaluators.get(agentType)!;
  }

  /**
   * 为 Agent 加载 Few-Shot 模板
   */
  loadFewShotTemplate(agentType: AgentType, templateName: string): void {
    const manager = this.getFewShotManager(agentType);
    const examples = loadPredefinedTemplate(templateName);
    if (examples.length > 0) {
      manager.import(examples);
    }
  }

  /**
   * 准备带有 Few-Shot 的系统提示词
   */
  prepareSystemPrompt(
    agentType: AgentType,
    basePrompt: string,
    userQuery?: string,
    options?: {
      instruction?: string;
      suffix?: string;
    }
  ): { prompt: string; examplesUsed: number } {
    const manager = this.getFewShotManager(agentType);

    if (!userQuery || manager.getAllExamples().length === 0) {
      return { prompt: basePrompt, examplesUsed: 0 };
    }

    const result = manager.generateFewShotPrompt(
      userQuery,
      basePrompt,
      options?.suffix
    );

    return {
      prompt: result.prompt,
      examplesUsed: result.examples.length,
    };
  }

  /**
   * 提交提示词版本
   */
  commitPromptVersion(
    agentType: AgentType,
    config: EnhancedPromptConfig,
    commitMessage: string,
    author?: string
  ): { versionId: string; branch: string } {
    const vc = this.getVersionControl(agentType);
    const version = vc.commit(config, commitMessage, author);
    return { versionId: version.id, branch: version.branch };
  }

  /**
   * 评估提示词效果
   */
  async evaluatePrompt(
    agentType: AgentType,
    systemPrompt: string,
    versionId: string,
    testCaseIds?: string[]
  ): Promise<{
    averageScore: number;
    passedTests: number;
    totalTests: number;
    recommendations: string[];
  }> {
    const evaluator = this.getEvaluator(agentType);
    const report = await evaluator.evaluateBatch(systemPrompt, versionId, testCaseIds);

    return {
      averageScore: report.averageScore,
      passedTests: report.passedTests,
      totalTests: report.totalTests,
      recommendations: report.recommendations,
    };
  }

  /**
   * 获取完整的配置信息
   */
  getFullConfig(agentType: AgentType): {
    fewShot: ReturnType<FewShotManager["getStatistics"]>;
    versions: ReturnType<PromptVersionControl["getHistory"]>;
    branches: ReturnType<PromptVersionControl["getBranches"]>;
  } {
    return {
      fewShot: this.getFewShotManager(agentType).getStatistics(),
      versions: this.getVersionControl(agentType).getHistory(),
      branches: this.getVersionControl(agentType).getBranches(),
    };
  }

  /**
   * 导出所有数据
   */
  exportAll(): Record<AgentType, {
    fewShots: ReturnType<FewShotManager["export"]>;
    versions: ReturnType<PromptVersionControl["export"]>;
    testCases: ReturnType<PromptEvaluator["exportTestCases"]>;
  }> {
    const result: any = {};

    (["react", "memory", "research", "retrieval"] as AgentType[]).forEach((type) => {
      result[type] = {
        fewShots: this.getFewShotManager(type).export(),
        versions: this.getVersionControl(type).export(),
        testCases: this.getEvaluator(type).exportTestCases(),
      };
    });

    return result;
  }

  /**
   * 导入所有数据
   */
  importAll(data: Record<AgentType, {
    fewShots: Parameters<FewShotManager["import"]>[0];
    versions: Parameters<PromptVersionControl["import"]>[0];
    testCases: Parameters<PromptEvaluator["importTestCases"]>[0];
  }>): void {
    Object.entries(data).forEach(([type, agentData]) => {
      const agentType = type as AgentType;
      this.getFewShotManager(agentType).import(agentData.fewShots);
      this.getVersionControl(agentType).import(agentData.versions);
      this.getEvaluator(agentType).importTestCases(agentData.testCases);
    });
  }
}

/**
 * 获取 Prompt Engineering 管理器实例
 */
export function getPromptEngineeringManager(): PromptEngineeringManager {
  return PromptEngineeringManager.getInstance();
}

/**
 * 快速配置 Agent 的 Prompt Engineering 功能
 */
export function setupAgentPromptEngineering(
  agentType: AgentType,
  options?: {
    fewShotTemplate?: string;
    enableVersionControl?: boolean;
    enableEvaluation?: boolean;
  }
): void {
  const manager = getPromptEngineeringManager();

  // 加载 Few-Shot 模板
  if (options?.fewShotTemplate) {
    manager.loadFewShotTemplate(agentType, options.fewShotTemplate);
  }

  // 预初始化版本控制和评估器
  if (options?.enableVersionControl) {
    manager.getVersionControl(agentType);
  }

  if (options?.enableEvaluation) {
    manager.getEvaluator(agentType);
  }
}

// 重新导出常用类型和常量
export {
  PREDEFINED_CRITERIA,
  loadPredefinedTemplate,
  createFewShotManager,
  createPromptVersionControl,
  createPromptEvaluator,
};

export type {
  FewShotManager,
  PromptVersionControl,
  PromptEvaluator,
  FewShotConfig,
  VersionControlConfig,
  EvaluatorConfig,
};
