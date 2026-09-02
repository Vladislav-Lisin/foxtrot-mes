package com.foxtrot.messenger.entity;

public enum CallStatus {
    RINGING,  // создан звонок внутри чата, разослано уведомление, хост уже участник
    ACTIVE,   // есть хотя бы один участник (standalone-встречи стартуют сразу в этом статусе)
    ENDED
}
