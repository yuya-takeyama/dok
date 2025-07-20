import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ZodError } from "zod";
import { type Config, ConfigSchema } from "./schema.js";

/**
 * Expands environment variables in a string
 * Supports ${VAR_NAME} and $VAR_NAME syntax
 */
function expandEnvVars(str: string): string {
  return str.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, p1, p2) => {
    const varName = p1 || p2;
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is not defined`);
    }
    return value;
  });
}

/**
 * Recursively expands environment variables in an object
 */
function expandEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return expandEnvVars(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvVarsInObject(item));
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value);
    }
    return result;
  }

  return obj;
}

/**
 * Loads and validates configuration from a YAML file
 */
export async function loadConfig(configPath: string): Promise<Config> {
  try {
    // Read the config file
    const configContent = readFileSync(configPath, "utf-8");

    // Parse YAML
    const rawConfig = parse(configContent);

    // Expand environment variables
    const expandedConfig = expandEnvVarsInObject(rawConfig);

    // Validate with Zod schema
    const config = ConfigSchema.parse(expandedConfig);

    return config;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Configuration validation failed: ${formatZodError(error)}`);
    }
    throw error;
  }
}

/**
 * Validates configuration content
 */
export async function validateConfig(configContent: string): Promise<boolean> {
  try {
    const rawConfig = parse(configContent);
    ConfigSchema.parse(rawConfig);
    return true;
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Validation errors:");
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      console.error("Error parsing configuration:", error);
    }
    return false;
  }
}

/**
 * Formats Zod validation errors for display
 */
function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
}

/**
 * Gets a specific job configuration
 */
export function getJobConfig(config: Config, jobName: string) {
  const job = config.jobs[jobName];
  if (!job) {
    throw new Error(`Job '${jobName}' not found in configuration`);
  }
  return job;
}

/**
 * Lists all available job names
 */
export function listJobNames(config: Config): string[] {
  return Object.keys(config.jobs);
}
