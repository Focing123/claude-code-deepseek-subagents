# Claude Code DeepSeek Subagents

Run Claude Code normally while routing Claude Code subagents to DeepSeek through a small local Anthropic-compatible gateway.

```text
main Claude Code requests      -> Anthropic / Claude Code login
Claude Code subagent requests  -> DeepSeek API
```

The routing rule is simple: Claude Code sends an `x-claude-code-agent-id` header for subagent requests. This gateway detects that header, sends the request to DeepSeek, and rewrites the model to `DEEPSEEK_SUBAGENT_MODEL`.

## Quick Start From GitHub

Clone the repo and install the commands into your user directory:

```bash
git clone https://github.com/Focing123/claude-code-deepseek-subagents.git
cd claude-code-deepseek-subagents
mkdir -p ~/.local
npm install -g . --prefix ~/.local
```

If `claude-deepseek` is not found after install, add `~/.local/bin` to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

From any Claude Code project:

```bash
claude-deepseek-init

export DEEPSEEK_API_KEY='sk-deepseek-...'
claude-deepseek --model sonnet
```

Then ask Claude Code:

```text
Use the deepseek-reviewer agent to review this project.
```

That is enough. The main conversation stays on Claude Code, while subagents are routed to DeepSeek.

## Commands

### `claude-deepseek-init`

Creates ready-to-use agents in the current project:

```text
.claude/agents/deepseek-reviewer.md
.claude/agents/deepseek-researcher.md
```

Use `--force` to overwrite existing copies.

### `claude-deepseek`

Starts the local gateway and then runs `claude` with the correct environment.

```bash
claude-deepseek --model sonnet
```

It automatically sets:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787
```

It also unsets API-token model overrides that commonly break Claude Code subscription login.

If you use an Anthropic API key for the main Claude Code session instead of a Claude Code subscription login, set it as:

```bash
export UPSTREAM_ANTHROPIC_API_KEY='sk-ant-...'
```

Do not use `ANTHROPIC_API_KEY` for this mode; `claude-deepseek` clears it before starting Claude Code so subscription login keeps working by default.

### `claude-deepseek-gateway`

Runs only the gateway.

```bash
DEEPSEEK_API_KEY='sk-deepseek-...' claude-deepseek-gateway
```

See [examples/manual-gateway.md](examples/manual-gateway.md) for the two-terminal setup.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | required | DeepSeek API key used for subagent requests |
| `DEEPSEEK_SUBAGENT_MODEL` | `deepseek-v4-flash` | Model sent to DeepSeek |
| `DEEPSEEK_ANTHROPIC_BASE_URL` | `https://api.deepseek.com/anthropic` | Anthropic-compatible DeepSeek endpoint |
| `UPSTREAM_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Upstream used for main Claude requests |
| `UPSTREAM_ANTHROPIC_API_KEY` | unset | Optional Anthropic API key for main requests |
| `HOST` | `127.0.0.1` | Gateway bind host |
| `PORT` | `8787` | Gateway port |
| `CLAUDE_MODELS` | `sonnet,opus,haiku` | Comma-separated aliases returned by `/v1/models` |
| `CLAUDE_DEEPSEEK_CLAUDE_BIN` | `claude` | Claude Code binary |

## Why Agent Files Use `model: haiku`

Claude Code validates subagent model names against Claude model names before sending the request. DeepSeek model names are not valid there.

The agent templates therefore use:

```yaml
model: haiku
```

The gateway rewrites subagent requests after Claude Code sends them:

```text
request model: haiku
upstream model: deepseek-v4-flash
```

You can change the DeepSeek model with:

```bash
export DEEPSEEK_SUBAGENT_MODEL='deepseek-v4-pro'
```

Current DeepSeek API docs list `deepseek-v4-flash` and `deepseek-v4-pro` as the primary model names. Use `deepseek-v4-pro` if you want the higher capability model for subagents.

## Verify Routing

Check the gateway log:

```text
[gateway] ... agent=main model=claude-sonnet... -> anthropic
[gateway] ... agent=agt_... model=deepseek-v4-flash -> deepseek
```

Do not ask the subagent which model it is using. Claude Code still tells the subagent that the selected model is a Claude model; the HTTP request is rewritten only inside the gateway.

## Security Notes

- The gateway binds to `127.0.0.1` by default.
- Do not expose it publicly.
- Do not commit `DEEPSEEK_API_KEY`.
- `GATEWAY_AUTH_TOKEN` is available for custom setups, but it is usually not needed for local Claude Code usage.

## How It Works

```text
Claude Code
  |
  | ANTHROPIC_BASE_URL=http://127.0.0.1:8787
  v
local gateway
  |
  | no x-claude-code-agent-id      -> Anthropic
  | with x-claude-code-agent-id    -> DeepSeek
```

For Anthropic routes, credentials and Claude Code beta headers are preserved. For DeepSeek routes, the gateway replaces credentials with `DEEPSEEK_API_KEY` and rewrites `model`.

## Rollback

Stop Claude Code and run it normally:

```bash
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_AUTH_TOKEN
unset ANTHROPIC_API_KEY
unset ANTHROPIC_MODEL
unset CLAUDE_CODE_SUBAGENT_MODEL
unset ANTHROPIC_DEFAULT_HAIKU_MODEL
unset ANTHROPIC_DEFAULT_SONNET_MODEL
unset ANTHROPIC_DEFAULT_OPUS_MODEL

claude --model sonnet
```
