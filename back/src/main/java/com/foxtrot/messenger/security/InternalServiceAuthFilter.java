package com.foxtrot.messenger.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

/**
 * Аутентификация media-service на вебхуках /internal/** - не пользовательский JWT,
 * а общий секрет в заголовке. По образцу JwtAuthenticationFilter: при совпадении
 * секрета кладём в SecurityContext синтетическую аутентификацию с ROLE_INTERNAL_SERVICE,
 * дальше это обычное правило доступа в SecurityConfig.
 */
@Component
public class InternalServiceAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "X-Internal-Secret";

    private final String expectedSecret;

    public InternalServiceAuthFilter(@Value("${media-service.internal-secret}") String expectedSecret) {
        this.expectedSecret = expectedSecret;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (request.getRequestURI().startsWith("/internal/")) {
            String provided = request.getHeader(HEADER);
            if (provided != null && constantTimeEquals(provided, expectedSecret)) {
                var auth = new UsernamePasswordAuthenticationToken(
                        "media-service", null, List.of(new SimpleGrantedAuthority("ROLE_INTERNAL_SERVICE")));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        filterChain.doFilter(request, response);
    }

    // MessageDigest.isEqual вместо String.equals - защита от timing-атаки на секрет
    private boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
