/**
 * The backend's GlobalExceptionHandler returns JSON ({ message, status, error, ... }),
 * not plain text - read the body as text first (a Response body can only be read
 * once) and try to parse it, falling back gracefully for non-JSON error bodies
 * (proxies, network-level failures, etc.).
 */
export const extractErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message || fallback;
  } catch {
    return text;
  }
};
