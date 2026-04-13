/**
 * Skills HTTP API Routes
 * 提供RESTful接口供前端管理Skills
 */

import { IncomingMessage, ServerResponse } from "http";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skill 存储目录
const SKILLS_DIR = path.join(__dirname, "../skills");
const REGISTRY_FILE = path.join(SKILLS_DIR, "registry.json");

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 确保目录存在
async function ensureDirectory() {
  try {
    await fs.access(SKILLS_DIR);
  } catch {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  }
}

// 读取注册表
async function readRegistry(): Promise<Record<string, any>> {
  try {
    const data = await fs.readFile(REGISTRY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { version: 1, skills: {} };
  }
}

// 写入注册表
async function writeRegistry(registry: Record<string, any>) {
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// 读取 skill 的 metadata
async function readSkillMetadata(skillId: string): Promise<any | null> {
  try {
    const metadataPath = path.join(SKILLS_DIR, skillId, "metadata.json");
    const data = await fs.readFile(metadataPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// 自动发现所有 skills（扫描目录）
async function discoverSkills(): Promise<string[]> {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // 检查是否有 metadata.json 或 index.ts
        const hasMetadata = await fs.access(path.join(SKILLS_DIR, entry.name, "metadata.json"))
          .then(() => true).catch(() => false);
        const hasCode = await fs.access(path.join(SKILLS_DIR, entry.name, "index.ts"))
          .then(() => true).catch(() => false);

        if (hasMetadata || hasCode) {
          skills.push(entry.name);
        }
      }
    }

    return skills;
  } catch {
    return [];
  }
}

// 解析请求体
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// 发送响应
function sendResponse(
  res: ServerResponse,
  statusCode: number,
  data: any
) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...corsHeaders,
  });
  res.end(JSON.stringify(data));
}

// 处理 CORS 预检
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }
  return false;
}

