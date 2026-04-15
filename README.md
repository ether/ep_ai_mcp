# ep_ai_mcp

MCP (Model Context Protocol) server for Etherpad. Exposes pad content, authorship,
editing, and chat as MCP tools that AI assistants can call.

## Installation

Requires `ep_ai_core`.

```bash
pnpm run plugins i ep_ai_core ep_ai_mcp
```

## Endpoint

The MCP server is mounted at `/mcp` using the Streamable HTTP transport.

## Authentication

Every request to `/mcp` must include a valid `Authorization: Bearer <token>`
header. The token can be either:

- The Etherpad API key (from `APIKEY.txt`)
- A valid JWT signed with the Etherpad OAuth2 provider's RS256 key

Unauthenticated requests receive a `401` response.

## Tools

### Content

| Tool | Description |
|------|-------------|
| `get_pad_text` | Get current plain text of a pad |
| `get_pad_html` | Get current HTML content of a pad |
| `get_pad_diff` | Get difference between two revisions |
| `search_pads` | Search for pads containing specific text |

### Authorship

| Tool | Description |
|------|-------------|
| `get_pad_authorship` | Get per-paragraph author attribution for current text |
| `get_text_provenance` | Get full edit history for specific text in a pad |
| `get_pad_contributors` | Get contribution statistics for all authors |
| `get_pad_activity` | Get timeline of changes to a pad |

### Editing

| Tool | Description |
|------|-------------|
| `edit_pad` | Edit pad content (insert at position, find-and-replace, or append) |
| `create_pad` | Create a new pad with optional initial content |

### Chat

| Tool | Description |
|------|-------------|
| `get_chat_history` | Get chat messages from a pad |
| `send_chat_message` | Send a chat message to a pad |

### Meta

| Tool | Description |
|------|-------------|
| `list_pads` | List all pad IDs the AI has access to |
| `get_pad_info` | Get metadata about a pad (revision count, authors, last edited, etc.) |

All tools respect the access control settings configured in `ep_ai_core`. Pads
with `none` access are hidden; pads with `readOnly` access block editing tools.

## Connecting from AI Clients

### Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "etherpad": {
      "url": "http://localhost:9001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "etherpad": {
      "url": "http://localhost:9001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add etherpad --transport http http://localhost:9001/mcp \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### OpenClaw

Add Etherpad as an MCP server in your OpenClaw config (`config.yaml`):

```yaml
mcp_servers:
  etherpad:
    url: http://localhost:9001/mcp
    transport: streamable-http
    headers:
      Authorization: "Bearer YOUR_API_KEY"
```

Once connected, OpenClaw can interact with Etherpad from any of its
supported channels (WhatsApp, Telegram, Slack, Discord, etc.). Ask it
to read pads, check who wrote what, edit documents, or send chat
messages — all 14 MCP tools are available.

Example from Telegram:
```
> Read the pad "meeting-notes" and summarize it
> Who wrote the introduction in pad "report-q1"?
> Add a conclusion to pad "draft-proposal"
```

## License

Apache-2.0
