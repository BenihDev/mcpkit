import fs from "node:fs";
import path from "node:path";

export function kebabToPascal(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

export function parseOpenApi(spec: Record<string, unknown>): {
  title: string;
  version: string;
  tools: Array<{
    name: string;
    description: string;
    method: string;
    url: string;
    params: Array<{ name: string; type: string; required: boolean; description: string }>;
  }>;
} {
  const info = spec.info as Record<string, unknown> | undefined;
  const title = (info?.title as string) || "openapi-server";
  const version = (info?.version as string) || "1.0.0";
  const servers = spec.servers as Array<{ url: string }> | undefined;
  const baseUrl = servers?.[0]?.url || "http://localhost:3000";

  const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>> | undefined;
  const tools: Array<{
    name: string;
    description: string;
    method: string;
    url: string;
    params: Array<{ name: string; type: string; required: boolean; description: string }>;
  }> = [];

  if (paths) {
    for (const [url, methods] of Object.entries(paths)) {
      for (const [method, detail] of Object.entries(methods)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const d = detail as Record<string, unknown>;
        const operationId = (d.operationId as string) || `${method}${url.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const name = operationId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const description = (d.summary as string) || (d.description as string) || `${method.toUpperCase()} ${url}`;

        const params: Array<{ name: string; type: string; required: boolean; description: string }> = [];

        // Path params
        const pathParams = d.parameters as Array<Record<string, unknown>> | undefined;
        if (pathParams) {
          for (const p of pathParams) {
            if (p.in === "path" || p.in === "query" || p.in === "header") {
              params.push({
                name: p.name as string,
                type: (p.schema as Record<string, string>)?.type || "string",
                required: p.required as boolean ?? false,
                description: (p.description as string) || "",
              });
            }
          }
        }

        // Request body (for post/put/patch)
        if (["post", "put", "patch"].includes(method)) {
          const rb = d.requestBody as Record<string, unknown> | undefined;
          if (rb) {
            const content = rb.content as Record<string, unknown> | undefined;
            if (content) {
              const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
              if (jsonContent) {
                const schema = jsonContent.schema as Record<string, unknown> | undefined;
                if (schema) {
                  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
                  const required = schema.required as string[] | undefined;
                  if (props) {
                    for (const [propName, propSchema] of Object.entries(props)) {
                      params.push({
                        name: propName,
                        type: (propSchema.type as string) || "string",
                        required: required?.includes(propName) ?? false,
                        description: (propSchema.description as string) || "",
                      });
                    }
                  }
                }
              }
            }
          }
        }

        tools.push({ name, description, method, url, params });
      }
    }
  }

  return { title, version, tools };
}

export interface SqliteTable {
  name: string;
  columns: Array<{ name: string; type: string; notNull: boolean }>;
}

export function getSqliteSchema(dbPath: string): SqliteTable[] {
  // Dynamic import to avoid bundling issues with better-sqlite3
  let Database: any;
  try {
    Database = require("better-sqlite3");
  } catch {
    throw new Error(
      "better-sqlite3 is required for SQLite support. Install it with: npm install better-sqlite3"
    );
  }

  const db = new Database(dbPath, { readonly: true });
  const tables: SqliteTable[] = [];

  try {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    for (const row of rows) {
      const columns = (db.pragma(`table_info("${row.name}")`) as Array<{
        name: string;
        type: string;
        notnull: number;
      }>).map((c) => ({
        name: c.name,
        type: c.type || "TEXT",
        notNull: c.notnull === 1,
      }));
      tables.push({ name: row.name, columns });
    }
  } finally {
    db.close();
  }

  return tables;
}

export interface YamlTool {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  handler?: string;
}

export interface YamlSpec {
  name: string;
  version: string;
  description: string;
  tools: YamlTool[];
}

export function parseYamlSpec(doc: Record<string, unknown>): YamlSpec {
  const tools = (doc.tools as Array<Record<string, unknown>>) || [];

  return {
    name: (doc.name as string) || "mcp-server",
    version: (doc.version as string) || "1.0.0",
    description: (doc.description as string) || "Custom MCP server",
    tools: tools.map((t) => {
      const params = (t.parameters as Array<Record<string, unknown>>) || [];
      return {
        name: t.name as string,
        description: (t.description as string) || "",
        parameters: params.map((p) => ({
          name: p.name as string,
          type: (p.type as string) || "string",
          description: (p.description as string) || "",
          required: (p.required as boolean) ?? false,
        })),
        handler: t.handler as string | undefined,
      };
    }),
  };
}
