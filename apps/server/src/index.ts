import http from "node:http";
import { config } from "./config.js";
import { pool } from "./db.js";
import { createApp } from "./http/app.js";
import { logger } from "./logger.js";
import { migrate } from "./migrate.js";
import { createIo, registerHandlers } from "./realtime/io.js";
import { PollService } from "./services/polls.js";

async function main() {
  await migrate();

  // The request handler must exist before Socket.IO attaches, so it can route /socket.io itself.
  const holder: { app?: ReturnType<typeof createApp> } = {};
  const httpServer = http.createServer((req, res) => holder.app!(req, res));
  const io = createIo(httpServer);
  holder.app = createApp(io);
  const pollService = new PollService(io);
  registerHandlers(io, pollService);
  await pollService.recoverOverdue();

  httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT, ai: config.aiEnabled }, "ClassPulse server listening");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    io.close();
    await pollService.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal(err, "failed to start");
  process.exit(1);
});
