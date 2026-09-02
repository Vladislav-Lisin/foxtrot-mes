package com.foxtrot.messenger.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Getter
@Setter
@Table(name = "calls")
public class Call {

    @Id
    @GeneratedValue
    private UUID id;

    // null - standalone-встреча без привязки к чату (см. CallService.startStandaloneCall)
    @Column(name = "chat_id")
    private UUID chatId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    // короткий код для входа по ссылке без похода в чат - актуален прежде всего для standalone
    @Column(name = "join_code", unique = true)
    private String joinCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CallStatus status;

    @Column(name = "media_room_id")
    private String mediaRoomId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;
}
