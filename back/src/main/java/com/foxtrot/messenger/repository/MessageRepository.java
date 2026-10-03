package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    Page<Message> findByChatId(UUID chatId, Pageable pageable);

    // content - bytea (обычный UTF-8 текст, не зашифровано, см. ChatService), поэтому
    // ILIKE работает только через convert_from - на JPQL такое не выразить, нужен нативный SQL.
    // COLLATE "und-x-icu" обязателен - у базы collation en_US.utf8 (glibc), а её case-folding
    // (как и lower()) не умеет регистронезависимо сравнивать кириллицу: 'Привет' ILIKE '%ПРИВЕТ%'
    // молча возвращает false. ICU-коллация же корректно работает с любым языком, не только ASCII.
    @Query(
        value = """
            SELECT * FROM messages m
            WHERE m.chat_id = :chatId
              AND m.is_deleted IS NOT TRUE
              AND convert_from(m.content, 'UTF8') COLLATE "und-x-icu" ILIKE CONCAT('%', :term, '%')
            ORDER BY m.created_at DESC
            """,
        countQuery = """
            SELECT count(*) FROM messages m
            WHERE m.chat_id = :chatId
              AND m.is_deleted IS NOT TRUE
              AND convert_from(m.content, 'UTF8') COLLATE "und-x-icu" ILIKE CONCAT('%', :term, '%')
            """,
        nativeQuery = true
    )
    Page<Message> searchByChatIdAndTerm(UUID chatId, String term, Pageable pageable);
}
