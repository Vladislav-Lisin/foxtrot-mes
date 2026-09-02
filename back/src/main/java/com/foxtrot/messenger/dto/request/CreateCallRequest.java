package com.foxtrot.messenger.dto.request;

import lombok.Data;

@Data
public class CreateCallRequest {
    // Опционален: указан -> звонок в чате, пусто/отсутствует -> standalone-встреча
    private String chatId;
}
