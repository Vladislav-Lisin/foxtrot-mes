package com.foxtrot.messenger.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** Runs when an unauthenticated request hits a protected endpoint - returns 401 JSON instead of Spring's default. */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                          AuthenticationException authException) throws IOException {
        JsonErrorResponseWriter.write(response, HttpStatus.UNAUTHORIZED, "Требуется авторизация.");
    }
}
