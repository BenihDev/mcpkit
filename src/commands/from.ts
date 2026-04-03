import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseOpenApi, getSqliteSchema, parseYamlSpec, sanitizeName, writeFiles } from "../utils.js";

interface FromOptions {
  name?: string;
  output?: string;
  readOnly?: boolean;
}

export async function fromCommand(source: string, options: FromOptions): Promise<void> {
  if (source.startsWith("sqlite://")) {
    await fromSqlite(source, options);
  } else if (source.endsWith(".yaml") || source.endsWith(".yml")) {
    const content = fs.readFileSync(source, "utf-8");
    const doc = yaml.load(content) as Record<string, unknown>;

    // Detect if it's an OpenAPI spec
    if (doc.openapi || doc.swagger) {
      await fromOpenApi(source, doc, options);
    } else if (doc.tools || doc.name) {
      await fromYaml(source, doc, options);
    } else {
      console.error("Could not detect file type. Expected OpenAPI spec (with openapi/swagger field) or mcpkit YAML (with tools/name field).");
      process.exit(1);
    }
  } else if (source.endsWith(".json")) {
    const content = fs.readFileSync(source, "utf-8");
    const doc = JSON.parse(content);
    if (doc.openapi || doc.swagger) {
      await fromOpenApi(source, doc, options);
    } else {
      console.error("JSON files must be OpenAPI specs (with openapi/swagger field).");
      process.exit(1);
    }
  } else {
    console.error(`Unknown source format: ${source}`);
    console.error("Supported: OpenAPI YAML/JSON files, sqlite:// URLs, or mcpkit YAML files");
    process.exit(1);
  }
}

