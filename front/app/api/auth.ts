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

  return res.json()
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

  return res.json()
}

export const fetchMe = async () => {
  const res = await fetch('http://localhost:8080/auth/me', {
    credentials: 'include'
  })

  if (!res.ok) return null

  return res.json()
}
