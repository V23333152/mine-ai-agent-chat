/**
 * Few-Shot 示例管理系统
 * 
 * 提供结构化的 Few-Shot 示例管理，支持：
 * - 示例的增删改查
 * - 动态示例选择（基于相似度）
 * - 示例格式化输出
 * - 示例效果追踪
 */

import { estimateTokenCount } from "../context-engineering/context_layers.js";

/**
 * Few-Shot 示例接口
 */
export interface FewShotExample {
  /** 唯一标识 */
  id: string;
  /** 输入内容 */
  input: string;
  /** 期望输出 */
  output: string;
  /** 示例描述/标签 */
  description?: string;
  /** 分类标签 */
  tags?: string[];
  /** 使用次数 */
  useCount: number;
  /** 成功次数（用于效果评估） */
  successCount: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后使用时间 */
  lastUsedAt?: number;
  /** 效果评分 1-10 */
  effectivenessScore?: number;
}

/**
 * Few-Shot 配置选项
 */
export interface FewShotConfig {
  /** 最大示例数量 */
  maxExamples: number;
  /** 选择策略 */
  selectionStrategy: "random" | "similarity" | "effectiveness" | "hybrid";
  /** 相似度权重（hybrid 模式下使用） */
  similarityWeight: number;
  /** 效果权重（hybrid 模式下使用） */
  effectivenessWeight: number;
  /** 最大 token 数 */
  maxTokens: number;
  /** 示例分隔符 */
  separator: string;
  /** 输入前缀 */
  inputPrefix: string;
  /** 输出前缀 */
  outputPrefix: string;
}

/**
 * 默认配置
 */
export const DEFAULT_FEW_SHOT_CONFIG: FewShotConfig = {
  maxExamples: 5,
  selectionStrategy: "hybrid",
  similarityWeight: 0.6,
  effectivenessWeight: 0.4,
  maxTokens: 2000,
  separator: "\n\n---\n\n",
  inputPrefix: "Input: ",
  outputPrefix: "Output: ",
};

/**
 * 示例选择结果
 */
export interface ExampleSelectionResult {
  examples: FewShotExample[];
  totalTokens: number;
  selectionMethod: string;
  scores: Map<string, number>;
}

/**
 * Few-Shot 管理器类
 */
export class FewShotManager {
  private examples: Map<string, FewShotExample> = new Map();
  private config: FewShotConfig;

  constructor(config: Partial<FewShotConfig> = {}) {
    this.config = { ...DEFAULT_FEW_SHOT_CONFIG, ...config };
  }

