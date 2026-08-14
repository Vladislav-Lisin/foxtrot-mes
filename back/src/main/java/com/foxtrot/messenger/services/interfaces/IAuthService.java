package com.foxtrot.messenger.services.interfaces;

import com.foxtrot.messenger.dto.request.AuthRequest;
import com.foxtrot.messenger.dto.response.AuthResponse;
import com.foxtrot.messenger.dto.request.RegisterRequest;

public interface IAuthService {

    AuthResponse login(AuthRequest request);

    AuthResponse register(RegisterRequest request);
}