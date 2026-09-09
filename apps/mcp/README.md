# @baldin/mcp

Model Context Protocol server for Baldin. It serves Baldin documentation without a database connection and exposes database tools when `BALDIN_CONNECTION_STRING` is configured.

```bash
npx @baldin/mcp
```

Use `--transport=http --host=127.0.0.1 --port=17500` for Streamable HTTP transport.
