import { describe, expect, it } from "vitest";
import { scrubDiagnosticText } from "./db";

describe("diagnostic privacy scrubbing", () => {
  it("redacts email, credential-like values and database URLs before storage", () => {
    const scrubbed = scrubDiagnosticText(
      "user@example.com token=super-secret password: nope inviteCode=ABCD mysql://db-user:db-password@db.example/internal",
      8000,
    );

    expect(scrubbed).toContain("[redacted-email]");
    expect(scrubbed).toContain("token=[redacted]");
    expect(scrubbed).toContain("password=[redacted]");
    expect(scrubbed).toContain("inviteCode=[redacted]");
    expect(scrubbed).toContain("[redacted-database-url]");
    expect(scrubbed).not.toContain("super-secret");
    expect(scrubbed).not.toContain("db-password");
  });

  it("enforces the configured storage limit after redaction", () => {
    expect(scrubDiagnosticText("x".repeat(20), 8)).toHaveLength(8);
  });
});
