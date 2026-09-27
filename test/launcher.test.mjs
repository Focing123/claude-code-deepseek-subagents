import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcher = path.join(root, "bin", "claude-deepseek.mjs");

function runLauncher(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], {
      cwd: root,
      env: {
        ...process.env,
        DEEPSEEK_API_KEY: "test-key",
        CLAUDE_DEEPSEEK_CLAUDE_BIN: process.execPath,
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("embedded launcher keeps gateway logs out of the Claude terminal by default", async () => {
  const result = await runLauncher(["--eval", "process.exit(0)"]);

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
});

test("gateway debug mode is explicit and is not forwarded to Claude", async () => {
  const result = await runLauncher([
    "--gateway-debug",
    "--eval",
    "process.exit(0)",
  ]);

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /\[gateway\] listening on/);
});
