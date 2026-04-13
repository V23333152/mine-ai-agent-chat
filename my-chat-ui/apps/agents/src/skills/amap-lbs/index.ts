/**
 * 高德地图 Skill
 * 提供地图搜索、路线规划、地理编码等功能
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Skill, SkillMetadata } from "../types.js";

// 高德API响应类型
interface AmapResponse<T = any> {
  status: string;
  info: string;
  count?: string;
  pois?: T[];
  route?: any;
  geocodes?: Array<{
    formatted_address: string;
    location: string;
  }>;
}

interface POIItem {
  id: string;
  name: string;
  type: string;
  address: string;
  location: string;
  tel?: string;
  distance?: string;
}

// Skill 元数据
export const amapSkillMetadata: SkillMetadata = {
  id: "amap-lbs",
  name: "高德地图",
  version: "1.0.0",
  description: "提供地图搜索、路线规划、地理编码等功能，支持查找地点、规划出行路线、搜索周边服务等",
  author: "system",
  type: "native",
  tags: ["地图", "导航", "位置服务"],
  config: [
    {
      name: "apiKey",
      type: "string",
      required: true,
      description: "高德地图 Web服务 Key",
      env: "AMAP_WEBSERVICE_KEY",
    },
    {
      name: "defaultCity",
      type: "string",
      required: false,
      description: "默认搜索城市",
      default: "北京",
    },
  ],
  tools: [
    {
      id: "search_poi",
      name: "搜索地点",
      description: "搜索兴趣点(POI)，如餐厅、酒店、景点、商场等",
      examples: ["搜索附近的火锅店", "查找北京故宫博物院地址"],
    },
    {
      id: "nearby_search",
      name: "附近搜索",
      description: "搜索指定位置周边的POI",
      examples: ["搜索我附近的加油站", "查找天安门附近的餐厅"],
    },
    {
      id: "route_planning",
      name: "路线规划",
      description: "规划驾车、步行、公交、骑行路线",
      examples: ["从北京南站到天安门怎么走", "规划去上海外滩的路线"],
    },
    {
      id: "geocode",
      name: "地理编码",
      description: "将地址转换为经纬度坐标",
      examples: ["获取北京市朝阳区的坐标"],
    },
  ],
};

// 创建高德地图 Skill
export async function createAmapSkill(config?: Record<string, any>): Promise<Skill> {
  const apiKey = config?.apiKey || process.env.AMAP_WEBSERVICE_KEY || process.env.AMAP_KEY;

  if (!apiKey) {
    throw new Error("高德地图 API Key 未配置，请设置 AMAP_WEBSERVICE_KEY 环境变量或在配置中提供");
  }

  const defaultCity = config?.defaultCity || "北京";

  // 创建工具
  const tools = [
    createSearchPOITool(apiKey, defaultCity),
    createNearbySearchTool(apiKey),
    createRoutePlanningTool(apiKey),
    createGeocodeTool(apiKey),
  ];

  return {
    metadata: amapSkillMetadata,
    tools,
    enabled: true,
    config: { apiKey, defaultCity },

    initialize: async (_config: Record<string, any>) => {
      console.log("[AmapSkill] Initializing...");
      // 验证 API Key 有效性
      try {
        const testUrl = `https://restapi.amap.com/v3/config/district?key=${apiKey}&keywords=北京&subdistrict=0`;
        const response = await fetch(testUrl);
        const data = await response.json();
        if (data.status === "1") {
          console.log("[AmapSkill] API Key validation passed");
          return true;
        } else {
          console.error("[AmapSkill] API Key validation failed:", data.info);
          return false;
        }
      } catch (error) {
        console.error("[AmapSkill] Failed to validate API Key:", error);
        return false;
      }
    },

    destroy: async () => {
      console.log("[AmapSkill] Destroyed");
    },
  };
}

// 搜索POI工具
function createSearchPOITool(apiKey: string, defaultCity: string) {
  return tool(
    async ({ keywords, city, page, offset }) => {
      try {
        const targetCity = city || defaultCity;
        const url = new URL("https://restapi.amap.com/v5/place/text");
        url.searchParams.append("key", apiKey);
        url.searchParams.append("keywords", keywords);
        url.searchParams.append("region", targetCity);
        url.searchParams.append("page", String(page));
        url.searchParams.append("offset", String(offset));
        url.searchParams.append("city_limit", "true");

        const response = await fetch(url.toString());
        const result: AmapResponse<POIItem> = await response.json();

        if (result.status === "1" && result.pois) {
          const pois = result.pois.map((poi) => ({
            名称: poi.name,
            地址: poi.address,
            类型: poi.type,
            电话: poi.tel || "无",
            坐标: poi.location,
          }));

          return JSON.stringify({
            success: true,
            city: targetCity,
            total: result.count,
            results: pois,
          }, null, 2);
        } else {
          return JSON.stringify({
            success: false,
            message: result.info || "搜索失败",
          });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "amap_search_poi",
      description: `搜索地点/POI（兴趣点），如餐厅、酒店、景点、商场等。

使用场景：
- 用户想查找某个地点，如"搜索附近的火锅店"
- 用户想找特定类型的场所，如"查找北京的博物馆"
- 用户需要某个地点的详细信息，如"故宫博物院在哪里"

参数说明：
- keywords: 搜索关键词，如"火锅博物馆"等
- city: 城市名称，如"北京"上海"，不传则使用默认城市
- page: 页码，默认1
- offset: 每页数量，默认10`,
      schema: z.object({
        keywords: z.string().describe("搜索关键词，如\"火锅\"\"博物馆\"等"),
        city: z.string().optional().describe("城市名称，如\"北京\"上海\""),
        page: z.number().default(1).describe("页码"),
        offset: z.number().default(10).describe("每页数量"),
      }),
    }
  );
}

// 附近搜索工具
function createNearbySearchTool(apiKey: string) {
  return tool(
    async ({ keywords, location, radius, page, offset }) => {
      try {
        const url = new URL("https://restapi.amap.com/v5/place/around");
        url.searchParams.append("key", apiKey);
        url.searchParams.append("keywords", keywords);
        url.searchParams.append("location", location);
        url.searchParams.append("radius", String(radius));
        url.searchParams.append("page", String(page));
        url.searchParams.append("offset", String(offset));

        const response = await fetch(url.toString());
        const result: AmapResponse<POIItem> = await response.json();

        if (result.status === "1" && result.pois) {
          const pois = result.pois.map((poi) => ({
            名称: poi.name,
            地址: poi.address,
            距离: poi.distance ? `${poi.distance}米` : "未知",
            类型: poi.type,
            电话: poi.tel || "无",
            坐标: poi.location,
          }));

          return JSON.stringify({
            success: true,
            location,
            radius: `${radius}米`,
            total: result.count,
            results: pois,
          }, null, 2);
        } else {
          return JSON.stringify({
            success: false,
            message: result.info || "搜索失败",
          });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "amap_nearby_search",
      description: `搜索指定位置周边的POI。

使用场景：
- 用户想找附近的设施，如"搜索我附近的加油站"
- 用户想找某个地点周边的服务，如"天安门附近有什么餐厅"

参数说明：
- keywords: 搜索关键词，如\"餐厅\"加油站\"等
- location: 中心点坐标，格式为\"经度,纬度\"，如\"116.397428,39.90923\"
- radius: 搜索半径（米），默认3000
- page: 页码，默认1
- offset: 每页数量，默认10`,
      schema: z.object({
        keywords: z.string().describe("搜索关键词"),
        location: z.string().describe("中心点坐标，格式为\"经度,纬度\"，如\"116.397428,39.90923\""),
        radius: z.number().default(3000).describe("搜索半径（米）"),
        page: z.number().default(1).describe("页码"),
        offset: z.number().default(10).describe("每页数量"),
      }),
    }
  );
}

// 路线规划工具
function createRoutePlanningTool(apiKey: string) {
  return tool(
    async ({ origin, destination, mode }) => {
      try {
        // 首先获取坐标
        const geocodeUrl = (address: string) => {
          const url = new URL("https://restapi.amap.com/v3/geocode/geo");
          url.searchParams.append("key", apiKey);
          url.searchParams.append("address", address);
          return url.toString();
        };

        // 获取起点和终点的坐标
        const [originRes, destRes] = await Promise.all([
          fetch(geocodeUrl(origin)),
          fetch(geocodeUrl(destination)),
        ]);

        const [originData, destData] = await Promise.all([
          originRes.json(),
          destRes.json(),
        ]);

        if (originData.status !== "1" || !originData.geocodes?.[0]) {
          return JSON.stringify({
            success: false,
            message: `无法识别起点: ${origin}`,
          });
        }

        if (destData.status !== "1" || !destData.geocodes?.[0]) {
          return JSON.stringify({
            success: false,
            message: `无法识别终点: ${destination}`,
          });
        }

        const originLocation = originData.geocodes[0].location;
        const destLocation = destData.geocodes[0].location;

        // 路线规划
        const modeEndpoints: Record<string, string> = {
          driving: "https://restapi.amap.com/v3/direction/driving",
          walking: "https://restapi.amap.com/v3/direction/walking",
          transit: "https://restapi.amap.com/v3/direction/transit/integrated",
          bicycling: "https://restapi.amap.com/v3/direction/bicycling",
        };

        const url = new URL(modeEndpoints[mode] || modeEndpoints.driving);
        url.searchParams.append("key", apiKey);
        url.searchParams.append("origin", originLocation);
        url.searchParams.append("destination", destLocation);

        const response = await fetch(url.toString());
        const result = await response.json();

        if (result.status === "1" && result.route?.paths?.[0]) {
          const path = result.route.paths[0];
          const steps = path.steps?.map((step: any, idx: number) =>
            `${idx + 1}. ${step.instruction}`
          ) || [];

          const modeNames: Record<string, string> = {
            driving: "驾车",
            walking: "步行",
            transit: "公交",
            bicycling: "骑行",
          };

          return JSON.stringify({
            success: true,
            mode: modeNames[mode] || mode,
            origin: originData.geocodes[0].formatted_address,
            destination: destData.geocodes[0].formatted_address,
            distance: path.distance ? `${(path.distance / 1000).toFixed(2)}公里` : "未知",
            duration: path.duration ? `${Math.round(path.duration / 60)}分钟` : "未知",
            steps,
          }, null, 2);
        } else {
          return JSON.stringify({
            success: false,
            message: result.info || "路线规划失败",
          });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "amap_route_planning",
      description: `规划从起点到终点的路线，支持驾车、步行、公交、骑行。

使用场景：
- 用户询问从A地到B地怎么走，如"从北京南站到天安门怎么走"
- 用户需要出行建议，如"去上海外滩有什么交通方式"
- 用户想知道距离和时间，如"从这里到机场要多久"

参数说明：
- origin: 起点地址，如\"北京南站\"\"天安门\"等
- destination: 终点地址，如\"上海外滩\"\"首都机场\"等
- mode: 出行方式，可选 driving(驾车)、walking(步行)、transit(公交)、bicycling(骑行)，默认driving`,
      schema: z.object({
        origin: z.string().describe("起点地址，如\"北京南站\""),
        destination: z.string().describe("终点地址，如\"天安门\""),
        mode: z.enum(["driving", "walking", "transit", "bicycling"])
          .default("driving")
          .describe("出行方式"),
      }),
    }
  );
}

// 地理编码工具
function createGeocodeTool(apiKey: string) {
  return tool(
    async ({ address }) => {
      try {
        const url = new URL("https://restapi.amap.com/v3/geocode/geo");
        url.searchParams.append("key", apiKey);
        url.searchParams.append("address", address);

        const response = await fetch(url.toString());
        const result = await response.json();

        if (result.status === "1" && result.geocodes?.[0]) {
          const geocode = result.geocodes[0];
          return JSON.stringify({
            success: true,
            address,
            formattedAddress: geocode.formatted_address,
            location: geocode.location,
            coordinates: {
              longitude: geocode.location.split(",")[0],
              latitude: geocode.location.split(",")[1],
            },
          }, null, 2);
        } else {
          return JSON.stringify({
            success: false,
            message: result.info || "地理编码失败",
          });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "amap_geocode",
      description: `将地址转换为经纬度坐标。

使用场景：
- 获取某个地点的精确坐标
- 验证地址是否可以被地图识别

参数说明：
- address: 要编码的地址，如\"北京市朝阳区建国路88号\"`,
      schema: z.object({
        address: z.string().describe("要编码的地址"),
      }),
    }
  );
}
