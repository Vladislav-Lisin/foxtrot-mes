package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<Message, UUID> {

    @Modifying
    @Transactional
    @Query("""
    update Message m
    set m.status = :status
    where m.id = :messageId
""")
    void updateStatus(UUID messageId, String status);


    @Modifying
    @Transactional
    @Query("""
    update Message m
    set m.status = 'READ'
    where m.chatId = :chatId
      and m.senderId <> :userId
""")
    void markChatMessagesAsRead(UUID chatId, UUID userId);

    List<Message> findByChatIdOrderByCreatedAtDesc(UUID chatId);
}
