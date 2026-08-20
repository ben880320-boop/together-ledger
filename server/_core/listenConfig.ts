export type ListenEnvironment = {
  NODE_ENV?: string;
  PORT?: string;
};

export type ListenConfig = {
  allowPortFallback: boolean;
  host: string;
  port: number;
};

export function resolveListenConfig(environment: ListenEnvironment): ListenConfig {
  const parsedPort = Number.parseInt(environment.PORT ?? "", 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : 3000;

  return {
    // Managed runtimes route traffic exclusively to the requested PORT. Falling back
    // to another free port can make an otherwise healthy revision fail its health check.
    allowPortFallback: environment.NODE_ENV !== "production",
    host: "0.0.0.0",
    port,
  };
}
