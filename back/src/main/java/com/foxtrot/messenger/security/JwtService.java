package com.foxtrot.messenger.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.util.Date;

@Service
public class JwtService {

    //  потом вынесем в application.properties
    private final String SECRET = "super_secret_key_super_secret_key_123456";

    private Key getSignKey() {
        return Keys.hmacShaKeyFor(SECRET.getBytes());
    }

    //  Генерация токена
    public String generateToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 1000 * 60 * 15)) // 15 минут
                .signWith(getSignKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    // Получить email из токена
    public String extractEmail(String token) {
        return extractAllClaims(token).getSubject();
    }

    // Проверка токена
    public boolean isTokenValid(String token, String email) {
        final String extractedEmail = extractEmail(token);
        return (extractedEmail.equals(email) && !isTokenExpired(token));
    }

    private boolean isTokenExpired(String token) {
        return extractAllClaims(token).getExpiration().before(new Date());
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSignKey())
                .setAllowedClockSkewSeconds(300) // 5 minutes tolerance for clock differences
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    // Safe extraction that returns null instead of throwing exception on expired token
    public Claims extractAllClaimsIfValid(String token) {
        try {
            return Jwts.parserBuilder()
                    .setSigningKey(getSignKey())
                    .setAllowedClockSkewSeconds(300)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (ExpiredJwtException e) {
            return null; // Token is expired but well-formed
        } catch (Exception e) {
            return null; // Token is invalid
        }
    }

    // Check if token is expired without throwing exception
    public boolean isTokenExpiredSafe(String token) {
        try {
            return isTokenExpired(token);
        } catch (ExpiredJwtException e) {
            return true; // Yes, it's expired
        } catch (Exception e) {
            return true; // Treat invalid token as expired
        }
    }
}