  /**
   * 添加示例
   */
  addExample(
    input: string,
    output: string,
    metadata?: Partial<Omit<FewShotExample, "id" | "input" | "output">>
  ): FewShotExample {
    const id = `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const example: FewShotExample = {
      id,
      input,
      output,
      useCount: 0,
      successCount: 0,
      createdAt: Date.now(),
      ...metadata,
    };

    this.examples.set(id, example);
    return example;
  }

  /**
   * 批量添加示例
   */
  addExamples(
    examples: Array<{ input: string; output: string; description?: string; tags?: string[] }>
  ): FewShotExample[] {
    return examples.map((e) => this.addExample(e.input, e.output, {
      description: e.description,
      tags: e.tags,
    }));
  }

  /**
   * 更新示例
   */
  updateExample(
    id: string,
    updates: Partial<Omit<FewShotExample, "id">>
  ): FewShotExample | null {
    const example = this.examples.get(id);
    if (!example) return null;

    const updated = { ...example, ...updates };
    this.examples.set(id, updated);
    return updated;
  }

  /**
   * 删除示例
   */
  removeExample(id: string): boolean {
    return this.examples.delete(id);
  }

  /**
   * 获取示例
   */
  getExample(id: string): FewShotExample | undefined {
    return this.examples.get(id);
  }

  /**
   * 获取所有示例
   */
  getAllExamples(): FewShotExample[] {
    return Array.from(this.examples.values());
  }

  /**
   * 按标签筛选示例
   */
  getExamplesByTag(tag: string): FewShotExample[] {
    return this.getAllExamples().filter((e) => e.tags?.includes(tag));
  }

  /**
   * 计算文本相似度（余弦相似度）
   */
  calculateSimilarity(text1: string, text2: string): number {
    const tokenize = (text: string): string[] => {
      return text
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0);
    };

    const tokens1 = tokenize(text1);
    const tokens2 = tokenize(text2);

    const allTokens = new Set([...tokens1, ...tokens2]);
    const freq1 = new Map<string, number>();
    const freq2 = new Map<string, number>();

    tokens1.forEach((t) => freq1.set(t, (freq1.get(t) || 0) + 1));
    tokens2.forEach((t) => freq2.set(t, (freq2.get(t) || 0) + 1));

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    allTokens.forEach((token) => {
      const f1 = freq1.get(token) || 0;
      const f2 = freq2.get(token) || 0;
      dotProduct += f1 * f2;
      norm1 += f1 * f1;
      norm2 += f2 * f2;
    });

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 选择最优示例
   */
  selectExamples(query: string, options?: { maxExamples?: number }): ExampleSelectionResult {
    const maxExamples = options?.maxExamples || this.config.maxExamples;
    const allExamples = this.getAllExamples();

    if (allExamples.length === 0) {
      return {
        examples: [],
        totalTokens: 0,
        selectionMethod: "none",
        scores: new Map(),
      };
    }

    // 根据策略计算分数
    const scoredExamples = allExamples.map((example) => {
      let score = 0;

      switch (this.config.selectionStrategy) {
        case "random":
          score = Math.random();
          break;

        case "similarity":
          score = this.calculateSimilarity(query, example.input);
          break;

        case "effectiveness":
          score = (example.effectivenessScore || 5) / 10;
          break;

        case "hybrid":
        default:
          const similarityScore = this.calculateSimilarity(query, example.input);
          const effectivenessScore = (example.effectivenessScore || 5) / 10;
          const usageScore = Math.min(example.useCount / 10, 1); // 使用频率归一化
          
          score =
            similarityScore * this.config.similarityWeight +
            effectivenessScore * this.config.effectivenessWeight +
            usageScore * 0.2;
          break;
      }

      return { example, score };
    });

    // 排序并选择 top N
    scoredExamples.sort((a, b) => b.score - a.score);

    const selected: FewShotExample[] = [];
    let totalTokens = 0;
    const scores = new Map<string, number>();

    for (const { example, score } of scoredExamples) {
      if (selected.length >= maxExamples) break;

      const exampleText = this.formatExample(example, false);
      const tokens = estimateTokenCount(exampleText);

      if (totalTokens + tokens > this.config.maxTokens) break;

      selected.push(example);
      totalTokens += tokens;
      scores.set(example.id, score);

      // 更新使用统计
      example.useCount++;
      example.lastUsedAt = Date.now();
    }

    return {
      examples: selected,
      totalTokens,
      selectionMethod: this.config.selectionStrategy,
      scores,
    };
  }

  /**
   * 格式化单个示例
   */
  formatExample(example: FewShotExample, includeDescription = true): string {
    const parts: string[] = [];

    if (includeDescription && example.description) {
      parts.push(`# ${example.description}`);
    }

    parts.push(`${this.config.inputPrefix}${example.input}`);
    parts.push(`${this.config.outputPrefix}${example.output}`);

