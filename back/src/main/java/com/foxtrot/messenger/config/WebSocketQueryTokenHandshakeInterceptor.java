package com.foxtrot.messenger.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;


public class WebSocketQueryTokenHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ACCESS_TOKEN_ATTRIBUTE = "access_token";

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        if (request instanceof ServletServerHttpRequest servletRequest) {
            HttpServletRequest http = servletRequest.getServletRequest();
            String token = http.getParameter("access_token");
            if (token != null && !token.isBlank()) {
                attributes.put(ACCESS_TOKEN_ATTRIBUTE, token.trim());
            }
        }
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
        // no-op
    }
}
