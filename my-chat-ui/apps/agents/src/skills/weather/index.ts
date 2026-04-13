/**
 * 天气查询 Skill
 * 提供天气预报、实时天气、生活指数等功能
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Skill, SkillMetadata } from "../types.js";

// Skill 元数据
export const weatherSkillMetadata: SkillMetadata = {
  id: "weather",
  name: "天气查询",
  version: "1.0.0",
  description: "提供天气预报、实时天气、生活指数等功能，支持查询全国各城市天气",
  author: "system",
  type: "native",
  tags: ["天气", "预报", "生活指数"],
  config: [
    {
      name: "apiKey",
      type: "string",
      required: false,
      description: "天气 API Key（部分 API 需要）",
      env: "WEATHER_API_KEY",
    },
  ],
  tools: [
    {
      id: "current_weather",
      name: "实时天气",
      description: "查询指定城市当前的天气状况",
      examples: ["北京今天天气怎么样", "上海现在多少度"],
    },
    {
      id: "weather_forecast",
      name: "天气预报",
      description: "查询指定城市未来几天的天气预报",
      examples: ["北京未来三天天气", "杭州这周会下雨吗"],
    },
  ],
};

// 创建天气 Skill
export async function createWeatherSkill(config?: Record<string, any>): Promise<Skill> {
  const apiKey = config?.apiKey || process.env.WEATHER_API_KEY;

  // 创建工具（使用免费的 API，不需要 Key）
  const tools = [
    createCurrentWeatherTool(),
    createForecastTool(),
  ];

  return {
    metadata: weatherSkillMetadata,
    tools,
    enabled: true,
    config: { apiKey },

    initialize: async () => {
      console.log("[WeatherSkill] Initializing...");
      return true;
    },

    destroy: async () => {
      console.log("[WeatherSkill] Destroyed");
    },
  };
}

// 实时天气工具
function createCurrentWeatherTool() {
  return tool(
    async ({ city }) => {
      try {
        // 使用免费的天气 API
        const response = await fetch(
          `https://api.seniverse.com/v3/weather/now.json?key=S5z3GqL_Q4z5y5&location=${encodeURIComponent(city)}&language=zh-Hans&unit=c`,
          { method: "GET" }
        );

        if (!response.ok) {
          // 使用备用 API
          const backupResponse = await fetch(
            `https://restapi.amap.com/v3/weather/weatherInfo?key=a1b2c3d4e5f6g7h8&city=${encodeURIComponent(city)}`
          );

          if (!backupResponse.ok) {
            return JSON.stringify({
              success: false,
              message: "天气服务暂时不可用，请稍后再试",
            });
          }

          const data = await backupResponse.json();
          if (data.status === "1" && data.lives?.[0]) {
            const live = data.lives[0];
            return JSON.stringify({
              success: true,
              city: live.city,
              weather: live.weather,
              temperature: live.temperature,
              humidity: live.humidity,
              windDirection: live.winddirection,
              windPower: live.windpower,
              reportTime: live.reporttime,
              source: "高德地图",
            }, null, 2);
          }
        } else {
          const data = await response.json();
          if (data.results?.[0]) {
            const result = data.results[0];
            return JSON.stringify({
              success: true,
              city: result.location.name,
              weather: result.now.text,
              temperature: result.now.temperature,
              humidity: result.now.humidity,
              windDirection: result.now.wind_direction,
              windPower: result.now.wind_scale,
              reportTime: result.last_update,
              source: "心知天气",
            }, null, 2);
          }
        }

        return JSON.stringify({
          success: false,
          message: "未找到该城市的天气信息",
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "weather_current",
      description: `查询指定城市当前的天气状况，包括温度、湿度、风向、天气现象等。

使用场景：
- 用户询问今天天气，如"北京今天天气怎么样"
- 用户想知道当前温度，如"上海现在多少度"
- 用户询问天气状况，如"深圳现在下雨吗"

参数说明：
- city: 城市名称，如"北京""上海""广州"等`,
      schema: z.object({
        city: z.string().describe("城市名称，如\"北京\"上海\""),
      }),
    }
  );
}

// 天气预报工具
function createForecastTool() {
  return tool(
    async ({ city, days }) => {
      try {
        const response = await fetch(
          `https://api.seniverse.com/v3/weather/daily.json?key=S5z3GqL_Q4z5y5&location=${encodeURIComponent(city)}&language=zh-Hans&unit=c&start=0&days=${days}`,
          { method: "GET" }
        );

        if (!response.ok) {
          return JSON.stringify({
            success: false,
            message: "天气预报服务暂时不可用",
          });
        }

        const data = await response.json();
        if (data.results?.[0]?.daily) {
          const daily = data.results[0].daily;
          const forecast = daily.map((day: any) => ({
            date: day.date,
            dayWeather: day.text_day,
            nightWeather: day.text_night,
            highTemp: day.high,
            lowTemp: day.low,
            humidity: day.humidity,
            windDirection: day.wind_direction,
            windScale: day.wind_scale,
          }));

          return JSON.stringify({
            success: true,
            city: data.results[0].location.name,
            days: forecast.length,
            forecast,
          }, null, 2);
        }

        return JSON.stringify({
          success: false,
          message: "未找到该城市的天气预报",
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    },
    {
      name: "weather_forecast",
      description: `查询指定城市未来几天的天气预报，包括最高/最低温度、天气现象、风向等。

使用场景：
- 用户询问未来天气，如"北京未来三天天气怎么样"
- 用户想知道周末天气，如"上海这周末会下雨吗"
- 用户规划出行，如"杭州下周天气如何"

参数说明：
- city: 城市名称，如"北京""上海""广州"等
- days: 预报天数，默认3天，最多15天`,
      schema: z.object({
        city: z.string().describe("城市名称，如\"北京\"上海\""),
        days: z.number().min(1).max(15).default(3).describe("预报天数，1-15天"),
      }),
    }
  );
}
