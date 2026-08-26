import { apiBase } from "./apiBase";
import type { User } from "~/composables/userState";

let isRefreshing = false;

type AuthApiResponse = {
  user?: User
  accessToken?: string
  token?: string
  refreshToken?: string
};

export const refreshAccessToken = async () => {
  const { clearAuth, refreshToken, setRefreshToken, setToken } = useUserState();

  if (!refreshToken.value) {
    clearAuth();
    return null;
  }

  const refreshUrl = new URL(`${apiBase()}/auth/refresh`);
  refreshUrl.searchParams.set("refreshToken", refreshToken.value);

  const res = await fetch(refreshUrl.toString(), {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    clearAuth();
    return null;
  }

  const response = await res.json() as AuthApiResponse;

  if (response.accessToken) {
    setToken(response.accessToken);
  }

  if (response.refreshToken) {
    setRefreshToken(response.refreshToken);
  }

  return response.accessToken || null;
};

export const secureFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const { token } = useUserState();
  const headers = new Headers(options.headers || {});

  if (token.value) {
    headers.set("Authorization", `Bearer ${token.value}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  if (response.status === 401 || response.headers.get("X-Token-Expired") === "true") {
    if (isRefreshing) return response;
    isRefreshing = true;

    const newToken = await refreshAccessToken();

    isRefreshing = false;

    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set("Authorization", `Bearer ${newToken}`);

      if (options.body && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }

      response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: retryHeaders,
      });
    }
  }

  return response;
};

export const registerUser = async (data: {
  username: string
  email: string
  password: string
}) => {
  const res = await fetch(`${apiBase()}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  const response = await res.json() as AuthApiResponse;

  if (response.accessToken || response.token) {
    const { setRefreshToken, setToken } = useUserState();
    setToken(response.accessToken || response.token || null);
    setRefreshToken(response.refreshToken ?? null);
  }

  return response;
};

export const loginUser = async (data: {
  email: string
  password: string
}) => {
  const res = await fetch(`${apiBase()}/auth/authorization`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  const response = await res.json() as AuthApiResponse;

  if (response.accessToken || response.token) {
    const { setRefreshToken, setToken } = useUserState();
    setToken(response.accessToken || response.token || null);
    setRefreshToken(response.refreshToken ?? null);
  }

  return response;
};

export const fetchMe = async () => {
  return secureFetch(`${apiBase()}/auth/me`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .catch(() => null);
};

// Reads the `exp` claim out of the JWT payload without verifying the
// signature — only used client-side to decide when to proactively refresh.
const decodeJwtExpMs = (token: string): number | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

export const proactiveRefreshToken = async () => {
  const { token } = useUserState();
  if (!token.value) return;

  const expiresAtMs = decodeJwtExpMs(token.value);
  if (!expiresAtMs) return;

  // Must exceed the polling interval in auth-init.client.ts (5 min) so a
  // token nearing expiry is never skipped between two poll ticks.
  const remainingMs = expiresAtMs - Date.now();
  const refreshWindowMs = 10 * 60 * 1000;

  if (remainingMs > 0 && remainingMs <= refreshWindowMs) {
    try {
      await refreshAccessToken();
    } catch (error) {
      console.error("Failed to refresh token proactively:", error);
    }
  }
};
