package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.CallParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CallParticipantRepository extends JpaRepository<CallParticipant, UUID> {
    List<CallParticipant> findByCallId(UUID callId);
    Optional<CallParticipant> findByCallIdAndUserIdAndLeftAtIsNull(UUID callId, UUID userId);
    boolean existsByCallIdAndUserIdAndLeftAtIsNull(UUID callId, UUID userId);
    long countByCallIdAndLeftAtIsNull(UUID callId);
}
