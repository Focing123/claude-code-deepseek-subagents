#!/usr/bin/env node

import { startGateway } from "../src/gateway.mjs";

try {
  await startGateway();
} catch (error) {
  console.error("[gateway] failed to start", error);
  process.exit(1);
}
