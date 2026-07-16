import http from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_CLAUDE_MODELS = [
  { id: "sonnet", display_name: "Claude Sonnet" },
  { id: "opus", display_name: "Claude Opus" },
  { id: "haiku", display_name: "Claude Haiku" },
];

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function providerUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function roughTokenEstimate(value) {
  if (value == null) return 0;

  if (typeof value === "string") {
    return Math.max(1, Math.ceil(value.length / 4));
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + roughTokenEstimate(item), 0);
  }

  if (typeof value === "object") {
    return Object.values(value).reduce(
      (total, item) => total + roughTokenEstimate(item),
      0,
    );
  }

  return roughTokenEstimate(String(value));
}

function estimateCountTokens(body) {
  const estimate = roughTokenEstimate({
    system: body.system,
    messages: body.messages,
    tools: body.tools,
    tool_choice: body.tool_choice,
  });

  return { input_tokens: Math.max(1, estimate) };
}

function parseClaudeModels(value) {
  if (!value) return DEFAULT_CLAUDE_MODELS;

  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .map((id) => ({ id, display_name: id }));
}

function hasValidGatewayAuth(req, token) {
  if (!token) return true;

  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length)
    : "";
  const apiKey = req.headers["x-api-key"] || "";

  return bearer === token || apiKey === token;
}

function isSubagentRequest(req) {
  return Boolean(req.headers["x-claude-code-agent-id"]);
}

function outgoingHeaders(req, provider) {
  const headers = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  headers["content-type"] = "application/json";
  headers["accept-encoding"] = "identity";

  if (provider.apiKey) {
    delete headers.authorization;
    delete headers["x-api-key"];
    headers["x-api-key"] = provider.apiKey;
  }

  return headers;
}

function buildConfig(options = {}) {
  return {
    host: options.host || process.env.HOST || DEFAULT_HOST,
    port: Number(options.port || process.env.PORT || DEFAULT_PORT),
    anthropicBaseUrl:
      options.anthropicBaseUrl ||
      process.env.UPSTREAM_ANTHROPIC_BASE_URL ||
      DEFAULT_ANTHROPIC_BASE_URL,
    deepseekBaseUrl:
      options.deepseekBaseUrl ||
      process.env.DEEPSEEK_ANTHROPIC_BASE_URL ||
      DEFAULT_DEEPSEEK_BASE_URL,
    upstreamAnthropicApiKey:
      options.upstreamAnthropicApiKey || process.env.UPSTREAM_ANTHROPIC_API_KEY,
    deepseekApiKey: options.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    gatewayAuthToken: options.gatewayAuthToken || process.env.GATEWAY_AUTH_TOKEN,
    deepseekModel:
      options.deepseekModel ||
      process.env.DEEPSEEK_SUBAGENT_MODEL ||
      DEFAULT_DEEPSEEK_MODEL,
    claudeModels:
      options.claudeModels || parseClaudeModels(process.env.CLAUDE_MODELS),
    log: options.log || console.error,
  };
}

function targetForRequest(req, config) {
  if (isSubagentRequest(req)) {
    return {
      name: "deepseek",
      baseUrl: config.deepseekBaseUrl,
      apiKey: config.deepseekApiKey,
    };
  }

  return {
    name: "anthropic",
    baseUrl: config.anthropicBaseUrl,
    apiKey: config.upstreamAnthropicApiKey,
  };
}

async function proxyRequest(req, res, config) {
  if (!hasValidGatewayAuth(req, config.gatewayAuthToken)) {
    return sendJson(res, 401, { error: "invalid gateway credential" });
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "HEAD" && requestUrl.pathname === "/") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && requestUrl.pathname === "/v1/models") {
    return sendJson(res, 200, {
      data: config.claudeModels,
    });
  }

  const isMessagesRequest =
    req.method === "POST" && requestUrl.pathname === "/v1/messages";
  const isCountTokensRequest =
    req.method === "POST" &&
    requestUrl.pathname === "/v1/messages/count_tokens";

  if (!isMessagesRequest && !isCountTokensRequest) {
    return sendJson(res, 404, {
      error: "only POST /v1/messages and /v1/messages/count_tokens are implemented",
    });
  }

  const rawBody = await readBody(req);
  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "request body is not valid JSON" });
  }

  const provider = targetForRequest(req, config);
  if (provider.name === "deepseek" && !provider.apiKey) {
    return sendJson(res, 500, { error: "missing DEEPSEEK_API_KEY" });
  }

  if (provider.name === "deepseek") {
    body.model = config.deepseekModel;
  }

  if (isCountTokensRequest && provider.name === "deepseek") {
    return sendJson(res, 200, estimateCountTokens(body));
  }

  const upstreamBody = Buffer.from(JSON.stringify(body));
  const upstreamUrl = providerUrl(provider.baseUrl, req.url);
  config.log(
    `[gateway] ${new Date().toISOString()} agent=${
      req.headers["x-claude-code-agent-id"] || "main"
    } model=${body.model || "<missing>"} -> ${provider.name}`,
  );

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers: outgoingHeaders(req, provider),
    body: upstreamBody,
  });

  const responseHeaders = {};
  for (const [key, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  }

  res.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }

  for await (const chunk of upstream.body) {
    res.write(chunk);
  }
  res.end();
}

export function createGateway(options = {}) {
  const config = buildConfig(options);
  const server = http.createServer((req, res) => {
    proxyRequest(req, res, config).catch((error) => {
      config.log("[gateway] request failed", error);
      if (!res.headersSent) {
        sendJson(res, 502, { error: "upstream request failed" });
      } else {
        res.destroy(error);
      }
    });
  });

  return { server, config };
}

export function startGateway(options = {}) {
  const { server, config } = createGateway(options);

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      config.log(`[gateway] listening on http://${config.host}:${config.port}`);
      resolve({ server, config });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.host);
  });
}
