import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createGateway } from "../src/gateway.mjs";

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createUpstream(name, requests) {
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    requests.push({
      provider: name,
      path: req.url,
      model: body.model,
      apiKey: req.headers["x-api-key"],
      agentId: req.headers["x-claude-code-agent-id"],
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ provider: name, model: body.model }));
  });

  const address = await listen(server);
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("health endpoint responds without upstreams", async () => {
  const { server } = createGateway({ log: () => {} });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await close(server);
  }
});

test("routes main requests to Anthropic and subagent requests to DeepSeek", async () => {
  const requests = [];
  const anthropic = await createUpstream("anthropic", requests);
  const deepseek = await createUpstream("deepseek", requests);
  const { server } = createGateway({
    anthropicBaseUrl: anthropic.baseUrl,
    deepseekBaseUrl: deepseek.baseUrl,
    deepseekApiKey: "deepseek-test-key",
    deepseekModel: "deepseek-test-model",
    log: () => {},
  });
  const address = await listen(server);
  const gatewayUrl = `http://127.0.0.1:${address.port}`;

  try {
    const mainResponse = await fetch(`${gatewayUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "main-key",
      },
      body: JSON.stringify({ model: "sonnet", messages: [] }),
    });
    assert.equal(mainResponse.status, 200);

    const subagentResponse = await fetch(`${gatewayUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "main-key",
        "x-claude-code-agent-id": "agent-1",
      },
      body: JSON.stringify({ model: "haiku", messages: [] }),
    });
    assert.equal(subagentResponse.status, 200);

    assert.deepEqual(requests, [
      {
        provider: "anthropic",
        path: "/v1/messages",
        model: "sonnet",
        apiKey: "main-key",
        agentId: undefined,
      },
      {
        provider: "deepseek",
        path: "/v1/messages",
        model: "deepseek-test-model",
        apiKey: "deepseek-test-key",
        agentId: "agent-1",
      },
    ]);
  } finally {
    await close(server);
    await close(anthropic.server);
    await close(deepseek.server);
  }
});

test("estimates count_tokens locally for DeepSeek subagent requests", async () => {
  const { server } = createGateway({
    deepseekApiKey: "deepseek-test-key",
    deepseekModel: "deepseek-test-model",
    log: () => {},
  });
  const address = await listen(server);
  const gatewayUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${gatewayUrl}/v1/messages/count_tokens`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "main-key",
        "x-claude-code-agent-id": "agent-1",
      },
      body: JSON.stringify({
        model: "haiku",
        system: "You are a reviewer.",
        messages: [{ role: "user", content: "Review this project." }],
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.input_tokens, "number");
    assert.ok(body.input_tokens > 0);
  } finally {
    await close(server);
  }
});

test("models endpoint returns configured Claude model aliases", async () => {
  const { server } = createGateway({
    claudeModels: [{ id: "custom-sonnet", display_name: "custom-sonnet" }],
    log: () => {},
  });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: [{ id: "custom-sonnet", display_name: "custom-sonnet" }],
    });
  } finally {
    await close(server);
  }
});
