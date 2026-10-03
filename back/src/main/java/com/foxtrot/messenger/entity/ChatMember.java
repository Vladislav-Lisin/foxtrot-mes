package com.foxtrot.messenger.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
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
    private Instant lastMessageAt;

    // Персональный фон чата - на пользователя, не общий для обоих собеседников
    // (как в Telegram: у каждого своя тема в рамках одного чата).
    @Column(name = "background_url")
    private String backgroundUrl;

    // "Удалить чат у себя" - не удаляем строку физически (иначе некуда было бы положить
    // lastMessageAt при новом сообщении, если собеседник потом снова напишет), а прячем
    // до этой отметки времени. Список чатов фильтрует по ней (см. ChatService) - если
    // после скрытия приходит новое сообщение, lastMessageAt (который и так обновляется
    // при каждом сообщении, см. ChatMemberRepository.updateLastMessage) становится свежее
    // hiddenAt, и чат сам "возвращается" в список без всякой отдельной логики восстановления.
    @Column(name = "hidden_at")
    private Instant hiddenAt;

}