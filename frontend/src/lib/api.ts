/** Cliente del API de administración. La sesión viaja en una cookie HttpOnly;
 *  el token CSRF se guarda solo en memoria y se envía en cada petición que modifica datos. */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let csrfToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: string[] };
      const field = first.loc?.[first.loc.length - 1];
      return field ? `${field}: ${first.msg}` : first.msg ?? "Datos inválidos";
    }
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  if (status === 0) return "No se pudo conectar con el servidor";
  return `Error ${status}`;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const finalHeaders = new Headers(headers);
  if (json !== undefined) finalHeaders.set("Content-Type", "application/json");
  if (method !== "GET" && csrfToken) finalHeaders.set("X-CSRF-Token", csrfToken);

  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      ...rest,
      method,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, errorMessage(null, 0));
  }

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login")) onUnauthorized?.();
    throw new ApiError(response.status, errorMessage(body, response.status));
  }
  return body as T;
}
