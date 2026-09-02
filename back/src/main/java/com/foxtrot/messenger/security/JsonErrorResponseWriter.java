package com.foxtrot.messenger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Same JSON error shape as GlobalExceptionHandler, for failures that happen inside
 * the Spring Security filter chain - before the request ever reaches a controller,
 * so @RestControllerAdvice never gets a chance to see them.
 */
final class JsonErrorResponseWriter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonErrorResponseWriter() {
    }

    static void write(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);

        response.getWriter().write(MAPPER.writeValueAsString(body));
    }
}
