package com.foxtrot.messenger.services;

import com.foxtrot.messenger.dto.response.CallResponse;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CallServiceTest {

    @Mock
    private CallRepository callRepository;
    @Mock
    private CallParticipantRepository callParticipantRepository;
    @Mock
    private ChatMemberRepository chatMemberRepository;
    @Mock
    private MediaServiceClient mediaServiceClient;
    @Mock
    private CallTokenService callTokenService;
    @Mock
    private SimpMessagingTemplate messagingTemplate;
    @Mock
    private BlockService blockService;

    private CallService callService;

    @BeforeEach
    void setUp() {
        // реальный CallRateLimiter, не мок - в этих тестах лимит не должен мешать/участвовать
        callService = new CallService(
                callRepository, callParticipantRepository, chatMemberRepository,
                mediaServiceClient, callTokenService, messagingTemplate,
                new CallRateLimiter(), blockService, "https://media.example.com"
        );
    }

    private Call newCall(UUID id, UUID chatId, UUID ownerId, CallStatus status) {
        Call call = new Call();
        call.setId(id);
        call.setChatId(chatId);
        call.setOwnerId(ownerId);
        call.setStatus(status);
        return call;
    }

    @Test
    void startChatCallFailsWhenUserIsNotAChatMember() {
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(false);

        assertThatThrownBy(() -> callService.startChatCall(chatId, userId))
                .isInstanceOf(AccessDeniedException.class);

        verifyNoInteractions(mediaServiceClient);
    }

    @Test
    void startChatCallFailsWhenAnActiveCallAlreadyExistsInTheChat() {
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(true);
        when(callRepository.findFirstByChatIdAndStatusIn(eq(chatId), any()))
                .thenReturn(Optional.of(newCall(UUID.randomUUID(), chatId, userId, CallStatus.RINGING)));

        assertThatThrownBy(() -> callService.startChatCall(chatId, userId))
                .isInstanceOf(EntityAlreadyExistsException.class);

        verifyNoInteractions(mediaServiceClient);
    }

    @Test
    void startChatCallCreatesRoomAndAddsOwnerAsParticipant() {
        UUID chatId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, ownerId)).thenReturn(true);
        when(callRepository.findFirstByChatIdAndStatusIn(eq(chatId), any())).thenReturn(Optional.empty());
        when(callRepository.existsByJoinCode(any())).thenReturn(false);
        // save() возвращает переданный ей же объект, эмулируя эффект генерации id при вставке
        when(callRepository.save(any(Call.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(mediaServiceClient.createRoom(any())).thenReturn("room-1");
        when(callTokenService.generate(ownerId, null)).thenReturn("call-token"); // id ещё не выставлен на моке
        when(chatMemberRepository.findByChatId(chatId)).thenReturn(List.of());

        CallResponse response = callService.startChatCall(chatId, ownerId);

        assertThat(response.getStatus()).isEqualTo(CallStatus.RINGING);
        assertThat(response.getRoomId()).isEqualTo("room-1");
        assertThat(response.getMediaServiceUrl()).isEqualTo("https://media.example.com");
        verify(callParticipantRepository).save(argThat(p -> p.getUserId().equals(ownerId)));
    }

    @Test
    void startChatCallFailsWhenBlockedByThePartner() {
        UUID chatId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        ChatMember partnerMembership = new ChatMember();
        partnerMembership.setUserId(partnerId);
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, ownerId)).thenReturn(true);
        when(chatMemberRepository.findByChatId(chatId)).thenReturn(List.of(partnerMembership));
        when(blockService.isBlocked(ownerId, partnerId)).thenReturn(true);

        assertThatThrownBy(() -> callService.startChatCall(chatId, ownerId))
                .isInstanceOf(AccessDeniedException.class);

        verifyNoInteractions(mediaServiceClient);
    }

    @Test
    void joinCallFailsWhenBlockedByThePartner() {
        UUID callId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        ChatMember partnerMembership = new ChatMember();
        partnerMembership.setUserId(partnerId);
        when(callRepository.findById(callId))
                .thenReturn(Optional.of(newCall(callId, chatId, partnerId, CallStatus.ACTIVE)));
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(true);
        when(chatMemberRepository.findByChatId(chatId)).thenReturn(List.of(partnerMembership));
        when(blockService.isBlocked(userId, partnerId)).thenReturn(true);

        assertThatThrownBy(() -> callService.joinCall(callId, userId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void joinCallFailsWhenCallHasAlreadyEnded() {
        UUID callId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(callRepository.findById(callId))
                .thenReturn(Optional.of(newCall(callId, null, userId, CallStatus.ENDED)));

        assertThatThrownBy(() -> callService.joinCall(callId, userId))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void joinCallFailsWhenUserIsNotAMemberOfTheChatTheCallBelongsTo() {
        UUID callId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(callRepository.findById(callId))
                .thenReturn(Optional.of(newCall(callId, chatId, UUID.randomUUID(), CallStatus.ACTIVE)));
        when(chatMemberRepository.existsByChatIdAndUserId(chatId, userId)).thenReturn(false);

        assertThatThrownBy(() -> callService.joinCall(callId, userId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void joinCallMovesARingingCallToActive() {
        UUID callId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Call call = newCall(callId, null, UUID.randomUUID(), CallStatus.RINGING);
        when(callRepository.findById(callId)).thenReturn(Optional.of(call));
        when(callParticipantRepository.existsByCallIdAndUserIdAndLeftAtIsNull(callId, userId)).thenReturn(false);
        when(callTokenService.generate(userId, callId)).thenReturn("call-token");

        callService.joinCall(callId, userId);

        assertThat(call.getStatus()).isEqualTo(CallStatus.ACTIVE);
        verify(callRepository).save(call);
        verify(callParticipantRepository).save(argThat(p -> p.getUserId().equals(userId)));
    }

    @Test
    void joinCallDoesNotDuplicateAnAlreadyActiveParticipant() {
        UUID callId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Call call = newCall(callId, null, UUID.randomUUID(), CallStatus.ACTIVE);
        when(callRepository.findById(callId)).thenReturn(Optional.of(call));
        when(callParticipantRepository.existsByCallIdAndUserIdAndLeftAtIsNull(callId, userId)).thenReturn(true);
        when(callTokenService.generate(userId, callId)).thenReturn("call-token");

        callService.joinCall(callId, userId);

        verify(callParticipantRepository, never()).save(any());
    }

    @Test
    void leaveCallEndsTheCallWhenTheLastParticipantLeaves() {
        UUID callId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Call call = newCall(callId, null, userId, CallStatus.ACTIVE);
        CallParticipant participant = new CallParticipant();
        participant.setCallId(callId);
        participant.setUserId(userId);
        when(callRepository.findById(callId)).thenReturn(Optional.of(call));
        when(callParticipantRepository.findByCallIdAndUserIdAndLeftAtIsNull(callId, userId))
                .thenReturn(Optional.of(participant));
        when(callParticipantRepository.countByCallIdAndLeftAtIsNull(callId)).thenReturn(0L);

        callService.leaveCall(callId, userId);

        assertThat(participant.getLeftAt()).isNotNull();
        assertThat(call.getStatus()).isEqualTo(CallStatus.ENDED);
    }

    @Test
    void leaveCallKeepsItActiveWhileOtherParticipantsRemain() {
        UUID callId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Call call = newCall(callId, null, userId, CallStatus.ACTIVE);
        CallParticipant participant = new CallParticipant();
        when(callRepository.findById(callId)).thenReturn(Optional.of(call));
        when(callParticipantRepository.findByCallIdAndUserIdAndLeftAtIsNull(callId, userId))
                .thenReturn(Optional.of(participant));
        when(callParticipantRepository.countByCallIdAndLeftAtIsNull(callId)).thenReturn(1L);

        callService.leaveCall(callId, userId);

        assertThat(call.getStatus()).isEqualTo(CallStatus.ACTIVE);
    }

    @Test
    void endCallFailsWhenCallerIsNotTheOwner() {
        UUID callId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID someoneElse = UUID.randomUUID();
        when(callRepository.findById(callId))
                .thenReturn(Optional.of(newCall(callId, null, ownerId, CallStatus.ACTIVE)));

        assertThatThrownBy(() -> callService.endCall(callId, someoneElse))
                .isInstanceOf(AccessDeniedException.class);

        verify(mediaServiceClient, never()).closeRoom(any());
    }

    @Test
    void endCallClosesTheMediaRoomAndMarksAllParticipantsAsLeft() {
        UUID callId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        Call call = newCall(callId, null, ownerId, CallStatus.ACTIVE);
        CallParticipant stillIn = new CallParticipant();
        when(callRepository.findById(callId)).thenReturn(Optional.of(call));
        when(callParticipantRepository.findByCallId(callId)).thenReturn(List.of(stillIn));

        callService.endCall(callId, ownerId);

        assertThat(stillIn.getLeftAt()).isNotNull();
        assertThat(call.getStatus()).isEqualTo(CallStatus.ENDED);
        verify(mediaServiceClient).closeRoom(callId);
    }
}
