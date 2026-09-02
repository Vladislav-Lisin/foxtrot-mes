package com.foxtrot.messenger.services;

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
    private final String mediaServiceUrl;

    public CallService(CallRepository callRepository,
                        CallParticipantRepository callParticipantRepository,
                        ChatMemberRepository chatMemberRepository,
                        MediaServiceClient mediaServiceClient,
                        CallTokenService callTokenService,
                        SimpMessagingTemplate messagingTemplate,
                        @Value("${media-service.public-url}") String mediaServiceUrl) {
        this.callRepository = callRepository;
        this.callParticipantRepository = callParticipantRepository;
        this.chatMemberRepository = chatMemberRepository;
        this.mediaServiceClient = mediaServiceClient;
        this.callTokenService = callTokenService;
        this.messagingTemplate = messagingTemplate;
        this.mediaServiceUrl = mediaServiceUrl;
    }

    // ---------- запуск звонка ----------

    @Transactional
    public CallResponse startChatCall(UUID chatId, UUID ownerId) {
        if (!chatMemberRepository.existsByChatIdAndUserId(chatId, ownerId)) {
            throw new AccessDeniedException("Not a member of this chat: " + chatId);
        }
        callRepository.findFirstByChatIdAndStatusIn(chatId, ACTIVE_STATUSES).ifPresent(existing -> {
            throw new EntityAlreadyExistsException("A call is already active in this chat");
        });

        Call call = createCallRecord(ownerId, chatId, CallStatus.RINGING);
        addParticipant(call.getId(), ownerId);
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

        return toResponse(call, callTokenService.generate(ownerId, call.getId()));
    }

    private Call createCallRecord(UUID ownerId, UUID chatId, CallStatus initialStatus) {
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

        return toResponse(call, callTokenService.generate(userId, callId));
    }

    private void assertCanJoin(Call call, UUID userId) {
        if (call.getChatId() != null && !chatMemberRepository.existsByChatIdAndUserId(call.getChatId(), userId)) {
            throw new AccessDeniedException("Not a member of this chat: " + call.getChatId());
        }
        // standalone (chatId == null): открытая модель v1, дополнительной проверки нет -
        // см. комментарий в startStandaloneCall.
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
