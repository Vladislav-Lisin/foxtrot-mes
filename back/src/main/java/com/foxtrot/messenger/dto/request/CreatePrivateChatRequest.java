package com.foxtrot.messenger.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreatePrivateChatRequest {
    @NotBlank(message = "Укажите partnerId.")
    private String partnerId;
}
