export class ServerApiUnavailableError extends Error {
  constructor(message = "Os recursos de servidor desta implantação não estão disponíveis.") {
    super(message);
    this.name = "ServerApiUnavailableError";
  }
}

type ServerApiStatus = "unknown" | "available" | "unavailable";

const configuredServerApiBaseUrl = (
  import.meta.env.VITE_SERVER_API_BASE_URL as string | undefined
)?.trim().replace(/\/+$/, "");

function shouldAssumeNoServerApi() {
  if (configuredServerApiBaseUrl) return false;
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname.toLowerCase();
  return hostname.endsWith(".vercel.app");
}

function resolveServerApiInput(input: RequestInfo | URL): RequestInfo | URL {
  if (!configuredServerApiBaseUrl) {
    return input;
  }

  if (typeof input === "string") {
    if (input.startsWith("/")) {
      return `${configuredServerApiBaseUrl}${input}`;
    }
    return input;
  }

  if (
    typeof window !== "undefined" &&
    input instanceof URL &&
    input.origin === window.location.origin &&
    input.pathname.startsWith("/")
  ) {
    return new URL(`${configuredServerApiBaseUrl}${input.pathname}${input.search}`);
  }

  return input;
}

let serverApiStatus: ServerApiStatus = shouldAssumeNoServerApi() ? "unavailable" : "unknown";

export function getServerApiStatus(): ServerApiStatus {
  return serverApiStatus;
}

export function isServerApiAvailable(): boolean {
  return serverApiStatus !== "unavailable";
}

export function markServerApiAvailable() {
  serverApiStatus = "available";
}

export function markServerApiUnavailable() {
  serverApiStatus = "unavailable";
}

export function isServerApiUnavailableError(error: unknown): error is ServerApiUnavailableError {
  return error instanceof ServerApiUnavailableError;
}

export async function fetchServerApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isServerApiAvailable()) {
    throw new ServerApiUnavailableError();
  }

  try {
    const response = await fetch(resolveServerApiInput(input), init);

    if (response.status === 404) {
      markServerApiUnavailable();
      throw new ServerApiUnavailableError();
    }

    markServerApiAvailable();
    return response;
  } catch (error) {
    if (error instanceof ServerApiUnavailableError) {
      throw error;
    }

    if (error instanceof TypeError) {
      markServerApiUnavailable();
      throw new ServerApiUnavailableError();
    }

    throw error;
  }
}
