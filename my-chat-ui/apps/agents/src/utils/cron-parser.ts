// 自然语言时间描述转换为 Cron 表达式
export function parseTimeToCron(scheduleDesc: string): string | null {
  // 标准化描述
  let desc = scheduleDesc
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[：:,，]/g, "")
    .replace(/(每隔|每)/g, "每");

  // 预设模式
  const patterns: Record<string, string> = {
    // 每天
    "每天早上8点": "0 8 * * *",
    "每天早上9点": "0 9 * * *",
    "每天上午8点": "0 8 * * *",
    "每天上午9点": "0 9 * * *",
    "每天上午10点": "0 10 * * *",
    "每天上午11点": "0 11 * * *",
    "每天中午12点": "0 12 * * *",
    "每天下午1点": "0 13 * * *",
    "每天下午2点": "0 14 * * *",
    "每天下午3点": "0 15 * * *",
    "每天下午4点": "0 16 * * *",
    "每天下午5点": "0 17 * * *",
    "每天下午6点": "0 18 * * *",
    "每天晚上7点": "0 19 * * *",
    "每天晚上8点": "0 20 * * *",
    "每天晚上9点": "0 21 * * *",
    "每天晚上10点": "0 22 * * *",
    "每天晚上11点": "0 23 * * *",
    "每天凌晨0点": "0 0 * * *",
    // 工作日
    "工作日早上8点": "0 8 * * 1-5",
    "工作日早上9点": "0 9 * * 1-5",
    "工作日下午6点": "0 18 * * 1-5",
    // 周末
    "周末早上9点": "0 9 * * 0,6",
    "周末早上10点": "0 10 * * 0,6",
    // 每周
    "每周一早上8点": "0 8 * * 1",
    "每周一早上9点": "0 9 * * 1",
    "每周二早上9点": "0 9 * * 2",
    "每周三早上9点": "0 9 * * 3",
    "每周四早上9点": "0 9 * * 4",
    "每周五下午6点": "0 18 * * 5",
    "每周日早上9点": "0 9 * * 0",
    // 间隔
    "每小时": "0 * * * *",
    "每2小时": "0 */2 * * *",
    "每4小时": "0 */4 * * *",
    "每分钟": "* * * * *",
    "每5分钟": "*/5 * * * *",
    "每10分钟": "*/10 * * * *",
    "每30分钟": "*/30 * * * *",
  };

  if (patterns[desc]) {
    return patterns[desc];
  }

  // 解析间隔
  const intervalMatch = desc.match(/每(\d+)(分钟|小时|时)/);
  if (intervalMatch) {
    const num = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2];
    if (unit === "分钟") {
      return `*/${num} * * * *`;
    } else if (unit === "小时" || unit === "时") {
      return `0 */${num} * * *`;
    }
  }

  // 解析时间
  let hour = -1;
  let minute = 0;

  const timeMatch = desc.match(/(\d+)[点时](?:(\d+|半|一刻|三刻)分?)?/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    const minuteStr = timeMatch[2];

    if (minuteStr) {
      if (minuteStr === "半") {
        minute = 30;
      } else if (minuteStr === "一刻") {
        minute = 15;
      } else if (minuteStr === "三刻") {
        minute = 45;
      } else if (!isNaN(parseInt(minuteStr))) {
        minute = parseInt(minuteStr, 10);
      }
    }

    // 处理12/24小时制
    const isPM = desc.includes("下午") || desc.includes("晚上") || desc.includes("傍晚");
    const isNoon = desc.includes("中午");
    const isMidnight = desc.includes("凌晨") && hour === 12;

    if (isPM && hour < 12) {
      hour += 12;
    }
    if (isNoon && hour < 12) {
      hour += 12;
    }
    if (isMidnight) {
      hour = 0;
    }
  }

  // 解析星期
  const weekdayMap: Record<string, string> = {
    "周一": "1", "周二": "2", "周三": "3", "周四": "4",
    "周五": "5", "周六": "6", "周日": "0", "星期天": "0",
    "星期一": "1", "星期二": "2", "星期三": "3", "星期四": "4",
    "星期五": "5", "星期六": "6", "星期日": "0",
    "工作日": "1-5",
    "周末": "0,6",
  };

  let weekday: string | null = null;
  for (const [key, value] of Object.entries(weekdayMap)) {
    if (desc.includes(key)) {
      weekday = value;
      break;
    }
  }

  // 解析每月几号
  const dayOfMonthMatch = desc.match(/每月(\d+)[号日]/);
  let dayOfMonth: string | null = null;
  if (dayOfMonthMatch) {
    dayOfMonth = dayOfMonthMatch[1];
  }
  // 每月最后一天
  if (desc.includes("每月最后一天")) {
    dayOfMonth = "L";
  }

  // 解析"每隔X天"格式
  const everyXDaysMatch = desc.match(/每(\d+)天/);
  if (everyXDaysMatch && hour >= 0) {
    const days = parseInt(everyXDaysMatch[1], 10);
    console.log(`[CronParser] Every ${days} days detected, using daily cron as approximation`);
    return `${minute} ${hour} * * *`;
  }

  // 特殊时间词处理
  if (desc.includes("日出")) {
    return `0 6 * * *`;
  }
  if (desc.includes("日落")) {
    return `0 18 * * *`;
  }
  if (desc.includes("午夜")) {
    return `0 0 * * *`;
  }
  if (desc.includes("正午")) {
    return `0 12 * * *`;
  }

  // 生成 Cron
  if (hour >= 0) {
    if (dayOfMonth) {
      return `${minute} ${hour} ${dayOfMonth} * *`;
    } else if (weekday) {
      return `${minute} ${hour} * * ${weekday}`;
    } else {
      return `${minute} ${hour} * * *`;
    }
  }

  return null;
}
