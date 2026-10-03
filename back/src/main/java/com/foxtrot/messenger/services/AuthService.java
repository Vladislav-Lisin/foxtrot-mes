package com.foxtrot.messenger.services;

import com.foxtrot.messenger.logging.Activity;
import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.request.RegisterRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.dto.mapping.UserMapper;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.entity.Role;
import com.foxtrot.messenger.entity.UserRole;
import com.foxtrot.messenger.exception.custom.EntityAlreadyExistsException;
import com.foxtrot.messenger.exception.custom.InvalidCredentialsException;
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

        // Одно и то же сообщение для "нет такого email" и "неверный пароль" -
        // иначе ответ сервера позволяет перебором узнавать, какие email вообще
        // зарегистрированы.
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new InvalidCredentialsException("Неверный email или пароль."));

        if (!encoder.matches(request.getPassword(), user.getPasswordHash())) {
            Activity.log("LOGIN_FAILED", "email", request.getEmail(), "reason", "bad_password");
            throw new InvalidCredentialsException("Неверный email или пароль.");
        }
        Activity.log("LOGIN_OK", "user", user.getId());
        user.setLastSeen(LocalDateTime.now());
        userRepository.save(user); // иначе lastSeen нигде не персистится - "в сети" никогда не было бы правдой
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
            throw new EntityAlreadyExistsException("Пользователь с таким email уже зарегистрирован.");
        }

        if (userRepository.findByUsername(request.username).isPresent()) {
            throw new EntityAlreadyExistsException("Это имя пользователя уже занято.");
        }

        User user = new User();
        // Отсутствие роли USER - не ошибка клиента, а не выполненная миграция/сид
        // данных на сервере, поэтому не бизнес-исключение, а инвариант (упадёт в 500).
        Role userRole = roleRepository.findByName("USER")
                .orElseThrow(() -> new IllegalStateException("Role USER not found"));

        user.setUsername(request.username);
        user.setEmail(request.email);
        user.setRole(userRole); // заготовка под роли сообществ - не участвует в правах доступа
        user.setPlatformRole(UserRole.USER); // по умолчанию и так USER (см. поле в User), явно для наглядности
        user.setPasswordHash(encoder.encode(request.password));

        user.setTag(generateTag());

        user.setAvatarUrl(null);
        user.setLastSeen(LocalDateTime.now());
        user.setCreatedAt(LocalDateTime.now());

        userRepository.save(user);
        Activity.log("REGISTER_OK", "user", user.getId(), "username", user.getUsername());
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
