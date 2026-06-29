export class ServerApiUnavailableError extends Error {
  constructor(message = "Os recursos de servidor desta implantação não estão disponíveis.") {
    super(message);
    this.name = "ServerApiUnavailableError";
  }
}

type ServerApiStatus = "unknown" | "available" | "unavailable";
type ServerApiCapability = "default" | "pdf" | "cloud";

const configuredServerApiBaseUrl = (
  import.meta.env.VITE_SERVER_API_BASE_URL as string | undefined
)?.trim().replace(/\/+$/, "");

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

const serverApiStatusByCapability: Record<ServerApiCapability, ServerApiStatus> = {
  default: "unknown",
  pdf: "unknown",
  cloud: "unknown",
};

type FetchServerApiOptions = RequestInit & {
  capability?: ServerApiCapability;
};

export function getServerApiStatus(capability: ServerApiCapability = "default"): ServerApiStatus {
  return serverApiStatusByCapability[capability];
}

export function isServerApiAvailable(capability: ServerApiCapability = "default"): boolean {
  return getServerApiStatus(capability) !== "unavailable";
}

export function markServerApiAvailable(capability: ServerApiCapability = "default") {
  serverApiStatusByCapability[capability] = "available";
}

export function markServerApiUnavailable(capability: ServerApiCapability = "default") {
  serverApiStatusByCapability[capability] = "unavailable";
}

export function isServerApiUnavailableError(error: unknown): error is ServerApiUnavailableError {
  return error instanceof ServerApiUnavailableError;
}

export async function fetchServerApi(input: RequestInfo | URL, init?: FetchServerApiOptions): Promise<Response> {
  const { capability = "default", ...requestInit } = init || {};

  if (!isServerApiAvailable(capability)) {
    throw new ServerApiUnavailableError();
  }

  try {
    const response = await fetch(resolveServerApiInput(input), requestInit);

    if (response.status === 404) {
      markServerApiUnavailable(capability);
      throw new ServerApiUnavailableError();
    }

    markServerApiAvailable(capability);
    return response;
  } catch (error) {
    if (error instanceof ServerApiUnavailableError) {
      throw error;
    }

    if (error instanceof TypeError) {
      markServerApiUnavailable(capability);
      throw new ServerApiUnavailableError();
    }

    throw error;
  }
}
