package com.foxtrot.messenger.dto.response;

import com.foxtrot.messenger.model.MessageStatus;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatMessageDTO {

    private String id;
    private String chatId;
    private String senderId;
    private String senderName;
    private String content;
    private LocalDateTime timestamp;
    private MessageStatus status;

}
