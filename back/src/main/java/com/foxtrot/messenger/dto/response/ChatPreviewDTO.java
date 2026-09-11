package com.foxtrot.messenger.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatPreviewDTO {

    private String chatId;
    private UserResponse partner;
    private String lastMessage;
    private Instant lastMessageAt;
    private long unreadCount;
    private String lastMessageSenderId;

}
