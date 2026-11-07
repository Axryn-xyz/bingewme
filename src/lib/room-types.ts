export interface RoomMember {
  id: string;
  name: string;
  moderator?: boolean;
  chatMuted?: boolean;
  micMuted?: boolean;
  badge?: string;
}
export interface RoomAsset {
  id: string;
  name: string;
  url: string;
}
export interface RoomOptions {
  persistent: boolean;
  hasPasscode: boolean;
  branding: { background?: string; badges?: string[]; emotes?: RoomAsset[] };
}
export interface RoomBan {
  id: string;
  name: string;
  at: number;
  reason: string;
}
export interface RoomCommand {
  action:
    | 'configure'
    | 'kick'
    | 'ban'
    | 'unban'
    | 'mute-chat'
    | 'mute-mic'
    | 'moderator'
    | 'transfer-host'
    | 'branding';
  target?: string;
  persistent?: boolean;
  passcode?: string;
  muted?: boolean;
  enabled?: boolean;
  reason?: string;
  badges?: string[];
  clearBackground?: boolean;
  removeEmote?: string;
}
