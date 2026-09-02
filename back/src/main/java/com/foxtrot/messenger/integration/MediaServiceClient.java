package com.foxtrot.messenger.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

/**
 * Единственная точка связи с Node.js media-service (mediasoup). Пока media-service
 * не поднят, эти вызовы будут падать RestClientException при обращении - это упадёт
 * в GlobalExceptionHandler как 500 (см. Exception.class-обработчик), поведение по
 * умолчанию безопасно. Для юнит-тестов CallService подменяйте этот бин моком/стабом.
 */
@Component
public class MediaServiceClient {

    private final RestClient restClient;

    public MediaServiceClient(@Value("${media-service.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public String createRoom(UUID callId) {
        CreateRoomResponse response = restClient.post()
                .uri("/rooms")
                .contentType(MediaType.APPLICATION_JSON)
                .body(new CreateRoomRequest(callId))
                .retrieve()
                .body(CreateRoomResponse.class);

        if (response == null || response.roomId() == null) {
            throw new IllegalStateException("Media service returned an empty room id for call " + callId);
        }
        return response.roomId();
    }

    public void closeRoom(UUID callId) {
        restClient.delete()
                .uri("/rooms/{callId}", callId)
                .retrieve()
                .toBodilessEntity();
    }

    private record CreateRoomRequest(UUID callId) {}
    private record CreateRoomResponse(String roomId) {}
}
