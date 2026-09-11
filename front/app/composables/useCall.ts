import { startCall as apiStartCall, joinCall as apiJoinCall, leaveCall as apiLeaveCall, endCall as apiEndCall, getActiveCallForChat as apiGetActiveCallForChat } from "~/api/calls";
import type { CallResponse, CallNotification, CallParticipantState, ProducerKind } from "~/types/call";

// Хоткеи переключения цветовой группы - "0" снимает группу (обратно в общий канал).
// Не привязано жёстко к двум цветам - просто пример набора, можно расширять.
const GROUP_HOTKEYS: Record<string, string | null> = {
  1: "green",
  2: "blue",
  3: "red",
  4: "yellow",
  0: null,
};

// Реконнект с задержками по нарастающей - см. attemptReconnect. callToken живёт всего
// ~60 секунд (см. call.jwt.expiration на Java), поэтому реконнект - это не "переиспользовать
// старый токен", а полноценный повторный join через REST за свежим.
const RECONNECT_DELAYS_MS = [2000, 4000, 8000];

let hotkeyListenerAttached = false;
const localTracks: Partial<Record<ProducerKind, MediaStreamTrack>> = {};

export const useCall = () => {
  const activeCall = useState<CallResponse | null>("activeCall", () => null);
  const incomingCall = useState<CallNotification | null>("incomingCall", () => null);
  const participants = useState<Record<string, CallParticipantState>>("callParticipants", () => ({}));
  const myGroup = useState<string | null>("callMyGroup", () => null);
  const connecting = useState<boolean>("callConnecting", () => false);
  const reconnecting = useState<boolean>("callReconnecting", () => false);
  const reconnectFailed = useState<boolean>("callReconnectFailed", () => false);
  const micEnabled = useState<boolean>("callMicEnabled", () => false);
  const cameraEnabled = useState<boolean>("callCameraEnabled", () => false);
  const screenSharing = useState<boolean>("callScreenSharing", () => false);
  // chatId -> звонок этого чата, который сейчас идёт (RINGING/ACTIVE), но я не обязательно
  // в нём нахожусь - для кнопки "переподключиться" в DialogWindow.vue.
  const activeCallByChat = useState<Record<string, CallNotification>>("activeCallByChat", () => ({}));

  const { user } = useUserState();

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
    onParticipantJoined: (userId: string) => ensureParticipant(userId),
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
    onConnectedChange: (connected: boolean, reason?: "intentional" | "ended" | "unexpected") => {
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
        void navigateTo("/user/panel");
        return;
      }
      if (reason === "unexpected" && activeCall.value) {
        void attemptReconnect();
      }
    },
  });

  const enterCall = async (call: CallResponse) => {
    if (!import.meta.client) return;
    if (!call.callToken) throw new Error("No call token in response");

    connecting.value = true;
    activeCall.value = call;
    incomingCall.value = null;
    participants.value = {};
    myGroup.value = null;

    try {
      await useCallSocket().connect({
        callId: call.callId,
        callToken: call.callToken,
        mediaServiceUrl: call.mediaServiceUrl,
        handlers: buildSocketHandlers(),
      });
    } finally {
      connecting.value = false;
    }

    attachHotkeys();
  };

  // Разрыв соединения не по нашей инициативе (сеть моргнула, Wi-Fi -> 4G и т.п.) -
  // callToken к этому моменту почти наверняка истёк, так что это полноценный повторный
  // join через REST за свежим токеном, а не просто переоткрытие старого WS. Локальные
  // треки (микрофон/камера/экран) живы независимо от WS - просто заново их анонсируем.
  const attemptReconnect = async () => {
    if (!activeCall.value || reconnecting.value) return;
    const callId = activeCall.value.callId;
    reconnecting.value = true;
    reconnectFailed.value = false;

    for (const delay of RECONNECT_DELAYS_MS) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (!activeCall.value || activeCall.value.callId !== callId) return; // тем временем сами вышли

      try {
        const fresh = await apiJoinCall(callId);
        if (!fresh.callToken) throw new Error("No call token in response");
        activeCall.value = fresh;

        await useCallSocket().connect({
          callId: fresh.callId,
          callToken: fresh.callToken,
          mediaServiceUrl: fresh.mediaServiceUrl,
          handlers: buildSocketHandlers(),
        });

        if (localTracks.audio) await useCallSocket().produce("audio", localTracks.audio);
        if (localTracks.camera) await useCallSocket().produce("camera", localTracks.camera);
        if (localTracks.screen) await useCallSocket().produce("screen", localTracks.screen);

        reconnecting.value = false;
        return;
      } catch (e) {
        console.error("Reconnect attempt failed:", e);
      }
    }

    reconnecting.value = false;
    reconnectFailed.value = true;
  };

  const startChatCall = async (chatId: string): Promise<CallResponse> => {
    const call = await apiStartCall(chatId);
    // Владельцу notifyChatMembers (Java) push про RINGING не шлёт - без этого карта узнала
    // бы о собственном звонке только когда кто-то другой его примет/он закончится.
    setActiveCallForChat(chatId, { callId: call.callId, chatId, ownerId: call.ownerId, status: call.status });
    await enterCall(call);
    return call;
  };

  const startStandaloneCall = async (): Promise<CallResponse> => {
    const call = await apiStartCall();
    await enterCall(call);
    return call;
  };

  const joinExistingCall = async (callId: string) => {
    const call = await apiJoinCall(callId);
    await enterCall(call);
  };

  const cleanupLocal = () => {
    detachHotkeys();
    // Не ждём завершения - при полном disconnect() ниже сервер и так закроет все наши
    // producer'ы каскадно через свой собственный participant.close() (см. Room.ts/
    // Participant.ts), явные close-producer здесь избыточны, но не вредны.
    void disableMic();
    void disableCamera();
    void stopScreenShare();
    useCallSocket().disconnect();
    activeCall.value = null;
    participants.value = {};
    myGroup.value = null;
    reconnecting.value = false;
    reconnectFailed.value = false;
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    if (!track) return;
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
    participants,
    myGroup,
    connecting,
    reconnecting,
    reconnectFailed,
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
