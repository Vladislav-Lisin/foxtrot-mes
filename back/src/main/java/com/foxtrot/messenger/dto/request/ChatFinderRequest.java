package com.foxtrot.messenger.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatFinderRequest {
    @NotBlank(message = "Укажите тег для поиска.")
    public String tag;
}
