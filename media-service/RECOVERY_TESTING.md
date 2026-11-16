# Call recovery checks

Run these checks with two test accounts/devices in a non-production room. Keep the second
participant connected to verify that the recovering participant is not announced as leaving
and rejoining during the grace period.

## Automated checks

```sh
npm run typecheck
npm test
```

The session-registry tests cover matching identity, one-time resume, and expiry. The client
Vitest suite covers reconnect backoff bounds.

## Network changes

1. Start an audio/video call and enable the microphone and camera.
2. Toggle VPN off/on, switch Wi-Fi to mobile data and back, and repeat with a real IP change.
3. Confirm the call UI displays reconnect/media recovery, the same participant tile remains,
   local mic/camera tracks return, and other participants do not see leave/join notifications.
4. Repeat with signaling interruptions of 5, 20, and 90 seconds. Before the configured
   `CALL_SESSION_GRACE_SECONDS` expires, verify that the existing session resumes. After it
   expires, verify a full REST join creates a fresh media session and restores local tracks.
   If all participants disconnect, `CALL_ROOM_IDLE_SECONDS` (default 120) keeps the empty
   room joinable long enough for a full rejoin after the session grace has elapsed.

For a signaling-only interruption in a controlled Linux test environment, the media UDP path
can remain available while blocking the public signaling port (replace the host/port for the
deployment under test):

```sh
MEDIA_HOST=203.0.113.10 # replace with the test deployment address
sudo iptables -I OUTPUT -p tcp -d "$MEDIA_HOST" --dport 8443 -j DROP
# wait 5, 20, or 90 seconds, then remove the exact rule:
sudo iptables -D OUTPUT -p tcp -d "$MEDIA_HOST" --dport 8443 -j DROP
```

Use the browser's offline toggle for a full network interruption. Do not run firewall rules on
a production host.

## UDP/TCP/TURN fallback

Configure distinct mediasoup and coturn relay ranges using `MEDIASOUP_RTC_MIN_PORT`,
`MEDIASOUP_RTC_MAX_PORT`, `TURN_MIN_PORT`, and `TURN_MAX_PORT`; open the selected ranges in the
test firewall. Block UDP to the mediasoup range while leaving its TCP range and TURN ports
available. Confirm the ICE selected candidate changes to TCP or relay and audio/video recover.
Then block UDP entirely on the test client and verify TURN over TLS (`TURN_TLS_PORT`, default
443) is selected. For port 443, enable compose profiles `proxy` and `turn`, point `TURN_HOST`
(for example `turn.example.com`) to the server, and provide a coturn certificate containing
that hostname. HAProxy routes `turn.*` SNI to coturn and HTTPS SNI to nginx.

On a dedicated Linux test client, the direct-SFU UDP case can be simulated with:

```sh
MEDIA_HOST=203.0.113.10 # replace with the test media-service address
sudo iptables -I OUTPUT -p udp -d "$MEDIA_HOST" --dport 40000:49999 -j DROP
# remove after the test
sudo iptables -D OUTPUT -p udp -d "$MEDIA_HOST" --dport 40000:49999 -j DROP
```

Permit the configured TURN relay range (`TURN_MIN_PORT`–`TURN_MAX_PORT`) and TCP media range
when testing fallback. For a strict UDP-blocked test, block UDP on the test client while
leaving TCP 5349 and the TURN TCP relay path open. Apply rules only on a disposable test client.

## Acceptance observations

- Restore network after a 5–20 second interruption: return to the same room automatically,
  within 10 seconds after connectivity is restored, with no leave/join event for peers.
- Block mediasoup UDP: call recovers on TCP or TURN; confirm the selected candidate using
  browser `getStats()` and media-service ICE logs.
- Wait beyond the grace period: the detached session expires, then a full join restores the
  call; the old session cannot be resumed.
- Check logs for `[session]`, `[ice]`, `[quality]`, and recovery duration; logs must not
  contain call tokens or full user identifiers.
