package com.foxtrot.messenger.services;


import com.foxtrot.messenger.logging.Activity;
import com.foxtrot.messenger.dto.mapping.UserToSettingsUpdateMapper;
import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.repository.UserRepository;
import com.foxtrot.messenger.services.interfaces.IUserSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Optional;

@Service
public class UserSettingsService implements IUserSettingsService {

    private final UserRepository userRepository;
    private final UserToSettingsUpdateMapper userToSettingsUpdateMapper;
    private final FileStorageService fileStorageService;

    public UserSettingsService(UserRepository userRepository,
                                UserToSettingsUpdateMapper userToSettingsUpdateMapper,
                                FileStorageService fileStorageService){
        this.userRepository = userRepository;
        this.userToSettingsUpdateMapper = userToSettingsUpdateMapper;
        this.fileStorageService = fileStorageService;
    }

    @Override
    public UserSettingsUpdateResponse profileSettingsUpdate(UserSettingsUpdateRequest request, User user){

        if (request.getTag() != null && !request.getTag().isBlank()){
            Optional<User> existingUser = userRepository.findByTag(request.getTag());
            if (existingUser.isPresent() && !existingUser.get().getId().equals(user.getId())) {
                throw new IllegalArgumentException("This tag is occupied by another user.");
            }
            user.setTag(request.getTag());
        }

        if (request.getUsername() != null && !request.getUsername().isBlank()) {
            user.setUsername(request.getUsername());
        }

        // В отличие от username/tag, пустую строку тут намеренно не игнорируем - это
        // единственный способ для пользователя СБРОСИТЬ статус (например, вернулся из
        // отпуска). Поле просто отсутствующее в запросе (null) статус не трогает.
        if (request.getStatusText() != null) {
            String trimmed = request.getStatusText().trim();
            if (trimmed.length() > 100) trimmed = trimmed.substring(0, 100); // колонка varchar(100)
            user.setStatusText(trimmed.isEmpty() ? null : trimmed);
        }

        if (request.getBio() != null) {
            String trimmed = request.getBio().trim();
            if (trimmed.length() > 200) trimmed = trimmed.substring(0, 200); // колонка varchar(200)
            user.setBio(trimmed.isEmpty() ? null : trimmed);
        }

        userRepository.save(user);
        Activity.log("PROFILE_UPDATED", "user", user.getId());

        return userToSettingsUpdateMapper.toDto(user);
    }

    public UserSettingsUpdateResponse uploadAvatar(User user, MultipartFile file) {
        String url = fileStorageService.store(file);
        user.setAvatarUrl(url);
        userRepository.save(user);
        Activity.log("AVATAR_UPLOADED", "user", user.getId());
        return userToSettingsUpdateMapper.toDto(user);
    }

    public UserSettingsUpdateResponse resetAvatar(User user) {
        user.setAvatarUrl(null);
        userRepository.save(user);
        Activity.log("AVATAR_RESET", "user", user.getId());
        return userToSettingsUpdateMapper.toDto(user);
    }
}
