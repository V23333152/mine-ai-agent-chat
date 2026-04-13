/**
 * Prompt Evaluator - 提示词效果评估系统
 * 
 * 提供全面的提示词评估能力：
 * - 自动化测试用例执行
 * - 多维度评分（相关性、准确性、完整性等）
 * - A/B 测试支持
 * - 效果趋势分析
 * - 优化建议生成
 */

import { initChatModel } from "langchain/chat_models/universal";

/**
 * 测试用例
 */
export interface TestCase {
  /** 唯一标识 */
  id: string;
  /** 测试名称 */
  name: string;
  /** 输入 */
  input: string;
  /** 期望输出（可选，用于有监督评估） */
  expectedOutput?: string;
  /** 评估标准 */
  criteria: EvaluationCriteria[];
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 评估标准
 */
export interface EvaluationCriteria {
  /** 标准名称 */
  name: string;
  /** 权重 (0-1) */
  weight: number;
  /** 评估类型 */
  type: "exact_match" | "contains" | "similarity" | "custom" | "llm_judge";
  /** 期望值 */
  expected?: string | string[] | number;
  /** 自定义评估函数 */
  evaluator?: (output: string, expected?: any) => number | Promise<number>;
  /** 描述 */
  description?: string;
}

/**
 * 测试结果
 */
export interface TestResult {
  /** 测试用例 ID */
  testCaseId: string;
  /** 提示词版本 ID */
  promptVersionId: string;
  /** 实际输出 */
  actualOutput: string;
  /** 各标准得分 */
  scores: Record<string, number>;
  /** 总分 */
  totalScore: number;
  /** 是否通过 */
  passed: boolean;
  /** 执行时间 (ms) */
  executionTime: number;
  /** 令牌使用 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 错误信息 */
  error?: string;
  /** 执行时间戳 */
  timestamp: number;
  /** 原始响应 */
  rawResponse?: any;
}

/**
 * 评估报告
 */
export interface EvaluationReport {
  /** 报告 ID */
  id: string;
  /** 提示词版本 ID */
  promptVersionId: string;
  /** 测试用例数量 */
  totalTests: number;
  /** 通过数量 */
  passedTests: number;
  /** 失败数量 */
  failedTests: number;
  /** 平均分数 */
  averageScore: number;
  /** 各维度平均分 */
  dimensionScores: Record<string, number>;
  /** 详细结果 */
  results: TestResult[];
  /** 执行时间 */
  executionTime: number;
  /** 生成时间 */
  generatedAt: number;
  /** 改进建议 */
  recommendations: string[];
}

/**
 * A/B 测试配置
 */
export interface ABTestConfig {
  /** 测试名称 */
  name: string;
  /** 变体 A（对照组） */
  variantA: {
    id: string;
    systemPrompt: string;
  };
  /** 变体 B（实验组） */
  variantB: {
    id: string;
    systemPrompt: string;
  };
  /** 测试用例 */
  testCases: TestCase[];
  /** 分流比例 (0-1, B 的比例) */
  splitRatio: number;
  /** 最小样本数 */
  minSampleSize: number;
  /** 评估指标 */
  metrics: string[];
  /** 显著性水平 */
  significanceLevel: number;
}

/**
 * A/B 测试结果
 */
export interface ABTestResult {
  /** 测试配置 */
  config: ABTestConfig;
  /** 变体 A 结果 */
  variantA: {
    sampleSize: number;
    averageScore: number;
    scores: number[];
  };
  /** 变体 B 结果 */
  variantB: {
    sampleSize: number;
    averageScore: number;
    scores: number[];
  };
  /** 优胜者 */
  winner: "A" | "B" | "tie" | "insufficient_data";
  /** 提升幅度 */
  improvement: number;
  /** p 值 */
  pValue: number;
  /** 是否显著 */
  isSignificant: boolean;
  /** 结论 */
  conclusion: string;
}

/**
 * 评估配置
 */
export interface EvaluatorConfig {
  /** 评估模型 */
  evaluationModel: string;
  /** 通过阈值 (0-1) */
  passThreshold: number;
  /** 最大并发数 */
  maxConcurrency: number;
  /** 超时时间 (ms) */
  timeout: number;
  /** 重试次数 */
  retries: number;
}

/**
 * 默认配置
 */
export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  evaluationModel: "anthropic/claude-3-5-haiku-latest",
  passThreshold: 0.7,
  maxConcurrency: 3,
  timeout: 30000,
  retries: 2,
};

/**
 * 提示词评估器
 */
export class PromptEvaluator {
  private config: EvaluatorConfig;
  private testCases: Map<string, TestCase> = new Map();
  private results: Map<string, TestResult[]> = new Map();

  constructor(config: Partial<EvaluatorConfig> = {}) {
    this.config = { ...DEFAULT_EVALUATOR_CONFIG, ...config };
  }

