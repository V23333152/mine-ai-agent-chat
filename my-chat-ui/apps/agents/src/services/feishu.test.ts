import { describe, it, expect } from "vitest";
import { formatFeishuMessage } from "./feishu.js";

describe("feishu", () => {
  it("should format task success message", () => {
    const msg = formatFeishuMessage({
      task_name: "早报",
      status: "success",
      result: "今天晴",
      duration_ms: 1200,
    });
    expect(msg).toContain("早报");
    expect(msg).toContain("今天晴");
  });
});
