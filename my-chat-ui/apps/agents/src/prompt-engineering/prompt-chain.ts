/**
 * Prompt Chain - 链式提示框架
 * 
 * 支持构建复杂的提示词链：
 * - 顺序执行链
 * - 条件分支
 * - 循环处理
 * - 并行执行
 * - 变量传递和上下文管理
 */

import { BaseMessage } from "@langchain/core/messages";

/**
 * 链节点类型
 */
export type ChainNodeType =
  | "prompt"      // 提示词节点
  | "condition"   // 条件分支
  | "loop"        // 循环
  | "parallel"    // 并行
  | "transform"   // 数据转换
  | "output";     // 输出

/**
 * 链执行上下文
 */
export interface ChainContext {
  /** 输入数据 */
  input: string;
  /** 中间变量 */
  variables: Map<string, any>;
  /** 消息历史 */
  messages: BaseMessage[];
  /** 元数据 */
  metadata: Record<string, any>;
  /** 执行路径 */
  executionPath: string[];
}

/**
 * 链节点基类
 */
export interface ChainNode {
  id: string;
  type: ChainNodeType;
  name: string;
  description?: string;
  execute: (context: ChainContext) => Promise<ChainContext>;
  next?: string | string[] | ((context: ChainContext) => string | null);
}

/**
 * 提示词节点
 */
export interface PromptNode extends ChainNode {
  type: "prompt";
  template: string;
  variables?: Record<string, string>;
  outputKey?: string;
  model?: string;
  temperature?: number;
}

/**
 * 条件节点
 */
export interface ConditionNode extends ChainNode {
  type: "condition";
  condition: (context: ChainContext) => boolean | Promise<boolean>;
  trueBranch: string;
  falseBranch: string;
}

/**
 * 循环节点
 */
export interface LoopNode extends ChainNode {
  type: "loop";
  condition: (context: ChainContext) => boolean | Promise<boolean>;
  body: string;
  maxIterations: number;
  iterationKey?: string;
}

/**
 * 并行节点
 */
export interface ParallelNode extends ChainNode {
  type: "parallel";
  branches: string[];
  mergeStrategy: "concat" | "join" | "custom";
  mergeFunction?: (results: any[]) => any;
}

/**
 * 转换节点
 */
export interface TransformNode extends ChainNode {
  type: "transform";
  transform: (context: ChainContext) => Promise<ChainContext> | ChainContext;
}

/**
 * 链定义
 */
export interface PromptChain {
  id: string;
  name: string;
  description?: string;
  nodes: Map<string, ChainNode>;
  startNode: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 链执行结果
 */
export interface ChainExecutionResult {
  success: boolean;
  context: ChainContext;
  output: any;
  executionTime: number;
  nodeCount: number;
  errors?: Array<{ nodeId: string; error: string }>;
}

/**
 * 链构建器
 */
export class PromptChainBuilder {
  private chain: PromptChain;

