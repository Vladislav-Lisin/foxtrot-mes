package com.foxtrot.messenger.dto.mapping;


import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.entity.User;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UserToSettingsUpdateMapper {
    UserSettingsUpdateResponse toDto(User user);
}
