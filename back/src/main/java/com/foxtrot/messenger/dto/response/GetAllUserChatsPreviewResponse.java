package com.foxtrot.messenger.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class GetAllUserChatsPreviewResponse {
    private List<ChatPreviewDTO> allChats;
}