  constructor(name: string, description?: string) {
    this.chain = {
      id: `chain_${Date.now()}`,
      name,
      description,
      nodes: new Map(),
      startNode: "",
      version: "1.0.0",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * 添加提示词节点
   */
  addPromptNode(
    id: string,
    config: {
      name: string;
      template: string;
      description?: string;
      variables?: Record<string, string>;
      outputKey?: string;
      next?: string;
    }
  ): this {
    const node: PromptNode = {
      id,
      type: "prompt",
      name: config.name,
      description: config.description,
      template: config.template,
      variables: config.variables,
      outputKey: config.outputKey,
      next: config.next,
      execute: async (context) => {
        // 渲染模板
        let prompt = config.template;
        for (const [key, value] of Object.entries(config.variables || {})) {
          prompt = prompt.replace(new RegExp(`{${key}}`, "g"), value);
        }

        // 添加上下文变量
        for (const [key, value] of context.variables) {
          prompt = prompt.replace(new RegExp(`{${key}}`, "g"), String(value));
        }

        // 替换输入变量
        prompt = prompt.replace(/{input}/g, context.input);

        // 这里应该调用 LLM，简化处理
        const output = `[LLM Response to: ${prompt.slice(0, 100)}...]`;

        if (config.outputKey) {
          context.variables.set(config.outputKey, output);
        }

        context.executionPath.push(id);
        return context;
      },
    };

    this.chain.nodes.set(id, node);
    return this;
  }

  /**
   * 添加条件节点
   */
  addConditionNode(
    id: string,
    config: {
      name: string;
      description?: string;
      condition: (ctx: ChainContext) => boolean | Promise<boolean>;
      trueBranch: string;
      falseBranch: string;
    }
  ): this {
    const node: ConditionNode = {
      id,
      type: "condition",
      name: config.name,
      description: config.description,
      condition: config.condition,
      trueBranch: config.trueBranch,
      falseBranch: config.falseBranch,
      execute: async (context) => {
        context.executionPath.push(id);
        return context;
      },
      next: (_context) => {
        // 实际执行在 executor 中处理
        return null;
      },
    };

    this.chain.nodes.set(id, node);
    return this;
  }

  /**
   * 添加循环节点
   */
  addLoopNode(
    id: string,
    config: {
      name: string;
      description?: string;
      condition: (ctx: ChainContext) => boolean | Promise<boolean>;
      body: string;
      maxIterations?: number;
      iterationKey?: string;
    }
  ): this {
    const node: LoopNode = {
      id,
      type: "loop",
      name: config.name,
      description: config.description,
      condition: config.condition,
      body: config.body,
      maxIterations: config.maxIterations || 10,
      iterationKey: config.iterationKey || `${id}_iteration`,
      execute: async (context) => {
        context.executionPath.push(id);
        return context;
      },
    };

    this.chain.nodes.set(id, node);
    return this;
  }

  /**
   * 添加并行节点
   */
  addParallelNode(
    id: string,
    config: {
      name: string;
      description?: string;
      branches: string[];
      mergeStrategy?: "concat" | "join" | "custom";
      mergeFunction?: (results: any[]) => any;
      next?: string;
    }
  ): this {
    const node: ParallelNode = {
      id,
      type: "parallel",
      name: config.name,
      description: config.description,
      branches: config.branches,
      mergeStrategy: config.mergeStrategy || "concat",
      mergeFunction: config.mergeFunction,
      next: config.next,
      execute: async (context) => {
        context.executionPath.push(id);
        return context;
      },
    };

    this.chain.nodes.set(id, node);
    return this;
  }

  /**
   * 添加转换节点
   */
  addTransformNode(
    id: string,
    config: {
      name: string;
      description?: string;
      transform: (ctx: ChainContext) => Promise<ChainContext> | ChainContext;
      next?: string;
    }
  ): this {
    const node: TransformNode = {
      id,
      type: "transform",
      name: config.name,
      description: config.description,
      transform: config.transform,
      next: config.next,
      execute: async (context) => config.transform(context),
    };

    this.chain.nodes.set(id, node);
    return this;
  }

  /**
   * 设置起始节点
   */
  setStartNode(id: string): this {
    this.chain.startNode = id;
    return this;
  }

  /**
   * 构建链
   */
  build(): PromptChain {
    if (!this.chain.startNode) {
      throw new Error("Start node must be set");
    }
    
    this.chain.updatedAt = Date.now();
    return { ...this.chain };
  }
}

/**
 * 链执行器
 */
export class PromptChainExecutor {
  private visitedNodes: Set<string> = new Set();
  private errors: Array<{ nodeId: string; error: string }> = [];

  /**
   * 执行链
   */
  async execute(
    chain: PromptChain,
    input: string,
    initialContext?: Partial<ChainContext>
  ): Promise<ChainExecutionResult> {
    const startTime = Date.now();
    this.visitedNodes.clear();
    this.errors = [];

    let context: ChainContext = {
      input,
      variables: new Map(initialContext?.variables || []),
      messages: initialContext?.messages || [],
      metadata: initialContext?.metadata || {},
      executionPath: [],
    };

    try {
      context = await this.executeNode(chain, chain.startNode, context);

      return {
        success: this.errors.length === 0,
        context,
        output: context.variables.get("output") || context.input,
        executionTime: Date.now() - startTime,
        nodeCount: this.visitedNodes.size,
        errors: this.errors.length > 0 ? this.errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        context,
        output: null,
        executionTime: Date.now() - startTime,
        nodeCount: this.visitedNodes.size,
        errors: [
          ...this.errors,
          { nodeId: "executor", error: (error as Error).message },
        ],
      };
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    chain: PromptChain,
    nodeId: string,
    context: ChainContext
  ): Promise<ChainContext> {
    if (this.visitedNodes.has(nodeId)) {
      return context; // 防止循环
    }

    const node = chain.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node '${nodeId}' not found`);
    }

    this.visitedNodes.add(nodeId);

    try {
      // 执行节点
      context = await node.execute(context);

      // 确定下一个节点
      let nextNodeId: string | null = null;

      if (node.type === "condition") {
        const conditionNode = node as ConditionNode;
        const result = await conditionNode.condition(context);
        nextNodeId = result ? conditionNode.trueBranch : conditionNode.falseBranch;
      } else if (node.type === "loop") {
        const loopNode = node as LoopNode;
        const iteration = (context.variables.get(loopNode.iterationKey!) || 0) as number;
        
        if (iteration < loopNode.maxIterations) {
          const shouldContinue = await loopNode.condition(context);
          if (shouldContinue) {
            context.variables.set(loopNode.iterationKey!, iteration + 1);
            // 先执行 body，然后回到循环节点
            context = await this.executeNode(chain, loopNode.body, context);
            nextNodeId = nodeId; // 回到循环节点
          }
        }
      } else if (node.type === "parallel") {
        const parallelNode = node as ParallelNode;
        const results: any[] = [];

        // 并行执行所有分支
        await Promise.all(
          parallelNode.branches.map(async (branchId) => {
            const branchContext = await this.executeNode(chain, branchId, { ...context });
            results.push(branchContext.variables.get("output"));
          })
        );

        // 合并结果
        let merged: any;
        switch (parallelNode.mergeStrategy) {
          case "join":
            merged = results.join("\n");
            break;
          case "custom":
            merged = parallelNode.mergeFunction
              ? parallelNode.mergeFunction(results)
              : results;
            break;
          case "concat":
          default:
            merged = results;
        }

        context.variables.set("parallel_results", merged);
        nextNodeId = typeof node.next === "string" ? node.next : null;
      } else {
        // 普通节点
        if (typeof node.next === "function") {
          nextNodeId = node.next(context);
        } else if (typeof node.next === "string") {
          nextNodeId = node.next;
        }
      }

      // 继续执行下一个节点
      if (nextNodeId && chain.nodes.has(nextNodeId)) {
        return this.executeNode(chain, nextNodeId, context);
      }

      return context;
    } catch (error) {
      this.errors.push({
        nodeId,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

/**
 * 预定义链模板
 */
export const CHAIN_TEMPLATES: Record<string, (builder: PromptChainBuilder) => PromptChainBuilder> = {
  // 分类链：先理解，再分类
  "classification": (builder) =>
    builder
      .addPromptNode("understand", {
        name: "理解输入",
        template: "请理解以下内容的含义：{input}",
        outputKey: "understanding",
        next: "classify",
      })
      .addPromptNode("classify", {
        name: "分类",
        template: "基于理解：{understanding}\n请将以下内容分类：{input}",
        outputKey: "category",
      })
      .setStartNode("understand"),

  // 检索-生成链：先检索，再生成
  "retrieval-generation": (builder) =>
    builder
      .addPromptNode("retrieve", {
        name: "检索信息",
        template: "搜索相关信息：{input}",
        outputKey: "retrieved_info",
        next: "generate",
      })
      .addPromptNode("generate", {
        name: "生成回答",
        template: "基于检索到的信息：{retrieved_info}\n回答问题：{input}",
        outputKey: "answer",
      })
      .setStartNode("retrieve"),

  // 审查链：生成后审查
  "review": (builder) =>
    builder
      .addPromptNode("generate", {
        name: "生成内容",
        template: "请生成以下内容：{input}",
        outputKey: "draft",
        next: "review",
      })
      .addConditionNode("review", {
        name: "审查内容",
        condition: (ctx) => ctx.variables.get("draft")?.length > 100,
        trueBranch: "improve",
        falseBranch: "output",
      })
      .addPromptNode("improve", {
        name: "改进内容",
        template: "请改进以下内容：{draft}",
        outputKey: "output",
      })
      .addTransformNode("output", {
        name: "输出",
        transform: (ctx) => {
          if (!ctx.variables.has("output")) {
            ctx.variables.set("output", ctx.variables.get("draft"));
          }
          return ctx;
        },
      })
      .setStartNode("generate"),

  // 多步骤推理链
  "multi-step-reasoning": (builder) =>
    builder
      .addPromptNode("analyze", {
        name: "分析问题",
        template: "请分析以下问题：{input}",
        outputKey: "analysis",
        next: "plan",
      })
      .addPromptNode("plan", {
        name: "制定计划",
        template: "基于分析：{analysis}\n请制定解决计划",
        outputKey: "plan",
        next: "execute",
      })
      .addLoopNode("execute", {
        name: "执行步骤",
        condition: (ctx) => {
          const step = (ctx.variables.get("current_step") || 0) as number;
          const plan = ctx.variables.get("plan") as string[];
          return step < (plan?.length || 0);
        },
        body: "step_execution",
        maxIterations: 10,
      })
      .addPromptNode("step_execution", {
        name: "执行单步",
        template: "执行当前步骤",
        outputKey: "step_result",
      })
      .addPromptNode("summarize", {
        name: "总结结果",
        template: "总结所有执行结果",
        outputKey: "final_answer",
      })
      .setStartNode("analyze"),
};

/**
 * 使用模板创建链
 */
export function createChainFromTemplate(
  templateName: string,
  chainName: string,
  description?: string
): PromptChain {
  const template = CHAIN_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Template '${templateName}' not found`);
  }

  const builder = new PromptChainBuilder(chainName, description);
  return template(builder).build();
}

/**
 * 创建链构建器
 */
export function createPromptChain(name: string, description?: string): PromptChainBuilder {
  return new PromptChainBuilder(name, description);
}

/**
 * 执行链的便捷函数
 */
export async function executePromptChain(
  chain: PromptChain,
  input: string,
  context?: Partial<ChainContext>
): Promise<ChainExecutionResult> {
  const executor = new PromptChainExecutor();
  return executor.execute(chain, input, context);
}
