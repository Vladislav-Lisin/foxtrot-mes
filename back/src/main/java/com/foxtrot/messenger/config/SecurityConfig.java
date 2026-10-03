package com.foxtrot.messenger.config;

import com.foxtrot.messenger.security.InternalServiceAuthFilter;
import com.foxtrot.messenger.security.JwtAuthenticationFilter;
import com.foxtrot.messenger.security.RestAccessDeniedHandler;
import com.foxtrot.messenger.security.RestAuthenticationEntryPoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;


@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final InternalServiceAuthFilter internalServiceAuthFilter;
    private final RestAuthenticationEntryPoint restAuthenticationEntryPoint;
    private final RestAccessDeniedHandler restAccessDeniedHandler;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter,
                           InternalServiceAuthFilter internalServiceAuthFilter,
                           RestAuthenticationEntryPoint restAuthenticationEntryPoint,
                           RestAccessDeniedHandler restAccessDeniedHandler) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.internalServiceAuthFilter = internalServiceAuthFilter;
        this.restAuthenticationEntryPoint = restAuthenticationEntryPoint;
        this.restAccessDeniedHandler = restAccessDeniedHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.cors(cors -> {})
            .csrf(csrf ->csrf.disable())
            .exceptionHandling(eh -> eh
                    .authenticationEntryPoint(restAuthenticationEntryPoint)
                    .accessDeniedHandler(restAccessDeniedHandler)
            )
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/auth/register", "/auth/authorization", "/auth/refresh").permitAll()
                    // Загруженные картинки (фон чата) - статика, отдаётся браузеру напрямую,
                    // без JWT в заголовке (как обычный <img src>/background-image).
                    .requestMatchers("/uploads/**").permitAll()
                    // SockJS performs HTTP requests to /ws/** before STOMP CONNECT (no Authorization header yet).
                    // Actual auth happens in WebSocketAuthInterceptor on STOMP CONNECT with Bearer token.
                    .requestMatchers("/ws", "/ws/**").permitAll()
                    // Вебхуки от media-service - не пользовательский JWT, см. InternalServiceAuthFilter.
                    .requestMatchers("/internal/**").hasRole("INTERNAL_SERVICE")
                    .anyRequest().authenticated()
            )
                    .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(internalServiceAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
