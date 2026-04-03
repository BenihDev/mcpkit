# mcpkit

Generate ready-to-use MCP servers from OpenAPI specs, databases, or YAML descriptions.

> [Model Context Protocol](https://modelcontextprotocol.io/) is the standard for connecting AI assistants to your tools and data. mcpkit gets you from zero to a working MCP server in seconds.

## Install

```bash
npx @fanioz/mcpkit
```

## Usage

### Create a blank MCP server

```bash
npx @fanioz/mcpkit init
# or with flags:
npx @fanioz/mcpkit init --name my-server --description "My custom MCP server"
```

### Generate from an OpenAPI spec

Turns every endpoint into an MCP tool. Supports OpenAPI 3.x and Swagger 2.x.

```bash
npx @fanioz/mcpkit from openapi.yaml
npx @fanioz/mcpkit from openapi.yaml --name petstore-mcp
npx @fanioz/mcpkit from openapi.yaml --name my-api -o ./output-dir
```

**Example — generate from a public API spec:**

```bash
npx @fanioz/mcpkit from https://api.example.com/openapi.yaml --name example-mcp
cd example-mcp
npm install
npm run dev
```

### Generate from a SQLite database

Creates read-only query tools for every table in your database.

```bash
npx @fanioz/mcpkit from sqlite:///path/to/your.db
npx @fanioz/mcpkit from sqlite:///path/to/your.db --name my-db-mcp
```

### Generate from a YAML description

Define your MCP tools in a simple YAML file:

```yaml
# mcp.yml
name: my-tools
version: "1.0.0"
description: My custom MCP server
tools:
  - name: search
    description: Search for items
    parameters:
      - name: query
        type: string
        description: Search query
        required: true
      - name: limit
        type: string
        description: Max results
        required: false
```

```bash
npx @fanioz/mcpkit from mcp.yml
```

## Generated project structure

Every command outputs a ready-to-run TypeScript project:

```
my-mcp-server/
  package.json
  tsconfig.json
  src/
    index.ts        # MCP server with your tools
  .gitignore
```

```bash
cd my-mcp-server
npm install
npm run dev        # Start the MCP server
```

## Use with AI assistants

Add your generated MCP server to your AI assistant's config:

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/my-mcp-server/src/index.ts"]
    }
  }
}
```

**Cursor / Windsurf** — add to your MCP settings.

## YAML spec reference

```yaml
name: server-name          # Required: kebab-case server name
version: "1.0.0"           # Optional: version string
description: My server     # Optional: description
tools:
  - name: tool_name        # Required: tool identifier
    description: What it does  # Required
    parameters:
      - name: param_name   # Required: parameter name
        type: string       # Required: parameter type
        description: Help text  # Optional
        required: true     # Optional: default false
```

## License

MIT
