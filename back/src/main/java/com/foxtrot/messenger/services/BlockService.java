package com.foxtrot.messenger.services;

import com.foxtrot.messenger.entity.BlockedUser;
import com.foxtrot.messenger.repository.BlockedUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class BlockService {

    private final BlockedUserRepository blockedUserRepository;

    public BlockService(BlockedUserRepository blockedUserRepository) {
        this.blockedUserRepository = blockedUserRepository;
    }

    @Transactional
    public void block(UUID blockerId, UUID blockedId) {
        if (blockedUserRepository.existsByBlockerIdAndBlockedId(blockerId, blockedId)) return; // идемпотентно

        BlockedUser entry = new BlockedUser();
        entry.setBlockerId(blockerId);
        entry.setBlockedId(blockedId);
        entry.setCreatedAt(Instant.now());
        blockedUserRepository.save(entry);
    }

    @Transactional
    public void unblock(UUID blockerId, UUID blockedId) {
        blockedUserRepository.deleteByBlockerIdAndBlockedId(blockerId, blockedId);
    }

    /** Заблокировано ли общение между двумя пользователями - в любом направлении. */
    public boolean isBlocked(UUID userA, UUID userB) {
        return blockedUserRepository.existsByBlockerIdAndBlockedId(userA, userB)
                || blockedUserRepository.existsByBlockerIdAndBlockedId(userB, userA);
    }

    public boolean isBlockedByMe(UUID me, UUID other) {
        return blockedUserRepository.existsByBlockerIdAndBlockedId(me, other);
    }
}
