#!/usr/bin/env node

import { spawn } from "node:child_process";
import { startGateway } from "../src/gateway.mjs";

function printHelp() {
  console.log(`claude-deepseek

Start the local gateway, then run Claude Code with subagents routed to DeepSeek.

Usage:
  claude-deepseek [claude arguments...]

Examples:
  DEEPSEEK_API_KEY=sk-... claude-deepseek --model sonnet
  DEEPSEEK_SUBAGENT_MODEL=deepseek-v4-pro claude-deepseek --model sonnet

Environment:
  DEEPSEEK_API_KEY             required for subagents
  DEEPSEEK_SUBAGENT_MODEL      default: deepseek-v4-flash
  PORT                         default: 8787
  HOST                         default: 127.0.0.1
  CLAUDE_DEEPSEEK_CLAUDE_BIN   default: claude`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY.");
  console.error("Run: export DEEPSEEK_API_KEY='sk-deepseek-...'");
  process.exit(1);
}

const { server, config } = await startGateway();
const claudeBin = process.env.CLAUDE_DEEPSEEK_CLAUDE_BIN || "claude";
const claudeArgs = process.argv.slice(2);

const childEnv = {
  ...process.env,
  ANTHROPIC_BASE_URL: `http://${config.host}:${config.port}`,
};

delete childEnv.ANTHROPIC_AUTH_TOKEN;
delete childEnv.ANTHROPIC_API_KEY;
delete childEnv.ANTHROPIC_MODEL;
delete childEnv.CLAUDE_CODE_SUBAGENT_MODEL;
delete childEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL;
delete childEnv.ANTHROPIC_DEFAULT_SONNET_MODEL;
delete childEnv.ANTHROPIC_DEFAULT_OPUS_MODEL;

const child = spawn(claudeBin, claudeArgs, {
  env: childEnv,
  stdio: "inherit",
});

function stopGateway() {
  server.close();
}

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

child.on("error", (error) => {
  stopGateway();
  console.error(`Failed to start ${claudeBin}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  stopGateway();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
