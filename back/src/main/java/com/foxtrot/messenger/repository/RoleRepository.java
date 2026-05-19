package com.foxtrot.messenger.repository;

import java.util.UUID;
import com.foxtrot.messenger.entity.Role;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, UUID> {
    Optional<Role> findByName(String name);
}
