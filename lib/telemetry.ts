import os from "os";
import { prisma } from "@/lib/prisma";

const INSTANCE_ID_KEY = "__INSTANCE_ID";

/**
 * Version check-in — lets the maintainer know this deployment is on an
 * older version so they can proactively reach out about updates.
 *
 * Disabled by default. Enable in Settings → System, or by setting
 * TELEMETRY_ENABLED=true / TELEMETRY_ENDPOINT in the environment.
 * Sends only: an anonymous instance id, hostname, library name, app
 * version, and rough book/member counts. Never throws — a failed
 * check-in never affects the app.
 */
async function getOrCreateInstanceId(): Promise<string> {
  const existing = await prisma.settings.findUnique({ where: { key: INSTANCE_ID_KEY } });
  if (existing?.value) return existing.value;

  const id = crypto.randomUUID();
  await prisma.settings.upsert({
    where:  { key: INSTANCE_ID_KEY },
    update: { value: id },
    create: { key: INSTANCE_ID_KEY, value: id },
  });
  return id;
}

export async function sendHeartbeat(): Promise<void> {
  const endpoint = process.env.TELEMETRY_ENDPOINT;
  const key = process.env.TELEMETRY_KEY;
  if (!endpoint || !key) return;

  const enabledSetting = await prisma.settings.findUnique({ where: { key: "TELEMETRY_ENABLED" } }).catch(() => null);
  if (enabledSetting?.value !== "true") return;

  try {
    const [instanceId, libraryNameRow, totalBooks, totalMembers] = await Promise.all([
      getOrCreateInstanceId(),
      prisma.settings.findUnique({ where: { key: "LIBRARY_NAME" } }),
      prisma.book.count(),
      prisma.member.count(),
    ]);

    await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-telemetry-key": key },
      body: JSON.stringify({
        instanceId,
        project:     "pvd-library",
        hostname:    os.hostname(),
        libraryName: libraryNameRow?.value ?? null,
        version:     process.env.npm_package_version ?? "0.1.0",
        meta:        { totalBooks, totalMembers },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Never let a failed check-in affect the app.
  }
}
