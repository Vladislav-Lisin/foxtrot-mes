package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.Call;
import com.foxtrot.messenger.entity.CallStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CallRepository extends JpaRepository<Call, UUID> {
    Optional<Call> findFirstByChatIdAndStatusIn(UUID chatId, List<CallStatus> statuses);
    boolean existsByJoinCode(String joinCode);
}
