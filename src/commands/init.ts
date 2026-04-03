import * as readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { sanitizeName, writeFiles } from "../utils.js";

interface InitOptions {
  name?: string;
  description?: string;
  output?: string;
}

function question(rl: readline.Interface, prompt: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${prompt} (${defaultValue}): `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

export async function initCommand(options: InitOptions): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    let serverName = options.name;
    let description = options.description;

    if (!serverName || !description) {
      serverName = await question(rl, "Server name (kebab-case)", serverName || "my-mcp-server");
      if (!/^[a-z][a-z0-9-]*$/.test(serverName)) {
        console.error("Name must be lowercase kebab-case starting with a letter.");
        process.exit(1);
      }
      description = await question(rl, "Description", description || "A custom MCP server");
    }

    const name = sanitizeName(serverName);
    const outDir = path.resolve(options.output || ".");
    const pkgDir = path.join(outDir, name);

    if (fs.existsSync(pkgDir)) {
      const answer = await question(rl, `Directory "${name}" exists. Overwrite? (y/N)`, "n");
      if (answer.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    }

    const className = name
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("");

    const files = generateInitFiles(name, className, description);
    writeFiles(pkgDir, files);

    console.log(`\n✓ MCP server created in ${pkgDir}`);
    console.log(`\n  cd ${name}`);
    console.log(`  npm install`);
    console.log(`  npm run dev\n`);
  } finally {
    rl.close();
  }
}

function generateInitFiles(
  name: string,
  className: string,
  description: string
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

const server = new McpServer({
  name: "${name}",
  version: "1.0.0",
});

// Add your tools here:
// server.tool(
//   "my_tool",
//   "Description of what this tool does",
//   { input: z.string().describe("Input parameter") },
//   async ({ input }) => {
//     return { content: [{ type: "text", text: \`Result: \${input}\` }] };
//   }
// );

// Example: echo tool
server.tool(
  "echo",
  "Echo back the input text",
  { text: z.string().describe("Text to echo") },
  async ({ text }) => {
    return { content: [{ type: "text", text }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
`,
    ".gitignore": `node_modules/
dist/
*.js.map
.env
`,
  };
}
