package com.foxtrot.messenger.services;

import com.foxtrot.messenger.repository.BlockedUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BlockServiceTest {

    @Mock
    private BlockedUserRepository blockedUserRepository;

    private BlockService blockService;

    @BeforeEach
    void setUp() {
        blockService = new BlockService(blockedUserRepository);
    }

    @Test
    void isBlockedIsTrueRegardlessOfDirection() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(blockedUserRepository.existsByBlockerIdAndBlockedId(a, b)).thenReturn(false);
        when(blockedUserRepository.existsByBlockerIdAndBlockedId(b, a)).thenReturn(true);

        assertThat(blockService.isBlocked(a, b)).isTrue();
        assertThat(blockService.isBlocked(b, a)).isTrue();
    }

    @Test
    void isBlockedIsFalseWhenNeitherSideBlockedTheOther() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(blockedUserRepository.existsByBlockerIdAndBlockedId(a, b)).thenReturn(false);
        when(blockedUserRepository.existsByBlockerIdAndBlockedId(b, a)).thenReturn(false);

        assertThat(blockService.isBlocked(a, b)).isFalse();
    }

    @Test
    void blockIsIdempotent() {
        UUID blocker = UUID.randomUUID();
        UUID blocked = UUID.randomUUID();
        when(blockedUserRepository.existsByBlockerIdAndBlockedId(blocker, blocked)).thenReturn(true);

        blockService.block(blocker, blocked);

        verify(blockedUserRepository, never()).save(any());
    }

    @Test
    void unblockRemovesTheDirectedEntry() {
        UUID blocker = UUID.randomUUID();
        UUID blocked = UUID.randomUUID();

        blockService.unblock(blocker, blocked);

        verify(blockedUserRepository).deleteByBlockerIdAndBlockedId(blocker, blocked);
    }
}