// GET /api/skills - 获取所有 skills 或单个 skill
export async function getSkills(_req: IncomingMessage, res: ServerResponse, skillId?: string) {
  try {
    await ensureDirectory();

    // 如果提供了 skillId，返回单个 skill 的详细信息（包括代码）
    if (skillId) {
      const skillDir = path.join(SKILLS_DIR, skillId);
      const metadata = await readSkillMetadata(skillId);

      if (!metadata) {
        sendResponse(res, 404, { success: false, error: `Skill "${skillId}" not found` });
        return;
      }

      // 读取代码文件
      let code = "";
      try {
        code = await fs.readFile(path.join(skillDir, "index.ts"), "utf-8");
      } catch {
        // 尝试读取 .js 文件
        try {
          code = await fs.readFile(path.join(skillDir, "index.js"), "utf-8");
        } catch {
          code = "// 代码文件不存在";
        }
      }

      const registry = await readRegistry();
      const reg = registry.skills?.[skillId] || { enabled: false, config: {} };

      sendResponse(res, 200, {
        success: true,
        skill: {
          id: skillId,
          ...reg,
          metadata,
          code,
        },
      });
      return;
    }

    // 否则返回所有 skills
    const registry = await readRegistry();

    // 自动发现所有 skills（包括未注册的）
    const discoveredDirs = await discoverSkills();

    // 构建从实际 skill id 到目录名的映射
    const skillIdToDirMap = new Map<string, string>();
    // 也构建从目录名到实际 skill id 的映射
    const dirToSkillIdMap = new Map<string, string>();
    for (const dirName of discoveredDirs) {
      const metadata = await readSkillMetadata(dirName);
      const actualId = metadata?.id || dirName;
      skillIdToDirMap.set(actualId, dirName);
      dirToSkillIdMap.set(dirName, actualId);
    }

    // 处理 registry 中的条目：如果 path 对应的目录有不同的 metadata.id，使用 metadata.id
    const registrySkillIds = new Set<string>();
    for (const [registryId, regEntry] of Object.entries(registry.skills || {})) {
      const entry = regEntry as any;
      // 从 path 提取目录名（如 "./scheduler" -> "scheduler"）
      const dirName = entry?.path?.replace(/^\.\//, '') || registryId;
      // 如果该目录有 metadata 且 id 不同，使用 metadata.id
      const actualId = dirToSkillIdMap.get(dirName) || registryId;
      registrySkillIds.add(actualId);
    }

    // 合并 registry 中的 skills 和发现的 skills（都使用实际 id）
    const allSkillIds = new Set([
      ...registrySkillIds,
      ...skillIdToDirMap.keys(),
    ]);

    // 读取每个 skill 的详细信息
    const skills = await Promise.all(
      Array.from(allSkillIds).map(async (actualId) => {
        const dirName = skillIdToDirMap.get(actualId);
        const metadata = dirName ? await readSkillMetadata(dirName) : null;

        // 通过实际 id 查找 registry 条目，或者通过目录名查找
        let reg = registry.skills?.[actualId];
        // 如果没找到，检查是否有 registry 条目指向该目录
        if (!reg && dirName) {
          for (const [, e] of Object.entries(registry.skills || {})) {
            const entry = e as any;
            if (entry?.path === `./${dirName}`) {
              reg = entry;
              break;
            }
          }
        }
        reg = reg || { enabled: false, config: {} };

        // 如果目录存在但没有注册（使用实际 id 或通过 path 都找不到），自动添加到注册表
        const existsInRegistry = registry.skills?.[actualId] || (dirName && Object.values(registry.skills || {}).some((e: any) => e?.path === `./${dirName}`));
        if (!existsInRegistry && dirName) {
          registry.skills[actualId] = {
            id: actualId,
            path: `./${dirName}`,
            enabled: true, // 自动发现的默认启用
            config: {},
          };
          console.log(`[Skills API] Auto-discovered skill: ${actualId} (from dir: ${dirName})`);
          // 异步保存注册表（不等待）
          writeRegistry(registry).catch(console.error);
        }

        // 标准化 metadata 格式
        let normalizedMetadata = metadata;
        if (metadata) {
          // 转换 config 对象格式为数组格式（如果必要）
          let configArray = metadata.config;
          if (configArray && typeof configArray === 'object' && !Array.isArray(configArray)) {
            configArray = Object.entries(configArray).map(([name, value]: [string, any]) => ({
              name,
              ...value
            }));
          }
          normalizedMetadata = {
            ...metadata,
            config: configArray || [],
            tools: metadata.tools || [],
            tags: metadata.tags || [],
          };
        }

        return {
          id: actualId,
          ...reg,
          enabled: registry.skills?.[actualId]?.enabled ?? true,
          metadata: normalizedMetadata || {
            id: actualId,
            name: actualId,
            version: "1.0.0",
            description: "暂无描述",
            author: "unknown",
            type: "custom",
            tags: [],
            config: [],
            tools: [],
          },
        };
      })
    );

    sendResponse(res, 200, { success: true, skills });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// POST /api/skills - 创建新 skill
export async function createSkill(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureDirectory();
    const body = await parseBody(req);
    const { id, name, description, type = "custom", config = {}, code } = body;

    if (!id || !name) {
      sendResponse(res, 400, { success: false, error: "Missing required fields: id, name" });
      return;
    }

    const skillDir = path.join(SKILLS_DIR, id);
    await fs.mkdir(skillDir, { recursive: true });

    // 创建 metadata.json
    const metadata = {
      id,
      name,
      version: "1.0.0",
      description: description || "",
      author: "user",
      type,
      tags: body.tags || [],
      config: config.config || [],
      tools: config.tools || [],
    };

    await fs.writeFile(
      path.join(skillDir, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

    // 创建 index.ts（如果提供了代码）
    if (code) {
      await fs.writeFile(path.join(skillDir, "index.ts"), code);
    } else {
      // 创建默认的 skill 模板
      const template = generateSkillTemplate(id, name, description);
      await fs.writeFile(path.join(skillDir, "index.ts"), template);
    }

    // 更新注册表
    const registry = await readRegistry();
    registry.skills[id] = {
      id,
      path: `./${id}`,
      enabled: false,
      config: {},
    };
    await writeRegistry(registry);

    sendResponse(res, 201, {
      success: true,
      message: `Skill "${name}" created successfully`,
      skillId: id,
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// DELETE /api/skills?id=xxx - 删除 skill
export async function deleteSkill(_req: IncomingMessage, res: ServerResponse, skillId: string) {
  try {
    if (!skillId) {
      sendResponse(res, 400, { success: false, error: "Missing skill id" });
      return;
    }

    // 删除 skill 目录
    const skillDir = path.join(SKILLS_DIR, skillId);
    try {
      await fs.rm(skillDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[Skills API] Failed to delete directory: ${error}`);
    }

    // 更新注册表
    const registry = await readRegistry();
    delete registry.skills[skillId];
    await writeRegistry(registry);

    sendResponse(res, 200, {
      success: true,
      message: `Skill "${skillId}" deleted successfully`,
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// PATCH /api/skills - 更新 skill 状态、配置、代码或元数据
export async function updateSkill(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody(req);
    const { id, enabled, config, code, metadata } = body;

    if (!id) {
      sendResponse(res, 400, { success: false, error: "Missing skill id" });
      return;
    }

    const registry = await readRegistry();
    const skillExists = !!registry.skills[id];
    const skillDir = path.join(SKILLS_DIR, id);

    // 更新启用状态
    if (enabled !== undefined && skillExists) {
      registry.skills[id].enabled = enabled;
    }

    // 更新配置
    if (config !== undefined && skillExists) {
      registry.skills[id].config = { ...registry.skills[id].config, ...config };
    }

    // 更新代码
    if (code !== undefined) {
      await fs.writeFile(path.join(skillDir, "index.ts"), code);
    }

    // 更新元数据
    if (metadata !== undefined) {
      await fs.writeFile(
        path.join(skillDir, "metadata.json"),
        JSON.stringify(metadata, null, 2)
      );
    }

    // 保存注册表
    if (skillExists) {
      await writeRegistry(registry);
    }

    sendResponse(res, 200, {
      success: true,
      message: `Skill "${id}" updated successfully`,
      skill: registry.skills[id],
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// POST /api/skills/upload - 上传 skill 文件
export async function uploadSkill(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureDirectory();

    // 简化的文件上传处理
    const body = await parseBody(req);
    const { skillId, filename, content, metadata: metadataStr } = body;

    if (!content) {
      sendResponse(res, 400, { success: false, error: "No content provided" });
      return;
    }

    // 生成 skill ID
    const id = skillId || filename?.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "-") || "unnamed-skill";
    const skillDir = path.join(SKILLS_DIR, id);

    // 检查是否已存在
    try {
      await fs.access(skillDir);
      sendResponse(res, 409, { success: false, error: `Skill "${id}" already exists` });
      return;
    } catch {
      // 目录不存在，继续创建
    }

    await fs.mkdir(skillDir, { recursive: true });

    // 根据文件类型处理
    let metadata: any;
    if (filename?.endsWith(".json")) {
      // 上传的是 metadata.json
      metadata = JSON.parse(content);
      await fs.writeFile(path.join(skillDir, "metadata.json"), content);

      // 创建默认的 index.ts
      const template = generateSkillTemplate(id, metadata.name, metadata.description);
      await fs.writeFile(path.join(skillDir, "index.ts"), template);
    } else {
      // 上传的是代码文件
      await fs.writeFile(path.join(skillDir, "index.ts"), content);

      // 尝试从 metadataStr 解析，或使用默认
      if (metadataStr) {
        metadata = JSON.parse(metadataStr);
      } else {
        metadata = {
          id,
          name: id,
          version: "1.0.0",
          description: "Uploaded skill",
          author: "user",
          type: "custom",
          tags: [],
          config: [],
          tools: [],
        };
      }
      await fs.writeFile(path.join(skillDir, "metadata.json"), JSON.stringify(metadata, null, 2));
    }

    // 更新注册表
    const registry = await readRegistry();
    registry.skills[id] = {
      id,
      path: `./${id}`,
      enabled: false,
      config: {},
    };
    await writeRegistry(registry);

    sendResponse(res, 201, {
      success: true,
      message: `Skill "${id}" uploaded successfully`,
      skillId: id,
      metadata,
    });
  } catch (error) {
    console.error("[Skills API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// ModelScope 魔塔社区 API 配置
const MODELSCOPE_API_BASE = "https://www.modelscope.cn/api/v1";

// GET /api/skills/remote - 从魔塔社区获取可用的远程 Skills
export async function getRemoteSkills(_req: IncomingMessage, res: ServerResponse) {
  try {
    let remoteSkills: any[] = [];

    // 尝试从魔塔社区获取
    try {
      // 搜索与 agent/skill/tool 相关的数据集
      const searchKeywords = ["agent", "skill", "tool", "mcp"];
      const modelscopeSkills: any[] = [];

      for (const keyword of searchKeywords) {
        try {
          const response = await fetch(
            `${MODELSCOPE_API_BASE}/datasets?Search=${keyword}&PageSize=20`,
            { headers: { "Accept": "application/json" } }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.Data?.List) {
              modelscopeSkills.push(...data.Data.List.map((item: any) => ({
                id: `modelscope-${item.Namespace}-${item.Name}`,
                name: item.ChineseName || item.Name,
                description: item.Description || item.Name,
                version: item.Tags?.find((t: string) => t.match(/^v?\d+\.\d+/)) || "1.0.0",
                author: item.Namespace,
                url: `https://modelscope.cn/datasets/${item.Namespace}/${item.Name}`,
                tags: [...(item.Tags || []), "魔塔社区"],
                source: "modelscope",
                downloads: item.Downloads,
                updatedAt: item.LastModified,
              })));
            }
          }
        } catch (e) {
          console.warn(`[Skills Remote] Failed to fetch from ModelScope for keyword "${keyword}":`, e);
        }
      }

      // 去重
      const seen = new Set();
      remoteSkills = modelscopeSkills.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      console.log(`[Skills Remote] Fetched ${remoteSkills.length} skills from ModelScope`);
    } catch (error) {
      console.warn("[Skills Remote] Failed to fetch from ModelScope, using fallback:", error);
    }

    // 如果魔塔社区获取失败或为空，使用备用数据
    if (remoteSkills.length === 0) {
      remoteSkills = [
        {
          id: "calculator",
          name: "计算器",
          description: "提供数学计算功能，支持基本运算和科学计算",
          version: "1.0.0",
          author: "system",
          url: "https://modelscope.cn/datasets",
          tags: ["数学", "工具"],
          source: "builtin",
        },
        {
          id: "translator",
          name: "翻译助手",
          description: "多语言翻译功能，支持文本翻译和语言检测",
          version: "1.0.0",
          author: "system",
          url: "https://modelscope.cn/datasets",
          tags: ["语言", "翻译"],
          source: "builtin",
        },
        {
          id: "datetime",
          name: "日期时间",
          description: "获取当前时间、日期计算、时区转换等功能",
          version: "1.0.0",
          author: "system",
          url: "https://modelscope.cn/datasets",
          tags: ["时间", "工具"],
          source: "builtin",
        },
      ];
    }

    // 检查哪些已安装
    const registry = await readRegistry();
    const skillsWithStatus = remoteSkills.map((s: any) => ({
      ...s,
      installed: !!registry.skills[s.id],
      enabled: registry.skills[s.id]?.enabled || false,
    }));

    sendResponse(res, 200, {
      success: true,
      skills: skillsWithStatus,
      source: "modelscope",
      total: skillsWithStatus.length,
    });
  } catch (error) {
    console.error("[Skills Remote API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// POST /api/skills/remote - 下载并安装远程 Skill
export async function downloadRemoteSkill(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureDirectory();

    const body = await parseBody(req);
    const { skillId, skillInfo: providedSkillInfo } = body;

    if (!skillId) {
      sendResponse(res, 400, { success: false, error: "Missing skillId" });
      return;
    }

    let skillInfo: any;

    // 如果前端提供了完整的 skill 信息，直接使用
    if (providedSkillInfo) {
      skillInfo = providedSkillInfo;
    } else {
      // 内置的 Skill 源列表
      const builtinSkills: Record<string, any> = {
        calculator: {
          id: "calculator",
          name: "计算器",
          description: "提供数学计算功能",
          version: "1.0.0",
          author: "system",
          tags: ["数学", "工具"],
        },
        translator: {
          id: "translator",
          name: "翻译助手",
          description: "多语言翻译功能",
          version: "1.0.0",
          author: "system",
          tags: ["语言", "翻译"],
        },
        datetime: {
          id: "datetime",
          name: "日期时间",
          description: "获取当前时间、日期计算",
          version: "1.0.0",
          author: "system",
          tags: ["时间", "工具"],
        },
      };

      skillInfo = builtinSkills[skillId];
    }

    if (!skillInfo) {
      sendResponse(res, 404, { success: false, error: `Skill "${skillId}" not found` });
      return;
    }

    // 生成安全的目录名
    const safeSkillId = skillId.replace(/[^a-zA-Z0-9-_]/g, "-");

    // 检查是否已安装
    const skillDir = path.join(SKILLS_DIR, safeSkillId);
    try {
      await fs.access(skillDir);
      sendResponse(res, 409, { success: false, error: `Skill "${skillId}" already installed` });
      return;
    } catch {
      // 未安装，继续
    }

    // 创建目录
    await fs.mkdir(skillDir, { recursive: true });

    // 创建 metadata
    const metadata = {
      id: safeSkillId,
      name: skillInfo.name,
      version: skillInfo.version,
      description: skillInfo.description,
      author: skillInfo.author,
      type: "custom",
      tags: skillInfo.tags || [],
      config: [],
      tools: [
        {
          id: "main_tool",
          name: skillInfo.name,
          description: skillInfo.description,
          examples: ["示例用法"],
        },
      ],
      source: skillInfo.source || "remote",
      originalUrl: skillInfo.url,
    };

    await fs.writeFile(
      path.join(skillDir, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

    // 生成默认代码
    const code = generateRemoteSkillCode(skillInfo);
    await fs.writeFile(path.join(skillDir, "index.ts"), code);

    // 更新注册表
    const registry = await readRegistry();
    registry.skills[safeSkillId] = {
      id: safeSkillId,
      path: `./${safeSkillId}`,
      enabled: false,
      config: {},
    };
    await writeRegistry(registry);

    sendResponse(res, 201, {
      success: true,
      message: `Skill "${skillInfo.name}" downloaded and installed successfully`,
      skillId: safeSkillId,
      metadata,
    });
  } catch (error) {
    console.error("[Skills Remote API] Error:", error);
    sendResponse(res, 500, { success: false, error: String(error) });
  }
}

// 生成 Skill 模板代码
function generateSkillTemplate(id: string, name: string, description?: string): string {
  return `/**
 * ${name} Skill
 * ${description || ""}
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Skill, SkillMetadata } from "../types.js";

export const metadata: SkillMetadata = {
  id: "${id}",
  name: "${name}",
  version: "1.0.0",
  description: "${description || ""}",
  author: "user",
  type: "custom",
  tags: [],
  config: [],
  tools: [
    {
      id: "example_tool",
      name: "示例工具",
      description: "这是一个示例工具",
      examples: ["示例用法"],
    },
  ],
};

export async function create${toPascalCase(id)}Skill(config?: Record<string, any>): Promise<Skill> {
  console.log("[${id}] Creating skill with config:", config);

  const tools = [
    tool(
      async ({ input }) => {
        // TODO: 实现工具逻辑
        return \`处理结果: \${input}\`;
      },
      {
        name: "${id}_tool",
        description: "${description || "工具描述"}",
        schema: z.object({
          input: z.string().describe("输入内容"),
        }),
      }
    ),
  ];

  return {
    metadata,
    tools,
    enabled: true,
    config: config || {},

    initialize: async () => {
      console.log("[${id}] Initializing...");
      return true;
    },

    destroy: async () => {
      console.log("[${id}] Destroyed");
    },
  };
}
`;
}

function generateRemoteSkillCode(skillInfo: any): string {
  return `/**
 * ${skillInfo.name} Skill
 * ${skillInfo.description}
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Skill, SkillMetadata } from "../types.js";

export const metadata: SkillMetadata = {
  id: "${skillInfo.id}",
  name: "${skillInfo.name}",
  version: "${skillInfo.version}",
  description: "${skillInfo.description}",
  author: "${skillInfo.author}",
  type: "custom",
  tags: ${JSON.stringify(skillInfo.tags)},
  config: [],
  tools: [
    {
      id: "main_tool",
      name: "${skillInfo.name}",
      description: "${skillInfo.description}",
      examples: ["示例用法"],
    },
  ],
};

export async function create${toPascalCase(skillInfo.id)}Skill(config?: Record<string, any>): Promise<Skill> {
  console.log("[${skillInfo.id}] Creating skill with config:", config);

  const tools = [
    tool(
      async ({ input }) => {
        // TODO: 实现具体的工具逻辑
        return \`${skillInfo.name} 处理结果: \${input}\`;
      },
      {
        name: "${skillInfo.id}_tool",
        description: "${skillInfo.description}",
        schema: z.object({
          input: z.string().describe("输入内容"),
        }),
      }
    ),
  ];

  return {
    metadata,
    tools,
    enabled: true,
    config: config || {},

    initialize: async () => {
      console.log("[${skillInfo.id}] Initializing...");
      return true;
    },

    destroy: async () => {
      console.log("[${skillInfo.id}] Destroyed");
    },
  };
}
`;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/\s/g, "");
}
