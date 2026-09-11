import express, { type NextFunction, type Request, type Response } from "express";
import http from "node:http";
import { config } from "./config.js";
import { initWorkers } from "./mediasoup/workers.js";
import { attachSignalingServer } from "./signaling/SignalingServer.js";
import { roomsRouter } from "./http/roomsApi.js";

async function main(): Promise<void> {
  await initWorkers();

  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use(roomsRouter);

  // Единый JSON-формат ошибок, как в Spring Boot GlobalExceptionHandler - не утечь
  // внутренностями по умолчанию.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  });

  const server = http.createServer(app);
  attachSignalingServer(server);

  server.listen(config.httpPort, () => {
    console.log(`media-service listening on :${config.httpPort} (HTTP /rooms + WSS /ws)`);
    console.log(`mediasoup listenIp=${config.mediasoup.listenIp} announcedIp=${config.mediasoup.announcedIp ?? "(not set)"} rtcPorts=${config.mediasoup.rtcMinPort}-${config.mediasoup.rtcMaxPort}`);
  });
}

main().catch((err) => {
  console.error("Fatal error during startup", err);
  process.exit(1);
});
