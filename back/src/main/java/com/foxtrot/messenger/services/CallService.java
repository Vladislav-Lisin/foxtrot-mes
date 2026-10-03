package com.foxtrot.messenger.services;

import com.foxtrot.messenger.logging.Activity;
import com.foxtrot.messenger.dto.response.CallResponse;
import com.foxtrot.messenger.dto.ws.CallNotification;
import com.foxtrot.messenger.entity.Call;
import com.foxtrot.messenger.entity.CallParticipant;
import com.foxtrot.messenger.entity.CallStatus;
import com.foxtrot.messenger.entity.ChatMember;
import com.foxtrot.messenger.exception.custom.EntityAlreadyExistsException;
import com.foxtrot.messenger.exception.custom.EntityNotFoundException;
import com.foxtrot.messenger.integration.MediaServiceClient;
import com.foxtrot.messenger.repository.CallParticipantRepository;
import com.foxtrot.messenger.repository.CallRepository;
import com.foxtrot.messenger.repository.ChatMemberRepository;
import com.foxtrot.messenger.security.CallTokenService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.UUID;

@Service
public class CallService {

    private static final List<CallStatus> ACTIVE_STATUSES = List.of(CallStatus.RINGING, CallStatus.ACTIVE);

    private final CallRepository callRepository;
    private final CallParticipantRepository callParticipantRepository;
    private final ChatMemberRepository chatMemberRepository;
    private final MediaServiceClient mediaServiceClient;
    private final CallTokenService callTokenService;
    private final SimpMessagingTemplate messagingTemplate;
    private final CallRateLimiter rateLimiter;
    private final BlockService blockService;
    private final String mediaServiceUrl;

    public CallService(CallRepository callRepository,
                        CallParticipantRepository callParticipantRepository,
                        ChatMemberRepository chatMemberRepository,
                        MediaServiceClient mediaServiceClient,
                        CallTokenService callTokenService,
                        SimpMessagingTemplate messagingTemplate,
                        CallRateLimiter rateLimiter,
                        BlockService blockService,
                        @Value("${media-service.public-url}") String mediaServiceUrl) {
        this.callRepository = callRepository;
        this.callParticipantRepository = callParticipantRepository;
        this.chatMemberRepository = chatMemberRepository;
        this.mediaServiceClient = mediaServiceClient;
        this.callTokenService = callTokenService;
        this.messagingTemplate = messagingTemplate;
        this.rateLimiter = rateLimiter;
        this.blockService = blockService;
        this.mediaServiceUrl = mediaServiceUrl;
    }

    // ---------- запуск звонка ----------

