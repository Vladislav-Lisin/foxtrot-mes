package com.foxtrot.messenger.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AuthResponse {

    private UserResponse user;       // данные пользователя для UI
    private String accessToken;      // JWT, которым клиент будет авторизоваться
    private String refreshToken;
}