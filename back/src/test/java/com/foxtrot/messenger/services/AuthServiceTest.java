package com.foxtrot.messenger.services;

import com.foxtrot.messenger.dto.mapping.UserMapper;
import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.request.RegisterRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.response.UserResponse;
import com.foxtrot.messenger.entity.RefreshToken;
import com.foxtrot.messenger.entity.Role;
import com.foxtrot.messenger.entity.User;
import com.foxtrot.messenger.entity.UserRole;
import com.foxtrot.messenger.exception.custom.EntityAlreadyExistsException;
import com.foxtrot.messenger.exception.custom.InvalidCredentialsException;
import com.foxtrot.messenger.repository.RoleRepository;
import com.foxtrot.messenger.repository.UserRepository;
import com.foxtrot.messenger.security.JwtService;
import com.foxtrot.messenger.security.RefreshTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private UserMapper userMapper;
    @Mock
    private RoleRepository roleRepository;
    @Mock
    private JwtService jwtService;
    @Mock
    private RefreshTokenService refreshTokenService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, userMapper, roleRepository, jwtService, refreshTokenService);
    }

    private User userWithPassword(String rawPassword) {
        User user = new User();
        user.setEmail("test@example.com");
        user.setUsername("tester");
        user.setPasswordHash(new BCryptPasswordEncoder().encode(rawPassword));
        return user;
    }

    @Test
    void loginSucceedsWithCorrectCredentials() {
        User user = userWithPassword("correct-password");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(jwtService.generateToken("test@example.com")).thenReturn("jwt-token");
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setToken("refresh-token");
        when(refreshTokenService.create(user)).thenReturn(refreshToken);
        when(userMapper.toDto(user)).thenReturn(new UserResponse());

        AuthResponse response = authService.login(new AuthRequest("test@example.com", "correct-password"));

        assertThat(response.getAccessToken()).isEqualTo("jwt-token");
        assertThat(response.getRefreshToken()).isEqualTo("refresh-token");
    }

    @Test
    void loginFailsWithWrongPassword() {
        User user = userWithPassword("correct-password");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.login(new AuthRequest("test@example.com", "wrong-password")))
                .isInstanceOf(InvalidCredentialsException.class);

        // JWT не должен выпускаться при неверном пароле
        verify(jwtService, never()).generateToken(any());
    }

    @Test
    void loginFailsWithUnknownEmailAndDoesNotLeakWhichPartWasWrong() {
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        // Одно и то же сообщение что и для неверного пароля - см. комментарий в AuthService.login
        assertThatThrownBy(() -> authService.login(new AuthRequest("nobody@example.com", "whatever")))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Неверный email или пароль.");
    }

    @Test
    void registerCreatesUserWithDefaultPlatformRole() {
        RegisterRequest request = new RegisterRequest();
        request.username = "newuser";
        request.email = "new@example.com";
        request.password = "password123";

        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("newuser")).thenReturn(Optional.empty());
        when(roleRepository.findByName("USER")).thenReturn(Optional.of(new Role()));
        when(jwtService.generateToken("new@example.com")).thenReturn("jwt-token");
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setToken("refresh-token");
        when(refreshTokenService.create(any())).thenReturn(refreshToken);
        when(userMapper.toDto(any())).thenReturn(new UserResponse());

        authService.register(request);

        ArgumentCaptor<User> savedUser = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(savedUser.capture());
        assertThat(savedUser.getValue().getUsername()).isEqualTo("newuser");
        assertThat(savedUser.getValue().getPlatformRole()).isEqualTo(UserRole.USER);
        // пароль не должен сохраняться в открытом виде
        assertThat(savedUser.getValue().getPasswordHash()).isNotEqualTo("password123");
    }

    @Test
    void registerFailsWhenEmailAlreadyTaken() {
        RegisterRequest request = new RegisterRequest();
        request.username = "newuser";
        request.email = "taken@example.com";
        request.password = "password123";

        when(userRepository.findByEmail("taken@example.com")).thenReturn(Optional.of(new User()));

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(EntityAlreadyExistsException.class);

        verify(userRepository, never()).save(any());
    }

    @Test
    void registerFailsWhenUsernameAlreadyTaken() {
        RegisterRequest request = new RegisterRequest();
        request.username = "takenname";
        request.email = "fresh@example.com";
        request.password = "password123";

        when(userRepository.findByEmail("fresh@example.com")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("takenname")).thenReturn(Optional.of(new User()));

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(EntityAlreadyExistsException.class);

        verify(userRepository, never()).save(any());
    }
}
