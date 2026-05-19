package com.foxtrot.messenger.dto.request;


import lombok.Data;

@Data
public class UserSettingsUpdateRequest {
    public String username;
    public String tag;
}
