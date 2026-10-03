package com.foxtrot.messenger.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

@Service
public class FileStorageService {

    // Расширение берём по РЕАЛЬНОМУ MIME-типу, который определяет сам браузер по содержимому
    // файла (а не по имени файла от клиента - то можно подделать как угодно, см. ниже) -
    // заодно это и есть "автоопределение формата": .jpeg/.jpg от разных браузеров/ОС
    // нормализуются в одно и то же, не нужно гадать по имени файла.
    private static final Map<String, String> ALLOWED_IMAGE_TYPES = Map.of(
            "image/png", ".png",
            "image/jpeg", ".jpg",
            "image/webp", ".webp",
            "image/gif", ".gif"
    );

    private final Path uploadsDir;

    public FileStorageService(@Value("${app.uploads.dir:./uploads}") String uploadsDir) {
        this.uploadsDir = Path.of(uploadsDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.uploadsDir);
        } catch (IOException e) {
            throw new UncheckedIOException("Не удалось создать директорию для загрузок: " + this.uploadsDir, e);
        }
    }

    /** Сохраняет картинку под случайным именем, возвращает публичный путь ("/uploads/<имя>"). */
    public String store(MultipartFile file) {
        String contentType = file.getContentType();
        String extension = contentType == null ? null : ALLOWED_IMAGE_TYPES.get(contentType.toLowerCase());
        if (extension == null) {
            // Раньше тут вообще не было проверки - принимался любой файл, с именем вида
            // "cat.png" можно было загрузить что угодно (.exe, .html и т.п.), и оно бы потом
            // отдавалось со /uploads/ напрямую браузеру. Белый список по Content-Type -
            // минимальная, но реальная защита (расширение в имени файла клиент подделывает
            // тривиально, Content-Type от браузера для обычной загрузки через <input> - нет).
            throw new IllegalArgumentException(
                    "Недопустимый формат файла - поддерживаются PNG, JPEG, WEBP, GIF");
        }

        String fileName = UUID.randomUUID() + extension;
        Path target = uploadsDir.resolve(fileName).normalize();

        if (!target.startsWith(uploadsDir)) {
            throw new IllegalArgumentException("Некорректное имя файла");
        }

        try {
            file.transferTo(target);
        } catch (IOException e) {
            throw new UncheckedIOException("Не удалось сохранить файл", e);
        }

        return "/uploads/" + fileName;
    }
}
