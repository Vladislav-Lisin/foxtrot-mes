package com.foxtrot.messenger.controllers;

import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.request.RegisterRequest;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.entity.RefreshToken;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.security.JwtService;
import com.foxtrot.messenger.security.RefreshTokenService;
import com.foxtrot.messenger.security.UserPrincipal;
import com.foxtrot.messenger.services.AuthService;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;

    public AuthController(AuthService authService, JwtService jwtService, RefreshTokenService refreshTokenService) {
        this.jwtService = jwtService;
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/authorization")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(authService.toDto(principal.getUser()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestParam String refreshToken) {
        RefreshToken token = refreshTokenService.validate(refreshToken);
        User user = token.getUser();

        String newAccessToken = jwtService.generateToken(user.getEmail());

        return ResponseEntity.ok(new AuthResponse(
                authService.toDto(user),
                newAccessToken,
                refreshToken // можно тот же вернуть (или сделать ротацию позже)
        ));
    }
}
