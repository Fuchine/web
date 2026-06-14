function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Layer-1 translation provider for the import worker (self-host house key).
  // Defaults to "echo" (no key needed; lines stay JP-only).
  llmProvider: process.env.LLM_PROVIDER ?? "echo",
  llmApiKey: process.env.LLM_API_KEY,
  llmBaseUrl: process.env.LLM_BASE_URL,
  llmModel: process.env.LLM_MODEL,
};
