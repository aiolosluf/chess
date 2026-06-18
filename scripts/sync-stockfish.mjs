import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const sourceDir = join(root, "node_modules", "stockfish", "bin");
const files = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
];

mkdirSync(publicDir, { recursive: true });

for (const file of files) {
  copyFileSync(join(sourceDir, file), join(publicDir, file));
}