  /**
   * 添加测试用例
   */
  addTestCase(testCase: Omit<TestCase, "id" | "createdAt">): TestCase {
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTestCase: TestCase = {
      ...testCase,
      id,
      createdAt: Date.now(),
    };
    this.testCases.set(id, newTestCase);
    return newTestCase;
  }

  /**
   * 批量添加测试用例
   */
  addTestCases(testCases: Array<Omit<TestCase, "id" | "createdAt">>): TestCase[] {
    return testCases.map((tc) => this.addTestCase(tc));
  }

  /**
   * 删除测试用例
   */
  removeTestCase(id: string): boolean {
    return this.testCases.delete(id);
  }

  /**
   * 获取测试用例
   */
  getTestCase(id: string): TestCase | undefined {
    return this.testCases.get(id);
  }

  /**
   * 获取所有测试用例
   */
  getAllTestCases(): TestCase[] {
    return Array.from(this.testCases.values());
  }

  /**
   * 按标签筛选
   */
  getTestCasesByTag(tag: string): TestCase[] {
    return this.getAllTestCases().filter((tc) => tc.tags?.includes(tag));
  }

  /**
   * 评估单个测试用例
   */
  async evaluate(
    testCase: TestCase,
    systemPrompt: string,
    promptVersionId: string
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 初始化模型
      const model = await initChatModel(this.config.evaluationModel);

      // 调用模型
      const response = await model.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: testCase.input },
      ]);

      const actualOutput = (response as any).content as string;
      const executionTime = Date.now() - startTime;

      // 评估各标准
      const scores: Record<string, number> = {};
      let totalWeight = 0;
      let weightedScore = 0;

      for (const criteria of testCase.criteria) {
        const score = await this.evaluateCriteria(actualOutput, criteria, testCase.expectedOutput);
        scores[criteria.name] = score;
        weightedScore += score * criteria.weight;
        totalWeight += criteria.weight;
      }

      const totalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

      const result: TestResult = {
        testCaseId: testCase.id,
        promptVersionId,
        actualOutput,
        scores,
        totalScore,
        passed: totalScore >= this.config.passThreshold,
        executionTime,
        tokenUsage: (response as any).usage,
        timestamp: Date.now(),
      };

      // 保存结果
      const versionResults = this.results.get(promptVersionId) || [];
      versionResults.push(result);
      this.results.set(promptVersionId, versionResults);

      return result;
    } catch (error) {
      return {
        testCaseId: testCase.id,
        promptVersionId,
        actualOutput: "",
        scores: {},
        totalScore: 0,
        passed: false,
        executionTime: Date.now() - startTime,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 评估单项标准
   */
  private async evaluateCriteria(
    actual: string,
    criteria: EvaluationCriteria,
    expected?: string
  ): Promise<number> {
    switch (criteria.type) {
      case "exact_match":
        return actual === expected ? 1 : 0;

      case "contains":
        if (!criteria.expected) return 0;
        const expectedValues = Array.isArray(criteria.expected)
          ? criteria.expected
          : [criteria.expected];
        const matches = expectedValues.filter((exp) => actual.includes(String(exp))).length;
        return matches / expectedValues.length;

      case "similarity":
        if (!expected) return 0;
        return this.calculateSimilarity(actual, expected);

      case "custom":
        if (criteria.evaluator) {
          const result = await criteria.evaluator(actual, expected);
          return Math.min(1, Math.max(0, result));
        }
        return 0;

      case "llm_judge":
        return await this.llmJudge(actual, expected, criteria.description);

      default:
        return 0;
    }
  }

  /**
   * 计算文本相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const tokenize = (text: string): string[] => {
      return text
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0);
    };

    const tokens1 = tokenize(text1);
    const tokens2 = tokenize(text2);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * LLM 评判
   */
  private async llmJudge(actual: string, expected: string | undefined, criteria?: string): Promise<number> {
    try {
      const model = await initChatModel(this.config.evaluationModel);

      const prompt = `请评估以下 AI 回答的质量，给出 0-10 的分数。

${expected ? `期望回答：${expected}\n\n` : ""}
实际回答：${actual}

${criteria ? `评估标准：${criteria}\n\n` : ""}
请只返回一个数字（0-10），不要有任何解释。`;

      const response = await model.invoke([{ role: "user", content: prompt }]);
      const content = (response as any).content as string;

      // 提取数字
      const match = content.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        const score = parseFloat(match[1]);
        return Math.min(1, Math.max(0, score / 10));
      }

      return 0.5;
    } catch {
      return 0.5;
    }
  }

  /**
   * 批量评估
   */
  async evaluateBatch(
    systemPrompt: string,
    promptVersionId: string,
    testCaseIds?: string[]
  ): Promise<EvaluationReport> {
    const startTime = Date.now();

    const testCases = testCaseIds
      ? testCaseIds.map((id) => this.testCases.get(id)).filter(Boolean) as TestCase[]
      : this.getAllTestCases();

    const results: TestResult[] = [];

    // 串行执行（避免并发问题）
    for (const testCase of testCases) {
      const result = await this.evaluate(testCase, systemPrompt, promptVersionId);
      results.push(result);
    }

    // 生成报告
    return this.generateReport(results, promptVersionId, Date.now() - startTime);
  }

  /**
   * 生成评估报告
   */
  private generateReport(
    results: TestResult[],
    promptVersionId: string,
    executionTime: number
  ): EvaluationReport {
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.length - passedTests;

    // 计算各维度平均分
    const dimensionScores: Record<string, number[]> = {};
    results.forEach((r) => {
      Object.entries(r.scores).forEach(([dim, score]) => {
        if (!dimensionScores[dim]) dimensionScores[dim] = [];
        dimensionScores[dim].push(score);
      });
    });

    const avgDimensionScores: Record<string, number> = {};
    Object.entries(dimensionScores).forEach(([dim, scores]) => {
      avgDimensionScores[dim] = scores.reduce((a, b) => a + b, 0) / scores.length;
    });

    const averageScore = results.reduce((sum, r) => sum + r.totalScore, 0) / results.length;

    // 生成改进建议
    const recommendations = this.generateRecommendations(results, avgDimensionScores);

    return {
      id: `report_${Date.now()}`,
      promptVersionId,
      totalTests: results.length,
      passedTests,
      failedTests,
      averageScore,
      dimensionScores: avgDimensionScores,
      results,
      executionTime,
      generatedAt: Date.now(),
      recommendations,
    };
  }

  /**
   * 生成改进建议
   */
  private generateRecommendations(
    results: TestResult[],
    dimensionScores: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // 找出低分维度
    Object.entries(dimensionScores).forEach(([dim, score]) => {
      if (score < 0.5) {
        recommendations.push(`${dim} 维度得分较低 (${(score * 100).toFixed(1)}%)，建议优化相关提示词`);
      }
    });

    // 分析失败案例
    const failedResults = results.filter((r) => !r.passed);
    if (failedResults.length > results.length * 0.3) {
      recommendations.push(`失败率较高 (${((failedResults.length / results.length) * 100).toFixed(1)}%)，建议检查提示词基础逻辑`);
    }

    // 分析执行时间
    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
    if (avgExecutionTime > 10000) {
      recommendations.push("平均响应时间较长，建议简化提示词或优化模型参数");
    }

    // 通用建议
    if (recommendations.length === 0) {
      if (dimensionScores["accuracy"] && dimensionScores["accuracy"] < 0.8) {
        recommendations.push("准确性有提升空间，建议添加更多约束条件或示例");
      }
      if (dimensionScores["completeness"] && dimensionScores["completeness"] < 0.8) {
        recommendations.push("完整性有提升空间，建议明确要求覆盖的要点");
      }
    }

    return recommendations;
  }

  /**
   * 执行 A/B 测试
   */
  async runABTest(config: ABTestConfig): Promise<ABTestResult> {
    // 分别评估两个变体
    const resultsA = await this.evaluateBatch(
      config.variantA.systemPrompt,
      config.variantA.id,
      config.testCases.map((tc) => tc.id)
    );

    const resultsB = await this.evaluateBatch(
      config.variantB.systemPrompt,
      config.variantB.id,
      config.testCases.map((tc) => tc.id)
    );

    const scoresA = resultsA.results.map((r) => r.totalScore);
    const scoresB = resultsB.results.map((r) => r.totalScore);

    const avgA = scoresA.reduce((a, b) => a + b, 0) / scoresA.length;
    const avgB = scoresB.reduce((a, b) => a + b, 0) / scoresB.length;

    // 简单的 t 检验（简化实现）
    const pValue = this.calculatePValue(scoresA, scoresB);
    const isSignificant = pValue < config.significanceLevel;

    let winner: ABTestResult["winner"];
    let improvement = 0;

    if (!isSignificant) {
      winner = "insufficient_data";
    } else if (Math.abs(avgA - avgB) < 0.05) {
      winner = "tie";
    } else {
      winner = avgB > avgA ? "B" : "A";
      improvement = Math.abs(avgB - avgA) / Math.min(avgA, avgB);
    }

    return {
      config,
      variantA: {
        sampleSize: scoresA.length,
        averageScore: avgA,
        scores: scoresA,
      },
      variantB: {
        sampleSize: scoresB.length,
        averageScore: avgB,
        scores: scoresB,
      },
      winner,
      improvement,
      pValue,
      isSignificant,
      conclusion: this.generateABTestConclusion(winner, improvement, isSignificant, avgA, avgB),
    };
  }

  /**
   * 计算 p 值（简化版 t 检验）
   */
  private calculatePValue(scoresA: number[], scoresB: number[]): number {
    const n1 = scoresA.length;
    const n2 = scoresB.length;
    const mean1 = scoresA.reduce((a, b) => a + b, 0) / n1;
    const mean2 = scoresB.reduce((a, b) => a + b, 0) / n2;

    const var1 = scoresA.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
    const var2 = scoresB.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));

    const tStat = Math.abs(mean1 - mean2) / se;

    // 简化：返回近似 p 值
    if (tStat < 1) return 0.3;
    if (tStat < 2) return 0.1;
    if (tStat < 3) return 0.01;
    return 0.001;
  }

  /**
   * 生成 A/B 测试结论
   */
  private generateABTestConclusion(
    winner: ABTestResult["winner"],
    improvement: number,
    isSignificant: boolean,
    avgA: number,
    avgB: number
  ): string {
    if (winner === "insufficient_data") {
      return `数据不足以得出显著结论。当前差异不显著，建议增加样本量后再进行测试。`;
    }

    if (winner === "tie") {
      return `两个变体表现相当，差异在误差范围内。建议选择实现更简单的变体或进行更多测试。`;
    }

    const winnerName = winner === "A" ? "变体 A" : "变体 B";
    const avg = winner === "A" ? avgA : avgB;

    return `${winnerName} 表现更优，得分 ${(avg * 100).toFixed(1)}%。` +
           `${isSignificant ? `差异具有统计学显著性 (p < 0.05)。` : `但差异不显著。`}` +
           `相比另一变体${improvement > 0 ? `提升 ${(improvement * 100).toFixed(1)}%` : ""}。`;
  }

  /**
   * 导出测试用例
   */
  exportTestCases(): TestCase[] {
    return this.getAllTestCases();
  }

  /**
   * 导入测试用例
   */
  importTestCases(testCases: TestCase[]): void {
    testCases.forEach((tc) => {
      this.testCases.set(tc.id, tc);
    });
  }

  /**
   * 获取历史结果
   */
  getResultsForVersion(promptVersionId: string): TestResult[] {
    return this.results.get(promptVersionId) || [];
  }

  /**
   * 清除历史结果
   */
  clearResults(promptVersionId?: string): void {
    if (promptVersionId) {
      this.results.delete(promptVersionId);
    } else {
      this.results.clear();
    }
  }
}

