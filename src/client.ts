type HttpMethod = "GET" | "POST";

export type DokployClientOptions = {
  host: string;
  apiKey: string;
};

export class DokployApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "DokployApiError";
  }
}

export class DokployClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: DokployClientOptions) {
    this.baseUrl = options.host.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
  }

  async get<T = unknown>(
    endpoint: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, query);
  }

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, body);
  }

  private async request<T>(
    method: HttpMethod,
    endpoint: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<T> {
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${normalizedEndpoint}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      accept: "application/json",
    };

    const init: RequestInit = {
      method,
      headers,
    };

    if (method === "POST") {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }

    const response = await fetch(url, init);
    const text = await response.text();

    if (!response.ok) {
      throw new DokployApiError(
        this.formatErrorMessage(response.status, normalizedEndpoint, text),
        response.status,
        normalizedEndpoint,
        text,
      );
    }

    if (!text.trim()) {
      return undefined as T;
    }

    const parsed = JSON.parse(text) as unknown;
    return this.unwrapResponse(parsed) as T;
  }

  private unwrapResponse(value: unknown): unknown {
    if (!isRecord(value)) return value;

    const result = value.result;
    if (isRecord(result)) {
      const data = result.data;
      if (isRecord(data) && "json" in data) return data.json;
      if (data !== undefined) return data;
    }

    const data = value.data;
    if (isRecord(data) && "json" in data) return data.json;
    if ("json" in value) return value.json;

    return value;
  }

  private formatErrorMessage(status: number, endpoint: string, body: string): string {
    const detail = extractErrorDetail(body);
    const hint =
      status === 401 || status === 403
        ? " Check DOKPLOY_API_KEY and the API key permissions."
        : "";

    return `Dokploy API ${endpoint} failed with HTTP ${status}${
      detail ? `: ${detail}` : ""
    }.${hint}`;
  }
}

function extractErrorDetail(body: string): string | undefined {
  if (!body.trim()) return undefined;

  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed)) {
      const message = parsed.message;
      if (typeof message === "string") return message;

      const error = parsed.error;
      if (isRecord(error) && typeof error.message === "string") return error.message;
    }
  } catch {
    return body.slice(0, 400);
  }

  return body.slice(0, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
