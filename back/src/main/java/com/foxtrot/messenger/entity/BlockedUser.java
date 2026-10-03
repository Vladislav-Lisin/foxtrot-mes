package com.foxtrot.messenger.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

// Направленная запись: blockerId заблокировал blockedId. Эффект для продукта всё равно
// симметричный (см. BlockService.isBlocked - проверяет оба направления разом), но кто
// именно нажал "заблокировать" храним - пригодится для текста в UI ("вы заблокировали
// этого пользователя" vs "этот пользователь вас заблокировал").
@Entity
@Getter
@Setter
@Table(name = "blocked_users", uniqueConstraints = @UniqueConstraint(columnNames = {"blocker_id", "blocked_id"}))
public class BlockedUser {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "blocker_id", nullable = false)
    private UUID blockerId;

    @Column(name = "blocked_id", nullable = false)
    private UUID blockedId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
