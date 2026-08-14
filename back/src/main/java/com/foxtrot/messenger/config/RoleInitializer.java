package com.foxtrot.messenger.config;

import com.foxtrot.messenger.entity.Role;
import com.foxtrot.messenger.repository.RoleRepository;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class RoleInitializer {

    @Bean
    ApplicationRunner seedRoles(RoleRepository roleRepository) {
        return args -> {
            for (String roleName : List.of("USER")) {
                if (roleRepository.findByName(roleName).isEmpty()) {
                    Role role = new Role();
                    role.setName(roleName);
                    roleRepository.save(role);
                }
            }
        };
    }
}
