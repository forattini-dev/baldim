# @baldim/mcp

Model Context Protocol server for Baldim. It serves Baldim documentation without a database connection and exposes database tools when `BALDIM_CONNECTION_STRING` is configured.

```bash
npx @baldim/mcp
```

Use `--transport=http --host=127.0.0.1 --port=17500` for Streamable HTTP transport.
