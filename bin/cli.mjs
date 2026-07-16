#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = new Map([
  ["claude-deepseek", "claude-deepseek.mjs"],
  ["claude-deepseek-gateway", "claude-deepseek-gateway.mjs"],
  ["claude-deepseek-init", "claude-deepseek-init.mjs"],
  ["gateway", "claude-deepseek-gateway.mjs"],
  ["init", "claude-deepseek-init.mjs"],
]);

function printHelp() {
  console.log(`claude-code-deepseek-subagents

Usage:
  npx claude-code-deepseek-subagents init
  npx claude-code-deepseek-subagents claude-deepseek --model sonnet
  npx claude-code-deepseek-subagents gateway

Commands:
  init                     Install sample DeepSeek-routed Claude Code agents
  claude-deepseek          Start gateway, then run Claude Code
  gateway                  Start only the gateway`);
}

const [command = "--help", ...args] = process.argv.slice(2);

if (command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const script = commands.get(command);
if (!script) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const child = spawn(process.execPath, [path.join(__dirname, script), ...args], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
