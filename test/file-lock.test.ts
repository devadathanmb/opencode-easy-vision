import { describe, expect, it } from "vitest";
import { withFileLock } from "../src/file-lock.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("withFileLock", () => {
  it("runs actions on the same path one at a time, in order", async () => {
    const events: string[] = [];
    const action = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([
      withFileLock("/same", action("a")),
      withFileLock("/same", action("b")),
      withFileLock("/same", action("c")),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(events).toEqual([
      "a:start",
      "a:end",
      "b:start",
      "b:end",
      "c:start",
      "c:end",
    ]);
  });

  it("lets different paths run concurrently", async () => {
    const events: string[] = [];
    const action = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
    };
    await Promise.all([
      withFileLock("/one", action("a")),
      withFileLock("/two", action("b")),
    ]);
    expect(events.slice(0, 2)).toEqual(["a:start", "b:start"]);
  });

  it("releases the lock when an action throws", async () => {
    await expect(
      withFileLock("/fails", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(withFileLock("/fails", async () => "next")).resolves.toBe(
      "next",
    );
  });
});
