import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const configHome = join(root, ".wrangler-config");
const logPath = join(root, ".wrangler-logs");

mkdirSync(configHome, { recursive: true });
mkdirSync(logPath, { recursive: true });

const env = {
  ...process.env,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || configHome,
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || logPath,
};

const child = spawn(
  process.execPath,
  [
    "node_modules/vinext/dist/cli.js",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
