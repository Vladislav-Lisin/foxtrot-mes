package com.foxtrot.messenger.controllers;

import com.foxtrot.messenger.dto.internal.CallEventPayload;
import com.foxtrot.messenger.services.CallService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Принимает события от media-service. Защищено InternalServiceAuthFilter + SecurityConfig (ROLE_INTERNAL_SERVICE), не пользовательский JWT. */
@RestController
@RequestMapping("/internal/calls")
public class CallWebhookController {

    private final CallService callService;

    public CallWebhookController(CallService callService) {
        this.callService = callService;
    }

    @PostMapping("/{callId}/events")
    public ResponseEntity<Void> handle(@PathVariable UUID callId, @RequestBody CallEventPayload payload) {
        switch (payload.getType()) {
            case "JOINED" -> callService.onParticipantJoined(callId, payload.getUserId());
            case "LEFT" -> callService.onParticipantLeft(callId, payload.getUserId());
            case "ROOM_EMPTY" -> callService.onRoomEmpty(callId);
            default -> throw new IllegalArgumentException("Unknown call event type: " + payload.getType());
        }
        return ResponseEntity.noContent().build();
    }
}
