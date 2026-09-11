package com.foxtrot.messenger.security;

import com.foxtrot.messenger.entity.User;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.List;
import java.util.UUID;

/**
 * Wraps {@link User} as the Spring Security principal instead of exposing the JPA
 * entity directly. Keeps persistence and security concerns separate, and gives
 * authentication.getName() a real, stable value (a bare entity has no Principal
 * contract, so it used to fall back to Object.toString()).
 */
public class UserPrincipal implements UserDetails {

    private final User user;

    public UserPrincipal(User user) {
        this.user = user;
    }

    public User getUser() {
        return user;
    }

    public UUID getId() {
        return user.getId();
    }

    // Не логин-имя пользователя, а стабильный идентификатор STOMP-принципала: Spring
    // Security берёт именно getUsername() для Authentication.getName() (UserDetails
    // проверяется раньше java.security.Principal), а весь код, шлющий персональные
    // STOMP-уведомления (convertAndSendToUser в CallService/ChatWebSocketController),
    // адресует их по userId.toString() - здесь должно быть то же самое, иначе брокер
    // не находит сессию и сообщение тихо теряется. Настоящий логин - email - не нужен
    // нигде в Principal-контракте, т.к. аутентификация идёт через кастомные JWT-фильтры,
    // а не через UserDetailsService.
    @Override
    public String getUsername() {
        return user.getId().toString();
    }

    @Override
    public String getPassword() {
        return user.getPasswordHash();
    }

    @Override
    public List<GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getPlatformRole().name()));
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        // Natural hook for a future ban/suspend feature - not implemented yet.
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
