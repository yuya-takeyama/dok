import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";

export interface CLIOptions {
  config: string;
  job?: string;
  dryRun?: boolean;
  logLevel?: string;
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("dok")
    .description("AI Knowledge ETL Framework - Sync documents between various knowledge providers")
    .version("0.0.1");

  program
    .command("run")
    .description("Run sync job(s)")
    .requiredOption("-c, --config <path>", "Path to configuration file")
    .option("-j, --job <name>", "Specific job to run (if not specified, runs all jobs)")
    .option("-d, --dry-run", "Perform a dry run without making any changes", false)
    .option("-l, --log-level <level>", "Log level (debug, info, warn, error)", "info")
    .action(async (options: CLIOptions) => {
      try {
        // Validate config file exists
        const configPath = resolve(options.config);
        if (!existsSync(configPath)) {
          console.error(`Error: Configuration file not found: ${configPath}`);
          process.exit(1);
        }

        // Import and run the main application
        const { runApp } = await import("./app.js");
        await runApp(options);
      } catch (error) {
        console.error("Error:", error);
        process.exit(1);
      }
    });

  program
    .command("validate")
    .description("Validate configuration file")
    .requiredOption("-c, --config <path>", "Path to configuration file")
    .action(async (options: { config: string }) => {
      try {
        const configPath = resolve(options.config);
        if (!existsSync(configPath)) {
          console.error(`Error: Configuration file not found: ${configPath}`);
          process.exit(1);
        }

        // Import and validate config
        const { validateConfig } = await import("./config/index.js");
        const configContent = readFileSync(configPath, "utf-8");
        const isValid = await validateConfig(configContent);

        if (isValid) {
          console.log("✅ Configuration is valid");
          process.exit(0);
        } else {
          console.error("❌ Configuration is invalid");
          process.exit(1);
        }
      } catch (error) {
        console.error("Error validating configuration:", error);
        process.exit(1);
      }
    });

  program
    .command("list-jobs")
    .description("List all available jobs in the configuration")
    .requiredOption("-c, --config <path>", "Path to configuration file")
    .action(async (options: { config: string }) => {
      try {
        const configPath = resolve(options.config);
        if (!existsSync(configPath)) {
          console.error(`Error: Configuration file not found: ${configPath}`);
          process.exit(1);
        }

        // Import and parse config to list jobs
        const { loadConfig } = await import("./config/index.js");
        const config = await loadConfig(configPath);

        console.log("\nAvailable jobs:");
        for (const [jobName, jobConfig] of Object.entries(config.jobs)) {
          console.log(`  - ${jobName}`);
          console.log(`    Sources: ${jobConfig.sources.map((s) => s.provider).join(", ")}`);
          console.log(`    Targets: ${jobConfig.targets.map((t) => t.provider).join(", ")}`);
        }
      } catch (error) {
        console.error("Error listing jobs:", error);
        process.exit(1);
      }
    });

  return program;
}

export function parseCLI(argv: string[]): Command {
  const program = createCLI();
  return program.parse(argv);
}
