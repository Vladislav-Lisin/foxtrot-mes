package com.foxtrot.messenger.controllers;

import com.foxtrot.messenger.dto.request.ReadMessageRequest;
import com.foxtrot.messenger.dto.request.SendMessageRequest;
import com.foxtrot.messenger.dto.response.ChatPreviewDTO;
import com.foxtrot.messenger.model.ChatMessage;
import com.foxtrot.messenger.model.MessageStatus;
import com.foxtrot.messenger.repository.ChatMemberRepository;
import com.foxtrot.messenger.services.ChatService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import org.springframework.security.core.Authentication;

import java.util.Date;
import java.util.UUID;

@Controller
public class ChatWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(ChatWebSocketController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatMemberRepository chatMemberRepository;
    private final ChatService chatService;

    private static final String CHAT_TOPIC_PREFIX = "/topic/chat/";

    public ChatWebSocketController(
            SimpMessagingTemplate messagingTemplate,
            ChatMemberRepository chatMemberRepository,
            ChatService chatService
    ) {
        this.messagingTemplate = messagingTemplate;
        this.chatMemberRepository = chatMemberRepository;
        this.chatService = chatService;
    }

    @MessageMapping("/chat")
    public void sendChatMessage(SendMessageRequest request, Principal principal) {
        try {
            if (principal == null) {
                logger.warn("WebSocket: Unauthorized message attempt - Principal is null");
                return;
            }

            if (!(principal instanceof Authentication)) {
                logger.warn("WebSocket: Invalid principal type");
                return;
            }

            Authentication authentication = (Authentication) principal;
            UUID userId;
            try {
                userId = UUID.fromString(authentication.getName());
            } catch (IllegalArgumentException e) {
                logger.warn("WebSocket: Invalid user ID format: {}", authentication.getName(), e);
                return;
            }

            ChatMessage message = chatService.processMessage(request, userId);

            if (message == null) {
                logger.warn("WebSocket: Message processing returned null for user: {}", userId);
                return;
            }

            UUID chatId = UUID.fromString(message.getChatId());

            // отправляем в общий канал чата (все участники)
            messagingTemplate.convertAndSend(
                    CHAT_TOPIC_PREFIX + message.getChatId(),
                    message
            );

            logger.info("WebSocket: Message sent to chat {} from user {}", chatId, userId);

            // обновляем превью чата в списке у всех участников (личная очередь)
            var members = chatMemberRepository.findByChatId(chatId);
            for (var member : members) {
                ChatPreviewDTO preview = chatService.buildChatPreviewForUser(chatId, member.getUserId());
                messagingTemplate.convertAndSendToUser(
                        member.getUserId().toString(),
                        "/queue/chats",
                        preview
                );
            }

            // отправляем статус DELIVERED отправителю
            ChatMessage delivered = ChatMessage.builder()
                    .id(message.getId())
                    .chatId(message.getChatId())
                    .senderId(message.getSenderId())
                    .content(message.getContent())
                    .timestamp(new Date())
                    .status(MessageStatus.DELIVERED)
                    .build();

            messagingTemplate.convertAndSendToUser(
                    userId.toString(),
                    "/queue/messages",
                    delivered
            );
        } catch (Exception e) {
            logger.error("WebSocket: Error in sendChatMessage", e);
        }
    }

    @MessageMapping("/read")
    public void readMessage(ReadMessageRequest request, Principal principal) {
        try {
            if (principal == null) {
                logger.warn("WebSocket: Unauthorized read attempt - Principal is null");
                return;
            }

            if (!(principal instanceof Authentication)) {
                logger.warn("WebSocket: Invalid principal type in readMessage");
                return;
            }

            Authentication authentication = (Authentication) principal;
            UUID userId;
            try {
                userId = UUID.fromString(authentication.getName());
            } catch (IllegalArgumentException e) {
                logger.warn("WebSocket: Invalid user ID format in readMessage: {}", authentication.getName(), e);
                return;
            }

            UUID chatId = UUID.fromString(request.getChatId());

            // 1. обновляем БД
            chatService.markChatAsRead(chatId, userId);

            // 2. уведомляем остальных участников
            var members = chatMemberRepository.findByChatId(chatId);

            for (var member : members) {
                // не отправляем самому себе
                if (member.getUserId().equals(userId)) continue;

                messagingTemplate.convertAndSendToUser(
                        member.getUserId().toString(),
                        "/queue/messages",
                        ChatMessage.builder()
                                .chatId(chatId.toString())
                                .status(MessageStatus.READ)
                                .timestamp(new Date())
                                .build()
                );
            }

            logger.info("WebSocket: Chat marked as read by user {} in chat {}", userId, chatId);
        } catch (Exception e) {
            logger.error("WebSocket: Error in readMessage", e);
        }
    }
}