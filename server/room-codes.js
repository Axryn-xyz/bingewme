import { randomInt } from 'node:crypto';

// Allocation stays on the room server so two hosts cannot receive the same live code.
export function allocateRoomCode(rooms, random = () => randomInt(10000, 100000)) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const code = String(random());
    if (!rooms.has(code)) return code;
  }
  for (let number = 10000; number <= 99999; number++) {
    const code = String(number);
    if (!rooms.has(code)) return code;
  }
  throw new Error('All room codes are currently in use. Please try again shortly.');
}

export function createRoomState(host = null) {
  return {
    members: new Map(),
    host,
    state: null,
    locked: false,
    voteEnabled: false,
    sharing: null,
  };
}
