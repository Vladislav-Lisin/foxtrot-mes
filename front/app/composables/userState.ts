export interface User {
  id: string
  username: string
  tag: string
  avatarUrl: string | null
}

const TOKEN_KEY = 'auth_token';

export const useUserState = () => {
  const user = useState<User | null>("user", () => null);
  const token = useState<string | null>("token", () => null);
  const isAuthReady = useState("auth_ready", () => false);

  const setUser = (u: User) => {
    user.value = u;
  };

  const setToken = (t: string | null) => {
    token.value = t;
    if (process.client) {
      if (t) {
        localStorage.setItem(TOKEN_KEY, t);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  };

  const loadToken = () => {
    if (process.client) {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        token.value = storedToken;
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
    isAuthReady,
    setUser,
    setToken,
    loadToken,
    clearUser,
    clearAuth,
  };
};
