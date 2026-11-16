import test from "node:test";
import assert from "node:assert/strict";
import { SessionRegistry } from "./SessionRegistry.js";

test("session can be resumed once by the same call and user", () => {
  const now = 1_000;
  const registry = new SessionRegistry(() => now);
  registry.detach("s1", "c1", "u1", 45_000);

  assert.deepEqual(registry.resume("s1", "c1", "u1"), {
    sessionId: "s1", callId: "c1", userId: "u1", expiresAt: 46_000,
  });
  assert.equal(registry.get("s1"), undefined);
});

test("a session cannot be resumed by a different call or user", () => {
  const registry = new SessionRegistry(() => 10);
  registry.detach("s1", "c1", "u1", 1_000);
  assert.equal(registry.resume("s1", "c2", "u1"), undefined);
  assert.equal(registry.resume("s1", "c1", "u2"), undefined);
  assert.ok(registry.get("s1"));
});

test("expired sessions cannot be resumed and are pruned", () => {
  let now = 100;
  const registry = new SessionRegistry(() => now);
  registry.detach("s1", "c1", "u1", 500);
  now = 600;

  assert.equal(registry.get("s1"), undefined);
  assert.deepEqual(registry.pruneExpired(), []);
});

test("pruneExpired returns only sessions whose TTL elapsed", () => {
  let now = 0;
  const registry = new SessionRegistry(() => now);
  registry.detach("expired", "c1", "u1", 10);
  registry.detach("active", "c1", "u2", 20);
  now = 10;

  assert.deepEqual(registry.pruneExpired().map(session => session.sessionId), ["expired"]);
  assert.ok(registry.get("active"));
});
