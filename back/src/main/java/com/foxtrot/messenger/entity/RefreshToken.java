package com.foxtrot.messenger.entity;

import java.sql.Date;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class RefreshToken {

    @Id
    @GeneratedValue
    private UUID id;    

    @Column(name="token", length=255, unique = true, nullable = false)
    private String token;

    @Column(name="expiry_date")
    private Date expiryDate;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

}
