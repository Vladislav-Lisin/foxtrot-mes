package com.foxtrot.messenger.controllers;


import com.foxtrot.messenger.dto.request.ChatFinderRequest;
import com.foxtrot.messenger.dto.request.CreatePrivateChatRequest;
import com.foxtrot.messenger.dto.response.ChatFinderResponse;
import com.foxtrot.messenger.dto.response.GetAllUserChatsPreviewResponse;
import com.foxtrot.messenger.dto.response.GetChatHistoryResponse;
import com.foxtrot.messenger.security.UserPrincipal;
import com.foxtrot.messenger.services.ChatService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/chats")
public class ChatsController {
    private final ChatService chatService;

    public ChatsController(ChatService chatService){
        this.chatService = chatService;
    }

    @PostMapping("/finder")
    public ResponseEntity<ChatFinderResponse> findChatByTag(@Valid @RequestBody ChatFinderRequest request,
                                                              @AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(chatService.findChatByTag(request, principal.getId()));
    }

    @PostMapping("/create-private")
    public ResponseEntity<ChatFinderResponse> createPrivateChat(@Valid @RequestBody CreatePrivateChatRequest request,
                                                                  @AuthenticationPrincipal UserPrincipal principal){
        UUID partnerId = UUID.fromString(request.getPartnerId());
        ChatFinderResponse response = chatService.createOrGetPrivateChatPreview(principal.getId(), partnerId);
        HttpStatus status = Boolean.TRUE.equals(response.getAlreadyExists()) ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @GetMapping("/{chatId}/history")
    public ResponseEntity<GetChatHistoryResponse> getChatHistory(@PathVariable UUID chatId,
                                                 @RequestParam int page,
                                                 @RequestParam int size,
                                                 @AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(chatService.getChatHistory(chatId, page, size, principal.getId()));
    }

    @GetMapping("/all-chats-preview")
    public ResponseEntity<GetAllUserChatsPreviewResponse> getAllUserChatsPreview(@AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(new GetAllUserChatsPreviewResponse(chatService.getAllUsersChatsPreview(principal.getId())));
    }

}
