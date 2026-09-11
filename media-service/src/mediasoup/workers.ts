import * as mediasoup from "mediasoup";
import type { Router, RouterRtpCodecCapability, Worker } from "mediasoup/types";
import { config } from "../config.js";

// Стандартный набор кодеков: Opus для звука (лучший компромисс качество/битрейт для WebRTC,
// + FEC против потерь пакетов в мобильных сетях), VP8 и H.264 для видео - разные устройства
// лучше поддерживают железным декодером тот или другой.
const mediaCodecs: RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: { useinbandfec: 1 },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

const workers: Worker[] = [];
let nextWorkerIndex = 0;

export async function initWorkers(): Promise<void> {
  for (let i = 0; i < config.mediasoup.numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: config.mediasoup.rtcMinPort,
      rtcMaxPort: config.mediasoup.rtcMaxPort,
      // Временно: диагностика "ICE никогда не подключается" - это лог самого нативного
      // worker'а (C++), а не Node-обвязки, показывает, доходят ли STUN-пакеты вообще.
      logLevel: "debug",
      logTags: ["ice", "dtls", "rtp"],
    });

    worker.on("died", () => {
      // 1 Worker ~= 1 ядро CPU; падение Worker'а - нештатная ситуация (обычно нехватка
      // ресурсов). Проще и безопаснее уронить весь процесс и дать оркестратору
      // (systemd/docker restart policy) поднять его заново, чем пытаться жить дальше
      // с частично рабочим пулом.
      console.error(`mediasoup Worker ${worker.pid} died - exiting process`);
      process.exit(1);
    });

    workers.push(worker);
  }

  console.log(`mediasoup: ${workers.length} worker(s) started, RTC ports ${config.mediasoup.rtcMinPort}-${config.mediasoup.rtcMaxPort}`);
}

// Простой round-robin по Worker'ам под новые комнаты. При росте нагрузки можно заменить на
// выбор по фактической загрузке (worker.getResourceUsage()) - осознанно оставлено простым
// для v1, см. Foxtrot Calls - Roadmap, §8 (масштабирование).
function pickWorker(): Worker {
  if (workers.length === 0) {
    throw new Error("mediasoup workers are not initialized yet");
  }
  const worker = workers[nextWorkerIndex]!;
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

export async function createRouter(): Promise<Router> {
  const worker = pickWorker();
  return worker.createRouter({ mediaCodecs });
}
