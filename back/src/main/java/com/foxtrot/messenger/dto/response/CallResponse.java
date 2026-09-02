package com.foxtrot.messenger.dto.response;

import com.foxtrot.messenger.entity.CallStatus;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
public class CallResponse {
    private UUID callId;
    private UUID chatId;          // null у standalone-встречи
    private UUID ownerId;
    private String joinCode;
    private CallStatus status;
    private Instant startedAt;

    // null в ответе на GET /calls/{id} (превью до входа) - токен выдаётся только при join
    private String callToken;
    private String mediaServiceUrl;
    private String roomId;
}