async function fromOpenApi(
  filePath: string,
  spec: Record<string, unknown>,
  options: FromOptions
): Promise<void> {
  console.log("Parsing OpenAPI spec...");
  const parsed = parseOpenApi(spec);

  if (parsed.tools.length === 0) {
    console.error("No API endpoints found in the OpenAPI spec.");
    process.exit(1);
  }

  const name = sanitizeName(options.name || parsed.title.toLowerCase().replace(/\s+/g, "-") || "openapi-mcp-server");
  const outDir = path.resolve(options.output || ".");
  const pkgDir = path.join(outDir, name);

  console.log(`Found ${parsed.tools.length} endpoint(s). Generating MCP server: ${name}`);

  const toolDefinitions = parsed.tools
    .map((t) => {
      const paramDecls = t.params
        .map(
          (p) =>
            `${p.name}: z.string()${p.required ? "" : ".optional()"}${p.description ? `.describe(${JSON.stringify(p.description)})` : ""}`
        )
        .join(", ");
      const paramDestructure =
        t.params.length > 0 ? `{ ${t.params.map((p) => p.name).join(", ")} }` : "_args";
      const urlTemplate = t.url.replace(/{([^}]+)}/g, "${$1}");
      const bodyParams = t.params
        .filter((p) => !t.url.includes(`{${p.name}}`))
        .map((p) => p.name)
        .join(", ");
      const bodyLine =
        t.method !== "get" && bodyParams
          ? `\n        body: JSON.stringify({ ${bodyParams} }),`
          : "";

      return [
        `// ${t.description}`,
        `server.tool(`,
        `  "${t.name}",`,
        `  ${JSON.stringify(t.description)},`,
        `  { ${paramDecls} },`,
        `  async (${paramDestructure}) => {`,
        `    try {`,
        `      const url = \`${urlTemplate}\`;`,
        `      const res = await fetch(url, {`,
        `        method: "${t.method.toUpperCase()}",`,
        `        headers: { "Content-Type": "application/json" },${bodyLine}`,
        `      });`,
        `      const data = await res.json();`,
        `      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };`,
        `    } catch (error) {`,
        `      return { content: [{ type: "text", text: \`Error: \${error instanceof Error ? error.message : String(error)}\` }], isError: true };`,
        `    }`,
        `  }`,
        `);`,
      ].join("\n");
    })
    .join("\n\n");

  const files = generateServerFiles(name, `${parsed.title} MCP Server`, toolDefinitions);
  writeFiles(pkgDir, files);

  console.log(`\n✓ MCP server created in ${pkgDir}`);
  console.log(`\n  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

async function fromSqlite(source: string, options: FromOptions): Promise<void> {
  const dbPath = source.replace("sqlite://", "");
  const resolvedPath = path.resolve(dbPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Database not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log("Reading SQLite schema...");
  const tables = getSqliteSchema(resolvedPath);

  if (tables.length === 0) {
    console.error("No tables found in the database.");
    process.exit(1);
  }

  const dbName = path.basename(resolvedPath, path.extname(resolvedPath));
  const name = sanitizeName(options.name || `${dbName}-mcp-server`);
  const outDir = path.resolve(options.output || ".");
  const pkgDir = path.join(outDir, name);

  console.log(`Found ${tables.length} table(s). Generating MCP server: ${name}`);

  const toolDefinitions = tables
    .map(
      (t) => `// List all rows from ${t.name}
server.tool(
  "list_${t.name.toLowerCase()}",
  "List rows from the ${t.name} table",
  {
    limit: z.number().optional().describe("Max rows to return (default 100)"),
    where: z.string().optional().describe("SQL WHERE clause (use with caution)"),
  },
  async ({ limit = 100, where }) => {
    const dbPath = path.join(import.meta.dirname || __dirname, "..", "data.db");
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    try {
      const sql = where
        ? \`SELECT * FROM ${t.name} WHERE \${where} LIMIT ?\`
        : \`SELECT * FROM ${t.name} LIMIT ?\`;
      const rows = db.prepare(sql).all(limit);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: \`Error: \${error instanceof Error ? error.message : String(error)}\` }], isError: true };
    } finally {
      db.close();
    }
  }
);
`
    )
    .join("\n\n");

  const pkgJson = JSON.parse(
    generateServerFiles(name, `${dbName} MCP Server`, toolDefinitions)["package.json"]
  );
  pkgJson.dependencies["better-sqlite3"] = "^11.8.1";

  const files = {
    ...generateServerFiles(name, `${dbName} MCP Server`, toolDefinitions),
    "package.json": JSON.stringify(pkgJson, null, 2),
    "data.db": null as any,
  };
  delete files["data.db"];

  writeFiles(pkgDir, files);

  // Copy the database
  fs.copyFileSync(resolvedPath, path.join(pkgDir, "data.db"));

  console.log(`\n✓ MCP server created in ${pkgDir}`);
  console.log(`\n  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

async function fromYaml(
  filePath: string,
  doc: Record<string, unknown>,
  options: FromOptions
): Promise<void> {
  console.log("Parsing MCP YAML spec...");
  const spec = parseYamlSpec(doc);

  if (spec.tools.length === 0) {
    console.error("No tools defined in the YAML spec.");
    process.exit(1);
  }

  const name = sanitizeName(options.name || spec.name.toLowerCase().replace(/\s+/g, "-") || "custom-mcp-server");
  const outDir = path.resolve(options.output || ".");
  const pkgDir = path.join(outDir, name);

  console.log(`Found ${spec.tools.length} tool(s). Generating MCP server: ${name}`);

  const toolDefinitions = spec.tools
    .map(
      (t) => `// ${t.description || t.name}
server.tool(
  "${t.name}",
  ${JSON.stringify(t.description || t.name)},
  { ${t.parameters.map((p) => `${p.name}: z.string()${p.required ? "" : ".optional()"}${p.description ? `.describe(${JSON.stringify(p.description)})` : ""}`).join(", ")} },
  async (${t.parameters.length > 0 ? `{ ${t.parameters.map((p) => p.name).join(", ")} }` : "_args"}) => {
    // TODO: Implement ${t.name}
    return { content: [{ type: "text", text: "Not yet implemented" }] };
  }
);
`
    )
    .join("\n\n");

  const files = generateServerFiles(name, spec.description, toolDefinitions);
  writeFiles(pkgDir, files);

  console.log(`\n✓ MCP server created in ${pkgDir}`);
  console.log(`\n  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

function generateServerFiles(
  name: string,
  description: string,
  toolDefinitions: string
): Record<string, string> {
  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        type: "module",
        main: "dist/index.js",
        scripts: {
          build: "tsc",
          dev: "npx tsx src/index.ts",
          start: "node dist/index.js",
        },
        dependencies: {
          "@modelcontextprotocol/sdk": "^1.12.1",
          zod: "^3.24.2",
        },
        devDependencies: {
          typescript: "^5.8.2",
          "@types/node": "^22.13.10",
          tsx: "^4.19.3",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          esModuleInterop: true,
          declaration: true,
          skipLibCheck: true,
        },
        include: ["src"],
      },
      null,
      2
    ),
    "src/index.ts": `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";

const server = new McpServer({
  name: "${name}",
  version: "1.0.0",
});

${toolDefinitions}

const transport = new StdioServerTransport();
await server.connect(transport);
`,
    ".gitignore": `node_modules/
dist/
*.js.map
.env
data.db
`,
  };
}
