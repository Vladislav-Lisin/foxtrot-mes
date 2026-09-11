package com.foxtrot.messenger.services;

import com.foxtrot.messenger.exception.custom.TooManyRequestsException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Простой sliding-window лимитер на создание звонков - защита от спама
 * POST /calls (и, соответственно, от лишних POST /rooms на media-service).
 * Ничего внешнего не тянем ради одного эндпоинта - для более широкого набора
 * лимитов имеет смысл заменить на bucket4j или аналог.
 */
@Component
public class CallRateLimiter {

    private static final int MAX_STARTS_PER_WINDOW = 5;
    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<UUID, Deque<Instant>> recentStarts = new ConcurrentHashMap<>();

    public void checkStartAllowed(UUID userId) {
        Deque<Instant> timestamps = recentStarts.computeIfAbsent(userId, id -> new ArrayDeque<>());
        Instant cutoff = Instant.now().minus(WINDOW);

        synchronized (timestamps) {
            while (!timestamps.isEmpty() && timestamps.peekFirst().isBefore(cutoff)) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= MAX_STARTS_PER_WINDOW) {
                throw new TooManyRequestsException("Слишком много звонков подряд - попробуйте через минуту.");
            }
            timestamps.addLast(Instant.now());
        }
    }
}
