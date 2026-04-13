/**
 * Prompt Engineering - 提示词工程模块
 * 
 * 提供完整的提示词工程解决方案：
 * - Few-Shot 示例管理
 * - 版本控制（Git 风格）
 * - 链式提示（Prompt Chain）
 * - 效果评估与 A/B 测试
 */

// Few-Shot 管理
export {
  FewShotManager,
  createFewShotManager,
  loadPredefinedTemplate,
  PREDEFINED_TEMPLATES,
  type FewShotExample,
  type FewShotConfig,
  type ExampleSelectionResult,
  DEFAULT_FEW_SHOT_CONFIG,
} from "./few-shot-manager.js";

// 版本控制
export {
  PromptVersionControl,
  createPromptVersionControl,
  LocalStorageVersionAdapter,
  type PromptVersion,
  type VersionMetrics,
  type Branch,
  type VersionDiff,
  type VersionControlConfig,
  type VersionStorageAdapter,
  DEFAULT_VC_CONFIG,
} from "./prompt-version-control.js";

// 链式提示
export {
  PromptChainBuilder,
  PromptChainExecutor,
  createPromptChain,
  createChainFromTemplate,
  executePromptChain,
  CHAIN_TEMPLATES,
  type PromptChain,
  type ChainNode,
  type PromptNode,
  type ConditionNode,
  type LoopNode,
  type ParallelNode,
  type TransformNode,
  type ChainContext,
  type ChainExecutionResult,
} from "./prompt-chain.js";

// 效果评估
export {
  PromptEvaluator,
  createPromptEvaluator,
  createTestSuite,
  PREDEFINED_CRITERIA,
  type TestCase,
  type EvaluationCriteria,
  type TestResult,
  type EvaluationReport,
  type ABTestConfig,
  type ABTestResult,
  type EvaluatorConfig,
  DEFAULT_EVALUATOR_CONFIG,
} from "./prompt-evaluator.js";
