package com.foxtrot.messenger.services.interfaces;

import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;

public interface IUserSettingsService {
    UserSettingsUpdateResponse profileSettingsUpdate(UserSettingsUpdateRequest request);
}
