package com.foxtrot.messenger.services.interfaces;

import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.entity.User;

public interface IUserSettingsService {
    UserSettingsUpdateResponse profileSettingsUpdate(UserSettingsUpdateRequest request, User user);
}
