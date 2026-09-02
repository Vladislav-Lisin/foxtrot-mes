package com.foxtrot.messenger.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AuthRequest {
    @NotBlank(message = "Укажите email.")
    private String email;

    @NotBlank(message = "Укажите пароль.")
    private String password;
}
