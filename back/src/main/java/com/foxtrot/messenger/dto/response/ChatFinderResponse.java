package com.foxtrot.messenger.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatFinderResponse {

    private String chatId;
    private UserResponse partner;
    private Boolean alreadyExists;
    private String lastMessage;
    private LocalDateTime lastMessageAt;

}
