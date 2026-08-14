package com.foxtrot.messenger.entity;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Table(name = "roles")
public class Role {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(length = 50, nullable = false, unique = true)
    private String name;

}
