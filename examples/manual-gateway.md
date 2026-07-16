# Manual Gateway Mode

Use this mode if you want to run the gateway in one terminal and Claude Code in another.

Terminal 1:

```bash
export DEEPSEEK_API_KEY='sk-deepseek-...'
claude-deepseek-gateway
```

Terminal 2:

```bash
export ANTHROPIC_BASE_URL='http://127.0.0.1:8787'

unset ANTHROPIC_AUTH_TOKEN
unset ANTHROPIC_API_KEY
unset ANTHROPIC_MODEL
unset CLAUDE_CODE_SUBAGENT_MODEL
unset ANTHROPIC_DEFAULT_HAIKU_MODEL
unset ANTHROPIC_DEFAULT_SONNET_MODEL
unset ANTHROPIC_DEFAULT_OPUS_MODEL

claude --model sonnet
```

Watch terminal 1 to verify routing:

```text
[gateway] ... agent=main model=claude-sonnet... -> anthropic
[gateway] ... agent=agt_... model=deepseek-v4-flash -> deepseek
```
