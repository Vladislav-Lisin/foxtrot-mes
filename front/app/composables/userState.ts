export interface User {
  id: string
  username: string
  tag: string
  avatarUrl: string | null
}

export const useUserState = () => {
  const user = useState<User | null>("user", () => null);

  const isAuthReady = useState("auth_ready", () => false);

  const setUser = (u: User) => {
    user.value = u;
  };

  const clearUser = () => {
    user.value = null;
  };

  return {
    user,
    isAuthReady,
    setUser,
    clearUser,
  };
};
