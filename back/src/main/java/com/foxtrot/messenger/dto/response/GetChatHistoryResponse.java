package com.foxtrot.messenger.dto.response;


import lombok.Data;
import org.springframework.data.domain.Page;

@Data
public class GetChatHistoryResponse {
    private Page<MessageResponse> history;
}
