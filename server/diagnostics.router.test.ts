import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreference: vi.fn(),
  createReport: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotificationPreferences: mocks.getPreferences,
    updateDiagnosticReportingEnabled: mocks.updatePreference,
    createDiagnosticReport: mocks.createReport,
  };
});

import { appRouter } from "./routers";

function createDiagnosticsContext(): TrpcContext {
  return {
    user: {
      id: 17, openId: "local-diagnostics-test-user", email: "diagnostics@example.com", name: "診斷測試者",
      loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("profile diagnostics router", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns disabled when the user has never opted in", async () => {
    mocks.getPreferences.mockResolvedValue({ diagnosticReportsEnabled: 0 });
    const caller = appRouter.createCaller(createDiagnosticsContext());

    await expect(caller.profile.diagnosticsPreference()).resolves.toEqual({ enabled: false });
    expect(mocks.getPreferences).toHaveBeenCalledWith(17);
  });

  it("only persists the explicit diagnostic consent selected by the authenticated user", async () => {
    mocks.updatePreference.mockResolvedValue({ diagnosticReportsEnabled: 1 });
    const caller = appRouter.createCaller(createDiagnosticsContext());

    await expect(caller.profile.updateDiagnosticsPreference({ enabled: true })).resolves.toEqual({ enabled: true });
    expect(mocks.updatePreference).toHaveBeenCalledWith(17, true);
  });

  it("forwards only bounded diagnostic fields to the protected report procedure", async () => {
    mocks.createReport.mockResolvedValue({ accepted: false });
    const caller = appRouter.createCaller(createDiagnosticsContext());
    const input = {
      platform: "android" as const,
      appVersion: "1.3.9",
      errorCode: "android.runtime.unhandled",
      message: "Error: 非預期的 App 技術錯誤",
      stack: "Error: technical stack",
    };

    await expect(caller.profile.reportDiagnostic(input)).resolves.toEqual({ accepted: false });
    expect(mocks.createReport).toHaveBeenCalledWith(17, input);
  });

  it("rejects overlong diagnostic input before it can reach storage", async () => {
    const caller = appRouter.createCaller(createDiagnosticsContext());

    await expect(caller.profile.reportDiagnostic({
      platform: "android",
      appVersion: "1.3.9",
      errorCode: "x".repeat(81),
      message: "Error",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createReport).not.toHaveBeenCalled();
  });
});
