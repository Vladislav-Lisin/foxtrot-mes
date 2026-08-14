package com.foxtrot.messenger.config;

import com.foxtrot.messenger.security.JwtService;
import com.foxtrot.messenger.repository.UserRepository;
import io.jsonwebtoken.ExpiredJwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public WebSocketAuthInterceptor(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = null;

            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                token = authHeader.substring(7).trim();
            }

            if (token == null || token.isBlank()) {
                String accessTokenHeader = accessor.getFirstNativeHeader("access_token");
                if (accessTokenHeader != null && !accessTokenHeader.isBlank()) {
                    token = accessTokenHeader.trim();
                }
            }

            // SockJS / some transports may not reliably propagate custom STOMP CONNECT headers.
            // Fallback: token passed via SockJS URL query param: /ws?access_token=...
            if ((token == null || token.isBlank()) && accessor.getSessionAttributes() != null) {
                Object raw = accessor.getSessionAttributes().get(WebSocketQueryTokenHandshakeInterceptor.ACCESS_TOKEN_ATTRIBUTE);
                if (raw instanceof String s && !s.isBlank()) {
                    token = s.trim();
                }
            }

            if (token == null || token.isBlank()) {
                logger.warn("WebSocket: Missing token on CONNECT (no Authorization Bearer and no access_token query param)");
                return message;
            }

            try {
                String email = jwtService.extractEmail(token);

                var userOpt = userRepository.findByEmail(email);
                if (userOpt.isEmpty()) {
                    logger.warn("WebSocket: User not found for email: {}", email);
                    return message;
                }

                var user = userOpt.get();

                if (!jwtService.isTokenValid(token, user.getEmail())) {
                    logger.warn("WebSocket: Invalid token for user: {}", email);
                    return message;
                }
                var authorities = List.of(
                        new SimpleGrantedAuthority("ROLE_" + user.getRole().getName())
                );

                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(
                                user.getId().toString(),
                                null,
                                authorities
                        );

                accessor.setUser(auth);
                logger.info("WebSocket: User authenticated: {} ({})", user.getId(), email);
                // Важно: без нового Message заголовки с пользователем не попадают в брокер —
                // тогда на SEND Principal остаётся null.
                return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());

            } catch (ExpiredJwtException e) {
                logger.warn("WebSocket: Token expired - client should refresh and reconnect. Error: {}", e.getMessage());
                // For expired token, return message allowing connection to continue
                // The client will handle the error and perform token refresh
                // Add a warning header that client can check
                accessor.setNativeHeader("X-Token-Expired", "true");
                return message;
            } catch (Exception e) {
                logger.error("WebSocket authentication error: {}", e.getMessage(), e);
                // For other auth errors, allow connection but unauthenticated
                // This is safer than closing the connection
                return message;
            }
        }

        return message;
    }


}