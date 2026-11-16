import { startCall as apiStartCall, joinCall as apiJoinCall, leaveCall as apiLeaveCall, endCall as apiEndCall, getActiveCallForChat as apiGetActiveCallForChat } from "~/api/calls";
import { guestJoinCall as apiGuestJoinCall } from "~/api/guestCalls";
import type { CallResponse, CallNotification, CallParticipantState, ProducerKind } from "~/types/call";
import { apiBase } from "~/api/apiBase";
import { reconnectDelayMs } from "~/utils/reconnectBackoff";
import { joinCallWithPassword } from "~/api/joinCallWithPassword";

// Хоткеи переключения цветовой группы - "0" снимает группу (обратно в общий канал).
// Не привязано жёстко к двум цветам - просто пример набора, можно расширять.
const GROUP_HOTKEYS: Record<string, string | null> = {
  1: "green",
  2: "blue",
  3: "red",
  4: "yellow",
  0: null,
};

const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_FULL_JOIN_AFTER = 5;

let hotkeyListenerAttached = false;
const localTracks: Partial<Record<ProducerKind, MediaStreamTrack>> = {};

// Гостевой callToken живёт 60 секунд, но после VPN/перезагрузки страницы его ещё можно
// предъявить media-service (подпись проверяется, срок для previousToken игнорируется) -
// так новая гостевая сессия сразу убирает старую, вместо двух одинаковых тайлов.
const GUEST_CALL_TOKEN_KEY = "foxtrot:guest-call-token";

