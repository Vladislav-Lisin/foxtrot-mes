package com.foxtrot.messenger.dto.internal;

import lombok.Data;

import java.util.UUID;

/**
 * Тело вебхука от media-service.
 * type: "JOINED" | "LEFT" | "ROOM_EMPTY" | "GROUP_CHANGED".
 * userId отсутствует для ROOM_EMPTY. group заполнен только для GROUP_CHANGED (может быть null - "без группы").
 */
@Data
public class CallEventPayload {
    private String type;
    private UUID userId;
    private String group;
}
