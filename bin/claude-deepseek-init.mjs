#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function copyTemplate(templatePath, destinationPath, { force = false } = {}) {
  const content = await readFile(templatePath, "utf8");
  try {
    await writeFile(destinationPath, content, { flag: force ? "w" : "wx" });
    return "created";
  } catch (error) {
    if (error.code === "EEXIST") return "exists";
    throw error;
  }
}

function printHelp() {
  console.log(`claude-deepseek-init

Install ready-to-use Claude Code DeepSeek subagents in the current project.

Usage:
  claude-deepseek-init [--force]

Creates:
  .claude/agents/deepseek-reviewer.md
  .claude/agents/deepseek-researcher.md`);
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

const force = args.has("--force");
const agentsDir = path.resolve(process.cwd(), ".claude", "agents");
await mkdir(agentsDir, { recursive: true });

const templatesDir = path.join(root, "templates", "agents");
const files = ["deepseek-reviewer.md", "deepseek-researcher.md"];

for (const file of files) {
  const status = await copyTemplate(
    path.join(templatesDir, file),
    path.join(agentsDir, file),
    { force },
  );
  console.log(`${status}: .claude/agents/${file}`);
}

console.log("");
console.log("Next:");
console.log("  export DEEPSEEK_API_KEY='sk-deepseek-...'");
console.log("  claude-deepseek --model sonnet");