const readStoredGuestToken = (callId: string): string | undefined => {
  if (!import.meta.client) return undefined;
  try {
    const raw = sessionStorage.getItem(GUEST_CALL_TOKEN_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as { callId?: unknown; token?: unknown };
    return stored.callId === callId && typeof stored.token === "string" ? stored.token : undefined;
  } catch {
    return undefined;
  }
};

const storeGuestToken = (callId: string, token: string): void => {
  if (!import.meta.client) return;
  try {
    sessionStorage.setItem(GUEST_CALL_TOKEN_KEY, JSON.stringify({ callId, token }));
  } catch {
    // приватный режим/запрет storage - не критично, просто не сможем убрать старый тайл
  }
};

const clearStoredGuestToken = (): void => {
  if (!import.meta.client) return;
  try {
    sessionStorage.removeItem(GUEST_CALL_TOKEN_KEY);
  } catch {
    // ignore
  }
};

export const useCall = () => {
  const activeCall = useState<CallResponse | null>("activeCall", () => null);
  const incomingCall = useState<CallNotification | null>("incomingCall", () => null);
  const participants = useState<Record<string, CallParticipantState>>("callParticipants", () => ({}));
  const myGroup = useState<string | null>("callMyGroup", () => null);
  const connecting = useState<boolean>("callConnecting", () => false);
  const reconnecting = useState<boolean>("callReconnecting", () => false);
  const reconnectFailed = useState<boolean>("callReconnectFailed", () => false);
  const iceRestarting = useState<boolean>("callIceRestarting", () => false);
  const networkOnline = useState<boolean>("callNetworkOnline", () => true);
  const micEnabled = useState<boolean>("callMicEnabled", () => false);
  const cameraEnabled = useState<boolean>("callCameraEnabled", () => false);
  const screenSharing = useState<boolean>("callScreenSharing", () => false);
  // chatId -> звонок этого чата, который сейчас идёт (RINGING/ACTIVE), но я не обязательно
  // в нём нахожусь - для кнопки "переподключиться" в DialogWindow.vue.
  const activeCallByChat = useState<Record<string, CallNotification>>("activeCallByChat", () => ({}));

  const { user } = useUserState();
  let reconnectPromise: Promise<void> | null = null;
  let forceFullRejoin = false;
  const iceRestartingDirections = new Set<"send" | "recv">();

  const setActiveCallForChat = (chatId: string, notification: CallNotification | null) => {
    if (notification) {
      activeCallByChat.value = { ...activeCallByChat.value, [chatId]: notification };
    } else {
      const { [chatId]: _removed, ...rest } = activeCallByChat.value;
      activeCallByChat.value = rest;
    }
  };

  // Спрашиваем бэкенд напрямую - живые пуши по /user/queue/calls покрывают только события,
  // случившиеся пока мы онлайн, но не расскажут про уже идущий звонок при свежем логине
  // или после того, как мы сами из него вышли не через notifyChatMembers (см. leaveActiveCall).
  const checkActiveCallForChat = async (chatId: string) => {
    if (!import.meta.client) return;
    try {
      const call = await apiGetActiveCallForChat(chatId);
      setActiveCallForChat(chatId, call ? { callId: call.callId, chatId: call.chatId, ownerId: call.ownerId, status: call.status } : null);
    } catch (e) {
      console.error("Failed to check active call for chat:", e);
    }
  };

  const ensureParticipant = (userId: string): CallParticipantState => {
    const existing = participants.value[userId];
    if (existing) return existing;
    const created: CallParticipantState = { userId, group: null, tracks: {}, speaking: false };
    participants.value = { ...participants.value, [userId]: created };
    return created;
  };

  const removeParticipant = (userId: string) => {
    const { [userId]: _removed, ...rest } = participants.value;
    participants.value = rest;
  };

  // ---------- жизненный цикл звонка ----------

  // Общие обработчики для первого подключения и для каждой попытки реконнекта -
  // держим в одном месте, чтобы поведение не расходилось между двумя путями.
  const buildSocketHandlers = () => ({
    onParticipantJoined: (userId: string) => {
      ensureParticipant(userId);
      if (activeCall.value) void refreshCallNames(activeCall.value.callId);
    },
    onParticipantLeft: (userId: string) => removeParticipant(userId),
    onTrack: (peerUserId: string, kind: ProducerKind, track: MediaStreamTrack) => {
      const p = ensureParticipant(peerUserId);
      participants.value = { ...participants.value, [peerUserId]: { ...p, tracks: { ...p.tracks, [kind]: track } } };
    },
    onTrackRemoved: (peerUserId: string, kind: ProducerKind) => {
      const p = participants.value[peerUserId];
      if (!p) return;
      const { [kind]: _removed, ...tracks } = p.tracks;
      participants.value = { ...participants.value, [peerUserId]: { ...p, tracks } };
    },
    onGroupChanged: (userId: string, group: string | null) => {
      if (user.value?.id === userId) {
        myGroup.value = group;
        return;
      }
      const p = ensureParticipant(userId);
      participants.value = { ...participants.value, [userId]: { ...p, group } };
    },
    onSpeakingChanged: (userId: string, speaking: boolean) => {
      // Сервер шлёт speaking-changed ВСЕМ участникам без исключения самого говорящего
      // (см. Room.setSpeaker - broadcast() там без exceptUserId, в отличие от group-changed
      // выше). Раньше это создавало САМОМУ СЕБЕ фантомного "участника" без единого трека
      // (ensureParticipant плодит запись в participants.value для любого нового userId) -
      // именно поэтому "при включении микрофона в чате появлялся какой-то юзер, хотя бы
      // иконка": это был не чужой участник, а пустой тайл нас самих.
      if (user.value?.id === userId) return;
      const p = ensureParticipant(userId);
      participants.value = { ...participants.value, [userId]: { ...p, speaking } };
    },
    onRoomState: (state: {
      self: { userId: string; group: string | null; producers: ProducerKind[]; sessionId: string }
      participants: Array<{ userId: string; group: string | null; producers: ProducerKind[] }>
    }) => {
      myGroup.value = state.self.group;
      const next: Record<string, CallParticipantState> = {};
      for (const peer of state.participants) {
        if (peer.userId === myCallUserId.value) continue;
        const existing = participants.value[peer.userId] ?? { userId: peer.userId, group: null, tracks: {}, speaking: false };
        const activeKinds = new Set(peer.producers);
        const tracks = Object.fromEntries(Object.entries(existing.tracks).filter(([kind]) => activeKinds.has(kind as ProducerKind))) as CallParticipantState["tracks"];
        next[peer.userId] = { ...existing, group: peer.group, tracks };
      }
      participants.value = next;
      if (activeCall.value) void refreshCallNames(activeCall.value.callId);
    },
    onIceRestartState: (active: boolean, direction?: "send" | "recv") => {
      if (direction) {
        if (active) iceRestartingDirections.add(direction);
        else iceRestartingDirections.delete(direction);
      }
      iceRestarting.value = iceRestartingDirections.size > 0;
    },
    onRecoveryRequired: () => {
      forceFullRejoin = true;
      void attemptReconnect();
    },
    onNetworkStatus: (online: boolean) => {
      networkOnline.value = online;
      if (online && activeCall.value && !useCallSocket().connected) void attemptReconnect();
    },
    onConnectedChange: (connected: boolean, reason?: "intentional" | "ended" | "unexpected" | "session-expired") => {
      if (connected) {
        connecting.value = false;
        reconnecting.value = false;
        reconnectFailed.value = false;
        return;
      }
      connecting.value = false;
      if (reason === "ended") {
        // Владелец завершил звонок (или комната опустела) - сервер сам закрыл сокет
        // (код 4410, см. useCallSocket.client.ts), это не обрыв связи, реконнект не нужен -
        // просто уходим со страницы звонка, как будто сами нажали "выйти".
        cleanupLocal();
        void navigateTo(afterCallPath());
        return;
      }
      if ((reason === "unexpected" || reason === "session-expired") && activeCall.value && !connecting.value) {
        void attemptReconnect();
      }
    },
  });

  const enterCall = async (call: CallResponse, options: { persistGuestToken?: boolean } = {}) => {
    if (!import.meta.client) return;
    if (!call.callToken) throw new Error("No call token in response");

    // Токен предыдущего захода (гостевой или после reload) - media-service по нему уберёт
    // старую сессию этого же человека, если она ещё висит в grace-периоде.
    const previousCallToken = readStoredGuestToken(call.callId);
    connecting.value = true;
    activeCall.value = call;
    myCallUserId.value = decodeTokenSubject(call.callToken);
    incomingCall.value = null;
    participants.value = {};
    myGroup.value = null;

    try {
      await useCallSocket().connect({
        callId: call.callId,
        callToken: call.callToken,
        previousCallToken,
        mediaServiceUrl: call.mediaServiceUrl,
        handlers: buildSocketHandlers(),
      });
      if (options.persistGuestToken && call.callToken) storeGuestToken(call.callId, call.callToken);
      else clearStoredGuestToken();
    } catch (e) {
      // Не удалось подключиться - не оставляем "активный" звонок, иначе страница зависнет на "Подключение..."
      useCallSocket().disconnect();
      activeCall.value = null;
      participants.value = {};
      throw e;
    } finally {
      connecting.value = false;
    }

    void refreshCallNames(call.callId);
    attachHotkeys();
  };

  // Разрыв соединения не по нашей инициативе (сеть моргнула, Wi-Fi -> 4G и т.п.) -
  // callToken к этому моменту почти наверняка истёк, так что это полноценный повторный
  // join через REST за свежим токеном, а не просто переоткрытие старого WS. Локальные
  // треки (микрофон/камера/экран) живы независимо от WS - просто заново их анонсируем.
  const waitForOnlineOrDelay = (delayMs: number, callId: string) => new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("online", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    window.addEventListener("online", finish, { once: true });
    if (!activeCall.value || activeCall.value.callId !== callId) finish();
  });

  const fullRejoin = async (callId: string): Promise<void> => {
    const previousCallToken = readStoredGuestToken(callId);
    const fresh = await obtainCallToken(callId);
    if (!fresh.callToken) throw new Error("No call token in response");
    if (!activeCall.value || activeCall.value.callId !== callId) return;
    activeCall.value = fresh;
    myCallUserId.value = decodeTokenSubject(fresh.callToken);
    participants.value = {};
    myGroup.value = null;
    await useCallSocket().connect({
      callId: fresh.callId,
      callToken: fresh.callToken,
      previousCallToken,
      mediaServiceUrl: fresh.mediaServiceUrl,
      handlers: buildSocketHandlers(),
    });
    if (isGuest.value && fresh.callToken) storeGuestToken(callId, fresh.callToken);
    else clearStoredGuestToken();
    if (localTracks.audio) await useCallSocket().produce("audio", localTracks.audio);
    if (localTracks.camera) await useCallSocket().produce("camera", localTracks.camera);
    if (localTracks.screen) await useCallSocket().produce("screen", localTracks.screen);
    if (localTracks.screenAudio) await useCallSocket().produce("screenAudio", localTracks.screenAudio);
    void refreshCallNames(callId);
  };

  const attemptReconnect = async (): Promise<void> => {
    if (reconnectPromise) return reconnectPromise;
    if (!activeCall.value) return;
    const callId = activeCall.value.callId;
    const startedAt = Date.now();
    reconnecting.value = true;
    reconnectFailed.value = false;
    iceRestartingDirections.clear();
    iceRestarting.value = false;
    reconnectPromise = (async () => {
      let attempt = 0;
      while (activeCall.value?.callId === callId) {
        if (!navigator.onLine) {
          networkOnline.value = false;
          await waitForOnlineOrDelay(1_000, callId);
          continue;
        }
        networkOnline.value = true;
        try {
          if (forceFullRejoin || attempt >= RECONNECT_FULL_JOIN_AFTER) {
            forceFullRejoin = true;
            await fullRejoin(callId);
          } else {
            const call = activeCall.value;
            if (!call?.callToken) throw new Error("No active call token");
            await useCallSocket().resume({
              callId: call.callId,
              callToken: call.callToken,
              mediaServiceUrl: call.mediaServiceUrl,
              handlers: buildSocketHandlers(),
            });
          }
          forceFullRejoin = false;
          reconnecting.value = false;
          reconnectFailed.value = false;
          console.info(`[call] recovered in ${Date.now() - startedAt}ms`);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "reconnect failed";
          console.warn(`[call] recovery attempt ${attempt + 1} failed: ${message}`);
          if (message === "CALL_SESSION_EXPIRED") {
            forceFullRejoin = true;
            continue;
          }
          attempt += 1;
          if (Date.now() - startedAt >= 90_000) reconnectFailed.value = true;
          await waitForOnlineOrDelay(reconnectDelayMs(attempt - 1, Math.random, 1_000, RECONNECT_MAX_DELAY_MS), callId);
        }
      }
    })().finally(() => {
      reconnectPromise = null;
      if (!activeCall.value || activeCall.value.callId !== callId) {
        reconnecting.value = false;
        reconnectFailed.value = false;
      }
    });
    return reconnectPromise;
  };

  const startChatCall = async (chatId: string): Promise<CallResponse> => {
    isGuest.value = false;
    guestCredentials.value = null;
    callPassword.value = null;
    const call = await apiStartCall(chatId);
    // Владельцу notifyChatMembers (Java) push про RINGING не шлёт - без этого карта узнала
    // бы о собственном звонке только когда кто-то другой его примет/он закончится.
    setActiveCallForChat(chatId, { callId: call.callId, chatId, ownerId: call.ownerId, status: call.status });
    await enterCall(call);
    return call;
  };

  const startStandaloneCall = async (): Promise<CallResponse> => {
    isGuest.value = false;
    guestCredentials.value = null;
    callPassword.value = null;
    const call = await apiStartCall();
    await enterCall(call);
    return call;
  };

  // Гость - без учётной записи, у него свой токен; авторизованный - обычный вход
  const isGuest = useState<boolean>("call_is_guest", () => false);
  const guestCredentials = useState<{ callId: string, password: string | null, name: string } | null>("call_guest_credentials", () => null);
  const callPassword = useState<string | null>("call_password", () => null);

  const obtainCallToken = async (callId: string) => {
    if (isGuest.value) {
      return apiGuestJoinCall(callId, guestCredentials.value?.password ?? null, guestCredentials.value?.name ?? "");
    }
    return callPassword.value ? joinCallWithPassword(callId, callPassword.value) : apiJoinCall(callId);
  };

  const joinExistingCall = async (callId: string, password?: string | null) => {
    isGuest.value = false;
    guestCredentials.value = null;
    callPassword.value = password ?? null;
    const call = password ? await joinCallWithPassword(callId, password) : await apiJoinCall(callId);
    await enterCall(call);
  };

  const joinAsGuest = async (callId: string, password: string | null, name: string) => {
    const call = await apiGuestJoinCall(callId, password, name);
    isGuest.value = true;
    guestCredentials.value = { callId, password, name };
    callPassword.value = null;
    await enterCall(call, { persistGuestToken: true });
  };

  // Мой id в конференции - из токена (sub). Гость и авторизованный равноправны в звонке.
  const myCallUserId = useState<string | null>("call_my_user_id", () => null);
  // Имена гостей: userId -> имя (у авторизованных имя берём из списка чатов)
  const callNames = useState<Record<string, string>>("call_guest_names", () => ({}));
  const guestName = computed(() => guestCredentials.value?.name ?? null);

  const decodeTokenSubject = (token: string): string | null => {
    try {
      const payload = token.split(".")[1];
      if (!payload) return null;
      const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return typeof json.sub === "string" ? json.sub : null;
    } catch {
      return null;
    }
  };

  const refreshCallNames = async (callId: string) => {
    try {
      const response = await fetch(`${apiBase()}/calls/${callId}/names`);
      if (response.ok) callNames.value = (await response.json()) as Record<string, string>;
    } catch {
      // имена - не критично: без них покажем короткий id
    }
  };

  // Гостю после звонка предлагаем регистрацию, остальных отправляем в панель
  const afterCallPath = () => (isGuest.value ? "/guest/after-call" : "/user/panel");

  const cleanupLocal = () => {
    detachHotkeys();
    // Не ждём завершения - при полном disconnect() ниже сервер и так закроет все наши
    // producer'ы каскадно через свой собственный participant.close() (см. Room.ts/
    // Participant.ts), явные close-producer здесь избыточны, но не вредны.
    void disableMic();
    void disableCamera();
    void stopScreenShare();
    useCallSocket().disconnect();
    clearStoredGuestToken();
    activeCall.value = null;
    participants.value = {};
    myGroup.value = null;
    reconnecting.value = false;
    reconnectFailed.value = false;
    callPassword.value = null;
    guestCredentials.value = null;
  };

  const leaveActiveCall = async () => {
    if (!import.meta.client || !activeCall.value) return;
    const { callId, chatId, ownerId, status } = activeCall.value;
    cleanupLocal();
    // Звонок продолжается без нас - помечаем это сразу же, не дожидаясь пуша от кого-то
    // другого (leave не рассылает notifyChatMembers, в отличие от start/end).
    if (chatId) setActiveCallForChat(chatId, { callId, chatId, ownerId, status });
    try {
      await apiLeaveCall(callId);
    } catch (e) {
      console.error("Failed to notify backend about leaving the call:", e);
    }
  };

  const endActiveCall = async () => {
    if (!import.meta.client || !activeCall.value) return;
    const { callId, chatId } = activeCall.value;
    cleanupLocal();
    if (chatId) setActiveCallForChat(chatId, null);
    try {
      await apiEndCall(callId);
    } catch (e) {
      console.error("Failed to end the call:", e);
    }
  };

  // ---------- входящие звонки (пуш по STOMP /user/queue/calls, см. useChatSocket) ----------

  const handleIncomingCallNotification = (notification: CallNotification) => {
    if (notification.chatId) {
      setActiveCallForChat(notification.chatId, notification.status === "ENDED" ? null : notification);
    }

    if (notification.status === "ENDED") {
      if (incomingCall.value?.callId === notification.callId) {
        incomingCall.value = null;
      }
      return;
    }
    // уже в этом звонке (например, сами его начали) - самим себе баннер не нужен
    if (activeCall.value?.callId === notification.callId) return;
    incomingCall.value = notification;
  };

  const dismissIncomingCall = () => {
    incomingCall.value = null;
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall.value) return;
    const callId = incomingCall.value.callId;
    incomingCall.value = null;
    await joinExistingCall(callId);
  };

  // ---------- локальные медиа: микрофон/камера/демонстрация экрана ----------

  const enableMic = async () => {
    if (!import.meta.client || micEnabled.value) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    localTracks.audio = track;
    await useCallSocket().produce("audio", track);
    micEnabled.value = true;
  };

  const disableMic = async () => {
    if (!import.meta.client) return;
    await useCallSocket().stopProducing("audio");
    localTracks.audio?.stop();
    delete localTracks.audio;
    micEnabled.value = false;
  };

  const enableCamera = async () => {
    if (!import.meta.client || cameraEnabled.value) return;
    // Явные ограничения не дают браузеру выбрать 640x480 по умолчанию. "ideal" не ломает
    // захват на камерах/устройствах, которые не умеют 1080p30, - браузер возьмёт максимум
    // доступного. max ограничивает 4K-камеры, чтобы не кодировать лишние пиксели.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    // Для камеры важнее плавность движения, а не максимальная детализация статичного кадра
    // (у демонстрации экрана - наоборот, см. startScreenShare).
    track.contentHint = "motion";
    localTracks.camera = track;
    await useCallSocket().produce("camera", track);
    cameraEnabled.value = true;
  };

  const disableCamera = async () => {
    if (!import.meta.client) return;
    await useCallSocket().stopProducing("camera");
    localTracks.camera?.stop();
    delete localTracks.camera;
    cameraEnabled.value = false;
  };

  const startScreenShare = async () => {
    if (!import.meta.client || screenSharing.value) return;

    // iOS/iPadOS Safari (и вообще любой браузер на iOS - Apple требует единый движок WebKit)
    // не реализует getDisplayMedia вообще - метода физически нет, вызов уронил бы промис с
    // TypeError без единого слова пользователю ("кнопка вообще не реагирует"). Это ограничение
    // самой платформы (веб-страницам не дают доступ к записи экрана, в отличие от нативных
    // приложений через ReplayKit) - обойти нельзя, но хотя бы явно предупредить стоит.
    if (!navigator.mediaDevices?.getDisplayMedia) {
      useToast().add({
        title: "Демонстрация экрана недоступна",
        description: "iOS/iPadOS Safari не поддерживает демонстрацию экрана в браузере - это ограничение самой платформы, Apple не даёт веб-страницам доступ к записи экрана. Показать экран можно только с компьютера.",
        color: "warning",
      });
      return;
    }

    // Явные width/height/frameRate - без них браузер сам решает разрешение по своему
    // усмотрению, часто занижая его. 1080p30 - разумный потолок для демонстрации экрана.
    // audio: true - пробуем захватить системный/вкладочный звук вместе с показом. Поддержка
    // неровная (Chrome: звук вкладки - везде, звук всей системы - только Windows; Firefox -
    // разнится по ОС; Safari звук почти никогда не отдаёт) - track.getAudioTracks() ниже
    // может оказаться пустым даже при audio:true, это не ошибка, а нормальный случай.
    // echoCancellation/noiseSuppression/autoGainControl выключены намеренно - это обработка
    // под микрофонный голос, а не под уже "чистый" звук приложения/системы, включённая
    // портит его сильнее, чем помогает.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      // "ideal", не "exact" - если у монитора разрешение/частота ниже (например, обычный
      // 1080p60), браузер просто возьмёт то, что реально есть, запрос выше потолка не сломает
      // захват. Так безопасно просить с запасом под 1440p/выше-60Hz мониторы.
      video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 90 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    // Подсказка кодировщику браузера приоритизировать резкость (текст/интерфейс) над
    // плавностью движения - для показа экрана обычно важнее читаемость, чем FPS.
    track.contentHint = "detail";
    // пользователь может остановить показ через системный UI браузера, а не только нашу кнопку
    track.addEventListener("ended", () => void stopScreenShare());
    localTracks.screen = track;
    await useCallSocket().produce("screen", track);

    const audioTrack = stream.getAudioTracks()[0];
    const toast = useToast();
    if (audioTrack) {
      audioTrack.addEventListener("ended", () => void stopScreenShare());
      localTracks.screenAudio = audioTrack;
      await useCallSocket().produce("screenAudio", audioTrack);
      toast.add({ title: "Демонстрация экрана начата", description: "Звук передаётся вместе с картинкой", color: "success" });
    } else {
      // Firefox в принципе не умеет отдавать звук через getDisplayMedia ни на одной ОС -
      // чекбокса "поделиться аудио" там просто нет ни при каком выборе источника, это не
      // временный баг, а сознательное решение Mozilla (см. bugzilla, тянется годами). Chrome/
      // Chromium умеет, но только если выбрать источником конкретную ВКЛАДКУ (не "весь экран"/
      // "окно") - тогда звук берётся из самой вкладки, а не через ОС, поэтому работает даже
      // на Linux, где системного захвата звука у Chromium вообще нет.
      const isFirefox = navigator.userAgent.includes("Firefox");
      toast.add({
        title: "Демонстрация экрана начата без звука",
        description: isFirefox
          ? "Firefox не поддерживает передачу звука при демонстрации экрана ни на одной ОС - это ограничение самого браузера. Для звука используйте Chrome/Chromium: в диалоге выбора источника выберите конкретную вкладку и отметьте \"Поделиться аудио вкладки\"."
          : "Браузер/ОС не передали звук с экрана - попробуйте выбрать источником конкретную вкладку (не весь экран/окно) и отметить \"Поделиться аудио вкладки\", если такая опция есть в диалоге выбора.",
        color: "warning",
      });
    }

    screenSharing.value = true;
  };

  const stopScreenShare = async () => {
    if (!import.meta.client) return;
    await useCallSocket().stopProducing("screen");
    localTracks.screen?.stop();
    delete localTracks.screen;
    if (localTracks.screenAudio) {
      await useCallSocket().stopProducing("screenAudio");
      localTracks.screenAudio.stop();
      delete localTracks.screenAudio;
    }
    screenSharing.value = false;
  };

  const toggleMic = () => (micEnabled.value ? disableMic() : enableMic());
  const toggleCamera = () => (cameraEnabled.value ? disableCamera() : enableCamera());
  const toggleScreenShare = () => (screenSharing.value ? stopScreenShare() : startScreenShare());

  // ---------- цветовые группы ----------

  const switchGroup = async (group: string | null) => {
    if (!import.meta.client || !activeCall.value) return;
    myGroup.value = await useCallSocket().switchGroup(group);
  };

  const onKeydown = (event: KeyboardEvent) => {
    // не перехватываем хоткей, пока пользователь печатает текст
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    if (!(event.key in GROUP_HOTKEYS)) return;

    void switchGroup(GROUP_HOTKEYS[event.key] ?? null);
  };

  const attachHotkeys = () => {
    if (!import.meta.client || hotkeyListenerAttached) return;
    window.addEventListener("keydown", onKeydown);
    hotkeyListenerAttached = true;
  };

  const detachHotkeys = () => {
    if (!import.meta.client || !hotkeyListenerAttached) return;
    window.removeEventListener("keydown", onKeydown);
    hotkeyListenerAttached = false;
  };

  return {
    activeCall,
    incomingCall,
    joinAsGuest,
    afterCallPath,
    isGuest,
    myCallUserId,
    callNames,
    guestName,
    participants,
    myGroup,
    connecting,
    reconnecting,
    reconnectFailed,
    iceRestarting,
    networkOnline,
    micEnabled,
    cameraEnabled,
    screenSharing,
    groupHotkeys: GROUP_HOTKEYS,
    localTracks,
    activeCallByChat,
    checkActiveCallForChat,

    startChatCall,
    startStandaloneCall,
    joinExistingCall,
    leaveActiveCall,
    endActiveCall,

    handleIncomingCallNotification,
    dismissIncomingCall,
    acceptIncomingCall,

    toggleMic,
    toggleCamera,
    toggleScreenShare,
    switchGroup,
  };
};
