package com.foxtrot.messenger.services;

import com.foxtrot.messenger.exception.custom.TooManyRequestsException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CallRateLimiterTest {

    private final CallRateLimiter rateLimiter = new CallRateLimiter();

    @Test
    void allowsUpToTheConfiguredLimitWithinTheWindow() {
        UUID userId = UUID.randomUUID();

        assertThatCode(() -> {
            for (int i = 0; i < 5; i++) {
                rateLimiter.checkStartAllowed(userId);
            }
        }).doesNotThrowAnyException();
    }

    @Test
    void blocksTheStartRightAfterTheLimitIsReached() {
        UUID userId = UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            rateLimiter.checkStartAllowed(userId);
        }

        assertThatThrownBy(() -> rateLimiter.checkStartAllowed(userId))
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    void limitIsTrackedPerUserIndependently() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            rateLimiter.checkStartAllowed(first);
        }

        // у второго пользователя лимит свой - первый его не исчерпывает
        assertThatCode(() -> rateLimiter.checkStartAllowed(second)).doesNotThrowAnyException();
    }
}
