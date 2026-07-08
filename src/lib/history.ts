import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "reelduel/room-history";
const LIMIT = 8;

export type RoomVisit = {
  code: string;
  roomName: string;
  myName: string;
  visitedAt: number;
  winnerTitle?: string;
  winnerPosterPath?: string | null;
  finishedAt?: number;
};

async function read(): Promise<RoomVisit[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RoomVisit[]) : [];
  } catch {
    return [];
  }
}

async function write(list: RoomVisit[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {}
}

export async function saveRoomVisit(visit: {
  code: string;
  roomName: string;
  myName: string;
}) {
  const list = await read();
  const rest = list.filter((r) => r.code !== visit.code);
  await write([{ ...visit, visitedAt: Date.now() }, ...rest]);
}

export async function markWinner(
  code: string,
  winnerTitle: string,
  winnerPosterPath: string | null,
) {
  const list = await read();
  const hit = list.find((r) => r.code === code);
  if (!hit || hit.winnerTitle === winnerTitle) return;
  hit.winnerTitle = winnerTitle;
  hit.winnerPosterPath = winnerPosterPath;
  hit.finishedAt = Date.now();
  await write(list);
}

export async function removeRoomVisit(code: string) {
  const list = await read();
  await write(list.filter((r) => r.code !== code));
}

export async function getRoomHistory(): Promise<RoomVisit[]> {
  return read();
}
