package com.foxtrot.messenger.repository;

import com.foxtrot.messenger.entity.Chats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatsRepository extends JpaRepository<Chats, UUID> {
    @Query("""
    select distinct c
    from Chats c
    join ChatMember m1 on m1.chatId = c.id
    join ChatMember m2 on m2.chatId = c.id
    where m1.userId = :firstUserId
      and m2.userId = :secondUserId
      and m1.id <> m2.id
      and c.type = com.foxtrot.messenger.entity.ChatType.PRIVATE
""")
    List<Chats> findDirectChatsBetweenUsers(UUID firstUserId, UUID secondUserId);

    default Optional<Chats> findDirectChatBetweenUsers(UUID firstUserId, UUID secondUserId) {
        List<Chats> found = findDirectChatsBetweenUsers(firstUserId, secondUserId);
        return found.isEmpty() ? Optional.empty() : Optional.of(found.get(0));
    }

    @Query("""
        select distinct c
        from Chats c
        join ChatMember m on m.chatId = c.id
        where m.userId = :userId
    """)
    List<Chats> findAllByMemberUserId(UUID userId);


}
