import { describe, it, expect, vi, beforeEach } from "vitest";
import { addSSEClient, removeSSEClient, broadcast, getClientCount, __resetClients } from "./notification-hub.js";

describe("notification-hub", () => {
  beforeEach(() => {
    __resetClients();
  });

  it("should add and remove clients", () => {
    const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    const id = addSSEClient(res);
    expect(getClientCount()).toBe(1);
    removeSSEClient(id);
    expect(getClientCount()).toBe(0);
  });

  it("should write correct SSE headers and initial connected event on addSSEClient", () => {
    const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    addSSEClient(res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })
    );

    expect(res.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ type: "connected" })}\n\n`
    );
  });

  it("should remove client when close event is simulated", () => {
    const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    addSSEClient(res);
    expect(getClientCount()).toBe(1);

    const closeHandler = res.on.mock.calls.find((call: any[]) => call[0] === "close")?.[1];
    expect(closeHandler).toBeDefined();

    closeHandler();
    expect(getClientCount()).toBe(0);
  });

  it("should remove client when write throws during broadcast", () => {
    let shouldThrow = false;
    const res = {
      writeHead: vi.fn(),
      write: vi.fn().mockImplementation(() => {
        if (shouldThrow) throw new Error("write failed");
      }),
      end: vi.fn(),
      on: vi.fn(),
    } as any;
    addSSEClient(res);
    expect(getClientCount()).toBe(1);

    shouldThrow = true;
    broadcast({ type: "task_result", taskName: "test" });
    expect(getClientCount()).toBe(0);
  });

  it("should broadcast to all clients", () => {
    const res1 = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    const res2 = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    addSSEClient(res1);
    addSSEClient(res2);
    broadcast({ type: "task_result", taskName: "test" });
    expect(res1.write).toHaveBeenCalled();
    expect(res2.write).toHaveBeenCalled();
  });

  it("should auto-generate id in broadcast payload when not provided", () => {
    const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
    addSSEClient(res);

    broadcast({ type: "task_result", taskName: "test" });

    const writtenPayload = res.write.mock.calls.find((call: any[]) =>
      typeof call[0] === "string" && call[0].includes("task_result")
    )?.[0];

    expect(writtenPayload).toBeDefined();
    const match = writtenPayload.match(/data: (.+)\n\n/);
    expect(match).toBeTruthy();
    const data = JSON.parse(match![1]);
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
  });
});
