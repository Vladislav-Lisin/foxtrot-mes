package com.foxtrot.messenger.dto.request;

import lombok.Data;

@Data
public class SendMessageRequest {
    private String chatId;
    private String content;
}