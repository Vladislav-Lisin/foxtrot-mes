package com.foxtrot.messenger.services;

import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.request.RegisterRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.dto.mapping.UserMapper;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.entity.Role;
import com.foxtrot.messenger.repository.UserRepository;
import com.foxtrot.messenger.repository.RoleRepository;
import com.foxtrot.messenger.security.RefreshTokenService;
import com.foxtrot.messenger.services.interfaces.IAuthService;
import com.foxtrot.messenger.security.JwtService;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Random;

@Service
public class AuthService implements IAuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final UserMapper userMapper;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;

    public AuthService(UserRepository userRepository,
                        UserMapper userMapper,
                        RoleRepository roleRepository, 
                        JwtService jwtService,
                        RefreshTokenService refreshTokenService) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
        this.roleRepository = roleRepository;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
    }

    @Override
    public AuthResponse login(AuthRequest request) {

        if (!userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new RuntimeException("There is no account with this email address");
        }
        User user = userRepository.findByEmail(request.getEmail()).get();
        if (!encoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new RuntimeException("Invalid password.");
        }
        user.setLastSeen(LocalDateTime.now());
        String token = jwtService.generateToken(user.getEmail()); // создаём JWT

        String refreshToken = refreshTokenService.create(user).getToken();

        return new AuthResponse(
                userMapper.toDto(user), // данные пользователя
                token,
                refreshToken
        );
    }

    @Override
    public AuthResponse register(RegisterRequest request) {

        if (userRepository.findByEmail(request.email).isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        if (userRepository.findByUsername(request.username).isPresent()) {
            throw new RuntimeException("Username already exists");
        }

        User user = new User();
        Role userRole = roleRepository.findByName("USER")
                .orElseThrow(() -> new RuntimeException("Role USER not found"));

        user.setUsername(request.username);
        user.setEmail(request.email);
        user.setRole(userRole);
        user.setPasswordHash(encoder.encode(request.password));

        user.setTag(generateTag());

        user.setAvatarUrl(null);
        user.setLastSeen(LocalDateTime.now());
        user.setCreatedAt(LocalDateTime.now());

        userRepository.save(user);
        String token = jwtService.generateToken(user.getEmail());

        String refreshToken = refreshTokenService.create(user).getToken();

        return new AuthResponse(
                userMapper.toDto(user), // данные пользователя
                token,
                refreshToken
        );
    }

    public UserResponse toDto(User user) {
        return userMapper.toDto(user);
    }

    private String generateTag() {
        return String.valueOf(1000 + new Random().nextInt(9000));
    }
}
