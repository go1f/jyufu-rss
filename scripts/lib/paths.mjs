import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..");
export const collectorDir = path.join(repoRoot, "collector");
export const siteDir = path.join(repoRoot, "site");
export const dataDir = path.join(siteDir, "data");
export const feedsDir = path.join(siteDir, "feeds");
export const logsDir = path.join(repoRoot, "logs");
