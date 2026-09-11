package com.foxtrot.messenger.services;

import com.foxtrot.messenger.dto.mapping.UserMapper;
import com.foxtrot.messenger.dto.request.ChatFinderRequest;
import com.foxtrot.messenger.dto.request.SendMessageRequest;
import com.foxtrot.messenger.dto.response.ChatPreviewDTO;
import com.foxtrot.messenger.dto.response.ChatFinderResponse;
import com.foxtrot.messenger.dto.response.GetChatHistoryResponse;
import com.foxtrot.messenger.dto.response.MessageResponse;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.entity.ChatMember;
import com.foxtrot.messenger.entity.Chats;
import com.foxtrot.messenger.entity.Message;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.exception.custom.EntityAlreadyExistsException;
import com.foxtrot.messenger.exception.custom.EntityNotFoundException;
import com.foxtrot.messenger.model.ChatMessage;
import com.foxtrot.messenger.model.MessageStatus;
import com.foxtrot.messenger.repository.*;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

import static com.foxtrot.messenger.entity.ChatType.PRIVATE;

@Service
public class ChatService {

    private final ChatMemberRepository chatMemberRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;
    private final ChatsRepository chatsRepository;
    private final UserMapper userMapper;
    private final MessageRepository messageRepository;

    public ChatService(ChatMemberRepository chatMemberRepository,
                       ChatMessageRepository chatMessageRepository,
                       UserRepository userRepository,
                       ChatsRepository chatsRepository,
                       UserMapper userMapper,
                       MessageRepository messageRepository) {
        this.chatMemberRepository = chatMemberRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.userRepository = userRepository;
        this.chatsRepository = chatsRepository;
        this.userMapper = userMapper;
        this.messageRepository = messageRepository;
    }



