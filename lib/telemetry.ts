import os from "os";
import { prisma } from "@/lib/prisma";

const INSTANCE_ID_KEY = "__INSTANCE_ID";

/** Safe to hardcode — just a URL, not a secret. Settings → System can override it. */
export const DEFAULT_TELEMETRY_ENDPOINT = "https://me.mrsloth.org/api/telemetry";

/**
 * Version check-in — lets the maintainer know this deployment is on an
 * older version so they can proactively reach out about updates.
 *
 * Disabled by default. Turning it on in Settings → System auto-fills the
 * endpoint with DEFAULT_TELEMETRY_ENDPOINT if left blank — no manual setup
 * needed for that part. The shared key is resolved in this order: the
 * Settings-table value (typed once in the UI) → a TELEMETRY_KEY env var
 * set on this deployment → nothing. The key is deliberately never
 * hardcoded here — this file ships in the repo, and baking the real
 * secret in would let anyone with source access read it and spoof
 * check-ins for other deployments. Sends only: an anonymous instance id,
 * hostname, library name, app version, rough book/member counts, and
 * basic runtime info (Node/Next version, OS, process uptime). Never
 * throws — a failed check-in never affects the app.
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

export interface HeartbeatResult {
  ok: boolean;
  message: string;
}

export async function sendHeartbeat(): Promise<HeartbeatResult> {
  const [enabledSetting, endpointSetting, keySetting] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "TELEMETRY_ENABLED" } }),
    prisma.settings.findUnique({ where: { key: "TELEMETRY_ENDPOINT" } }),
    prisma.settings.findUnique({ where: { key: "TELEMETRY_KEY" } }),
  ]).catch(() => [null, null, null]);
  if (enabledSetting?.value !== "true") return { ok: false, message: "Version check-in is disabled" };

  const endpoint = endpointSetting?.value || DEFAULT_TELEMETRY_ENDPOINT;
  const key = keySetting?.value || process.env.TELEMETRY_KEY;
  if (!endpoint || !key) return { ok: false, message: "Endpoint and key must both be set" };

  try {
    const [instanceId, libraryNameRow, totalBooks, totalMembers] = await Promise.all([
      getOrCreateInstanceId(),
      prisma.settings.findUnique({ where: { key: "LIBRARY_NAME" } }),
      prisma.book.count(),
      prisma.member.count(),
    ]);

    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-telemetry-key": key },
      body: JSON.stringify({
        instanceId,
        project:     "pvd-library",
        hostname:    os.hostname(),
        libraryName: libraryNameRow?.value ?? null,
        version:     process.env.npm_package_version ?? "0.1.0",
        meta: {
          totalBooks,
          totalMembers,
          nodeVersion: process.version,
          nextVersion: (await import("next/package.json")).version,
          platform:    `${os.platform()} ${os.release()}`,
          uptimeSecs:  Math.floor(process.uptime()),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    interface TelemetryResponse {
      ok?: boolean;
      updateAvailable?: boolean;
      latestVersion?: string;
      releaseUrl?: string;
      githubUrl?: string;
    }
    const json = (await res.json().catch(() => null)) as TelemetryResponse | null;

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        message: `Endpoint rejected the check-in (HTTP ${res.status}) — check the key matches the server's TELEMETRY_SECRET`,
      };
    }

    if (json?.updateAvailable && typeof json.latestVersion === "string") {
      const releaseUrl = typeof json.releaseUrl === "string" ? json.releaseUrl : (typeof json.githubUrl === "string" ? json.githubUrl : "");
      await prisma.settings.upsert({
        where:  { key: "__UPDATE_AVAILABLE" },
        update: { value: json.latestVersion },
        create: { key: "__UPDATE_AVAILABLE", value: json.latestVersion },
      });
      await prisma.settings.upsert({
        where:  { key: "__UPDATE_URL" },
        update: { value: releaseUrl },
        create: { key: "__UPDATE_URL", value: releaseUrl },
      });
      return { ok: true, message: `Connected — update available: v${json.latestVersion}` };
    } else {
      await prisma.settings.deleteMany({ where: { key: { in: ["__UPDATE_AVAILABLE", "__UPDATE_URL"] } } });
      return { ok: true, message: json?.latestVersion ? `Connected — up to date (v${json.latestVersion})` : "Connected" };
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message || "Request failed" };
  }
}
