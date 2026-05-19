package com.foxtrot.messenger.security;

import com.foxtrot.messenger.entity.RefreshToken;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.repository.RefreshTokenRepository;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository repository;

    public RefreshTokenService(RefreshTokenRepository repository) {
        this.repository = repository;
    }

    public RefreshToken create(User user) {

        RefreshToken token = new RefreshToken();

        token.setUser(user); // привязка к пользователю
        token.setToken(UUID.randomUUID().toString()); // случайная строка
        token.setExpiryDate(new Date(System.currentTimeMillis() + 1000L * 60 * 60 * 24 * 7)); // 7 дней

        return repository.save(token);
    }

    public RefreshToken validate(String tokenStr) {

        RefreshToken token = repository.findByToken(tokenStr)
                .orElseThrow(() -> new RuntimeException("Invalid refresh token"));

        if (token.getExpiryDate().before(new Date(System.currentTimeMillis()))) {
            repository.delete(token);
            throw new RuntimeException("Refresh token expired");
        }

        return token;
    }
}