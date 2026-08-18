import { describe, expect, it } from "vitest";
import { resolveListenConfig } from "./listenConfig";

describe("resolveListenConfig", () => {
  it("uses the managed runtime port exactly in production", () => {
    expect(resolveListenConfig({ NODE_ENV: "production", PORT: "8080" })).toEqual({
      allowPortFallback: false,
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it("keeps local development resilient when the default port is occupied", () => {
    expect(resolveListenConfig({ NODE_ENV: "development" })).toEqual({
      allowPortFallback: true,
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("falls back to the standard port only when the supplied value is invalid", () => {
    expect(resolveListenConfig({ NODE_ENV: "production", PORT: "invalid" }).port).toBe(3000);
  });
});
