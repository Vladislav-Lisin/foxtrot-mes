package com.foxtrot.messenger.controllers;

import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.request.RegisterRequest;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.security.JwtService;
import com.foxtrot.messenger.security.RefreshTokenService;
import com.foxtrot.messenger.services.AuthService;

import jakarta.servlet.http.HttpSession;

import org.springframework.security.core.context.SecurityContextHolder;
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
    public AuthResponse register(@RequestBody RegisterRequest request, HttpSession session) {
        return authService.register(request);
    }

    @PostMapping("/authorization")
    public AuthResponse login(@RequestBody AuthRequest request, HttpSession session) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public UserResponse me() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        // достаём текущую аутентификацию

        if (authentication == null || authentication.getPrincipal() == null) {
            throw new RuntimeException("Unauthorized");
        }

        User user = (User) authentication.getPrincipal();
        // мы туда положили User в фильтре. Достаём его

        return authService.toDto(user);
        // возвращаем DTO (лучше не отдавать entity напрямую)
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestParam String refreshToken) {

        var token = refreshTokenService.validate(refreshToken);

        User user = token.getUser();

        String newAccessToken = jwtService.generateToken(user.getEmail());

        return new AuthResponse(
                authService.toDto(user),
                newAccessToken,
                refreshToken // можно тот же вернуть (или сделать ротацию позже)
        );
    }
}
