import { useEffect, useState } from 'react';
import type { useWebRTCSync } from '../hooks/useWebRTCSync';
import type { RoomCommand } from '../lib/room-types';
import { apiUrl } from '../lib/backend';
import '../styles/room-management.css';
type RoomControl = Pick<
  ReturnType<typeof useWebRTCSync>,
  | 'options'
  | 'members'
  | 'host'
  | 'moderator'
  | 'bans'
  | 'manageRoom'
  | 'uploadToken'
  | 'selectBadge'
  | 'socket'
  | 'overlay'
>;
export function RoomDashboard({
  sync,
  room,
  notify,
}: {
  sync: RoomControl;
  room: string;
  notify: (message: string) => void;
}) {
  const [passcode, setPasscode] = useState('');
  const [removePasscode, setRemovePasscode] = useState(false);
  const [persistent, setPersistent] = useState(sync.options.persistent);
  const [badges, setBadges] = useState((sync.options.branding.badges || []).join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPersistent(sync.options.persistent);
  }, [sync.options.persistent]);
  useEffect(() => {
    setBadges((sync.options.branding.badges || []).join(', '));
  }, [sync.options.branding.badges]);
  const manage = async (command: RoomCommand) => {
    try {
      await sync.manageRoom(command);
      notify('Room updated.');
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Room update failed.');
      return false;
    }
  };
  async function upload(file: File, kind: 'background' | 'emote') {
    setBusy(true);
    try {
      const response = await fetch(
        apiUrl(`/api/rooms/${room}/assets?kind=${kind}&name=${encodeURIComponent(file.name)}`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sync.uploadToken}`,
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed.');
      notify(kind === 'background' ? 'Room background updated.' : 'Emote added to the room.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="room-dashboard">
      <div className="management-heading">
        <h3>Room access</h3>
        <span>{sync.options.persistent ? 'PERSISTENT' : 'TEMPORARY'}</span>
      </div>
      <p className="management-description">
        {sync.options.hasPasscode
          ? 'A passcode protects this room.'
          : 'Anyone with the invite can join.'}
      </p>
      {sync.host && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const ok = await manage({
              action: 'configure',
              persistent,
              ...(passcode || removePasscode ? { passcode: removePasscode ? '' : passcode } : {}),
            });
            if (ok) {
              setPasscode('');
              setRemovePasscode(false);
            }
            setBusy(false);
          }}
        >
          <label className="management-check">
            <input
              type="checkbox"
              checked={persistent}
              onChange={(event) => setPersistent(event.target.checked)}
            />
            Keep this room after everyone leaves
          </label>
          <label className="input-label" htmlFor="new-room-passcode">
            NEW PASSCODE
          </label>
          <input
            id="new-room-passcode"
            className="url-input"
            type="password"
            minLength={4}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Leave blank to keep the current passcode"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
          {sync.options.hasPasscode && (
            <label className="management-check">
              <input
                type="checkbox"
                checked={removePasscode}
                onChange={(event) => setRemovePasscode(event.target.checked)}
              />
              Remove the current passcode
            </label>
          )}
          <button className="yellow-btn full" disabled={busy}>
            Save room access
          </button>
        </form>
      )}
      <div className="management-heading">
        <h3>Room identity</h3>
      </div>
      <label className="input-label" htmlFor="my-room-badge">
        YOUR CHAT BADGE
      </label>
      <select
        id="my-room-badge"
        className="url-input"
        value={sync.members.find((member) => member.id === sync.socket.current?.id)?.badge || ''}
        onChange={(event) => {
          void sync.selectBadge(event.target.value).catch((error: Error) => notify(error.message));
        }}
      >
        <option value="">No badge</option>
        {sync.options.branding.badges?.map((badge) => (
          <option key={badge}>{badge}</option>
        ))}
      </select>
      {sync.moderator && (
        <>
          <label className="management-upload">
            {busy ? 'Uploading…' : 'Upload a background · up to 2 MiB'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={(event) => {
                if (event.target.files?.[0]) void upload(event.target.files[0], 'background');
                event.target.value = '';
              }}
            />
          </label>
          {sync.options.branding.background && (
            <button
              className="outline-btn"
              onClick={() => void manage({ action: 'branding', clearBackground: true })}
            >
              Remove background
            </button>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void manage({
                action: 'branding',
                badges: badges
                  .split(',')
                  .map((badge) => badge.trim())
                  .filter(Boolean),
              });
            }}
          >
            <label className="input-label" htmlFor="room-badge-pack">
              CUSTOM BADGES · COMMA SEPARATED
            </label>
            <input
              id="room-badge-pack"
              className="url-input"
              value={badges}
              maxLength={400}
              onChange={(event) => setBadges(event.target.value)}
            />
            <button className="outline-btn" type="submit">
              Save badges
            </button>
          </form>
          <label className="management-upload">
            Upload PNG/GIF emotes · up to 512 KiB each
            <input
              type="file"
              multiple
              accept="image/png,image/gif,image/webp"
              disabled={busy}
              onChange={async (event) => {
                const files = [...(event.target.files || [])].slice(0, 24);
                event.target.value = '';
                for (const file of files) await upload(file, 'emote');
              }}
            />
          </label>
        </>
      )}
      {!!sync.options.branding.emotes?.length && (
        <div className="room-emote-pack">
          {sync.options.branding.emotes.map((emote) => (
            <div key={emote.id}>
              <button
                title={`Show ${emote.name} on the video`}
                onClick={() =>
                  void sync.overlay(emote.url).catch((error: Error) => notify(error.message))
                }
              >
                <img src={apiUrl(emote.url)} alt={emote.name} />
              </button>
              {sync.moderator && (
                <button
                  aria-label={`Remove ${emote.name}`}
                  onClick={() => void manage({ action: 'branding', removeEmote: emote.id })}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function ModerationDashboard({
  sync,
  notify,
}: {
  sync: RoomControl;
  notify: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const perform = (command: RoomCommand) => {
    void sync
      .manageRoom({ ...command, reason })
      .then(() => notify('Moderation updated.'))
      .catch((error: Error) => notify(error.message));
  };
  return (
    <section className="moderation-dashboard">
      {sync.moderator && (
        <>
          <label className="input-label" htmlFor="moderation-reason">
            MODERATION NOTE · OPTIONAL
          </label>
          <input
            id="moderation-reason"
            className="url-input"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </>
      )}
      {sync.members.map((member) => (
        <article className="moderation-person" key={member.id}>
          <div>
            <strong>{member.name}</strong>
            {member.badge && <span className="custom-badge">{member.badge}</span>}
            <small>
              {member.moderator ? 'HOST / MODERATOR' : 'VIEWER'}
              {member.chatMuted ? ' · CHAT MUTED' : ''}
              {member.micMuted ? ' · MIC MUTED' : ''}
            </small>
          </div>
          {sync.moderator && member.id !== sync.socket.current?.id && (
            <div className="moderation-actions">
              <button
                onClick={() =>
                  perform({ action: 'mute-chat', target: member.id, muted: !member.chatMuted })
                }
              >
                {member.chatMuted ? 'Unmute chat' : 'Mute chat'}
              </button>
              <button
                onClick={() =>
                  perform({ action: 'mute-mic', target: member.id, muted: !member.micMuted })
                }
              >
                {member.micMuted ? 'Unmute mic' : 'Mute mic'}
              </button>
              <button onClick={() => perform({ action: 'kick', target: member.id })}>Kick</button>
              <button
                className="danger-action"
                onClick={() => perform({ action: 'ban', target: member.id })}
              >
                Ban
              </button>
              {sync.host && (
                <>
                  <button
                    onClick={() =>
                      perform({
                        action: 'moderator',
                        target: member.id,
                        enabled: !member.moderator,
                      })
                    }
                  >
                    {member.moderator ? 'Remove moderator' : 'Make moderator'}
                  </button>
                  <button onClick={() => perform({ action: 'transfer-host', target: member.id })}>
                    Transfer host
                  </button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      {sync.moderator && (
        <>
          <h4>Room bans · {sync.bans.length}</h4>
          {!sync.bans.length && (
            <p className="management-description">No banned browser identities.</p>
          )}
          {sync.bans.map((ban) => (
            <div className="banned-person" key={ban.id}>
              <div>
                <strong>{ban.name}</strong>
                <small>
                  {ban.reason || 'No note'} · {new Date(ban.at).toLocaleDateString()}
                </small>
              </div>
              <button
                className="outline-btn"
                onClick={() => perform({ action: 'unban', target: ban.id })}
              >
                Unban
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
