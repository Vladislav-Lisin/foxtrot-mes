package com.foxtrot.messenger.services;


import com.foxtrot.messenger.dto.mapping.UserToSettingsUpdateMapper;
import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.repository.UserRepository;
import com.foxtrot.messenger.services.interfaces.IUserSettingsService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
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
    public UserSettingsUpdateResponse profileSettingsUpdate(UserSettingsUpdateRequest request){

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("User not authenticated");
        }

        User user = (User)authentication.getPrincipal();

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
