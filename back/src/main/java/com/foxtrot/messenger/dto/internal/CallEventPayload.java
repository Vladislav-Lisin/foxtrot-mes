package com.foxtrot.messenger.dto.internal;

import lombok.Data;

import java.util.UUID;

/** Тело вебхука от media-service. type: "JOINED" | "LEFT" | "ROOM_EMPTY"; userId отсутствует для ROOM_EMPTY. */
@Data
public class CallEventPayload {
    private String type;
    private UUID userId;
}
