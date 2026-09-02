package com.foxtrot.messenger.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterRequest {
    @NotBlank(message = "Укажите имя пользователя.")
    @Size(min = 2, max = 50, message = "Имя пользователя должно быть от 2 до 50 символов.")
    public String username;

    @NotBlank(message = "Укажите email.")
    @Email(message = "Некорректный email.")
    public String email;

    @NotBlank(message = "Укажите пароль.")
    @Size(min = 8, max = 72, message = "Пароль должен быть от 8 до 72 символов.")
    public String password;
}