    return parts.join("\n");
  }

  /**
   * 格式化所有选中的示例为提示词
   */
  formatExamples(examples: FewShotExample[], includeDescriptions = true): string {
    if (examples.length === 0) return "";

    const formattedExamples = examples.map((e) =>
      this.formatExample(e, includeDescriptions)
    );

    return formattedExamples.join(this.config.separator);
  }

  /**
   * 生成完整的 Few-Shot 提示词
   */
  generateFewShotPrompt(
    query: string,
    instruction?: string,
    suffix?: string
  ): { prompt: string; examples: FewShotExample[]; metadata: { totalTokens: number } } {
    const selection = this.selectExamples(query);
    const parts: string[] = [];

    // 添加指令
    if (instruction) {
      parts.push(instruction);
      parts.push("");
    }

    // 添加示例
    if (selection.examples.length > 0) {
      parts.push("Here are some examples:");
      parts.push("");
      parts.push(this.formatExamples(selection.examples));
      parts.push("");
    }

    // 添加查询
    parts.push("Now, please respond to the following:");
    parts.push(`${this.config.inputPrefix}${query}`);

    // 添加后缀/格式要求
    if (suffix) {
      parts.push("");
      parts.push(suffix);
    }

    return {
      prompt: parts.join("\n"),
      examples: selection.examples,
      metadata: {
        totalTokens: selection.totalTokens,
      },
    };
  }

  /**
   * 记录示例使用效果
   */
  recordExampleResult(exampleId: string, success: boolean, score?: number): void {
    const example = this.examples.get(exampleId);
    if (!example) return;

    if (success) {
      example.successCount++;
    }

    // 更新效果评分（滑动平均）
    if (score !== undefined) {
      const currentScore = example.effectivenessScore || 5;
      const newScore = (currentScore * 0.7 + score * 0.3); // 70% 历史 + 30% 新评分
      example.effectivenessScore = Math.min(10, Math.max(1, newScore));
    }
  }

  /**
   * 批量记录使用效果
   */
  recordBatchResults(
    results: Array<{ exampleId: string; success: boolean; score?: number }>
  ): void {
    results.forEach((r) => this.recordExampleResult(r.exampleId, r.success, r.score));
  }

  /**
   * 获取示例统计信息
   */
  getStatistics(): {
    totalExamples: number;
    averageEffectiveness: number;
    totalUses: number;
    averageSuccessRate: number;
    topExamples: FewShotExample[];
    unusedExamples: FewShotExample[];
  } {
    const examples = this.getAllExamples();
    const totalExamples = examples.length;

    if (totalExamples === 0) {
      return {
        totalExamples: 0,
        averageEffectiveness: 0,
        totalUses: 0,
        averageSuccessRate: 0,
        topExamples: [],
        unusedExamples: [],
      };
    }

    const totalUses = examples.reduce((sum, e) => sum + e.useCount, 0);
    const averageEffectiveness =
      examples.reduce((sum, e) => sum + (e.effectivenessScore || 5), 0) / totalExamples;
    const averageSuccessRate =
      examples.reduce((sum, e) => sum + (e.useCount > 0 ? e.successCount / e.useCount : 0), 0) /
      totalExamples;

    const sortedByEffectiveness = [...examples].sort(
      (a, b) => (b.effectivenessScore || 0) - (a.effectivenessScore || 0)
    );

    return {
      totalExamples,
      averageEffectiveness,
      totalUses,
      averageSuccessRate,
      topExamples: sortedByEffectiveness.slice(0, 5),
      unusedExamples: examples.filter((e) => e.useCount === 0),
    };
  }

  /**
   * 导出示例数据
   */
  export(): FewShotExample[] {
    return this.getAllExamples();
  }

  /**
   * 导入示例数据
   */
  import(examples: FewShotExample[]): void {
    examples.forEach((e) => {
      this.examples.set(e.id, { ...e });
    });
  }

  /**
   * 清空所有示例
   */
  clear(): void {
    this.examples.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FewShotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): FewShotConfig {
    return { ...this.config };
  }
}

/**
 * 创建 Few-Shot 管理器实例
 */
export function createFewShotManager(config?: Partial<FewShotConfig>): FewShotManager {
  return new FewShotManager(config);
}

/**
 * 预定义的 Few-Shot 模板
 */
export const PREDEFINED_TEMPLATES: Record<string, FewShotExample[]> = {
  "classification": [
    {
      id: "template_1",
      input: "这个产品真的很好用，推荐给大家！",
      output: JSON.stringify({ sentiment: "positive", confidence: 0.95, aspects: ["quality", "recommendation"] }),
      description: "正面评价分类",
      tags: ["classification", "sentiment"],
      useCount: 0,
      successCount: 0,
      createdAt: Date.now(),
    },
    {
      id: "template_2",
      input: "质量太差了，完全不值这个价",
      output: JSON.stringify({ sentiment: "negative", confidence: 0.92, aspects: ["quality", "price"] }),
      description: "负面评价分类",
      tags: ["classification", "sentiment"],
      useCount: 0,
      successCount: 0,
      createdAt: Date.now(),
    },
  ],
  "extraction": [
    {
      id: "template_3",
      input: "张三，电话：13800138000，邮箱：zhangsan@example.com",
      output: JSON.stringify({ name: "张三", phone: "13800138000", email: "zhangsan@example.com" }),
      description: "联系信息提取",
      tags: ["extraction", "contact"],
      useCount: 0,
      successCount: 0,
      createdAt: Date.now(),
    },
  ],
  "translation": [
    {
      id: "template_4",
      input: "Hello, how are you today?",
      output: "你好，你今天怎么样？",
      description: "英译中",
      tags: ["translation", "en-zh"],
      useCount: 0,
      successCount: 0,
      createdAt: Date.now(),
    },
  ],
};

/**
 * 加载预定义模板
 */
export function loadPredefinedTemplate(templateName: string): FewShotExample[] {
  return PREDEFINED_TEMPLATES[templateName] || [];
}
