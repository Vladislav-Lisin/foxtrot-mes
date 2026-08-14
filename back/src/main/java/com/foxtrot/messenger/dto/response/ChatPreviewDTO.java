package com.foxtrot.messenger.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatPreviewDTO {

    private String chatId;
    private UserResponse partner;
    private String lastMessage;
    private LocalDateTime lastMessageAt;

}
