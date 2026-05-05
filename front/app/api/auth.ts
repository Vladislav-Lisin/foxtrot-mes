// Флаг для предотвращения бесконечного цикла refresh запросов
let isRefreshing = false;

/**
 * Обновляет access token используя refresh token
 */
export const refreshAccessToken = async () => {
  const res = await fetch('http://localhost:8080/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    // Если refresh не прошел, очищаем данные
    const { clearAuth } = useUserState();
    clearAuth();
    return null;
  }

  const response = await res.json();

  if (response.accessToken) {
    const { setToken } = useUserState();
    setToken(response.accessToken);
  }

  return response.accessToken || null;
};

/**
 * Утилита для безопасных запросов с автоматическим добавлением токена.
 * При 401 автоматически пытается обновить токен и повторяет запрос.
 */
export const secureFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const { token } = useUserState();
  const headers = new Headers(options.headers || {});

  // Добавляем токен если он есть
  if (token.value) {
    headers.set('Authorization', `Bearer ${token.value}`);
  }

  // Убедимся что Content-Type установлен если есть body
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  // Если получили 401, пытаемся обновить токен
  if (response.status === 401 && !isRefreshing) {
    isRefreshing = true;

    const newToken = await refreshAccessToken();

    isRefreshing = false;

    // Если удалось обновить токен, повторяем запрос
    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);

      if (options.body && !retryHeaders.has('Content-Type')) {
        retryHeaders.set('Content-Type', 'application/json');
      }

      response = await fetch(url, {
        ...options,
        credentials: 'include',
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
  const res = await fetch('http://localhost:8080/auth/register', {
    method: 'POST',
    credentials: "include",
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text)
  }

  const response = await res.json()

  // Сохраняем токен если он есть в ответе
  if (response.accessToken || response.token) {
    const { setToken } = useUserState();
    setToken(response.accessToken || response.token);
  }

  return response
}

export const loginUser = async (data: {
  email: string
  password: string
}) => {
  const res = await fetch('http://localhost:8080/auth/authorization', {
    method: 'POST',
    credentials: "include",
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text)
  }

  const response = await res.json()

  // Сохраняем токен если он есть в ответе
  if (response.accessToken || response.token) {
    const { setToken } = useUserState();
    setToken(response.accessToken || response.token);
  }

  return response
}

export const fetchMe = async () => {
  return secureFetch('http://localhost:8080/auth/me')
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .catch(() => null);
};
