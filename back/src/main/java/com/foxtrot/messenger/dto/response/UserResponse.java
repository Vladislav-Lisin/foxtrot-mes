package com.foxtrot.messenger.dto.response;

import lombok.Data;

@Data
public class UserResponse {
    public String id;
    public String username;
    public String tag;
    public String avatarUrl;
}