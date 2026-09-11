package com.foxtrot.messenger.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
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

    public MediaServiceClient(@Value("${media-service.base-url}") String baseUrl,
                               @Value("${media-service.internal-secret}") String internalSecret) {
        // JDK HttpClient по умолчанию пытается h2c upgrade (Connection: Upgrade,
        // Upgrade: h2c) на первом запросе к новому хосту. media-service - это Node/Express
        // с ws-сервером на том же HTTP-сервере (см. SignalingServer.attachSignalingServer) -
        // ws перехватывает любой запрос с заголовком Upgrade и, увидев не-GET метод (наш POST),
        // отвечает 405 "Invalid HTTP method" вместо того, чтобы запрос дошёл до Express-роута.
        // Фиксируем HTTP/1.1, чтобы JDK не пыталась апгрейднуться.
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();

        // Тот же секрет, что проверяет InternalServiceAuthFilter на входящих вебхуках -
        // здесь мы сами клиент, отдаём его media-service на POST/DELETE /rooms
        // (см. checkInternalSecret в media-service/src/http/roomsApi.ts).
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(new JdkClientHttpRequestFactory(httpClient))
                .defaultHeader("X-Internal-Secret", internalSecret)
                .build();
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
