package com.foxtrot.messenger.controllers;


import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.services.UserSettingsService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/settings")
public class UserSettingsController {

    private final UserSettingsService userSettingsService;

    public UserSettingsController(UserSettingsService userSettingsService){
        this.userSettingsService = userSettingsService;
    }

    @PutMapping("/profile")
    public UserSettingsUpdateResponse profileSettingsUpdate(@RequestBody UserSettingsUpdateRequest request){
        return userSettingsService.profileSettingsUpdate(request);
    }
}
