// Safe and robust API request handler for hosted and local environments
export async function apiRequest<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    let data: any = null;

    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }
    } else {
      const text = await res.text();
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        return {
          ok: false,
          status: res.status === 200 ? 404 : res.status,
          error: `Server endpoint ${endpoint} returned HTML instead of JSON. Ensure the backend server is running and routes are configured.`,
        };
      }
      data = { error: text || "Invalid response format" };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || `Request failed with status ${res.status}`,
        data,
      };
    }

    return {
      ok: true,
      status: res.status,
      data,
    };
  } catch (err: any) {
    console.error(`API Error on ${endpoint}:`, err);
    return {
      ok: false,
      status: 0,
      error: err?.message || "Network error. Unable to reach the server.",
    };
  }
}
