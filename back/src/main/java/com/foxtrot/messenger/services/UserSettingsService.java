package com.foxtrot.messenger.services;


import com.foxtrot.messenger.dto.mapping.UserToSettingsUpdateMapper;
import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.repository.UserRepository;
import com.foxtrot.messenger.services.interfaces.IUserSettingsService;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UserSettingsService implements IUserSettingsService {

    private final UserRepository userRepository;
    private final UserToSettingsUpdateMapper userToSettingsUpdateMapper;

    public UserSettingsService(UserRepository userRepository, UserToSettingsUpdateMapper userToSettingsUpdateMapper){
        this.userRepository = userRepository;
        this.userToSettingsUpdateMapper = userToSettingsUpdateMapper;
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
        userRepository.save(user);

        return userToSettingsUpdateMapper.toDto(user);
    }
}
