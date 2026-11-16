export type DetachedSession = {
  sessionId: string
  callId: string
  userId: string
  expiresAt: number
};

/** Tracks detached signaling sessions during the media recovery grace period. */
export class SessionRegistry {
  private readonly sessions = new Map<string, DetachedSession>();

  constructor(private readonly now: () => number = Date.now) {}

  detach(sessionId: string, callId: string, userId: string, ttlMs: number): DetachedSession {
    const session = { sessionId, callId, userId, expiresAt: this.now() + ttlMs };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): DetachedSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  resume(sessionId: string, callId: string, userId: string): DetachedSession | undefined {
    const session = this.get(sessionId);
    if (!session || session.callId !== callId || session.userId !== userId) return undefined;
    this.sessions.delete(sessionId);
    return session;
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  pruneExpired(): DetachedSession[] {
    const expired: DetachedSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.expiresAt <= this.now()) {
        expired.push(session);
        this.sessions.delete(session.sessionId);
      }
    }
    return expired;
  }
}
