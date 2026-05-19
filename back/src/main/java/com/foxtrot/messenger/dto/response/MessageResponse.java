package com.foxtrot.messenger.dto.response;


import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class MessageResponse {
    private UUID id;
    private UUID senderId;
    /** Текст сообщения (UTF-8), не Base64 — для корректного отображения после перезагрузки. */
    private String content;
    private LocalDateTime createdAt;
    private String status;
    private Boolean isDeleted;
}