/**
 * 创建评估器实例
 */
export function createPromptEvaluator(
  config?: Partial<EvaluatorConfig>
): PromptEvaluator {
  return new PromptEvaluator(config);
}

/**
 * 预定义评估标准
 */
export const PREDEFINED_CRITERIA = {
  /** 准确性 */
  accuracy: (weight = 0.3): EvaluationCriteria => ({
    name: "accuracy",
    weight,
    type: "llm_judge",
    description: "回答内容是否准确、符合事实",
  }),

  /** 完整性 */
  completeness: (weight = 0.25): EvaluationCriteria => ({
    name: "completeness",
    weight,
    type: "llm_judge",
    description: "是否完整回答了问题的各个方面",
  }),

  /** 相关性 */
  relevance: (weight = 0.25): EvaluationCriteria => ({
    name: "relevance",
    weight,
    type: "similarity",
    description: "回答是否与问题高度相关",
  }),

  /** 格式正确性 */
  format: (expectedFormat: string, weight = 0.2): EvaluationCriteria => ({
    name: "format",
    weight,
    type: "custom",
    description: `回答格式是否符合要求：${expectedFormat}`,
    evaluator: (output: string) => {
      // 简单的格式检查
      if (expectedFormat === "json") {
        try {
          JSON.parse(output);
          return 1;
        } catch {
          return 0;
        }
      }
      return 0.5;
    },
  }),

  /** 包含关键词 */
  containsKeywords: (keywords: string[], weight = 0.2): EvaluationCriteria => ({
    name: "contains_keywords",
    weight,
    type: "contains",
    expected: keywords,
    description: `回答应包含以下关键词：${keywords.join(", ")}`,
  }),
};

/**
 * 快速创建测试套件
 */
export function createTestSuite(
  name: string,
  testCases: Array<{
    name: string;
    input: string;
    expectedOutput?: string;
    criteria?: EvaluationCriteria[];
    tags?: string[];
  }>
): TestCase[] {
  const evaluator = createPromptEvaluator();

  return testCases.map((tc) =>
    evaluator.addTestCase({
      name: tc.name,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      criteria: tc.criteria || [PREDEFINED_CRITERIA.accuracy()],
      tags: [...(tc.tags || []), name],
    })
  );
}
