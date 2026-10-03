package com.foxtrot.messenger.controllers;


import com.foxtrot.messenger.dto.request.UserSettingsUpdateRequest;
import com.foxtrot.messenger.dto.response.UserSettingsUpdateResponse;
import com.foxtrot.messenger.security.UserPrincipal;
import com.foxtrot.messenger.services.UserSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/settings")
public class UserSettingsController {

    private final UserSettingsService userSettingsService;

    public UserSettingsController(UserSettingsService userSettingsService){
        this.userSettingsService = userSettingsService;
    }

    @PutMapping("/profile")
    public ResponseEntity<UserSettingsUpdateResponse> profileSettingsUpdate(@RequestBody UserSettingsUpdateRequest request,
                                                                              @AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(userSettingsService.profileSettingsUpdate(request, principal.getUser()));
    }

    @PostMapping("/avatar")
    public ResponseEntity<UserSettingsUpdateResponse> uploadAvatar(@RequestParam("file") MultipartFile file,
                                                                     @AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(userSettingsService.uploadAvatar(principal.getUser(), file));
    }

    @DeleteMapping("/avatar")
    public ResponseEntity<UserSettingsUpdateResponse> resetAvatar(@AuthenticationPrincipal UserPrincipal principal){
        return ResponseEntity.ok(userSettingsService.resetAvatar(principal.getUser()));
    }
}
