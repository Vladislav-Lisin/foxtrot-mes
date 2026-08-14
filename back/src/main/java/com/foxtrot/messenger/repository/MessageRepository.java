package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    Page<Message> findByChatId(UUID chatId, Pageable pageable);
}
