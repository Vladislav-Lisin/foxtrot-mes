package com.foxtrot.messenger.dto.response;


import lombok.Data;

@Data
public class UserSettingsUpdateResponse {
    public String username;
    public String tag;
    public String avatarUrl;
    public String statusText;
    public String bio;
}
