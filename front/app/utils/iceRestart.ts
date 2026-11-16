export function shouldRestartIce(state: string): boolean {
  return state === "connected" || state === "disconnected" || state === "failed";
}

export function shouldRetryIceRestart(state: string): boolean {
  return state === "disconnected" || state === "failed";
}
