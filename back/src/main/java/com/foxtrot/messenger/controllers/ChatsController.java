package com.foxtrot.messenger.controllers;



import com.foxtrot.messenger.dto.request.ChatFinderRequest;
import com.foxtrot.messenger.dto.request.CreatePrivateChatRequest;
import com.foxtrot.messenger.dto.response.ChatFinderResponse;
import com.foxtrot.messenger.dto.response.GetAllUserChatsPreviewResponse;
import com.foxtrot.messenger.dto.response.GetChatHistoryResponse;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.services.ChatService;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/chats")
@CrossOrigin(origins = "http://localhost:3000", allowCredentials = "true")
public class ChatsController {
    private final ChatService chatService;

    public ChatsController(ChatService chatService){
        this.chatService = chatService;
    }

    @PostMapping("/finder")
    public ChatFinderResponse findChatByTag(@RequestBody ChatFinderRequest request, HttpSession session){
        return chatService.findChatByTag(request);
    }

    @PostMapping("/create-private")
    public ChatFinderResponse createPrivateChat(@RequestBody CreatePrivateChatRequest request){
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UUID senderId = ((User)authentication.getPrincipal()).getId();
        UUID partnerId = UUID.fromString(request.getPartnerId());
        return chatService.createOrGetPrivateChatPreview(senderId, partnerId);
    }

    @GetMapping("/{chatId}/history")
    public GetChatHistoryResponse getChatHistory(@PathVariable UUID chatId,
                                                 @RequestParam int page,
                                                 @RequestParam int size){
        return chatService.getChatHistory(chatId, page, size);
    }

    @GetMapping("/all-chats-preview")
    public GetAllUserChatsPreviewResponse getAllUserChatsPreview(){
        return new GetAllUserChatsPreviewResponse(chatService.getAllUsersChatsPreview());
    }




}
