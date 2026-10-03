package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.BlockedUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface BlockedUserRepository extends JpaRepository<BlockedUser, UUID> {
    boolean existsByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);

    void deleteByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);
}
