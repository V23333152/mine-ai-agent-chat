/**
 * 高德地图 Web Service API 工具封装
 * 提供POI搜索、路径规划、旅游规划等功能
 */

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

interface RouteResult {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  steps: Array<{
    instruction: string;
    distance: string;
    duration: string;
  }>;
}

// 从环境变量或配置获取API Key
function getAmapKey(): string {
  const key = process.env.AMAP_WEBSERVICE_KEY || process.env.AMAP_KEY;
  if (!key) {
    throw new Error('高德地图 API Key 未配置，请设置 AMAP_WEBSERVICE_KEY 环境变量');
  }
  return key;
}

/**
 * POI 搜索
 * @param keywords 搜索关键词
 * @param city 城市名称或编码
 * @param page 页码，默认1
 * @param offset 每页数量，默认10
 */
export async function searchPOI(
  keywords: string,
  city?: string,
  page: number = 1,
  offset: number = 10
): Promise<{ success: boolean; data?: POIItem[]; message?: string }> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v5/place/text');
    url.searchParams.append('key', key);
    url.searchParams.append('keywords', keywords);
    if (city) url.searchParams.append('region', city);
    url.searchParams.append('page', String(page));
    url.searchParams.append('offset', String(offset));
    url.searchParams.append('city_limit', 'true');

    const response = await fetch(url.toString());
    const result: AmapResponse<POIItem> = await response.json();

    if (result.status === '1' && result.pois) {
      return {
        success: true,
        data: result.pois,
        message: `找到 ${result.count} 个结果`,
      };
    } else {
      return {
        success: false,
        message: result.info || '搜索失败',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 地理编码 - 将地址转换为坐标
 * @param address 地址
 */
export async function geocode(address: string): Promise<{ 
  success: boolean; 
  location?: { lng: number; lat: number; formatted_address: string };
  message?: string;
}> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v3/geocode/geo');
    url.searchParams.append('key', key);
    url.searchParams.append('address', address);
    url.searchParams.append('output', 'JSON');

    const response = await fetch(url.toString());
    const result: AmapResponse = await response.json();

    if (result.status === '1' && result.geocodes && result.geocodes.length > 0) {
      const geo = result.geocodes[0];
      const [lng, lat] = geo.location.split(',').map(Number);
      return {
        success: true,
        location: {
          lng,
          lat,
          formatted_address: geo.formatted_address,
        },
      };
    } else {
      return {
        success: false,
        message: '地理编码失败，请检查地址是否正确',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 周边搜索
 * @param keywords 搜索关键词
 * @param location 中心点坐标（经度,纬度）
 * @param radius 搜索半径（米），默认1000
 */
export async function searchNearby(
  keywords: string,
  location: string,
  radius: number = 1000
): Promise<{ success: boolean; data?: POIItem[]; message?: string }> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v5/place/around');
    url.searchParams.append('key', key);
    url.searchParams.append('keywords', keywords);
    url.searchParams.append('location', location);
    url.searchParams.append('radius', String(radius));
    url.searchParams.append('offset', '10');

    const response = await fetch(url.toString());
    const result: AmapResponse<POIItem> = await response.json();

    if (result.status === '1' && result.pois) {
      return {
        success: true,
        data: result.pois,
        message: `找到 ${result.count} 个周边结果`,
      };
    } else {
      return {
        success: false,
        message: result.info || '搜索失败',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 步行路径规划
 * @param origin 起点坐标（经度,纬度）
 * @param destination 终点坐标（经度,纬度）
 */
export async function walkingRoute(
  origin: string,
  destination: string
): Promise<{ success: boolean; data?: RouteResult; message?: string }> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v3/direction/walking');
    url.searchParams.append('key', key);
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);

    const response = await fetch(url.toString());
    const result = await response.json();

    if (result.status === '1' && result.route?.paths?.[0]) {
      const path = result.route.paths[0];
      return {
        success: true,
        data: {
          origin: result.route.origin,
          destination: result.route.destination,
          distance: path.distance,
          duration: path.duration,
          steps: path.steps.map((s: any) => ({
            instruction: s.instruction,
            distance: s.distance,
            duration: s.duration,
          })),
        },
      };
    } else {
      return {
        success: false,
        message: result.info || '路线规划失败',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 驾车路径规划
 * @param origin 起点坐标（经度,纬度）
 * @param destination 终点坐标（经度,纬度）
 */
export async function drivingRoute(
  origin: string,
  destination: string
): Promise<{ success: boolean; data?: RouteResult; message?: string }> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v3/direction/driving');
    url.searchParams.append('key', key);
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);
    url.searchParams.append('strategy', '10'); // 躲避拥堵
    url.searchParams.append('extensions', 'base');

    const response = await fetch(url.toString());
    const result = await response.json();

    if (result.status === '1' && result.route?.paths?.[0]) {
      const path = result.route.paths[0];
      return {
        success: true,
        data: {
          origin: result.route.origin,
          destination: result.route.destination,
          distance: path.distance,
          duration: path.duration,
          steps: path.steps.map((s: any) => ({
            instruction: s.instruction,
            distance: s.distance,
            duration: s.duration,
          })),
        },
      };
    } else {
      return {
        success: false,
        message: result.info || '路线规划失败',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 公交路径规划
 * @param origin 起点坐标（经度,纬度）
 * @param destination 终点坐标（经度,纬度）
 * @param city 城市名称或编码
 */
export async function transitRoute(
  origin: string,
  destination: string,
  city: string
): Promise<{ success: boolean; data?: any; message?: string }> {
  try {
    const key = getAmapKey();
    const url = new URL('https://restapi.amap.com/v3/direction/transit/integrated');
    url.searchParams.append('key', key);
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);
    url.searchParams.append('city', city);
    url.searchParams.append('strategy', '0'); // 最快捷

    const response = await fetch(url.toString());
    const result = await response.json();

    if (result.status === '1' && result.route?.transits?.[0]) {
      const transit = result.route.transits[0];
      return {
        success: true,
        data: {
          origin: result.route.origin,
          destination: result.route.destination,
          distance: transit.distance,
          duration: transit.duration,
          cost: transit.cost,
          segments: transit.segments.map((s: any) => ({
            mode: s.walking ? '步行' : (s.bus ? '公交' : '其他'),
            instruction: s.instruction || '',
            distance: s.walking?.distance || s.bus?.distance,
            duration: s.walking?.duration || s.bus?.duration,
          })),
        },
      };
    } else {
      return {
        success: false,
        message: result.info || '公交路线规划失败',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '请求失败',
    };
  }
}

/**
 * 生成地图可视化链接
 * @param mapData 地图数据
 */
export function generateMapLink(mapData: any[]): string {
  const baseUrl = 'https://a.amap.com/jsapi_demo_show/static/openclaw/travel_plan.html';
  const dataStr = encodeURIComponent(JSON.stringify(mapData));
  return `${baseUrl}?data=${dataStr}`;
}

/**
 * 智能旅游规划
 * @param city 城市名称
 * @param interests 兴趣点关键词数组
 */
export async function travelPlanner(
  city: string,
  interests: string[]
): Promise<{ success: boolean; data?: any; mapLink?: string; message?: string }> {
  try {
    const mapTaskData: any[] = [];
    const poiResults: POIItem[] = [];

    // 搜索各类兴趣点
    for (const interest of interests) {
      const result = await searchPOI(interest, city, 1, 5);
      if (result.success && result.data) {
        poiResults.push(...result.data);
        
        result.data.forEach(poi => {
          const [lng, lat] = poi.location.split(',').map(Number);
          mapTaskData.push({
            type: 'poi',
            lnglat: [lng, lat],
            sort: poi.type || interest,
            text: poi.name,
            remark: poi.address || `${interest}推荐`,
          });
        });
      }
    }

    // 规划路线
    if (poiResults.length >= 2) {
      for (let i = 0; i < poiResults.length - 1; i++) {
        const start = poiResults[i];
        const end = poiResults[i + 1];
        const [startLng, startLat] = start.location.split(',').map(Number);
        const [endLng, endLat] = end.location.split(',').map(Number);
        
        mapTaskData.push({
          type: 'route',
          routeType: 'walking',
          start: [startLng, startLat],
          end: [endLng, endLat],
          remark: `从 ${start.name} 到 ${end.name}`,
        });
      }
    }

    const mapLink = generateMapLink(mapTaskData);

    return {
      success: true,
      data: poiResults,
      mapLink,
      message: `为您规划了 ${city} 的旅游行程，包含 ${poiResults.length} 个推荐地点`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '规划失败',
    };
  }
}

/**
 * 检查高德API Key是否已配置
 */
export function isAmapKeyConfigured(): boolean {
  return !!(process.env.AMAP_WEBSERVICE_KEY || process.env.AMAP_KEY);
}
