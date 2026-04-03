#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { fromCommand } from "./commands/from.js";

const program = new Command();

program
  .name("mcpkit")
  .description("Generate ready-to-use MCP servers from OpenAPI specs, databases, or YAML descriptions")
  .version("1.0.0");

program
  .command("init")
  .description("Create a new MCP server project with interactive prompts")
  .option("-n, --name <name>", "Server name")
  .option("-d, --description <desc>", "Server description")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(initCommand);

program
  .command("from")
  .description("Generate an MCP server from a source")
  .argument("<source>", "Source: OpenAPI spec file, sqlite:// URL, or YAML description file")
  .option("-n, --name <name>", "Server name")
  .option("-o, --output <dir>", "Output directory", ".")
  .option("-r, --read-only", "Generate read-only tools (for databases)")
  .action(fromCommand);

program.parse();
