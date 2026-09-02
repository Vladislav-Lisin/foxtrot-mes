package com.foxtrot.messenger.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.UUID;

/**
 * Короткоживущий токен доступа к конкретному звонку - отдельный секрет от основного
 * jwt.secret, чтобы компрометация одного не давала доступ через другой. Проверяет его
 * media-service (тем же общим секретом), а не этот бэкенд - методы extract-геттеры и isValid
 * оставлены здесь на случай, если понадобится собственная проверка на стороне Java.
 */
@Service
public class CallTokenService {

    private final String secret;
    private final long ttlMs;

    public CallTokenService(@Value("${call.jwt.secret}") String secret,
                             @Value("${call.jwt.expiration:60000}") long ttlMs) {
        this.secret = secret;
        this.ttlMs = ttlMs;
    }

    private Key getSignKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generate(UUID userId, UUID callId) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .claim("callId", callId.toString())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + ttlMs))
                .signWith(getSignKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public UUID extractUserId(String token) {
        return UUID.fromString(extractAllClaims(token).getSubject());
    }

    public UUID extractCallId(String token) {
        return UUID.fromString(extractAllClaims(token).get("callId", String.class));
    }

    public boolean isValid(String token) {
        try {
            extractAllClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSignKey())
                .setAllowedClockSkewSeconds(5)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
