package com.foxtrot.messenger.dto.ws;

import com.foxtrot.messenger.entity.CallStatus;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Payload для STOMP /user/queue/calls - и "входящий звонок" (status=RINGING), и "звонок завершён" (status=ENDED). */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class CallNotification {
    private UUID callId;
    private UUID chatId;
    private UUID ownerId;
    private CallStatus status;
}
