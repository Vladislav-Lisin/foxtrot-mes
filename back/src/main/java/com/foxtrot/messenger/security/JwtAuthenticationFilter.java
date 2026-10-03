package com.foxtrot.messenger.security;

import com.foxtrot.messenger.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.List;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import com.foxtrot.messenger.entity.User;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String token = authHeader.substring(7);

        final String email;
        try {
            email = jwtService.extractEmail(token);
        } catch (Exception e) {
            filterChain.doFilter(request, response);
            return;
        }

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {

            var userOpt = userRepository.findByEmail(email);

            if (userOpt.isEmpty()) {
                filterChain.doFilter(request, response);
                return;
            }

            var user = userOpt.get();

            if (jwtService.isTokenValid(token, user.getEmail())) {

                touchLastSeen(user);

                var authorities = List.of(
                        new SimpleGrantedAuthority("ROLE_" + user.getPlatformRole().name())
                );
                // создаём роли ТОЛЬКО после проверки пользователя

                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                new UserPrincipal(user),   // principal
                                null,
                                authorities
                        );

                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }

        filterChain.doFilter(request, response);
    }

    // "В сети" (см. ChatService) показывается по свежести lastSeen - обновляем её на
    // каждый аутентифицированный запрос, а не только на логин, иначе статус был бы
    // по сути "последний вход", а не реальное присутствие. Троттлинг на минуту - иначе
    // почти каждый REST-запрос фронта писал бы в БД.
    private static final Duration LAST_SEEN_UPDATE_THRESHOLD = Duration.ofMinutes(1);

    private void touchLastSeen(User user) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime last = user.getLastSeen();
        if (last == null || Duration.between(last, now).compareTo(LAST_SEEN_UPDATE_THRESHOLD) > 0) {
            user.setLastSeen(now);
            userRepository.save(user);
        }
    }
}