    public GetChatHistoryResponse getChatHistory(UUID chatId, int page, int size, UUID senderId){
        chatsRepository.findById(chatId)
                .orElseThrow(() -> new EntityNotFoundException("Chat not found: " + chatId));

        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, senderId)) {
            throw new AccessDeniedException("Access denied to this chat");
        }

        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.max(size, 1),
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        Page<MessageResponse> history = messageRepository.findByChatId(chatId, pageable)
                .map(this::toMessageResponse);

        GetChatHistoryResponse response = new GetChatHistoryResponse();
        response.setHistory(history);
        return response;
    }

    private MessageResponse toMessageResponse(Message message) {
        MessageResponse response = new MessageResponse();
        response.setId(message.getId());
        response.setSenderId(message.getSenderId());
        byte[] raw = message.getContent();
        response.setContent(raw == null ? "" : new String(raw, StandardCharsets.UTF_8));
        response.setCreatedAt(message.getCreatedAt());
        response.setStatus(message.getStatus());
        response.setIsDeleted(message.getIsDeleted());
        return response;
    }


    // поиск чата по тегу пользователя
    public ChatFinderResponse findChatByTag(ChatFinderRequest request, UUID senderId){
        User targetUser = userRepository.findByTag(request.getTag())
                .orElseThrow(() -> new EntityNotFoundException("This tag does not exist."));

        UUID targetId = targetUser.getId();

        ChatFinderResponse chatFinderResponse = new ChatFinderResponse();
        chatFinderResponse.setPartner(userMapper.toDto(targetUser));

        Optional<Chats> chatOpt = chatsRepository.findDirectChatBetweenUsers(senderId, targetId);
        if (chatOpt.isEmpty()){
            chatFinderResponse.setChatId(null);
            chatFinderResponse.setAlreadyExists(false);
            chatFinderResponse.setLastMessage("здесь пока ничего нет");
            chatFinderResponse.setLastMessageAt(null);
            return chatFinderResponse;
        }

        Chats chat = chatOpt.get();
        chatFinderResponse.setChatId(chat.getId().toString());
        chatFinderResponse.setAlreadyExists(true);

        if (chat.getLastMessageId() != null) {
            Optional<Message> lastMessageOpt = chatMessageRepository.findById(chat.getLastMessageId());
            String lastMessageText = lastMessageOpt
                    .map(Message::getContent)
                    .map(content -> content == null ? "" : new String(content, StandardCharsets.UTF_8))
                    .filter(text -> !text.isBlank())
                    .orElse("здесь пока ничего нет");
            chatFinderResponse.setLastMessage(lastMessageText);
            chatFinderResponse.setLastMessageAt(chat.getLastMessageAt());
        } else {
            chatFinderResponse.setLastMessage("здесь пока ничего нет");
            chatFinderResponse.setLastMessageAt(null);
        }

        return chatFinderResponse;
    }

    //Создание приавтного чата на 2 пользователей
    @Transactional
    public UUID createPrivateChat(UUID firstUserId, UUID secondUserId){

        if (chatsRepository.findDirectChatBetweenUsers(firstUserId, secondUserId).isPresent()){
            throw new EntityAlreadyExistsException("Direct chat between users already exists");
        }
        if (firstUserId.equals(secondUserId)) {
            throw new IllegalArgumentException("Cannot create a private chat with yourself");
        }

        // создаем новый чат
        Chats chat = new Chats();
        chat.setCreatedAt(Instant.now());
        chat.setType(PRIVATE);
        chatsRepository.save(chat);

        // добавляем пользователей в чат
        addUserToChat(chat.getId(), firstUserId);
        addUserToChat(chat.getId(), secondUserId);

        return chat.getId();
    }

    public ChatFinderResponse createOrGetPrivateChatPreview(UUID senderId, UUID partnerId) {
        if (senderId.equals(partnerId)) {
            throw new IllegalArgumentException("Cannot create a private chat with yourself");
        }

        User partner = userRepository.findById(partnerId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + partnerId));

        Optional<Chats> existingChat = chatsRepository.findDirectChatBetweenUsers(senderId, partnerId);
        boolean alreadyExisted = existingChat.isPresent();
        UUID chatId = existingChat.map(Chats::getId)
                .orElseGet(() -> createPrivateChat(senderId, partnerId));

        Chats chat = chatsRepository.findById(chatId)
                .orElseThrow(() -> new EntityNotFoundException("Chat not found: " + chatId));

        ChatFinderResponse resp = new ChatFinderResponse();
        resp.setChatId(chat.getId().toString());
        resp.setAlreadyExists(alreadyExisted);
        resp.setPartner(userMapper.toDto(partner));

        if (chat.getLastMessageId() != null) {
            String lastMessageText = chatMessageRepository.findById(chat.getLastMessageId())
                    .map(Message::getContent)
                    .map(content -> content == null ? "" : new String(content, StandardCharsets.UTF_8))
                    .filter(text -> !text.isBlank())
                    .orElse("здесь пока ничего нет");
            resp.setLastMessage(lastMessageText);
            resp.setLastMessageAt(chat.getLastMessageAt());
        } else {
            resp.setLastMessage("здесь пока ничего нет");
            resp.setLastMessageAt(null);
        }

        return resp;
    }

    // добавление пользователя в чат
    private void addUserToChat(UUID chatId, UUID userId){
        ChatMember chatMember = new ChatMember();
        chatMember.setChatId(chatId);
        chatMember.setUserId(userId);
        chatMember.setRole("user");
        chatMemberRepository.save(chatMember);
    }

    // Получение всех чатов пользователя по его Id
    private List<Chats> getAllUserChats(UUID userId){
        return chatsRepository.findAllByMemberUserId(userId);
    }

    // Получение превью для всех чатов пользователя
    public List<ChatPreviewDTO> getAllUsersChatsPreview(UUID userId){
        List<Chats> chatsList = getAllUserChats(userId);
        chatsList.sort(Comparator.comparing(Chats::getLastMessageAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        List<ChatPreviewDTO> previewDTOList = new ArrayList<>();
        for (Chats chat : chatsList) {
            previewDTOList.add(buildChatPreviewForUser(chat.getId(), userId));
        }
        return previewDTOList;
    }



    @Transactional
    public ChatMessage processMessage(SendMessageRequest request, UUID userId) {

        UUID chatId = UUID.fromString(request.getChatId());

        // проверка участия
        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, userId)) {
            return null;
        }

        Chats chat = chatsRepository.findById(chatId)
                .orElseThrow(() -> new EntityNotFoundException("Chat not found: " + chatId));

        // сохраняем
        Message entity = new Message();
        entity.setChatId(chatId);
        entity.setSenderId(userId);
        entity.setContent(request.getContent().getBytes(StandardCharsets.UTF_8));
        entity.setCreatedAt(Instant.now());
        entity.setStatus("SENT");
        entity.setIsDeleted(false);

        Message saved = chatMessageRepository.save(entity);
        // Иначе bulk-update chat_members может выполниться до INSERT в messages → FK fk_last_message
        chatMessageRepository.flush();

        // обновляем last message для превью (и у членов, и у чата)
        chatMemberRepository.updateLastMessage(
                chatId,
                saved.getId(),
                saved.getCreatedAt()
        );

        chat.setLastMessageId(saved.getId());
        chat.setLastMessageAt(saved.getCreatedAt());
        chatsRepository.save(chat);

        // возвращаем DTO (используем именно сохранённое время, чтобы REST-история и live-пуш
        // по WebSocket показывали один и тот же timestamp для одного и того же сообщения)
        return ChatMessage.builder()
                .id(saved.getId().toString())
                .chatId(saved.getChatId().toString())
                .senderId(saved.getSenderId().toString())
                .content(request.getContent())
                .timestamp(saved.getCreatedAt())
                .status(MessageStatus.SENT)
                .build();
    }

    public void markAsRead(UUID messageId) {
        chatMessageRepository.updateStatus(messageId, "READ");
    }

    public void markChatAsRead(UUID chatId, UUID userId) {
        chatMessageRepository.markChatMessagesAsRead(chatId, userId);
    }


    // Получение данных для получения превью конкретного чата.
    public ChatPreviewDTO buildChatPreviewForUser(UUID chatId, UUID viewerId) {
        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, viewerId)) {
            throw new AccessDeniedException("User is not a member of chat: " + chatId);
        }

        Chats chat = chatsRepository.findById(chatId)
                .orElseThrow(() -> new EntityNotFoundException("Chat not found: " + chatId));

        UUID partnerId = chatMemberRepository.findByChatId(chatId).stream()
                .map(ChatMember::getUserId)
                .filter(id -> !id.equals(viewerId))
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Partner not found for chat: " + chatId));

        User partner = userRepository.findById(partnerId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + partnerId));

        Message lastMessage = chat.getLastMessageId() != null
                ? chatMessageRepository.findById(chat.getLastMessageId()).orElse(null)
                : null;

        String lastMessageText = "здесь пока ничего нет";
        if (lastMessage != null && lastMessage.getContent() != null) {
            String content = new String(lastMessage.getContent(), StandardCharsets.UTF_8);
            if (!content.isBlank()) lastMessageText = content;
        }

        return new ChatPreviewDTO(
                chatId.toString(),
                userMapper.toDto(partner),
                lastMessageText,
                chat.getLastMessageAt(),
                chatMessageRepository.countUnread(chatId, viewerId),
                lastMessage != null ? lastMessage.getSenderId().toString() : null
        );
    }
}