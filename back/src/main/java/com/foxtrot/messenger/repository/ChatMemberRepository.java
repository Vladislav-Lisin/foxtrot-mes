package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.ChatMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;



public interface ChatMemberRepository extends JpaRepository<ChatMember, UUID> {

    boolean existsByChatIdAndUserId(UUID chatId, UUID userId);
    List<ChatMember> findByChatId(UUID chatId);

    @Transactional
    @Modifying
    @Query("""
        update ChatMember cm
        set cm.lastMessageId = :messageId,
            cm.lastMessageAt = :createdAt
        where cm.chatId = :chatId
    """)
    void updateLastMessage(UUID chatId, UUID messageId, LocalDateTime createdAt);

}
