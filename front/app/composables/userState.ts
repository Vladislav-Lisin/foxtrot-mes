export interface User {
  id: string
  username: string
  tag: string
  avatarUrl: string | null
}

const TOKEN_KEY = "auth_token";
const TOKEN_CREATED_KEY = "auth_token_created";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

export const useUserState = () => {
  const user = useState<User | null>("user", () => null);
  const token = useState<string | null>("token", () => null);
  const tokenCreatedAt = useState<number | null>("token_created_at", () => null);
  const refreshToken = useState<string | null>("refresh_token", () => null);
  const isAuthReady = useState("auth_ready", () => false);

  const setUser = (u: User) => {
    user.value = u;
  };

  const setToken = (t: string | null) => {
    token.value = t;
    if (import.meta.client) {
      if (t) {
        const now = Date.now();
        tokenCreatedAt.value = now;
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(TOKEN_CREATED_KEY, now.toString());
      } else {
        tokenCreatedAt.value = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_CREATED_KEY);
      }
    }
  };

  const setRefreshToken = (t: string | null) => {
    refreshToken.value = t;
    if (import.meta.client) {
      if (t) {
        localStorage.setItem(REFRESH_TOKEN_KEY, t);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  };

  const loadToken = () => {
    if (import.meta.client) {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedCreated = localStorage.getItem(TOKEN_CREATED_KEY);
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (storedToken) {
        token.value = storedToken;
        tokenCreatedAt.value = storedCreated ? parseInt(storedCreated, 10) : null;
      }
      if (storedRefreshToken) {
        refreshToken.value = storedRefreshToken;
      }
    }
  };

  const clearUser = () => {
    user.value = null;
  };

  const clearAuth = () => {
    user.value = null;
    setToken(null);
    setRefreshToken(null);
  };

  return {
    user,
    token,
    tokenCreatedAt,
    refreshToken,
    isAuthReady,
    setUser,
    setToken,
    setRefreshToken,
    loadToken,
    clearUser,
    clearAuth,
  };
};
