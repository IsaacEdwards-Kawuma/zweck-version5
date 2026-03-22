import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

export function getServerPackageVersion(): string {
  if (cached) return cached;
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    cached = pkg.version?.trim() || "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
