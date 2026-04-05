// server/api/auth.post.ts

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const res = await fetch("http://localhost:8080/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw createError({
      statusCode: res.status,
      statusMessage: text,
    });
  }

  return await res.json();
});
