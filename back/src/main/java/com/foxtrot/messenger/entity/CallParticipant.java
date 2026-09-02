package com.foxtrot.messenger.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Getter
@Setter
@Table(name = "call_participants")
public class CallParticipant {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "call_id", nullable = false)
    private UUID callId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    @Column(name = "left_at")
    private Instant leftAt;

    // историческая запись группы (аудио-команды) участника - НЕ источник истины для
    // живой маршрутизации звука во время звонка, та живёт в памяти media-service
    @Column(name = "group_tag")
    private String groupTag;
}