    @Transactional
    public CallResponse startChatCall(UUID chatId, UUID ownerId) {
        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, ownerId)) {
            throw new AccessDeniedException("Not a member of this chat: " + chatId);
        }
        assertNotBlockedInChat(chatId, ownerId);
        callRepository.findFirstByChatIdAndStatusIn(chatId, ACTIVE_STATUSES).ifPresent(existing -> {
            throw new EntityAlreadyExistsException("A call is already active in this chat");
        });

        Call call = createCallRecord(ownerId, chatId, CallStatus.RINGING);
        addParticipant(call.getId(), ownerId);
        Activity.log("CALL_STARTED", "user", ownerId, "call", call.getId(), "chat", chatId);
        notifyChatMembers(call, call.getStatus());

        return toResponse(call, callTokenService.generate(ownerId, call.getId()));
    }

    @Transactional
    public CallResponse startStandaloneCall(UUID ownerId) {
        // v1: открытая модель - любой залогиненный пользователь с callId/joinCode может
        // войти, без списка приглашённых и без гостевого доступа без аккаунта. Если позже
        // понадобится закрытая встреча - проверка приглашений добавляется в assertCanJoin.
        Call call = createCallRecord(ownerId, null, CallStatus.ACTIVE);
        addParticipant(call.getId(), ownerId);
        Activity.log("CALL_STARTED", "user", ownerId, "call", call.getId(), "chat", "standalone");

        return toResponse(call, callTokenService.generate(ownerId, call.getId()));
    }

    private Call createCallRecord(UUID ownerId, UUID chatId, CallStatus initialStatus) {
        rateLimiter.checkStartAllowed(ownerId);

        Call call = new Call();
        call.setOwnerId(ownerId);
        call.setChatId(chatId);
        call.setJoinCode(generateUniqueJoinCode());
        call.setStatus(initialStatus);
        call.setStartedAt(Instant.now());
        Call saved = callRepository.save(call); // нужен id до вызова media-service

        String roomId = mediaServiceClient.createRoom(saved.getId());
        saved.setMediaRoomId(roomId);
        return callRepository.save(saved);
    }

    private String generateUniqueJoinCode() {
        String code;
        do {
            code = String.valueOf(100_000_000 + new Random().nextInt(900_000_000));
        } while (callRepository.existsByJoinCode(code));
        return code;
    }

    // ---------- просмотр / вход / выход ----------

    public CallResponse getCall(UUID callId, UUID userId) {
        Call call = getActiveOrAnyCall(callId);
        assertCanJoin(call, userId);
        return toResponse(call, null); // без токена - его выдаём только на реальном join
    }

    // Для кнопки "переподключиться к звонку" в чате - вышел из звонка, но он ещё идёт,
    // не нужно отдельного POST /calls (он упадёт EntityAlreadyExistsException).
    public CallResponse getActiveCallForChat(UUID chatId, UUID userId) {
        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, userId)) {
            throw new AccessDeniedException("Not a member of this chat: " + chatId);
        }
        return callRepository.findFirstByChatIdAndStatusIn(chatId, ACTIVE_STATUSES)
                .map(call -> toResponse(call, null))
                .orElse(null);
    }

    @Transactional
    public CallResponse joinCall(UUID callId, UUID userId) {
        Call call = callRepository.findById(callId)
                .orElseThrow(() -> new EntityNotFoundException("Call not found: " + callId));

        if (call.getStatus() == CallStatus.ENDED) {
            throw new EntityNotFoundException("Call has already ended: " + callId);
        }

        assertCanJoin(call, userId);

        if (call.getStatus() == CallStatus.RINGING) {
            call.setStatus(CallStatus.ACTIVE);
            callRepository.save(call);
        }

        if (!callParticipantRepository.existsByCallIdAndUserIdAndLeftAtIsNull(callId, userId)) {
            addParticipant(callId, userId);
        }
        Activity.log("CALL_JOINED", "user", userId, "call", callId);

        return toResponse(call, callTokenService.generate(userId, callId));
    }

    private void assertCanJoin(Call call, UUID userId) {
        if (call.getChatId() != null) {
            if (!chatMemberRepository.existsByChatIdAndUserId(call.getChatId(), userId)) {
                throw new AccessDeniedException("Not a member of this chat: " + call.getChatId());
            }
            assertNotBlockedInChat(call.getChatId(), userId);
        }
        // standalone (chatId == null): открытая модель v1, дополнительной проверки нет -
        // см. комментарий в startStandaloneCall.
    }

    // Чат 1:1 - значит у звонящего/входящего ровно один собеседник в этом чате.
    // Заблокированные друг другом не могут ни начать, ни присоединиться к звонку этого чата.
    private void assertNotBlockedInChat(UUID chatId, UUID userId) {
        UUID partnerId = chatMemberRepository.findByChatId(chatId).stream()
                .map(ChatMember::getUserId)
                .filter(id -> !id.equals(userId))
                .findFirst()
                .orElse(null);
        if (partnerId != null && blockService.isBlocked(userId, partnerId)) {
            throw new AccessDeniedException("Call blocked between these users");
        }
    }

    private Call getActiveOrAnyCall(UUID callId) {
        return callRepository.findById(callId)
                .orElseThrow(() -> new EntityNotFoundException("Call not found: " + callId));
    }

    @Transactional
    public void leaveCall(UUID callId, UUID userId) {
        Call call = getActiveOrAnyCall(callId);

        callParticipantRepository.findByCallIdAndUserIdAndLeftAtIsNull(callId, userId)
                .ifPresent(p -> {
                    p.setLeftAt(Instant.now());
                    callParticipantRepository.save(p);
                });
        Activity.log("CALL_LEFT", "user", userId, "call", callId);

        if (callParticipantRepository.countByCallIdAndLeftAtIsNull(callId) == 0) {
            finishCall(call);
        }
    }

    @Transactional
    public void endCall(UUID callId, UUID userId) {
        Call call = getActiveOrAnyCall(callId);

        if (!call.getOwnerId().equals(userId)) {
            throw new AccessDeniedException("Only the call owner can end it for everyone");
        }

        Instant now = Instant.now();
        for (CallParticipant participant : callParticipantRepository.findByCallId(callId)) {
            if (participant.getLeftAt() == null) {
                participant.setLeftAt(now);
                callParticipantRepository.save(participant);
            }
        }

        finishCall(call);
        Activity.log("CALL_ENDED_FOR_ALL", "user", userId, "call", callId);
        mediaServiceClient.closeRoom(callId);
    }

    private void finishCall(Call call) {
        if (call.getStatus() == CallStatus.ENDED) return;

        call.setStatus(CallStatus.ENDED);
        call.setEndedAt(Instant.now());
        callRepository.save(call);

        if (call.getChatId() != null) {
            notifyChatMembers(call, CallStatus.ENDED);
        }
    }

    private void addParticipant(UUID callId, UUID userId) {
        CallParticipant participant = new CallParticipant();
        participant.setCallId(callId);
        participant.setUserId(userId);
        participant.setJoinedAt(Instant.now());
        callParticipantRepository.save(participant);
    }

    // ---------- вебхуки от media-service ----------

    @Transactional
    public void onParticipantJoined(UUID callId, UUID userId) {
        if (!callParticipantRepository.existsByCallIdAndUserIdAndLeftAtIsNull(callId, userId)) {
            addParticipant(callId, userId);
        }
    }

    @Transactional
    public void onParticipantLeft(UUID callId, UUID userId) {
        callParticipantRepository.findByCallIdAndUserIdAndLeftAtIsNull(callId, userId)
                .ifPresent(p -> {
                    p.setLeftAt(Instant.now());
                    callParticipantRepository.save(p);
                });
    }

    @Transactional
    public void onRoomEmpty(UUID callId) {
        callRepository.findById(callId).ifPresent(this::finishCall);
    }

    // group может быть null ("без группы") - исторический снимок в БД, не источник истины
    // для живой маршрутизации звука (та в памяти media-service, см. Foxtrot Calls - Roadmap §6.4)
    @Transactional
    public void onGroupChanged(UUID callId, UUID userId, String group) {
        callParticipantRepository.findByCallIdAndUserIdAndLeftAtIsNull(callId, userId)
                .ifPresent(p -> {
                    p.setGroupTag(group);
                    callParticipantRepository.save(p);
                });
    }

    // ---------- вспомогательное ----------

    private void notifyChatMembers(Call call, CallStatus status) {
        CallNotification notification = new CallNotification(call.getId(), call.getChatId(), call.getOwnerId(), status);
        for (ChatMember member : chatMemberRepository.findByChatId(call.getChatId())) {
            if (status == CallStatus.RINGING && member.getUserId().equals(call.getOwnerId())) {
                continue; // хосту, который сам начал звонок, уведомление о входящем не нужно
            }
            messagingTemplate.convertAndSendToUser(member.getUserId().toString(), "/queue/calls", notification);
        }
    }

    private CallResponse toResponse(Call call, String callToken) {
        CallResponse response = new CallResponse();
        response.setCallId(call.getId());
        response.setChatId(call.getChatId());
        response.setOwnerId(call.getOwnerId());
        response.setJoinCode(call.getJoinCode());
        response.setStatus(call.getStatus());
        response.setStartedAt(call.getStartedAt());
        response.setCallToken(callToken);
        response.setMediaServiceUrl(mediaServiceUrl);
        response.setRoomId(call.getMediaRoomId());
        return response;
    }
}
