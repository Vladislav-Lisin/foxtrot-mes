package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByToken(String token); // ищем по строке токена

    void deleteByUserId(UUID userId); // пригодится для logout
}