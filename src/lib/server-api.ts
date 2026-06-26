export class ServerApiUnavailableError extends Error {
  constructor(message = "Os recursos de servidor desta implantação não estão disponíveis.") {
    super(message);
    this.name = "ServerApiUnavailableError";
  }
}

type ServerApiStatus = "unknown" | "available" | "unavailable";

let serverApiStatus: ServerApiStatus = "unknown";

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
    const response = await fetch(input, init);

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
