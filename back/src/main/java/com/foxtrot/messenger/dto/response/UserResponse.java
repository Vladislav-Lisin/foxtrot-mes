package com.foxtrot.messenger.dto.response;

import lombok.Data;

@Data
public class UserResponse {
    public String id;
    public String username;
    public String tag;
    public String avatarUrl;
    // null, если собеседники заблокировали друг друга - см. ChatService.buildChatPreviewForUser
    public Boolean online;
    // Короткий статус вида "в отпуске до 15 числа" - виден везде, где показан сам пользователь
    // (список чатов, шапка чата), без захода в профиль - как в Instagram.
    public String statusText;
    public String bio;
}