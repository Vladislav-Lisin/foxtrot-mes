package com.foxtrot.messenger.controllers;

import com.foxtrot.messenger.dto.request.CreateCallRequest;
import com.foxtrot.messenger.dto.response.CallResponse;
import com.foxtrot.messenger.security.UserPrincipal;
import com.foxtrot.messenger.services.CallService;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/calls")
public class CallController {

    private final CallService callService;

    public CallController(CallService callService) {
        this.callService = callService;
    }

    @PostMapping
    public ResponseEntity<CallResponse> start(@Valid @RequestBody CreateCallRequest request,
                                                @AuthenticationPrincipal UserPrincipal principal) {
        boolean hasChatId = request.getChatId() != null && !request.getChatId().isBlank();
        CallResponse response = hasChatId
                ? callService.startChatCall(UUID.fromString(request.getChatId()), principal.getId())
                : callService.startStandaloneCall(principal.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{callId}")
    public ResponseEntity<CallResponse> get(@PathVariable UUID callId,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(callService.getCall(callId, principal.getId()));
    }

    @PostMapping("/{callId}/join")
    public ResponseEntity<CallResponse> join(@PathVariable UUID callId,
                                               @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(callService.joinCall(callId, principal.getId()));
    }

    @PostMapping("/{callId}/leave")
    public ResponseEntity<Void> leave(@PathVariable UUID callId,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        callService.leaveCall(callId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{callId}/end")
    public ResponseEntity<Void> end(@PathVariable UUID callId,
                                      @AuthenticationPrincipal UserPrincipal principal) {
        callService.endCall(callId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
