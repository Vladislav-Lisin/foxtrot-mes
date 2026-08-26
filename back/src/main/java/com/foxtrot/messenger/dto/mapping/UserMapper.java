package com.foxtrot.messenger.dto.mapping;

import org.mapstruct.Mapper;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.dto.response.UserResponse;

@Mapper(componentModel = "spring")
public interface UserMapper {
    UserResponse toDto(User user);
}
