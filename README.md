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

**What it does:**

Given `petstore.yaml`:

```yaml
openapi: 3.0.0
info: { title: Petstore API, version: "1.0.0" }
servers: [{ url: https://petstore.example.com/api }]
paths:
  /pets/{petId}:
    get:
      operationId: getPetById
      summary: Get a pet by ID
      parameters:
        - name: petId
          in: path
          required: true
          schema: { type: string }
  /pets:
    post:
      operationId: createPet
      summary: Add a new pet
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
                tag: { type: string }
```

mcpkit generates a project whose `src/index.ts` contains one MCP tool per endpoint:

```ts
server.tool(
  "getpetbyid",
  "Get a pet by ID",
  { petId: z.string() },
  async ({ petId }) => {
    const url = `https://petstore.example.com/api/pets/${petId}`;
    // fetch + return the JSON response as the tool result
  }
);

server.tool(
  "createpet",
  "Add a new pet",
  { name: z.string(), tag: z.string().optional() },
  async ({ name, tag }) => {
    // POST with body: JSON.stringify({ name, tag })
  }
);
```

Register it in your AI assistant and you can ask "get pet number 42" and it calls your real API.

### Generate from a SQLite database

Creates read-only query tools for every table in your database.

```bash
npx @fanioz/mcpkit from sqlite:///path/to/your.db
npx @fanioz/mcpkit from sqlite:///path/to/your.db --name my-db-mcp
```

For every table, the generated server exposes a read-only query tool:

```ts
server.tool(
  "list_users",
  "List rows from the users table",
  {
    limit: z.number().optional().describe("Max rows to return (default 100)"),
    where: z.string().optional().describe("SQL WHERE clause (use with caution)"),
  },
  async ({ limit = 100, where }) => {
    // SELECT * FROM users [WHERE ...] LIMIT ?
  }
);
```

The database is copied into the generated project as `data.db` and opened read-only.

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
