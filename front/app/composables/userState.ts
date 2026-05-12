export interface User {
  id: string
  username: string
  tag: string
  avatarUrl: string | null
}

const TOKEN_KEY = 'auth_token';
const TOKEN_CREATED_KEY = 'auth_token_created';

export const useUserState = () => {
  const user = useState<User | null>("user", () => null);
  const token = useState<string | null>("token", () => null);
  const tokenCreatedAt = useState<number | null>("token_created_at", () => null);
  const isAuthReady = useState("auth_ready", () => false);

  const setUser = (u: User) => {
    user.value = u;
  };

  const setToken = (t: string | null) => {
    token.value = t;
    if (process.client) {
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

  const loadToken = () => {
    if (process.client) {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedCreated = localStorage.getItem(TOKEN_CREATED_KEY);
      if (storedToken) {
        token.value = storedToken;
        tokenCreatedAt.value = storedCreated ? parseInt(storedCreated, 10) : null;
      }
    }
  };

  const clearUser = () => {
    user.value = null;
  };

  const clearAuth = () => {
    user.value = null;
    setToken(null);
  };

  return {
    user,
    token,
    tokenCreatedAt,
    isAuthReady,
    setUser,
    setToken,
    loadToken,
    clearUser,
    clearAuth,
  };
};
