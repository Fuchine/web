import {
  createRedis,
  bullConnection,
  IMPORT_QUEUE,
  type ImportJob,
  type RedisConnection,
} from "@fuchine/jobs";
import { env } from "./env";

export { IMPORT_QUEUE, type ImportJob } from "@fuchine/jobs";

// Shared Redis connection for the consumer.
export const connection: RedisConnection = createRedis(env.redisUrl);
export const bullConn = bullConnection(connection);
