package com.foxtrot.messenger.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Журнал действий пользователей -> activity.log (отдельный файл, см. logback-spring.xml).
 * Текст сообщений сюда намеренно не пишем - только события и идентификаторы.
 */
public final class Activity {

    private static final Logger LOG = LoggerFactory.getLogger("com.foxtrot.messenger.activity");

    private Activity() {
    }

    /** Пример: Activity.log("MESSAGE_SENT", "user", userId, "chat", chatId) */
    public static void log(String action, Object... keyValues) {
        StringBuilder sb = new StringBuilder(action);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            sb.append(' ').append(keyValues[i]).append('=').append(keyValues[i + 1]);
        }
        LOG.info(sb.toString());
    }
}
