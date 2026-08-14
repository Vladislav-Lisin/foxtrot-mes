package com.foxtrot.messenger.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Getter
@Setter
@Table(name = "chat_members")
public class ChatMember {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "role")
    private String role;

    @Column(name = "last_message_id")
    private UUID lastMessageId;

    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

}