import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { SessionRevokedError, sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Intentionally carries no account identifier or authentication material. */
  authState: "anonymous" | "session-revoked" | "authenticated";
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let authState: TrpcContext["authState"] = "anonymous";

  try {
    user = await sdk.authenticateRequest(opts.req);
    authState = "authenticated";
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
    if (error instanceof SessionRevokedError) {
      authState = "session-revoked";
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    authState,
  };
}
