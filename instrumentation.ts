export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sendHeartbeat } = await import("@/lib/telemetry");
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  void sendHeartbeat();
  setInterval(() => void sendHeartbeat(), SIX_HOURS).unref();
}
